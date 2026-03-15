/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { 
  N42Error, 
  N42ErrorCode,
} from '../../core/error.js';

import { getDocumentInKey, getDocumentOutKey } from '../storage.js'


export async function createReceiverS3Adapter(client) {
  let commands, presignerCommands;
  try { 
    commands = await import('@aws-sdk/client-s3');
    presignerCommands = await import("@aws-sdk/s3-request-presigner");
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "DynamoDB adapter requires AWS SDK — run: npm install @aws-sdk/lib-dynamodb @aws-sdk/client-dynamodb" });
  }
  
  const { PutObjectCommand, GetObjectCommand } = commands;
  const { getSignedUrl } = presignerCommands;

  async function getUploadUrl(context) {
    const s3Bucket = context.runtimeEnv.get('AWS_BUCKET');
    const s3Key = getDocumentOutKey(context.userId, context.id);

    const putCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    });

    const signedUploadUrl = await getSignedUrl(client, putCommand, { expiresIn: 3600 });
    return signedUploadUrl;
  }

  async function get(context) {
    const s3Bucket = context.runtimeEnv.get('AWS_BUCKET');
    const s3Key = context.document;

  
    const res = await client.send(
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

  async function store(context) {
    const s3Bucket = context.runtimeEnv.get('AWS_BUCKET');
    const s3Key = getDocumentInKey(context.id);
    
    try {
      await client.send(new PutObjectCommand({
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
}