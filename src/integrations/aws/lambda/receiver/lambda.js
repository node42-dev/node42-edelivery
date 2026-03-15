/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import path from 'path';

import { decompressDocument } from '../../../../security/crypto.js';
import { N42Context }        from '../../../../model/context.js';
import { parseCert, extractCertFields, getTruststore } from '../../../../security/pki.js';
import { storeFile } from '../../storage/s3.js';

import { parseAs4Message } from '../../../../receiver/parse.js';
import { verifyAs4Signature } from '../../../../receiver/verify.js';
import { decryptAs4Payload } from '../../../../receiver/decrypt.js';
import { validateDocument } from '../../../../receiver/validate.js';
import { generateMDN } from '../../../../receiver/mdn.js';

import { 
  N42ErrorCode 
} from '../../../../core/error.js';

import { 
  createDb, 
  getDbAdapter 
} from '../../../../db/db.js';

let db = null;
async function getDb() {
  if (!db) db = createDb(await getDbAdapter());
  return db;
}

/**
 * Receiver message processing flow:
 * 1. Parse incoming multipart/related HTTP request
 * 2. Extract SOAP envelope and encrypted attachment
 * 3. Verify signature (sender's public key from BST)
 * 4. Decrypt attachment (our private key)
 * 5. Decompress gzipped content
 * 6. Validate UBL business document
 * 7. Store message
 * 8. Return MDN (receipt)
 */

/**
 * AWS Lambda handler for receiving AS4 messages
 */
export const handler = async (event) => { 
  db = await getDb();

  const context = new N42Context({
      certId:     process.env.N42_RECEIVER_CERT_ID,
      schematron: '/var/task/src/assets/schematrons/billing',
      truststore: path.join(process.cwd(), 'src/assets/certs/truststore.pem'),
      env:        process.env.N42_ENV,
  });

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

    console.log('[1/8] Loading AP Certificate...');
    const apCert = await db.getOne('Identity', 'SYSTEM', `CERT#${context.certId}`);

    context.cert = apCert.certPem;
    context.key = apCert.privKeyPem;

    const cert = parseCert(apCert.certPem);
    const subject = extractCertFields(cert, 'subject');

    console.log('✓ Loaded certificate CN:', subject.CN);
    
    //const truststore = getTruststore(context);
    //console.log(truststore);

    const bodyStr = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    
    // Step 1: Parse multipart AS4 message (sender: buildAs4Request)
    console.log('[2/8] Parsing AS4 message...');
    const { envelope, attachment, messageId, from, to } = await parseAs4Message(
      event.headers['content-type'],
      bodyStr
    );
    
    context.messageId = messageId;
    context.senderId = from;
    context.receiverId = to;
    
    // Step 2: Verify signature (sender: signAs4Envelope)
    console.log('[3/8] Verifying signature...');
    const verified = await verifyAs4Signature(envelope, attachment);
    
    if (!verified.valid) {
      console.error('Signature verification failed:', verified.error);
      return createErrorResponse(
        context,
        N42ErrorCode.CRYPTO_FAILED,
        'Digital signature verification failed'
      );
    }
    
    console.log('✓ Signature verified from:', verified.senderCN);
    
    // Step 3: Decrypt payload (sender: encryptAs4Envelope + encryptDocument)
    console.log('[4/8] Decrypting payload...');
    const { decrypted, _sessionKey } = await decryptAs4Payload(envelope, attachment, context.key);
    
    // Step 4: Decompress (sender: compressDocument)
    console.log('[5/8] Decompressing document...');
    context.document = decompressDocument(decrypted);
    
    console.log('✓ Decompressed document:', context.document.length, 'bytes');
    
    // Step 5: Validate UBL business document
    console.log('[6/8] Validating business document...');
    const validation = await validateDocument(context);
    
    if (!validation.valid) {
      console.error('Document validation failed:', validation.errors);
      return createErrorResponse(
        context,
        N42ErrorCode.DOC_INVALID,
        'Business document validation failed',
        validation.errors
      );
    }
    
    console.log('✓ Document valid:', validation.documentType);
    
    // Step 6: Store message
    console.log('[7/8] Storing message...');

    await storeFile(context);
  
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
    
    console.log('✓ Message stored');
    
    // Step 7: Generate positive MDN (sender: parseAs4Signal)
    console.log('[8/8] Generating MDN receipt...');
    const mdn = generateMDN({
      refToMessageId: context.messageId,
      timestamp: new Date().toISOString(),
      status: 'success',
    });
    
    console.log('✓ MDN generated');
    console.log('--- [ END_PROCESS: SUCCESS ] ---');
    console.log('Total time:', Date.now() - startTime, 'ms');
    
    // Return MDN as SOAP response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(mdn, 'utf-8')),
      },
      body: mdn,
    };
    
  } catch(e) {
    console.error('--- [ END_PROCESS: FAILED ] ---');
    console.error('Error:', e);
    
    // Return error MDN
    const errorMdn = generateMDN({
      refToMessageId: event.headers['message-id'] || 'unknown',
      timestamp: new Date().toISOString(),
      status: 'error',
      errorCode: e.code || N42ErrorCode.INTERNAL_ERROR,
      errorMessage: e.message,
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      body: errorMdn,
    };
  }
};

/**
 * Load secret from AWS Secrets Manager
 */
async function getSecret(secretArn) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient();
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  return response.SecretString;
}

/**
 * Create error response with negative MDN
 */
function createErrorResponse(context, errorCode, message, details = null) {
  console.error(`Error [${errorCode}]:`, message);
  if (details) console.error('Details:', details);
  
  const errorMdn = generateMDN({
    refToMessageId: context.messageId,
    timestamp: context.timestamp,
    status: 'error',
    errorCode,
    errorMessage: message,
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
