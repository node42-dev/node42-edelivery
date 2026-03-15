/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import crypto from 'crypto';
import zlib   from 'zlib';
import { parseCert } from './pki.js';

/**
 * Gzip compress document bytes.
 * Returns { compressed: Buffer, digest: string (base64 SHA-256) }
 */
export function compressDocument(document) {
  const buf = Buffer.isBuffer(document) ? document : Buffer.from(document);
  const compressed = zlib.gzipSync(buf, { level: 6 });
  const digest = crypto.createHash('sha256').update(compressed).digest('base64');
  return { compressed, digest };
}

/**
 * Decompress gzipped document
 */
export function decompressDocument(compressed) {
  const buf = Buffer.isBuffer(compressed) ? compressed : Buffer.from(compressed);
  return zlib.gunzipSync(buf);
}

/**
 * Encrypt a gzipped document for a given receiver PEM certificate.
 * Returns { cipherValue: string (base64 wrapped key), encryptedContent: Buffer (IV+CT+TAG) }
 */
export function encryptDocument(context, gzippedDocument) {
  context.spinner.start('Generating Session Key');
  const sessionKey = crypto.randomBytes(16); // AES-128
  const iv = crypto.randomBytes(12); // GCM standard 96-bit IV
  context.spinner.done('Generated Session Key');

  // AES-128-GCM encrypt
  context.spinner.start('Encrypting Document');
  const cipher = crypto.createCipheriv('aes-128-gcm', sessionKey, iv);
  const ct = Buffer.concat([cipher.update(gzippedDocument), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  
  // XMLEnc AES-GCM CipherValue format: IV (12) | CT | TAG (16)
  const encryptedContent = Buffer.concat([iv, ct, tag]);
  context.spinner.done('Encrypted Document');

  // RSA-OAEP wrap session key with receiver's public key
  context.spinner.start('Encrypting Session Key');
  const cert = parseCert(context.receiverCert);
  const wrapped = crypto.publicEncrypt(
    { key: cert.publicKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    sessionKey
  );
  const cipherValue = wrapped.toString('base64');
  context.spinner.done('Encrypted Session Key');

  return { cipherValue, encryptedContent };
}
