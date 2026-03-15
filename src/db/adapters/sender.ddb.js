/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import { C, c } from '../../cli/color.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../../core/error.js';

/**
 * DynamoDB adapter for the n42 db layer.
 *
 * Table schema:
 *   PK (String) — partition key, collection name (e.g. 'user', 'discovery', 'artefact')
 *   SK (String) — sort key, item id
 *
 * GSI1 — index for artefactsByParticipant queries
 *   GSI1PK (String) — item.participantId
 *   GSI1SK (String) — item.id
 *   Items must have both GSI1PK and GSI1SK set to appear in the index.
 *   These are set automatically by insert/upsert/update/replace when item.participantId is present.
 */

// TODO: Remove once confirmed working. <a1exnd3r 2026-03-08 d:2026-05-08 p:1>
export async function createSenderDynamoDbAdapter(client, tableName) {
  let commands;
  try { commands = await import('@aws-sdk/lib-dynamodb'); } 
  catch {
    throw new N42Error(N42ErrorCode.MODULE_NOT_FOUND, { details: "DynamoDB adapter requires AWS SDK — run: npm install @aws-sdk/lib-dynamodb @aws-sdk/client-dynamodb" });
  }
  const { PutCommand, GetCommand, DeleteCommand, QueryCommand } = commands;

  async function send(cmd) {
    try {
      return await client.send(cmd);
    } catch(e) {
      if (e.name === "UnrecognizedClientException" || e.name === 'CredentialsProviderError') {
        throw new N42Error(N42ErrorCode.SSO_SESSION_EXPIRED, { details: `Refresh the SSO session; run: ${c(C.BOLD, 'aws sso login')}` });
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
    await send(new PutCommand({
      TableName: tableName,
      Item: { 
        PK: collection, 
        SK: item.id, 
        ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }),
        ...item 
      },
    }));
  }

  async function upsert(collection, item, key = 'id') {
    const existing = (await getAll(collection)).find(x => x[key] === item[key]);
    await send(new PutCommand({
      TableName: tableName,
      Item: existing
        ? { PK: collection, SK: item[key], ...existing, ...item, ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }), updatedAt: Date.now() }
        : { PK: collection, SK: item[key], ...item, ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }), createdAt: Date.now() },
    }));
  }

  async function update(collection, item, key = 'id') {
    const existing = (await getAll(collection)).find(x => x[key] === item[key]);
    if (!existing) return false;
    await send(new PutCommand({
      TableName: tableName,
      Item: { PK: collection, SK: item[key], ...existing, ...item, ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }) },
    }));
    return true;
  }

  async function replace(collection, value) {
    await clear(collection);
    await Promise.all(value.map(item =>
      send(new PutCommand({
        TableName: tableName,
        Item: { PK: collection, SK: item.id, ...(item.participantId && { GSI1PK: item.participantId, GSI1SK: item.id }), ...item },
      }))
    ));
  }

  async function set(collection, key, value) {
    await send(new PutCommand({
      TableName: tableName,
      Item:      { PK: collection, SK: key, value },
    }));
  }

  async function remove(collection, keyValue, _key = 'id') {
    await send(new DeleteCommand({
      TableName: tableName,
      Key:       { PK: collection, SK: keyValue },
    }));
  }

  async function clear(collection) {
    const items = await getAll(collection);
    await Promise.all(items.map(item =>
      send(new DeleteCommand({
        TableName: tableName,
        Key:       { PK: collection, SK: item.id },
      }))
    ));
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

  async function getAll(collection) {
    const result = await send(new QueryCommand({
      TableName:              tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': collection },
    }));
    return result.Items ?? [];
  }

  async function find(collection, predicate) {
    const items = await getAll(collection);
    return items.filter(predicate);
  }

  async function artefactsByParticipant(_collection, pid) {
    const result = await send(new QueryCommand({
      TableName:              tableName,
      IndexName:              'GSI1',
      KeyConditionExpression: 'GSI1PK = :pid',
      ExpressionAttributeValues: { ':pid': pid },
    }));
    return result.Items ?? [];
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