/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { 
  N42Error, 
  N42ErrorCode 
} from '../../core/error.js';


export async function createSenderCosmosDbAdapter(client, databaseId = 'n42') {
  try { await import('@azure/cosmos'); }
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "CosmosDB adapter requires Azure SDK — run: npm install @azure/cosmos" });
  }

  async function getContainer(collection) {
    try {
      const database = client.database(databaseId);
      return database.container(collection);
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: `Failed to get container: ${e.message}` });
    }
  }

  async function insert(collection, item) {
    try {
      const container = await getContainer(collection);
      await container.items.upsert({
        ...item,
        id: item.id,          // Cosmos DB requires 'id' field
        _pk: item.PK,         // partition key
      });
      console.log('✓ Transaction stored to CosmosDB:', item.id);
    } catch(e) {
      console.error('CosmosDB storage failed:', e);
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function getAll(_collection) {
    throw new N42Error(N42ErrorCode.NOT_IMPLEMENTED, { details: 'getAll()' });
  }

  async function getOne(collection, key, value) {
    try {
      const container = await getContainer(collection);
      const { resources } = await container.items.query({
        query: 'SELECT * FROM c WHERE c.PK = @pk AND c.SK = @sk',
        parameters: [
          { name: '@pk', value: key },
          { name: '@sk', value: value },
        ]
      }, { partitionKey: key }).fetchAll();

      if (!resources || resources.length === 0) {
        throw new N42Error(
          N42ErrorCode.STORAGE_ITEM_NOT_FOUND,
          { details: `Item not found: ${key}=${value}` },
          { retryable: false }
        );
      }

      return resources[0];
    } catch(e) {
      if (e instanceof N42Error) throw e;
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  return {
    insert,
    getAll,
    getOne
  }
}