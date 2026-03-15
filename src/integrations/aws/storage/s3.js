/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import { 
  N42Error, 
  N42ErrorCode,
} from '../../../core/error.js';


async function isStorageAvailable() {
  let S3Client, PutObjectCommand, GetObjectCommand;
  try {
    ({ S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3'));
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "S3 requires AWS SDK — run: npm install @aws-sdk/client-s3" });
  }

  return { S3Client, PutObjectCommand, GetObjectCommand }
}

async function isUploadAvailable() {
  let getSignedUrl;
  try {
    ({ getSignedUrl } = await import("@aws-sdk/s3-request-presigner"));
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "S3 upload requires AWS SDK — run: npm install @aws-sdk/s3-request-presigner" });
  }

  return { getSignedUrl }
}

function getDocumentInKey(transactionId) {
  const archiverDatePath = getArchiverDatePath();
  const prefix = transactionId.substring(0, 4);
  return `transactions/artefacts/${prefix}/${archiverDatePath}${transactionId}@doc-in.xml`;
}

function getDocumentOutKey(userId, transactionId) {
  const archiverDatePath = getArchiverDatePath();
  const prefix = transactionId.substring(0, 4);
  return `outbound/${prefix}/${userId}/${archiverDatePath}${transactionId}@doc-out.xml`;
}

function getArchiverDatePath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}/`;
}

export async function getUploadUrl(context) {
  const s3Bucket = process.env.AWS_BUCKET;
  const s3Key = getDocumentOutKey(context.userId, context.id);

  const { getSignedUrl } = await isUploadAvailable();
  const { S3Client, PutObjectCommand, _ } = await isStorageAvailable();
  const s3Client = new S3Client();

  const putCommand = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
  });

  const signedUploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });
  return signedUploadUrl;
}

export async function getFile(context) {
  const s3Bucket = context.s3Bucket ?? process.env.AWS_BUCKET;
  const s3Key = context.document;

  const { S3Client, _, GetObjectCommand } = await isStorageAvailable();
  const s3Client = new S3Client();

  const res = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key
    })
  );

  const stream = res.Body;

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

export async function storeFile(context) {
  const s3Bucket = process.env.AWS_BUCKET;
  const s3Key = getDocumentInKey(context.id);

  const { S3Client, PutObjectCommand, _ } = await isStorageAvailable();
  const s3Client = new S3Client();
  
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: context.document,
      ContentLength: context.document.length,
      ContentType: 'application/xml',
      ChecksumAlgorithm: 'SHA256'
    }));
    
    console.log('✓ Document stored to S3:', s3Key);
  } 
  catch(e) {
    console.error('S3 storage failed:', e);
    throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
  }
}
