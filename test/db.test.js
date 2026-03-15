import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

import { createSenderJsonFileAdapter } from '../src/db/adapters/sender.jsondb.js';
import { createDb, indexBy, indexByFn } from '../src/db/db.js';

const TEST_DB = path.join(os.tmpdir(), 'n42-test-db.json');

let adapter;
let db;

describe('db', () => {

  beforeEach(() => {
    if (fs.existsSync(TEST_DB))          fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '.tmp')) fs.unlinkSync(TEST_DB + '.tmp');
    adapter = createSenderJsonFileAdapter(TEST_DB);
    db      = createDb(adapter);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB))          fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_DB + '.tmp')) fs.unlinkSync(TEST_DB + '.tmp');
  });

  describe('load()', () => {
    it('returns default structure when file missing', () => {
      const dbObj = adapter.load();
      assert.ok('User'         in dbObj);
      assert.ok('Discovery'    in dbObj);
      assert.ok('Transactions' in dbObj);
    });
  });

  describe('insert() & getAll()', () => {
    it('inserts and retrieves artefact', () => {
      db.insert('artefacts', { id: '1', participantId: '0007:123' });
      const artefacts = db.getAll('artefacts');
      assert.equal(artefacts.length, 1);
      assert.equal(artefacts[0].id, '1');
    });
  });

  describe('find()', () => {
    it('filters by predicate', () => {
      db.insert('artefacts', { id: '1', participantId: 'A' });
      db.insert('artefacts', { id: '2', participantId: 'B' });
      const result = db.find('artefacts', x => x.participantId === 'A');
      assert.equal(result.length, 1);
      assert.equal(result[0].id, '1');
    });
  });

  describe('indexBy()', () => {
    it('indexes by key', () => {
      const list = [
        { id: '1', participantId: 'A' },
        { id: '2', participantId: 'A' },
        { id: '3', participantId: 'B' },
      ];
      const idx = indexBy(list, 'participantId');
      assert.equal(idx['A'].length, 2);
      assert.equal(idx['B'].length, 1);
    });
  });

  describe('indexByFn()', () => {
    it('groups by derived key', () => {
      const list = [
        { id: 1, date: '2026-01-01' },
        { id: 2, date: '2026-01-01' },
        { id: 3, date: '2026-01-02' },
      ];
      const idx = indexByFn(list, x => x.date);
      assert.equal(idx['2026-01-01'].length, 2);
    });
  });

  describe('save()', () => {
    it('writes file atomically', () => {
      adapter.save({ artefacts: [] });
      assert.ok(fs.existsSync(TEST_DB));
    });

    it("doesn't corrupt original file if rename fails", (t) => {
      const original = { artefacts: [{ id: 1 }] };
      adapter.save(original);

      t.mock.method(fs, 'renameSync', () => { throw new Error('fail'); });

      try { adapter.save({ artefacts: [{ id: 2 }] }); } catch {}

      const content = JSON.parse(fs.readFileSync(TEST_DB, 'utf8'));
      assert.equal(content.artefacts[0].id, 1);
    });
  });

  describe('upsert()', () => {
    it('inserts new item if id does not exist', () => {
      db.upsert('artefacts', { id: '1', name: 'A' });
      const list = db.getAll('artefacts');
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'A');
    });

    it('updates existing item if id exists', () => {
      db.upsert('artefacts', { id: '1', name: 'A' });
      db.upsert('artefacts', { id: '1', name: 'B' });
      const list = db.getAll('artefacts');
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'B');
    });

    it('adds createdAt on insert and updatedAt on update', () => {
      db.upsert('artefacts', { id: '1' });
      let item = db.getAll('artefacts')[0];
      assert.ok(item.createdAt);

      db.upsert('artefacts', { id: '1', value: 2 });
      item = db.getAll('artefacts')[0];
      assert.ok(item.updatedAt);
    });
  });
});