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


export async function createReceiverAwsSecMgrAdapter(client) {
  let commands;
  try { commands = await import('@aws-sdk/client-secrets-manager'); } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "SecretsManager requires AWS SDK — run: npm install @aws-sdk/client-secrets-manager" });
  }
  const { GetSecretValueCommand } = commands;

  async function store(_key, _value) {
    throw new N42Error(N42ErrorCode.NOT_IMPLEMENTED, { details: 'store()' });   
  }
  
  async function get(arn) {
    const response = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    return response.SecretString;
  }

  return { store, get }
}