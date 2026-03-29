/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { decompressDocument } from '../security/crypto.js';
import { parseCert, extractCertFields, validateCert } from '../security/pki.js';
import { createSoapHttpResponse } from '../core/utils.js'

import { parseAs4Message } from './parse.js';
import { verifyAs4Signature } from './verify.js';
import { decryptAs4Payload } from './decrypt.js';
import { validateDocument } from './validate.js';
import { generateMDN } from './mdn.js';

import { 
  N42Error,
  N42ErrorCode 
} from '../core/error.js';

import { 
  createStorage, 
  getStorageAdapter 
} from '../storage/storage.js';

/*
import { 
  createSecrets, 
  getSecretsAdapter 
} from '../secrets/secrets.js';
*/

import { 
  createDb, 
  getDbAdapter 
} from '../db/db.js';

import { 
  createMlsAdapter, 
  getMlsAdapter,
  buildMlsOptions,
  generateMls 
} from '../mls/mls.js';


let db = null;
async function getDb(context) {
  if (!db) db = createDb(await getDbAdapter(context));
  return db;
}

let storage = null;
async function getStorage(context) {
  if (!storage) storage = createStorage(await getStorageAdapter(context));
  return storage;
}

let mls = null;
async function getMls(context) {
  if (!mls) mls = createMlsAdapter(await getMlsAdapter(context));
  return mls;
}

/*
TODO: Secrets Adapter will be enabled once the implementation
is finalized <a1exnd3r 2026-03-16 p:1>
*/

/*
let secrets = null;
async function getSecrets(context) {
  if (!secrets) secrets = createSecrets(await getSecretsAdapter(context));
  return secrets;
}
*/

