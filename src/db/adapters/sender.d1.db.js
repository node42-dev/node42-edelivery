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

export async function createSenderD1Adapter(d1) {
  async function insert(collection, item) {
    try {
      const stmt = d1.prepare(
        `INSERT OR REPLACE INTO ${collection} (id, PK, SK, data) VALUES (?, ?, ?, ?)`
      );
      await stmt.bind(
        item.id,
        item.PK,
        item.SK,
        JSON.stringify(item)
      ).run();
    } catch(e) {
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  async function getAll(_collection) {
    throw new N42Error(N42ErrorCode.NOT_IMPLEMENTED, { details: 'getAll()' });
  }

  async function getOne(collection, key, value) {
    try {
      const stmt = d1.prepare(
        `SELECT data FROM ${collection} WHERE PK = ? AND SK = ? LIMIT 1`
      );
      const result = await stmt.bind(key, value).first();

      if (!result) {
        throw new N42Error(
          N42ErrorCode.STORAGE_ITEM_NOT_FOUND,
          { details: `Item not found: ${key}=${value}` },
          { retryable: false }
        );
      }

      return JSON.parse(result.data);
    } catch(e) {
      if (e instanceof N42Error) throw e;
      throw new N42Error(N42ErrorCode.DATABASE_ERROR, { details: e.message });
    }
  }

  return { insert, getAll, getOne };
}