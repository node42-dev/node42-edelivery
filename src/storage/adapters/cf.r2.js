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

import { getDocumentInKey, getDocumentOutKey } from '../storage.js';


export async function createReceiverR2Adapter(r2) {
    /*
      The AWS SDK just happens to speak the S3 protocol — it's just an HTTP client that knows 
      the S3 request format. So we point it at Cloudflare's endpoint instead of AWS, and give
      it R2 API tokens instead of AWS keys. 
      
      The SDK doesn't know or care it's talking to Cloudflare.
    */
    async function getUploadUrl(context) {
      try {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

        const accountId = context.runtimeEnv.get('CF_ACCOUNT_ID');
        const bucket    = context.runtimeEnv.get('CF_R2_BUCKET');
        const accessKey = context.runtimeEnv.get('CF_R2_ACCESS_KEY');
        const secretKey = context.runtimeEnv.get('CF_R2_SECRET_KEY');

        const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`, // remove .eu for default jurisdiction
        credentials: {
            accessKeyId:     accessKey,
            secretAccessKey: secretKey,
        },
        });

        const blobKey = getDocumentOutKey(context.userId, context.id);

        const url = await getSignedUrl(s3, new PutObjectCommand({
        Bucket:      bucket,
        Key:         blobKey,
        ContentType: 'application/xml',
        }), { expiresIn: 3600 });

        return url;
    } catch(e) {
        throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
    }
  }

  async function get(context) {
    try {
      const blobKey = context.document;
      const object = await r2.get(blobKey);

      if (!object) {
        throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: `Object not found: ${blobKey}` });
      }

      const arrayBuffer = await object.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('utf-8');
    } catch(e) {
      if (e instanceof N42Error) throw e;
      throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
    }
  }

  async function store(context) {
    const blobKey = getDocumentInKey(context.id);

    try {
      await r2.put(blobKey, context.document, {
        httpMetadata: { contentType: 'application/xml' },
      });
      console.log('✓ Document stored to R2:', blobKey);
    } catch(e) {
      console.error('R2 storage failed:', e);
      throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
    }
  }

  return { getUploadUrl, get, store };
}