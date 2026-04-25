/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import crypto   from 'crypto';
import os       from 'os';
import fs       from 'fs';
import path     from 'path';
import fetch    from 'node-fetch';
import format   from 'xml-formatter';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { signAs4Envelope, encryptAs4Envelope, addExtraNs }   from '../security/wsse.js';
import { compressDocument, encryptDocument }     from '../security/crypto.js';
import { el, c14nSyncNode, c14nDigest }          from '../security/xmlsig.js';
import { getParticipantValue }                   from '../core/utils.js';

import { 
  createDb, 
  getDbAdapter 
} from '../db/db.js';

import { 
  getUserTransactionsDir
} from '../cli/paths.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../core/error.js';

import { 
  EBMS_NS, EBMS_ROLE_INIT, EBMS_ROLE_RESP, PEPPOL_AS4, EBMS_AS4_NAMESPACES
} from '../core/constants.js';


const parser     = new DOMParser();
const serializer = new XMLSerializer();

let db = null;
async function getDb(context) {
  if (!db) db = createDb(await getDbAdapter(context));
  return db;
}

// ── DB ────────────────────────────────────────────────

export async function saveTransaction(context) {
  db = await getDb(context);
  
  await db.insert('Transactions', {
    type:              'TRANSACTION',
    userId:            context.senderId,
    id:                context.id,
    PK:                `USER#${context.senderId}`,
    SK:                `TRANSACTION#${context.id}`,
    GSI1PK:            `USER#${context.senderId}#FLOW#FROM_NETWORK`,
    GSI1SK:            context.timestamp,
    environment:       context.env,
    transactionFlow:   'TO_NETWORK',
    senderId:          context.senderId,
    receiverId:        context.receiverId,
    receiverCN:        context.toPartyId,
    docTypeId:         context.documentType,
    processId:         context.processId,
    transportProfile:  context.transportProfile,
    senderCountry:     context.senderCountry,
    receiverCountry:   context.receiverCountry,
    transactionStatus: 'COMPLETED',
    createdAt:         context.timestamp,
  });      
}

// ── Parse AS4 signal response ────────────────────────────────────────────────

export function parseAs4Signal(xmlBuffer) {
  const text = Buffer.isBuffer(xmlBuffer) ? xmlBuffer.toString('utf-8') : xmlBuffer;
  const doc  = parser.parseFromString(text, 'application/xml');

  const signal = doc.getElementsByTagNameNS(EBMS_NS, 'SignalMessage')[0];
  if (!signal) throw new Error('No SignalMessage found');

  const msgInfo  = signal.getElementsByTagNameNS(EBMS_NS, 'MessageInfo')[0];
  const errors   = [];
  const errEls   = signal.getElementsByTagNameNS(EBMS_NS, 'Error');

  for (let i = 0; i < errEls.length; i++) {
    const e = errEls[i];
    errors.push({
      N42ErrorCode:  e.getAttribute('N42ErrorCode'),
      severity:   e.getAttribute('severity'),
      category:   e.getAttribute('category'),
      description: e.getElementsByTagNameNS(EBMS_NS, 'Description')[0]?.textContent,
      detail:      e.getElementsByTagNameNS(EBMS_NS, 'ErrorDetail')[0]?.textContent,
    });
  }

  return {
    messageId:       msgInfo?.getElementsByTagNameNS(EBMS_NS, 'MessageId')[0]?.textContent,
    refToMessageId:  msgInfo?.getElementsByTagNameNS(EBMS_NS, 'RefToMessageId')[0]?.textContent,
    timestamp:       msgInfo?.getElementsByTagNameNS(EBMS_NS, 'Timestamp')[0]?.textContent,
    isReceipt:       !!signal.getElementsByTagNameNS(EBMS_NS, 'Receipt')[0],
    errors,
  };
}

// ── Build AS4 envelope ───────────────────────────────────────────────────────

