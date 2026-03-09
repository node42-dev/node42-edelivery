import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseCert, getCertInfo, getCertCommonName } from '../src/security/pki.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PEM  = fs.readFileSync(path.join(__dirname, 'fixtures/test-cert.pem'), 'utf-8');

// ─── parseCert ───────────────────────────────────────────────────────────────

test('parseCert: returns an X509Certificate with a publicKey', () => {
  const cert = parseCert(CERT_PEM);
  assert.ok(cert.publicKey, 'cert must have a publicKey');
  assert.ok(cert.subject.includes('CN=n42-test'), 'CN must match fixture cert');
});

test('parseCert: accepts a Buffer input', () => {
  const cert = parseCert(Buffer.from(CERT_PEM));
  assert.ok(cert.publicKey);
});

test('parseCert: throws on invalid PEM', () => {
  assert.throws(() => parseCert('not a cert'), 'must throw on invalid input');
});

// ─── getCertCommonName ───────────────────────────────────────────────────────

test('getCertCommonName: returns the CN from the fixture cert', () => {
  const cn = getCertCommonName(CERT_PEM);
  assert.equal(cn, 'n42-test');
});

// ─── getCertInfo ─────────────────────────────────────────────────────────────

test('getCertInfo: returns a non-empty string for a valid cert', () => {
  const info = getCertInfo(CERT_PEM);
  assert.ok(info.length > 0);
  assert.ok(info.includes('CN=n42-test'));
});

test('getCertInfo: returns empty string for null input', () => {
  assert.equal(getCertInfo(null), '');
});
