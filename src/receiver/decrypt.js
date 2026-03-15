/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import crypto from 'crypto';
import { N42Error, N42ErrorCode } from '../../src/core/error.js';
import { WSSE_NS } from '../../src/core/constants.js';

/**
 * Decrypt AS4 payload
 * Reverses: encryptAs4Envelope (SOAP headers) + encryptDocument (payload crypto)
 * 
 * Steps (reverse of sender):
 * 1. Extract EncryptedKey from SOAP Security header
 * 2. Unwrap session key using our RSA private key (reverse of RSA-OAEP wrap)
 * 3. Extract encrypted content from attachment
 * 4. Decrypt using AES-128-GCM with unwrapped session key
 * 
 * Input: envelope (XMLDocument), attachment (Buffer), privateKeyPem (string)
 * Output: { decrypted: Buffer, sessionKey: Buffer }
 */
export async function decryptAs4Payload(envelope, attachment, privateKeyPem) {
  // Step 1: Extract encrypted session key from SOAP header
  const security = envelope.getElementsByTagNameNS(WSSE_NS, 'Security')[0];
  if (!security) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'No WS-Security header found in envelope' }
    );
  }
  
  // Find EncryptedKey element
  const encryptedKeyEl = security.getElementsByTagNameNS(
    'http://www.w3.org/2001/04/xmlenc#',
    'EncryptedKey'
  )[0];
  
  if (!encryptedKeyEl) {
    throw new N42Error(
      N42ErrorCode.NO_ENCRYPTED_KEY,
      'No EncryptedKey found in Security header'
    );
  }
  
  // Extract CipherValue (base64-encoded wrapped session key)
  const cipherValueEl = encryptedKeyEl.getElementsByTagNameNS(
    'http://www.w3.org/2001/04/xmlenc#',
    'CipherValue'
  )[0];
  
  if (!cipherValueEl) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'No CipherValue found in EncryptedKey' }
    );
  }
  
  const cipherValueB64 = cipherValueEl.textContent.trim();
  const wrappedKey = Buffer.from(cipherValueB64, 'base64');
  
  console.log('Session key wrapped:', wrappedKey.length, 'bytes');
  
  // Step 2: Unwrap session key using RSA-OAEP with our private key
  // Reverses: crypto.publicEncrypt from sender's encryptDocument
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
  });
  
  let sessionKey;
  try {
    sessionKey = crypto.privateDecrypt(
      {
        key: privateKey,
        oaepHash: 'sha256',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      wrappedKey
    );
  } catch(e) {
    throw new N42Error(N42ErrorCode.TRANSACTION_FAILED, { details: `Failed to unwrap session key: ${e.message}` });
  }
  
  if (sessionKey.length !== 16) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: `Invalid Session Key; Expected 16-byte AES-128 key, got ${sessionKey.length} bytes` }
    );
  }
  
  console.log('✓ Session key unwrapped:', {
    hex: sessionKey.toString('hex'),
    base64: sessionKey.toString('base64'),
    length: sessionKey.length + ' bytes',
  });
  
  // Step 3: Decrypt attachment using AES-128-GCM
  // Reverses: AES-128-GCM encryption from sender's encryptDocument
  // 
  // Attachment format: IV (12 bytes) | Ciphertext | Auth Tag (16 bytes)
  // This is the XMLEnc AES-GCM CipherValue format
  
  if (attachment.length < 28) { // 12 + 16 minimum
    throw new N42Error(N42ErrorCode.TRANSACTION_FAILED, { details: `Attachment too small: ${attachment.length} bytes (min 28)` });
  }
  
  const iv = attachment.subarray(0, 12);           // First 12 bytes
  const authTag = attachment.subarray(-16);        // Last 16 bytes
  const ciphertext = attachment.subarray(12, -16); // Everything in between
  
  console.log('✓ Attachment format:', {
    IV: iv.length + ' bytes',
    ciphertext: ciphertext.length + ' bytes',
    authTag: authTag.length + ' bytes',
  });
  
  // Decrypt using AES-128-GCM
  const decipher = crypto.createDecipheriv('aes-128-gcm', sessionKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted;
  try {
    decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
  } catch(e) {
    throw new N42Error(N42ErrorCode.TRANSACTION_FAILED, { details: `AES-GCM decryption failed: ${e.message}` });
  }
  
  console.log('✓ Payload decrypted:', decrypted.length, 'bytes (gzipped)');
  
  return { decrypted, sessionKey };
}
