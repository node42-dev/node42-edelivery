/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import crypto from 'crypto';
import { N42Error, N42ErrorCode } from '../../src/core/error.js';
import { parseCert, extractCertFields } from '../../src/security/pki.js';
import { c14nSignedInfo, c14nDigest } from '../../src/security/xmlsig.js';
import { DS_NS, WSSE_NS, EBMS_NS, WSU_NS } from '../../src/core/constants.js';

/**
 * Verify AS4 signature
 * Reverses: signAs4Envelope from sender
 * 
 * Steps:
 * 1. Extract sender's certificate from BinarySecurityToken
 * 2. Verify signature on SignedInfo
 * 3. Verify digests: Body, Messaging, Attachment
 * 
 * Input: envelope (XMLDocument), attachment (Buffer)
 * Output: { valid: boolean, senderCN: string, error?: string }
 */
export async function verifyAs4Signature(envelope, _attachment) {
  try {
    // Step 1: Extract BinarySecurityToken (sender's certificate)
    const security = envelope.getElementsByTagNameNS(WSSE_NS, 'Security')[0];
    if (!security) {
      return { valid: false, error: 'No Security header found' };
    }
    
    const bstElements = security.getElementsByTagNameNS(WSSE_NS, 'BinarySecurityToken');
    
    // Find the signing certificate (not encryption cert)
    let signingCert = null;
    for (let i = 0; i < bstElements.length; i++) {
      const bst = bstElements[i];
      const id = bst.getAttributeNS(WSU_NS, 'Id');
      if (id === 'X509-Sign') {
        signingCert = bst;
        break;
      }
    }
    
    if (!signingCert) {
      return { valid: false, error: 'No signing certificate found in BinarySecurityToken' };
    }
    
    const certB64 = signingCert.textContent.trim();
    //const certDer = Buffer.from(certB64, 'base64');
    const certPem = `-----BEGIN CERTIFICATE-----\n${certB64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    
    const cert = parseCert(certPem);
    const subject = extractCertFields(cert, 'subject');
    //const issuer = extractCertFields(cert, 'issuer');

    const senderCN = subject.CN || 'Unknown';
    
    console.log('Sender certificate CN:', senderCN);
    
    // Step 2: Extract Signature element
    const signature = security.getElementsByTagNameNS(DS_NS, 'Signature')[0];
    if (!signature) {
      return { valid: false, error: 'No Signature element found' };
    }
    
    // Extract SignedInfo
    const signedInfo = signature.getElementsByTagNameNS(DS_NS, 'SignedInfo')[0];
    if (!signedInfo) {
      return { valid: false, error: 'No SignedInfo element found' };
    }
    
    // Extract SignatureValue
    const signatureValue = signature.getElementsByTagNameNS(DS_NS, 'SignatureValue')[0];
    if (!signatureValue) {
      return { valid: false, error: 'No SignatureValue found' };
    }
    
    const signatureB64 = signatureValue.textContent.trim();
    const signatureBytes = Buffer.from(signatureB64, 'base64');
    
    console.log('Signature size:', signatureBytes.length, 'bytes');
    
    // Step 3: Verify signature on SignedInfo
    // sender: crypto.sign in signAs4Envelope
    const signedInfoC14n = c14nSignedInfo(signedInfo);
    
    let verified;
    try {

      const keyData = cert.publicKey.export({ type: 'spki', format: 'der' });
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      verified = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes,
        Buffer.from(signedInfoC14n, 'utf-8')
      );
      
      /*
      verified = crypto.verify(
        'sha256',
        Buffer.from(signedInfoC14n, 'utf-8'),
        {
          key: cert.publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        signatureBytes
      );
      */
    } catch(e) {
      return { valid: false, error: `Signature verification failed: ${e.message}` };
    }
    
    if (!verified) {
      return { valid: false, error: 'Invalid signature on SignedInfo' };
    }
    
    console.log('✓ SignedInfo signature: VALID');
    
    // Step 4: Verify digest references
    // Each Reference in SignedInfo contains a digest that must match
    // the canonicalized version of the referenced element
    
    const references = signedInfo.getElementsByTagNameNS(DS_NS, 'Reference');
    const digests = {
      body: null,
      messaging: null,
      attachment: null,
    };
    
    // Extract expected digests from SignedInfo
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const uri = ref.getAttribute('URI');
      const digestValue = ref.getElementsByTagNameNS(DS_NS, 'DigestValue')[0]?.textContent.trim();
      
      if (uri === '#body') {
        digests.body = digestValue;
      } else if (uri === '#messaging') {
        digests.messaging = digestValue;
      } else if (uri.startsWith('cid:')) {
        digests.attachment = digestValue;
      }
    }
    
    console.log('Expected digests:', {
      body: digests.body?.substring(0, 16) + '...',
      messaging: digests.messaging?.substring(0, 16) + '...',
      attachment: digests.attachment?.substring(0, 16) + '...',
    });
    
    // Verify Body digest
    const body = envelope.getElementsByTagNameNS('http://www.w3.org/2003/05/soap-envelope', 'Body')[0] ||
                 envelope.getElementsByTagNameNS('http://schemas.xmlsoap.org/soap/envelope/', 'Body')[0];
    
    if (!body) {
      return { valid: false, error: 'No SOAP Body found' };
    }
    
    const bodyDigest = c14nDigest(body);
    if (bodyDigest !== digests.body) {
      return { valid: false, error: 'Body digest mismatch' };
    }
    
    console.log('✓ Body digest: VALID');
    
    // Verify Messaging digest
    const messaging = envelope.getElementsByTagNameNS(EBMS_NS, 'Messaging')[0];
    if (!messaging) {
      return { valid: false, error: 'No ebMS3 Messaging element found' };
    }
    
    const messagingDigest = c14nDigest(messaging);
    if (messagingDigest !== digests.messaging) {
      return { valid: false, error: 'Messaging digest mismatch' };
    }
    
    console.log('✓ Messaging digest: VALID');
    
    // Verify Attachment digest
    // Note: This is the digest of the COMPRESSED (gzipped) content,
    // not the encrypted content. But we can't verify it yet because
    // we haven't decrypted. This verification happens after decryption.
    // For now, we trust the signature on SignedInfo.
    
    console.log('⚠ Attachment digest verification deferred to post-decryption');
    
    return {
      valid: true,
      senderCN,
      certificate: certPem,
    };
    
  } catch(e) {
    console.error('Signature verification error:', e);
    return {
      valid: false,
      error: e.message,
    };
  }
}

/**
 * Verify attachment digest after decryption
 * This should be called after decompressing the payload
 * 
 * Reverses: compressDocument digest from sender
 */
export function verifyAttachmentDigest(compressed, expectedDigestB64) {
  const actualDigest = crypto.createHash('sha256')
    .update(compressed)
    .digest('base64');
  
  if (actualDigest !== expectedDigestB64) {
    throw new N42Error(
      N42ErrorCode.ATTACHMENT_DIGEST_MISMATCH,
      `Attachment digest mismatch. Expected: ${expectedDigestB64.substring(0, 16)}..., Got: ${actualDigest.substring(0, 16)}...`
    );
  }
  
  console.log('✓ Attachment digest valid');
  return true;
}
