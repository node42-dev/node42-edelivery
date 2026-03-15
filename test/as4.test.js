import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseAs4Signal, buildAs4Envelope } from '../src/sender/as4.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PEM  = fs.readFileSync(path.join(__dirname, 'fixtures/test-cert.pem'), 'utf-8');
const noop      = { start: () => {}, done: () => {}, fail: () => {} };

// ─── parseAs4Signal ──────────────────────────────────────────────────────────

const RECEIPT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope">
  <S:Body>
    <eb:Messaging xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/">
      <eb:SignalMessage>
        <eb:MessageInfo>
          <eb:Timestamp>2025-01-01T00:00:00Z</eb:Timestamp>
          <eb:MessageId>receipt-001@test.host</eb:MessageId>
          <eb:RefToMessageId>sent-001@test.host</eb:RefToMessageId>
        </eb:MessageInfo>
        <eb:Receipt><ebbp:NonRepudiationInformation xmlns:ebbp="http://docs.oasis-open.org/ebxml-bp/ebbp-signals-2.0"/></eb:Receipt>
      </eb:SignalMessage>
    </eb:Messaging>
  </S:Body>
</S:Envelope>`;

const ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope">
  <S:Body>
    <eb:Messaging xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/">
      <eb:SignalMessage>
        <eb:MessageInfo>
          <eb:MessageId>err-001@test.host</eb:MessageId>
        </eb:MessageInfo>
        <eb:Error N42ErrorCode="EBMS:0004" severity="Failure" category="Content">
          <eb:Description xml:lang="en">Validation failed</eb:Description>
        </eb:Error>
      </eb:SignalMessage>
    </eb:Messaging>
  </S:Body>
</S:Envelope>`;

test('parseAs4Signal: identifies a receipt signal', () => {
  const signal = parseAs4Signal(RECEIPT_XML);
  assert.equal(signal.isReceipt, true);
  assert.equal(signal.errors.length, 0);
  assert.equal(signal.messageId, 'receipt-001@test.host');
  assert.equal(signal.refToMessageId, 'sent-001@test.host');
});

test('parseAs4Signal: identifies an error signal with correct fields', () => {
  const signal = parseAs4Signal(ERROR_XML);
  assert.equal(signal.isReceipt, false);
  assert.equal(signal.errors.length, 1);
  assert.equal(signal.errors[0].N42ErrorCode, 'EBMS:0004');
  assert.equal(signal.errors[0].severity, 'Failure');
});

test('parseAs4Signal: accepts a Buffer input', () => {
  const signal = parseAs4Signal(Buffer.from(RECEIPT_XML));
  assert.equal(signal.isReceipt, true);
});

test('parseAs4Signal: throws when no SignalMessage is present', () => {
  const xml = '<Envelope><Body><Messaging xmlns="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/"/></Body></Envelope>';
  assert.throws(() => parseAs4Signal(xml), /No SignalMessage/);
});

// ─── buildAs4Envelope ────────────────────────────────────────────────────────

function makeContext() {
  return {
    timestamp:    '2025-01-01T00:00:00Z',
    fromPartyId:  'POP000001',
    toPartyId:    'POP000002',
    senderId:     '0088::test-sender',
    receiverId:   '0088::test-receiver',
    processId:    'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    documentType: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
    hostname:     'test.n42.dev',
    spinner:      noop,
    persist:      false,
    senderCert:   CERT_PEM,
    receiverCert: CERT_PEM,
  };
}

test('buildAs4Envelope: returns attachmentId, envelope, messaging, body, doc', () => {
  const { attachmentId, envelope, messaging, body, doc } = buildAs4Envelope(makeContext());
  assert.ok(attachmentId.startsWith('cid:'), 'attachmentId must start with cid:');
  assert.ok(attachmentId.endsWith('@test.n42.dev'), 'attachmentId must use context hostname');
  assert.ok(envelope, 'envelope must be present');
  assert.ok(messaging, 'messaging must be present');
  assert.ok(body, 'body must be present');
  assert.ok(doc, 'doc must be present');
});

test('buildAs4Envelope: messaging element has wsu:Id="messaging"', () => {
  const { messaging } = buildAs4Envelope(makeContext());
  const WSU_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
  assert.equal(messaging.getAttributeNS(WSU_NS, 'Id'), 'messaging');
});

test('buildAs4Envelope: PartProperties has CompressionType before MimeType', () => {
  const { messaging } = buildAs4Envelope(makeContext());
  const EBMS_NS = 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/';
  const props   = messaging.getElementsByTagNameNS(EBMS_NS, 'Property');
  const names   = Array.from({ length: props.length }, (_, i) => props[i].getAttribute('name'));
  const compIdx = names.indexOf('CompressionType');
  const mimeIdx = names.indexOf('MimeType');
  assert.ok(compIdx !== -1, 'CompressionType property must exist');
  assert.ok(mimeIdx !== -1, 'MimeType property must exist');
  assert.ok(compIdx < mimeIdx, 'CompressionType must come before MimeType');
});

test('buildAs4Envelope: attachmentId is unique on each call', () => {
  const ctx  = makeContext();
  const id1  = buildAs4Envelope(ctx).attachmentId;
  const id2  = buildAs4Envelope(ctx).attachmentId;
  assert.notEqual(id1, id2, 'each envelope must get a fresh attachment ID');
});