export function buildAs4Envelope(context) {
  const hostname     = context.hostname ?? os.hostname();
  const attachmentId = `cid:${crypto.randomUUID()}@${hostname}`;
  const messageId    = `${crypto.randomUUID()}@${hostname}`;

  const doc = parser.parseFromString('<root/>', 'application/xml');
  const e = (prefix, tag, attrs = {}, text = null) => el(doc, prefix, tag, attrs, text);
  const wsuId = (id) => ({ 'wsu:Id': id });

  // UserMessage
  const userMessage = e('ns2', 'UserMessage');

  const msgInfo = e('ns2', 'MessageInfo');
  msgInfo.appendChild(e('ns2', 'Timestamp', {}, context.timestamp));
  msgInfo.appendChild(e('ns2', 'MessageId', {}, messageId));
  userMessage.appendChild(msgInfo);

  const partyInfo = e('ns2', 'PartyInfo');
  
  const partyFrom = e('ns2', 'From');
  partyFrom.appendChild(e('ns2', 'PartyId', { type: PEPPOL_AS4.PARTY_TYPE }, context.fromPartyId));
  partyFrom.appendChild(e('ns2', 'Role', {}, EBMS_ROLE_INIT));
  partyInfo.appendChild(partyFrom);

  const partyTo = e('ns2', 'To');
  partyTo.appendChild(e('ns2', 'PartyId', { type: PEPPOL_AS4.PARTY_TYPE }, context.toPartyId));
  partyTo.appendChild(e('ns2', 'Role', {}, EBMS_ROLE_RESP));
  partyInfo.appendChild(partyTo);

  userMessage.appendChild(partyInfo);

  const collabInfo = e('ns2', 'CollaborationInfo');
  collabInfo.appendChild(e('ns2', 'AgreementRef', {}, PEPPOL_AS4.AGREEMENT));
  collabInfo.appendChild(e('ns2', 'Service', { type: PEPPOL_AS4.SERVICE_TYPE }, context.processId));
  collabInfo.appendChild(e('ns2', 'Action', {}, `busdox-docid-qns::${context.documentType}`));
  collabInfo.appendChild(e('ns2', 'ConversationId', {}, messageId));
  userMessage.appendChild(collabInfo);

  const msgProps = e('ns2', 'MessageProperties');
  msgProps.appendChild(e('ns2', 'Property', { name: 'originalSender', type: 'iso6523-actorid-upis' }, 
    getParticipantValue(context.senderId)));
  msgProps.appendChild(e('ns2', 'Property', { name: 'finalRecipient', type: 'iso6523-actorid-upis' },
    getParticipantValue(context.receiverId)));
  userMessage.appendChild(msgProps);

  const payloadInfo = e('ns2', 'PayloadInfo');
  const partInfo    = e('ns2', 'PartInfo', { href: attachmentId });
  const partProps   = e('ns2', 'PartProperties');
  
  partProps.appendChild(e('ns2', 'Property', { name: 'CompressionType' }, 'application/gzip'));
  partProps.appendChild(e('ns2', 'Property', { name: 'MimeType'        }, 'application/xml'));
  partInfo.appendChild(partProps);

  payloadInfo.appendChild(partInfo);
  userMessage.appendChild(payloadInfo);

  // Messaging
  const messaging = e('ns2', 'Messaging', {
    'env:mustUnderstand': 'true',
    'wsu:Id':            'messaging',
  });
  messaging.appendChild(userMessage);

  // Body
  const body = e('env', 'Body', wsuId('body'));

  // Security (placeholder)
  const security = e('wsse', 'Security', { 'env:mustUnderstand': 'true' });

  // Header
  const header = e('env', 'Header');
  header.appendChild(messaging);
  header.appendChild(security);

  // Envelope
  const envelope = e('env', 'Envelope');
  addExtraNs(EBMS_AS4_NAMESPACES, envelope);
 
  envelope.appendChild(header);
  envelope.appendChild(body);

  doc.replaceChild(envelope, doc.documentElement);

  return { attachmentId, envelope, messaging, body, doc };
}

// ── Build full AS4 message ───────────────────────────────────────────────────

