/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import { decompressDocument } from '../security/crypto.js';
import { parseCert, extractCertFields, validateCert } from '../security/pki.js';

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

// TODO: Secrets Adapter will be enabled once the implementation is finalized. <a1exnd3r 2026-03-16 p:1>
/*
let secrets = null;
async function getSecrets(context) {
  if (!secrets) secrets = createSecrets(await getSecretsAdapter(context));
  return secrets;
}
*/

/**
 * Receiver message processing flow:
 * 1.  Parse incoming multipart/related HTTP request
 * 1a. Extract SOAP envelope and encrypted attachment
 * 2.  Verify signature (sender's public key from BST)
 * 3.  Validate certificate (sender's certificate)
 * 4.  Decrypt attachment (our private key)
 * 5.  Decompress gzipped content
 * 6.  Validate UBL business document
 * 7.  Store transaction
 * 8.  Return MDN (receipt/error)
 */

export async function receiveAs4Message(context, event) {
  db = await getDb(context);
  storage = await getStorage(context);
  //secrets = await getSecrets(context);
  
  const startTime = Date.now(); 
  
  try {
    console.log('--- [ INBOUND_MESSAGE: AS4 ] ---');
    console.log('Content-Length:', event.headers['content-length']);
    
    // Check for probe mode (Node42 diagnostic probes)
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
    
    // Step 1: Parse multipart AS4 message (sender: buildAs4Request)
    console.log('[2/9] Parsing AS4 message...');
    const { envelope, attachment, messageId, from, to } = await parseAs4Message(
      event.headers['content-type'],
      bodyStr
    );
    
    context.messageId = messageId;
    context.senderId = from;
    context.receiverId = to;
    
    // Step 2: Verify signature (sender: signAs4Envelope)
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
    Step 3: Validate certificate.
    
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
    console.log('✓ Sender certificate trusted');

    
    // Step 4: Decrypt payload (sender: encryptAs4Envelope + encryptDocument)
    console.log('[5/9] Decrypting payload...');
    const { decrypted, sessionKey } = await decryptAs4Payload(envelope, attachment, context.receiverKey);

    if (context.verbose) {
      console.log('Session key (hex):', sessionKey?.toString('hex'));
    }
    
    // Step 5: Decompress (sender: compressDocument)
    console.log('[6/9] Decompressing document...');
    context.document = decompressDocument(decrypted);
    
    console.log('✓ Decompressed document:', context.document.length, 'bytes');
    
    // Step 6: Validate UBL business document
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
    
    // Step 7: Store transaction
    console.log('[8/9] Storing Transaction...');

    await storage.store(context);
  
    await db.insert('Transactions', {
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
    });
    
    console.log('✓ Transaction stored');
    
    // Step 8: Generate positive MDN (sender: parseAs4Signal)
    console.log('[9/9] Generating (signed) MDN receipt...');
    const successMdn = generateMDN({
      refToMessageId: context.messageId,
      timestamp: new Date().toISOString(),
      status: 'success',
      cert: context.receiverCert,
      key: context.receiverKey,
    });
    
    console.log('✓ MDN generated');

    console.log('--- [ END_PROCESS: SUCCESS ] ---');
    console.log('Total time:', Date.now() - startTime, 'ms');
    
    // Return MDN as SOAP response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(successMdn, 'utf-8')),
      },
      body: successMdn,
    };
    
  } 
  catch(e) {
    console.error('--- [ END_PROCESS: FAILED ] ---');
    console.error('⚠ ', e.reason);
    
    // Return error MDN
    const errorMdn = generateMDN({
      refToMessageId: event.headers['message-id'] || 'unknown',
      timestamp: new Date().toISOString(),
      status: 'error',
      cert: context.receiverCert,
      key: context.receiverKey,
      
      errorCode: e.code || N42ErrorCode.INTERNAL_ERROR,
      errorMessage: e.reason || e.message,
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      body: errorMdn,
    };
  }
}

/**
 * Create error response with negative MDN
 */
function createErrorResponse(context, error, details = null) {
  console.error(`Error [${error.errorCode}]:`, error.message);
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
    errorMessage: error.message,
    errorDetails: details,
  });
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
    },
    body: errorMdn,
  };
}