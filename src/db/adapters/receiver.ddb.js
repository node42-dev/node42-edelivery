/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import { 
  N42Error, 
  N42ErrorCode 
} from '../../core/error.js';


export async function createReceiverDynamoDbAdapter(client) {
  let commands;
  try { commands = await import('@aws-sdk/lib-dynamodb'); } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "DynamoDB adapter requires AWS SDK — run: npm install @aws-sdk/lib-dynamodb @aws-sdk/client-dynamodb" });
  }
  const { PutCommand, GetCommand } = commands;

  async function send(cmd) {
    try {
      return await client.send(cmd);
    } catch(e) {
      if (e.name === "UnrecognizedClientException" || e.name === 'CredentialsProviderError') {
        throw new N42Error(N42ErrorCode.SSO_SESSION_EXPIRED, { details: 'Refresh the SSO session; run: aws sso login' });
      }

      if (e.name === 'ValidationException') {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, {
          details: `DynamoDB table misconfigured: ${e.message}`
        });
      }
      throw e;
    }
  }

  async function insert(collection, item) {
    switch(collection) {
      case 'Transactions': {
          try {
            await send(new PutCommand({
              TableName: collection,
              Item: item,
            }));
            
            console.log('✓ Transaction stored to DynamoDB: ', item.id);
          } 
          catch(e) {
              console.error('DynamoDB storage failed:', e);
              throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });  
          }
          break;
        }
      }
    }
    
    async function getAll(_collection) {
       throw new N42Error(N42ErrorCode.NOT_IMPLEMENTED, { details: 'getAll()' });   
    }

    async function getOne(collection, key, value) {
      const result = await send(new GetCommand({
        TableName: collection,
        Key: {
          PK: key,
          SK: value
        }
      }));
      
      if (!result.Item) {
        throw new N42Error(
          N42ErrorCode.STORAGE_ITEM_NOT_FOUND,
          { details: `Item not found: ${key}=${value}` },
          { retryable: false }
        );
      }
    
      return result.Item;
    }
   
    return {
        insert,
        getAll,
        getOne
    }
}