export function buildAs4Message(context, document) {
  const docBuf = Buffer.isBuffer(document) ? document : Buffer.from(document);

  /*
    Step 1: Gzip compress the document and compute a SHA-256 digest 
    of the compressed bytes. The hash is included in the AS4 signature 
    for attachment integrity verification.
  */
  context.spinner.start('Compressing Document');
  const { compressed, digest } = compressDocument(docBuf);
  context.spinner.done('Compressed Document');

  /*
    Step 2: Encrypt the document payload using the receiver's
    public key. Returns the encrypted session key (cipher_value),
    the encrypted gzipped content.
  */
  const { cipherValue, encryptedContent } = encryptDocument(context, compressed);

  /*
    Step 3: Build the AS4 SOAP envelope structure including the ebMS3
    messaging header, security header placeholder, and empty body.
  */
  context.spinner.start('Building Envelope');
  const { attachmentId, envelope, messaging, body, doc } = buildAs4Envelope(context);
  context.spinner.done('Built Envelope');

  if (context.persist) {
const debugOutput = `
━━━━ MESSAGING C14N ━━━━━━━━━━━━━━ 
${format(c14nSyncNode(messaging), { indentation: "  ", collapseContent: true })}

━━━━ BODY C14N ━━━━━━━━━━━━━━━━━━━ 
${format(c14nSyncNode(body), { indentation: "  ", collapseContent: true })}

━━━━ MESSAGING DIGEST ━━━━━━━━━━━━ 
${c14nDigest(messaging)}

━━━━ BODY DIGEST ━━━━━━━━━━━━━━━━━ 
${c14nDigest(body)}
`;
    const outDir = getUserTransactionsDir();
    fs.writeFileSync(
      path.join(outDir, `${context.id}_signing_input.txt`),
      debugOutput
    );
  }

  /**
   * Step 4: Inject WS-Security encryption headers into the SOAP envelope.
   * Wraps the AES-128-GCM session key with RSA-OAEP using the receiver's certificate,
   * and references the encrypted attachment via a CipherReference.
   */
  context.spinner.start('Encrypting Envelope');
  encryptAs4Envelope(context, attachmentId, envelope, cipherValue);
  context.spinner.done('Encrypted Envelope');

  /*
    Step 5: Sign the envelope body, messaging header, and attachment
    using the sender's private key. The attachment is referenced by
    its content ID and signed using the SwA attachment transform.
  */
  context.spinner.start('Signing Envelope');
  signAs4Envelope(context, attachmentId, envelope, messaging, body, digest);
  context.spinner.done('Signed Envelope');

  const envelopeXml = serializer.serializeToString(doc);

  if (context.persist) {
    const outDir = getUserTransactionsDir();
    fs.writeFileSync(path.join(outDir, `${context.id}_soap_envelope.xml`), envelopeXml);
  }

  return { attachmentId, envelopeXml: Buffer.from(envelopeXml), encryptedContent };
}

// ── Build multipart request ──────────────────────────────────────────────────

