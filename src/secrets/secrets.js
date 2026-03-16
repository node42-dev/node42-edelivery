/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { createReceiverAwsSecMgrAdapter } from './adapters/aws.sec.mgr.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../core/error.js';


async function isAwsSecMgrAvailable() {
  let SecretsManagerClient, fromIni;
  try {
    ({ SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager'));
    ({ fromIni }              = await import('@aws-sdk/credential-provider-ini'));
  } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "SecretsManager requires AWS SDK — run: npm install @aws-sdk/client-secrets-manager" });
  }

  return { SecretsManagerClient, fromIni }
}

export async function getSecretsAdapter(context) {
    const procEnvSecrets = context.runtimeEnv.get('N42_SECRETS_ADAPTER');
    if (!procEnvSecrets) {
      throw new N42Error(N42ErrorCode.SECRETS_ERROR, { details: 'No secrets adapter configured — set N42_SECRETS_ADAPTER' });
    }
    
    switch(procEnvSecrets) {
      case 'receiver-aws-sec-mgr': {
        const { SecretsManagerClient, fromIni } = await isAwsSecMgrAvailable();

        try {
          const isLocal = context.runtimeEnv.platform === null;
          const hasAccessKey = context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY') !== undefined;
          const client = new SecretsManagerClient({
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

          return await createReceiverAwsSecMgrAdapter(client);
        }
        catch(e) {
          throw new N42Error(N42ErrorCode.SECRETS_ERROR, { details: e.message }); 
        }
      }

      default: {
        throw new N42Error(N42ErrorCode.SECRETS_ERROR, { details: 'No secrets adapter configured — set N42_SECRETS_ADAPTER' });
      }
    }
}

export function createSecrets(adapter) {
  return {
    get:             (context)         => adapter.get(context),
    store:           (context)         => adapter.store(context),
  };
}