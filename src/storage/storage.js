/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { createReceiverS3Adapter }    from './adapters/aws.s3.js';
import { createReceiverBlobAdapter }  from './adapters/azure.blob.js';

import { 
  N42Error, 
  N42ErrorCode,
} from '../core/error.js';


async function isS3Available() {
  let S3Client, PutObjectCommand, GetObjectCommand, getSignedUrl, fromIni;
  try {
    ({ S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3'));
    ({ fromIni }                                      = await import('@aws-sdk/credential-provider-ini'));
    ({ getSignedUrl }                                 = await import("@aws-sdk/s3-request-presigner"));
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "S3 requires AWS SDK — run: npm install @aws-sdk/client-s3 @aws-sdk/credential-provider-ini" });
  }

  return { S3Client, PutObjectCommand, GetObjectCommand, getSignedUrl, fromIni }
}

async function isBlobAvailable() {
  try {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    return { BlobServiceClient };
  }
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "Blob adapter requires Azure SDK — run: npm install @azure/storage-blob" });
  }
}

export async function getStorageAdapter(context) {
    const procEnvStorage = context.runtimeEnv.get('N42_STORAGE_ADAPTER');
    switch(procEnvStorage) {
        case 'receiver-azure-blob': {
            const { BlobServiceClient } = await isBlobAvailable();
            try {
                const connectionString = context.runtimeEnv.get('AZURE_STORAGE_CONNECTION_STRING');
                const client = BlobServiceClient.fromConnectionString(connectionString);
                return await createReceiverBlobAdapter(client);
            }
            catch(e) {
                throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message });
            }
        }

        case 'receiver-aws-s3': {
            const { S3Client, fromIni } = await isS3Available();
  
            try {
                const isLocal = context.runtimeEnv.platform === null;
                const hasAccessKey = context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY') !== undefined;

                const client = new S3Client({
                    region: context.runtimeEnv.get('AWS_REGION') ?? 'eu-north-1',
                    ...(!hasAccessKey && isLocal && {
                        credentials: fromIni({ profile: context.runtimeEnv.get('AWS_PROFILE') }),
                    }),
                    ...(hasAccessKey && {
                        credentials: {
                            accessKeyId: context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY'),
                            secretAccessKey: context.runtimeEnv.get('CLOUD_AWS_SECRET_KEY'),
                        },
                    }),
                });
                return await createReceiverS3Adapter(client);
            }
            catch(e) {
                throw new N42Error(N42ErrorCode.STORAGE_ERROR, { details: e.message }); 
            }
        }

        default: {
            return null;
        }
    }
}

export function createStorage(adapter) {
  return {
    get:             (context)         => adapter.get(context),
    store:           (context)         => adapter.store(context),
    getUploadUrl:    (context)         => adapter.getUploadUrl(context),
  };
}

export function getDocumentInKey(transactionId) {
    const archiverDatePath = getArchiverDatePath();
    const prefix = transactionId.substring(0, 4);
    return `transactions/artefacts/${prefix}/${archiverDatePath}${transactionId}@doc-in.xml`;
}

export function getDocumentOutKey(userId, transactionId) {
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