export function buildAs4Request(context, document) {
  const { attachmentId, envelopeXml, encryptedContent } = buildAs4Message(context, document);

  const boundary  = `===============${crypto.randomBytes(16).toString('hex')}==`;
  const cidBare = attachmentId.replace(/^cid:/, '');

  /*
    AS4 MIME multipart requires CRLF line endings (RFC 2822)
    phase4 (and most AS4 gateways) strictly require this
  */
  const CRLF = '\r\n';

  /*
    AS4 SwA (SOAP with Attachments) profile requires the SOAP envelope to be
    the first MIME part, followed by the encrypted attachment. Receivers may
    reject the message if the order is incorrect.
  */
  const parts = [
    `Content-Type: multipart/related;${CRLF}`,
    ` boundary="${boundary}"${CRLF}`,
    `MIME-Version: 1.0${CRLF}${CRLF}`,
    `--${boundary}${CRLF}`,
    `Content-Type: application/soap+xml${CRLF}`,
    `MIME-Version: 1.0${CRLF}`,
    `Content-Transfer-Encoding: 7bit${CRLF}`,
    `Content-ID: <root.message@cxf.apache.org>${CRLF}`,
    CRLF,
    envelopeXml.toString('utf-8'),
    CRLF,
    `--${boundary}${CRLF}`,
    `Content-Type: application/octet-stream${CRLF}`,
    `MIME-Version: 1.0${CRLF}`,
    `Content-Transfer-Encoding: base64${CRLF}`,
    `Content-ID: <${cidBare}>${CRLF}`,
    CRLF,
  ];

  const attachmentB64 = encryptedContent.toString('base64');
  const attachmentB64Lines = attachmentB64.match(/.{1,76}/g).join(CRLF) + CRLF;

  const bodyParts = Buffer.concat([
    Buffer.from(parts.join('')),
    Buffer.from(attachmentB64Lines),
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);

  const headers = {
    'Content-Type': `multipart/related; type="application/soap+xml"; start="<root.message@cxf.apache.org>"; boundary="${boundary}"`,
    'Content-Length': String(bodyParts.length),
  };

  /*
    If probe mode is active, attach the probe certificate identifier
    to the outbound AS4 request.
    
    The receiving side uses this header to:
      - Fetch the persisted probe certificate/key material
      - Load the matching private key
      - Perform deterministic decryption independent of SMP metadata
    
    This ensures the crypto context is explicitly bound to the probe ID.
  */
  if (context.certId) {
    headers['X-Node42-Probe-Cert-Id'] = context.certId;
  }

  return { headers, body: bodyParts };
}

// ── Send ─────────────────────────────────────────────────────────────────────

/* eslint-disable no-await-in-loop */
export async function sendAs4Message(context, headers, body) {
  const MAX_RETRIES  = 3;
  const RETRY_DELAYS = [5000, 30000, 120000]; // ms
  
  const outDir = getUserTransactionsDir();
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      context.spinner.start(`Retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    context.spinner.start('Sending Message        ');
    context.timer.mark(`Sending Message (${attempt})`, false);

    let res;
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), context.timeout);
      res = await fetch(context.endpointUrl, { method: 'POST', headers, body, signal: ctrl.signal });
      clearTimeout(tid);
    } 
    catch(e) {
      context.spinner.fail('Sending Message');
      lastError = new N42Error(N42ErrorCode.SERVER_ERROR, { details: e.message }, { url: context.endpointUrl, retryable: true });
      continue;
    }

    let resBody;
    try {
      resBody = Buffer.from(await res.arrayBuffer());
      context.timer.mark('Received Response');
    } catch(e) {
      context.spinner.fail('Sending Message');
      lastError = new N42Error(N42ErrorCode.SERVER_ERROR, { details: `Failed to read response: ${e.message}` }, { retryable: true });
      continue;
    }
    
    if (!resBody.length || res.status >= 400) {
      const retryable = res.status >= 500;
      context.spinner.fail('Sending Message');
      lastError = new N42Error(N42ErrorCode.SERVER_ERROR, { details: `HTTP ${res.status}` }, { url: context.endpointUrl, retryable });
      if (!retryable) {
        break;
      }
      continue;
    }

    context.spinner.done('Sent Message');

    const responseHeaders = {};
    for (const [key, value] of res.headers.entries()) {
      responseHeaders[key] = value;
    }

    if (context.persist) {
      fs.writeFileSync(
        path.join(outDir, `${context.id}_response_headers.json`), 
        JSON.stringify(responseHeaders, null, 2)
      );
      fs.writeFileSync(
        path.join(outDir, `${context.id}_response_body.txt`),
        resBody
      );
    }

    await saveTransaction(context);

    context.spinner.start('Parsing Response');
    let signal;
    try {
      signal = parseAs4Signal(resBody);
    } 
    catch(e) {
      context.spinner.fail('Parsing Response');
      lastError = new N42Error(N42ErrorCode.SERVER_ERROR, { details: e.message }, { url: context.endpointUrl, retryable: true });
      continue;
    }
    context.spinner.done('Parsed Response');

    if (context.persist) {
      fs.writeFileSync(
        path.join(outDir, `${context.id}_as4_signal.xml`),
        resBody
      );
      fs.writeFileSync(
        path.join(outDir, `${context.id}_as4_mdn.json`),
        JSON.stringify(signal, null, 2)
      );
    }

    if (signal.errors?.length) {
      context.spinner.fail('Error Received');
      return signal;
    }

    if (signal.isReceipt) {
      context.spinner.done(`Receipt Received`);
      return signal;
    }
  }

  context.spinner.fail('Sending Message');
  throw lastError;
}
/* eslint-enable no-await-in-loop */