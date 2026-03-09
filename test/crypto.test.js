import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { compressDocument, encryptDocument } from '../src/security/crypto.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CERT_PEM   = fs.readFileSync(path.join(__dirname, 'fixtures/test-cert.pem'), 'utf-8');
const KEY_PEM    = fs.readFileSync(path.join(__dirname, 'fixtures/test-key.pem'),  'utf-8');

const noop = { start: () => {}, done: () => {} };

// ─── compressDocument ────────────────────────────────────────────────────────

test('compressDocument: gzip reduces size for repetitive XML', () => {
  const xml = Buffer.from('<Invoice>' + '<Line>data</Line>'.repeat(200) + '</Invoice>');
  const { compressed } = compressDocument(xml);
  assert.ok(compressed.length < xml.length, 'compressed must be smaller than input');
});

test('compressDocument: digest is SHA-256 of the compressed bytes', () => {
  const { compressed, digest } = compressDocument('<Invoice><ID>001</ID></Invoice>');
  const expected = crypto.createHash('sha256').update(compressed).digest('base64');
  assert.equal(digest, expected);
});

test('compressDocument: accepts string input', () => {
  const { compressed, digest } = compressDocument('<Invoice/>');
  assert.ok(Buffer.isBuffer(compressed));
  assert.ok(digest.length > 0);
});

// ─── encryptDocument ─────────────────────────────────────────────────────────

test('encryptDocument: cipherValue is base64 and encryptedContent is a Buffer', () => {
  const context = { receiverCert: CERT_PEM, spinner: noop };
  const { cipherValue, encryptedContent } = encryptDocument(context, Buffer.from('test payload'));

  assert.match(cipherValue, /^[A-Za-z0-9+/]+=*$/, 'cipherValue must be base64');
  assert.ok(Buffer.isBuffer(encryptedContent));
  assert.ok(encryptedContent.length >= 28, 'encryptedContent must contain IV + CT + TAG');
});

test('encryptDocument: RSA-OAEP wrapped key is 256 bytes (RSA-2048)', () => {
  const context = { receiverCert: CERT_PEM, spinner: noop };
  const { cipherValue } = encryptDocument(context, Buffer.from('hello'));
  const wrappedKey = Buffer.from(cipherValue, 'base64');
  assert.equal(wrappedKey.length, 256, 'RSA-2048 produces a 256-byte wrapped key');
});

test('encryptDocument: full round-trip — decrypt with matching private key', () => {
  const context = { receiverCert: CERT_PEM, spinner: noop };
  const plaintext = Buffer.from('Peppol test invoice content');
  const { cipherValue, encryptedContent } = encryptDocument(context, plaintext);

  const privateKey = crypto.createPrivateKey(KEY_PEM);
  const sessionKey = crypto.privateDecrypt(
    { key: privateKey, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(cipherValue, 'base64')
  );
  assert.equal(sessionKey.length, 16, 'session key is AES-128 (16 bytes)');

  const iv       = encryptedContent.slice(0, 12);
  const tag      = encryptedContent.slice(-16);
  const ct       = encryptedContent.slice(12, -16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', sessionKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);

  assert.deepEqual(decrypted, plaintext, 'decrypted output must match original input');
});