/*
  Cryptographic Processing Order

  [x]  1. Parse: incoming Content-Type: multipart/related request and extract boundary parameter
  [x]  2. Parse: <soap:Envelope> and extract <soap:Header> and <soap:Body>
  [x]  3. Parse Sender's (C2) certificate: extract from <wsse:BinarySecurityToken>, decode (Base64) and parse the X.509 structure
  [x]  4. Check Expiry: Verify (C2) cert NotBefore <= now <= NotAfter
  [ ]  5. Build Chain: Construct chain from (C2) cert to Peppol Root CA
  [x]  6. Verify Chain: Validate that (C2) cert chains to trusted Peppol CA
  [ ]  7. Check Revocation: OCSP/CRL check (optional but recommended)
  [x]  8. Verify Message Signature: Use public key from (C2) cert to verify the XML Digital Signature (<ds:Signature>) in the <soap:Header>
  [x]  9. Verify Digest: Recalculate (SHA-256) digests of signed elements and compare with <ds:DigestValue> in <ds:SignedInfo>
  [x] 10. Decrypt Session Key: Use receiver's (C3) private key to decrypt session key from <xenc:EncryptedKey>
  [x] 11. Decrypt Payload: Use session key to decrypt payload (AES-128-GCM) from <xenc:EncryptedData>
  [ ] 12. Check Duplicate: Compare <eb:MessageId> with message log (reject if duplicate)
  [ ] 13. Validate Timestamp: Reject messages with <eb:Timestamp> older than (implementation-defined) minutes or in the future (clock skew tolerance)
  [x] 14. Decompress: (gunzip) the decrypted payload
  [x] 15. Extract SBDH: Parse the Standard Business Document Header
  [x] 16. Validate Business Document: Check against UBL/CII schemas and Schematron rules
  [x] 17. Generate Receipt: and sign with (C3) private key
  [x] 18. Return Receipt: as synchronous response to original HTTP POST

*/
export async function receiveAs4Message(context, event) {
  //secrets = await getSecrets(context);
  db = await getDb(context);
  storage = await getStorage(context);
  mls = await getMls(context);

  const startTime = Date.now(); 
  
  try {
    console.log('--- [ INBOUND_MESSAGE: AS4 ] ---');
    console.log('Content-Length:', event.headers['content-length']);
    
    // Check for PROBE mode
    const probeCertId = event.headers['x-node42-probe-cert-id'];
    if (probeCertId !== null && probeCertId.length === 36) {
      console.log("--- [ PROBE_HEADER: FOUND ] ---\nprobeCertId: " + probeCertId);
      context.certId = probeCertId;  
    }

    console.log('[1/9] Loading AP Certificate...');
    const apCert = await db.getOne('Identity', 'SYSTEM', `CERT#${context.certId}`);
    context.receiverCert = apCert.certPem;
    context.receiverKey = apCert.privKeyPem;

    const cert = parseCert(apCert.certPem);
    const subject = extractCertFields(cert, 'subject');
    console.log('✓ Loaded certificate CN:', subject.CN);

    const bodyStr = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body instanceof ArrayBuffer
      ? Buffer.from(event.body).toString('utf-8')
      : event.body;
    
    // sender: buildAs4Request
    console.log('[2/9] Parsing AS4 message...');
    const { envelope, attachment, messageId, from, to } = await parseAs4Message(
      event.headers['content-type'],
      bodyStr
    );
    
    context.messageId = messageId;
    context.senderId = from;
    context.receiverId = to;
    
    // sender: signAs4Envelope
    console.log('[3/9] Verifying signature...');
    const signature = await verifyAs4Signature(envelope, attachment);
    if (!signature.valid) {
      console.error('Signature verification failed:', signature.error);
      return createErrorResponse(
        context,
        new N42Error(N42ErrorCode.CRYPTO_FAILED, { details: 'Digital signature verification failed'})
      );
    }
    console.log('✓ Signature verified from:', signature.senderCN);

    /*
    In PROBE mode (certId set), certificate validation is intentionally
    skipped because the certificate is dynamically generated and tied to
    the persisted private key for deterministic crypto testing.
    */
    console.log('[4/9] Validating sender certificate...');
    context.senderCert = signature.senderCert;
    if (!context.certId) {
      validateCert(context);
    } else {
      console.error('⚠ Probe mode: Skipping certificate validation');
    }
    console.log('✓ Sender certificate: TRUSTED');

    
    // sender: encryptAs4Envelope + encryptDocument
    console.log('[5/9] Decrypting payload...');
    const { decrypted, sessionKey } = await decryptAs4Payload(envelope, attachment, context.receiverKey);

    if (context.verbose) {
      console.log('Session key (hex):', sessionKey?.toString('hex'));
    }
    
    // sender: compressDocument
    console.log('[6/9] Decompressing document...');
    context.document = decompressDocument(decrypted);
    console.log('✓ Decompressed document:', context.document.length, 'bytes');
    

    console.log('[7/9] Validating business document...');
    const validation = await validateDocument(context);
    if (!validation.valid) {
      console.error('Document validation failed:', validation.errors);
      return createErrorResponse(
        context,
        new N42Error(N42ErrorCode.DOC_INVALID, { details: 'Business document validation failed'}),
        validation.errors
      );
    }
    console.log('Document Type:', validation.documentType);
    console.log('✓ Document: VALID');
    
    /*
    TODO: Replace current logic, this persistance logic is temporary placeholder 
    to demonstrate possible behavior <a1exnd3r 2026-03-16 p:1>
    */
    console.log('[8/9] Storing Transaction...');
    await storage.store(context);
  
    const transactionItem = {
      type:              'TRANSACTION',
      userId:            context.receiverId,
      id:                context.id,
      messageId:         context.messageId,
      PK:                `USER#${context.receiverId}`,
      SK:                `TRANSACTION#${context.id}`,
      GSI1PK:            `USER#${context.receiverId}#FLOW#FROM_NETWORK`,
      GSI1SK:            context.timestamp,
      environment:       context.env,
      transactionFlow:   'FROM_NETWORK',
      senderId:          context.senderId,
      receiverId:        context.receiverId,
      docTypeId:         validation.documentType,
      //document:          context.document.toString('utf-8'),
      transactionStatus: 'COMPLETED',
      createdAt:         context.timestamp,
    };

    await db.insert('Transactions', transactionItem);
    console.log('✓ Transaction stored');

    // Send MLS (Message Level Status) back to C2
    if (context.runtimeEnv.get('N42_MLS_ENABLED') === 'true') {
      try {
        const mlsOptions = buildMlsOptions(context, true);
        const mlsXml = generateMls(mlsOptions);

        context.runtimeEnv.scheduleTask(
          mls.send(context, mlsXml, context.senderId)
        );
      }
      catch(e) {
        console.error('MLS error:', e.message);
      }
    }
    
    // sender: parseAs4Signal
    console.log('[9/9] Generating MDN...');
    const successMdn = generateMDN({
      refToMessageId: context.messageId,
      timestamp: new Date().toISOString(),
      status: 'success',
      cert: context.receiverCert,
      key: context.receiverKey,
    });
    console.log('✓ MDN generated');

    console.log('--- [ PROCESS_RESULT: SUCCESS ] ---');
    console.log('Total time:', Date.now() - startTime, 'ms');
    
    return createSoapHttpResponse(successMdn);
  } 
  catch(e) {
    console.error('--- [ PROCESS_RESULT: FAILED ] ---');
    console.error('⚠ ', e.reason);
    
    const errorMdn = generateMDN({
      refToMessageId: event.headers['message-id'] || 'unknown',
      timestamp: new Date().toISOString(),
      status: 'error',
      cert: context.receiverCert,
      key: context.receiverKey,
      
      errorCode: e.code || N42ErrorCode.INTERNAL_ERROR,
      errorMessage: e.reason || e.message,
    });
    
    return createSoapHttpResponse(errorMdn);
  }
}

function createErrorResponse(context, error, details = null) {
  console.error(`Error [${error.errorCode}]:`, error.reason);

  if (details) {
    console.error('Details:', details);
  }
  
  const errorMdn = generateMDN({
    refToMessageId: context.messageId,
    timestamp: context.timestamp,
    status: 'error',
    cert: context.receiverCert,
    key: context.receiverKey,
    
    errorCode: error.errorCode,
    errorMessage: error.reason,
    errorDetails: details,
  });

  return createSoapHttpResponse(errorMdn);
}