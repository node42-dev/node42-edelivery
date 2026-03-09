import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  c14nSyncNode,
  c14nSignedInfo,
  c14nDigest,
  parseXml,
  buildDigestReference,
  el,
} from '../src/security/xmlsig.js';
import { SWA_ATT_SIG_TRANS, XML_CANONICAL_C14N, XML_SHA256 } from '../src/core/constants.js';

// ─── c14nSyncNode ────────────────────────────────────────────────────────────

test('c14nSyncNode: produces a non-empty string for a simple element', () => {
  const doc  = parseXml('<Body xmlns:env="http://www.w3.org/2003/05/soap-envelope" env:mustUnderstand="true"/>');
  const root = doc.documentElement;
  const result = c14nSyncNode(root);
  assert.ok(typeof result === 'string' && result.length > 0);
});

test('c14nSyncNode: output is deterministic for the same input', () => {
  const xml  = '<Messaging xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" wsu:Id="messaging"><UserMessage/></Messaging>';
  const doc1 = parseXml(xml);
  const doc2 = parseXml(xml);
  assert.equal(c14nSyncNode(doc1.documentElement), c14nSyncNode(doc2.documentElement));
});

// ─── c14nDigest ──────────────────────────────────────────────────────────────

test('c14nDigest: returns a valid base64 SHA-256 digest', () => {
  const doc    = parseXml('<Body/>');
  const digest = c14nDigest(doc.documentElement);
  assert.match(digest, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(Buffer.from(digest, 'base64').length, 32, 'digest is 32 bytes (SHA-256)');
});

test('c14nDigest: digest matches manual SHA-256 of c14n output', () => {
  const doc      = parseXml('<Body xmlns:env="http://www.w3.org/2003/05/soap-envelope"/>');
  const node     = doc.documentElement;
  const c14nStr  = c14nSyncNode(node);
  const expected = crypto.createHash('sha256').update(c14nStr).digest('base64');
  assert.equal(c14nDigest(node), expected);
});

test('c14nDigest: different elements produce different digests', () => {
  const doc1 = parseXml('<Body><ID>001</ID></Body>');
  const doc2 = parseXml('<Body><ID>002</ID></Body>');
  assert.notEqual(c14nDigest(doc1.documentElement), c14nDigest(doc2.documentElement));
});

// ─── c14nSignedInfo ──────────────────────────────────────────────────────────

test('c14nSignedInfo: produces a string containing ds:SignedInfo', () => {
  const doc  = parseXml('<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/></ds:SignedInfo>');
  const result = c14nSignedInfo(doc.documentElement);
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('SignedInfo'), 'output must contain SignedInfo element');
});

test('c14nSignedInfo: output does not contain duplicate namespace declarations', () => {
  const doc    = parseXml('<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:env="http://www.w3.org/2003/05/soap-envelope"/>');
  const result = c14nSignedInfo(doc.documentElement);
  // Count occurrences of xmlns:env — must appear at most once
  const matches = (result.match(/xmlns:env=/g) || []).length;
  assert.ok(matches <= 1, `xmlns:env declared ${matches} times — must not be duplicated`);
});

// ─── buildDigestReference ────────────────────────────────────────────────────

test('buildDigestReference: builds a ds:Reference with correct URI for element refs', () => {
  const doc = parseXml('<root/>');
  const ref = buildDigestReference(doc, 'body', XML_CANONICAL_C14N, 'abc123==');
  assert.equal(ref.getAttribute('URI'), '#body', 'element reference URI must be prefixed with #');
});

test('buildDigestReference: builds a ds:Reference without # for attachment refs', () => {
  const doc = parseXml('<root/>');
  const ref = buildDigestReference(doc, 'cid:abc@host', SWA_ATT_SIG_TRANS, 'digest==');
  assert.equal(ref.getAttribute('URI'), 'cid:abc@host', 'attachment URI must not have # prefix');
});

test('buildDigestReference: DigestValue text content matches provided value', () => {
  const doc    = parseXml('<root/>');
  const digest = 'abc123deadbeef==';
  const ref    = buildDigestReference(doc, 'messaging', XML_CANONICAL_C14N, digest);
  const dvEl   = ref.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'DigestValue')[0];
  assert.equal(dvEl?.textContent, digest);
});
