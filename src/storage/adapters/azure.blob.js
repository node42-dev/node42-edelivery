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


export async function createReceiverBlobAdapter(client) {
  let blobCommands;
  try { 
    blobCommands = await import('@azure/storage-blob');
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "Blob adapter requires Azure SDK — run: npm install @azure/storage-blob" });
  }
  
  const { BlobSASPermissions, _generateBlobSASQueryParameters, _StorageSharedKeyCredential } = blobCommands;

  async function getUploadUrl(context) {
    const container = context.runtimeEnv.get('AZURE_BLOB_CONTAINER');
    const blobKey = getDocumentOutKey(context.userId, context.id);
    const blockBlobClient = client.getContainerClient(container).getBlockBlobClient(blobKey);
    const signedUploadUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.from({ write: true }),
      expiresOn: new Date(Date.now() + 3600 * 1000),
    });
    return signedUploadUrl;
  }

  async function get(context) {
    const container = context.runtimeEnv.get('AZURE_BLOB_CONTAINER');
    const blobKey = context.document;
    const blockBlobClient = client.getContainerClient(container).getBlockBlobClient(blobKey);
    const downloadResponse = await blockBlobClient.download(0);
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  async function store(context) {
    const container = context.runtimeEnv.get('AZURE_BLOB_CONTAINER');
    const blobKey = getDocumentInKey(context.id);

    try {
      const blockBlobClient = client.getContainerClient(container).getBlockBlobClient(blobKey);
      await blockBlobClient.uploadData(context.document, {
        blobHTTPHeaders: { blobContentType: 'application/xml' },
      });
      console.log('✓ Document stored to Blob:', blobKey);
    }
    catch(e) {
      console.error('Blob storage failed:', e);
      throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
    }
  }

  return { getUploadUrl, get, store };
}