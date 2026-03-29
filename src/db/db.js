/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { getDbFile } from '../cli/paths.js';

import { createCliJsonFileAdapter } from './adapters/cli.json.db.js';
import { createCliDynamoDbAdapter } from './adapters/cli.dynamo.db.js';

import { createSenderDynamoDbAdapter } from './adapters/sender.dynamo.db.js';
import { createSenderCosmosDbAdapter } from './adapters/sender.cosmos.db.js';
import { createSenderD1Adapter }       from './adapters/sender.d1.db.js';

import { createReceiverDynamoDbAdapter } from './adapters/receiver.dynamo.db.js';
import { createReceiverCosmosDbAdapter } from './adapters/receiver.cosmos.db.js';
import { createReceiverD1Adapter }       from './adapters/receiver.d1.db.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../core/error.js';


function createDefaultAdapter() {
  return createCliJsonFileAdapter(getDbFile());
}

async function isCosmosDbAvailable() {
  try {
    const { CosmosClient } = await import('@azure/cosmos');
    return { CosmosClient };
  } catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "CosmosDB adapter requires Azure SDK — run: npm install @azure/cosmos" });
  }
}

async function isDynamoDbAvailable() {
  let DynamoDBClient, DynamoDBDocumentClient, fromIni;
  try {
      ({ DynamoDBClient }         = await import('@aws-sdk/client-dynamodb'));
      ({ DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb'));
      ({ fromIni }                = await import('@aws-sdk/credential-provider-ini'));
    } 
    catch {
      throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "DynamoDB adapter requires AWS SDK — run: npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/credential-provider-ini" });
    }

    return { DynamoDBClient, DynamoDBDocumentClient, fromIni }
}

export async function getDbAdapter(context) {
  const procEnvDb = context.runtimeEnv.get('N42_DB_ADAPTER');
  switch(procEnvDb) {

    case 'receiver-cf-d1-db': {
      try {
        return createReceiverD1Adapter(context.runtimeEnv.get('D1_BINDING'));
      }
      catch(e) {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
      }
    }
    
    case 'sender-cf-d1-db': {
      try {
        return createSenderD1Adapter(context.runtimeEnv.get('D1_BINDING'));
      }
      catch(e) {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
      }
    }

    case 'receiver-azure-cosmos-db': {
      const { CosmosClient } = await isCosmosDbAvailable();

      try {
        const endpoint = context.runtimeEnv.get('COSMOS_ENDPOINT');
        const key      = context.runtimeEnv.get('COSMOS_KEY');
        const database = context.runtimeEnv.get('COSMOS_DATABASE');

        const client = new CosmosClient({ endpoint, key });
        return await createReceiverCosmosDbAdapter(client, database);
      }
      catch(e) {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
      }
    }

    case 'sender-azure-cosmos-db': {
      const { CosmosClient } = await isCosmosDbAvailable();

      try {
        const endpoint = context.runtimeEnv.get('COSMOS_ENDPOINT');
        const key      = context.runtimeEnv.get('COSMOS_KEY');
        const database = context.runtimeEnv.get('COSMOS_DATABASE');

        const client = new CosmosClient({ endpoint, key });
        return await createSenderCosmosDbAdapter(client, database);
      }
      catch(e) {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
      }
    }

    case 'receiver-aws-dynamo-db': {
      const { DynamoDBClient, DynamoDBDocumentClient, fromIni } = await isDynamoDbAvailable();
    
      try {
        const isLocal = context.runtimeEnv.platform === null;
        const hasAccessKey = context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY') !== undefined;
        const client  = new DynamoDBClient({
          region: context.runtimeEnv.get('AWS_REGION'),
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
        return await createReceiverDynamoDbAdapter(DynamoDBDocumentClient.from(client));
      }
      catch(e) {
        throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message }); 
      }
    }

    case 'sender-aws-dynamo-db': {
      const { DynamoDBClient, DynamoDBDocumentClient, fromIni } = await isDynamoDbAvailable();

      try {
        const isLocal = context.runtimeEnv.platform === null;
        const hasAccessKey = context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY') !== undefined;
        const client  = new DynamoDBClient({
          region: context.runtimeEnv.get('AWS_REGION'),
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
        return await createSenderDynamoDbAdapter(DynamoDBDocumentClient.from(client));
      }
      catch {
        return createDefaultAdapter();
      }
    }

    case 'cli-aws-dynamo-db': {
      const { DynamoDBClient, DynamoDBDocumentClient, fromIni } = await isDynamoDbAvailable();

      try {
        const isLocal = context.runtimeEnv.platform === null;
        const hasAccessKey = context.runtimeEnv.get('CLOUD_AWS_ACCESS_KEY') !== undefined;
        const client  = new DynamoDBClient({
          region: context.runtimeEnv.get('AWS_REGION'),
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
        return await createCliDynamoDbAdapter(DynamoDBDocumentClient.from(client), context.runtimeEnv.get('N42_DB_TABLE_CLI'));
      }
      catch {
        return createDefaultAdapter();
      }
    }


    case 'cli-json-db': {
      return createCliJsonFileAdapter(getDbFile());
    }
    
    default: {
      return createDefaultAdapter();
    }
  }
}

export function createDb(adapter) {
  return {
    insert:                (collection, item)              => adapter.insert(collection, item),
    update:                (collection, item, key)         => adapter.update(collection, item, key),
    upsert:                (collection, item, key)         => adapter.upsert(collection, item, key),
    replace:               (collection, value)             => adapter.replace(collection, value),
    set:                   (collection, key, value)        => adapter.set(collection, key, value),
    remove:                (collection, keyValue, key)     => adapter.remove(collection, keyValue, key),
    clear:                 (collection)                    => adapter.clear(collection),
    getAll:                (collection)                    => adapter.getAll(collection),
    getOne:                (collection, key, value)        => adapter.getOne(collection, key, value),
    find:                  (collection, predicate)         => adapter.find(collection, predicate),
    artefactsByParticipant:(collection, pid)               => adapter.artefactsByParticipant(collection, pid),
    invalidateArtefactIndex:()                             => adapter.invalidateArtefactIndex?.(),
  };
}

export function indexBy(list, key) {
  const map = Object.create(null);
  for (const item of list) {
    const k = item?.[key];
    if (k === null) continue;
    (map[k] ??= []).push(item);
  }
  return map;
}

export function indexByFn(list, keyFn) {
  const map = Object.create(null);
  for (const item of list) {
    const k = keyFn(item);
    if (k === null) continue;
    (map[k] ??= []).push(item);
  }
  return map;
}

export function indexByMap(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = item?.[key];
    if (k === null) continue;
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}