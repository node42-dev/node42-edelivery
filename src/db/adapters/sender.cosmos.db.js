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
  let cosmos;
  try { cosmos = await import('@azure/cosmos'); }
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "CosmosDB adapter requires Azure SDK — run: npm install @azure/cosmos" });
  }

  function getContainer(collection) {
    return client.database(databaseId).container(collection);
  }

  function toCosmosItem(collection, item) {
    return {
      ...item,
      id:     item.id,
      PK:     collection,
      SK:     item.id,
      ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }),
    };
  }

  async function insert(collection, item) {
    try {
      await getContainer(collection).items.create(toCosmosItem(collection, item));
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function upsert(collection, item, key = 'id') {
    try {
      const existing = (await getAll(collection)).find(x => x[key] === item[key]);
      const doc = existing
        ? { ...toCosmosItem(collection, item), ...existing, ...item, updatedAt: Date.now() }
        : { ...toCosmosItem(collection, item), createdAt: Date.now() };
      await getContainer(collection).items.upsert(doc);
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function update(collection, item, key = 'id') {
    try {
      const existing = (await getAll(collection)).find(x => x[key] === item[key]);
      if (!existing) return false;
      await getContainer(collection).items.upsert({
        ...existing,
        ...item,
        PK: collection,
        SK: item[key],
        id: item[key],
        ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }),
      });
      return true;
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function replace(collection, value) {
    await clear(collection);
    await Promise.all(value.map(item =>
      getContainer(collection).items.upsert(toCosmosItem(collection, item))
    ));
  }

  async function set(collection, key, value) {
    try {
      await getContainer(collection).items.upsert({
        id:    key,
        PK:    collection,
        SK:    key,
        value,
      });
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function remove(collection, keyValue) {
    try {
      await getContainer(collection).item(keyValue, collection).delete();
    } catch(e) {
      if (e.code === 404) return;
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function clear(collection) {
    const items = await getAll(collection);
    await Promise.all(items.map(item =>
      getContainer(collection).item(item.id, collection).delete()
    ));
  }

  async function getOne(collection, key, value) {
    try {
      const { resources } = await getContainer(collection).items.query({
        query: 'SELECT * FROM c WHERE c.PK = @pk AND c.SK = @sk',
        parameters: [
          { name: '@pk', value: key },
          { name: '@sk', value: value },
        ]
      }).fetchAll();

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

  async function getAll(collection) {
    try {
      const { resources } = await getContainer(collection).items.query({
        query: 'SELECT * FROM c WHERE c.PK = @pk',
        parameters: [{ name: '@pk', value: collection }]
      }).fetchAll();
      return resources ?? [];
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function find(collection, predicate) {
    const items = await getAll(collection);
    return items.filter(predicate);
  }

  async function artefactsByParticipant(_collection, pid) {
    try {
      const { resources } = await getContainer(_collection).items.query({
        query: 'SELECT * FROM c WHERE c.GSI1PK = @pid',
        parameters: [{ name: '@pid', value: pid }]
      }).fetchAll();
      return resources ?? [];
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  return {
    insert,
    update,
    upsert,
    replace,
    set,
    remove,
    clear,
    getAll,
    getOne,
    find,
    artefactsByParticipant,
  };
}