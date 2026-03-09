# Node42 Database Layer – Usage Guide

This guide covers the Node42 database layer used across all Node42 packages. The default adapter stores data in a local JSON file, but the architecture supports swappable backends (e.g. DynamoDB for Lambda deployments).

## Default Storage

Location (Linux/macOS/Windows):
```
~/.node42/db.json
```

Intended scale: **1 – 10,000 records**. See [When to Upgrade](#when-to-upgrade) for larger workloads.

---

## Architecture

The DB layer is split into two parts:

- **Adapter** — handles the actual read/write (JSON file, DynamoDB, etc.)
- **`createDb(adapter)`** — wraps the adapter and exposes a consistent API

```js
import { createDb }              from './db/db.js';
import { createJsonFileAdapter } from './db/adapters/json-db.js';

const db = createDb(createJsonFileAdapter('~/.node42/db.json'));
```

The CLI wires this up automatically via `getDbAdapter()`, which reads `N42_CLI_DB` from the environment.

---

## Environment Configuration

```dotenv
# Default (no config needed) — uses JSON file
N42_CLI_DB=jsondb

# DynamoDB (requires AWS SDK installed separately)
N42_CLI_DB=dynamodb
N42_CLI_TABLE=cli-transactions
AWS_REGION=eu-north-1
AWS_SSO_PROFILE=default
```

Place this in `~/.node42/.env`.

---

## Data Structure

Example `db.json`:

```json
{
  "user": [],
  "artefacts": [],
  "transactions": [],
  "discovery": []
}
```

Collections are flexible and can hold any object structure.

---

## Core API

### `db.get(collection)`

Returns a collection array or an empty array. Never throws if missing.

```js
const artefacts = db.get('artefacts');
```

### `db.insert(collection, item)`

Adds an item and persists.

```js
db.insert('artefacts', {
  id:            'uuid',
  participantId: '0007:123',
  createdAt:     Date.now()
});
```

### `db.find(collection, predicate)`

Filters a collection by predicate.

```js
const results = db.find('artefacts', x => x.participantId === pid);
```

### `db.upsert(collection, item, key?)`

Inserts or updates by key (default `id`). Automatically sets `createdAt` / `updatedAt`.

```js
db.upsert('user', { id: 'abc', userName: 'Alex' });
```

### `db.update(collection, item, key?)`

Updates an existing item by key. Returns `false` if not found.

```js
db.update('user', { id: 'abc', userName: 'Updated' });
```

### `db.remove(collection, keyValue, key?)`

Removes items matching the key value.

```js
db.remove('artefacts', 'uuid');
```

### `db.replace(collection, value)`

Replaces an entire collection.

```js
db.replace('discovery', []);
```

### `db.clear(collection)`

Empties a collection.

```js
db.clear('artefacts');
```

---

## Indexing (Fast Lookup)

### `indexBy(list, key)`

Builds an in-memory index for repeated queries.

```js
import { indexBy } from './db/db.js';

const artefacts = db.get('artefacts');
const byPid     = indexBy(artefacts, 'participantId');
const results   = byPid['0007:123'] ?? [];
```

Use when doing many lookups on the same key.

### `indexByFn(list, fn)`

Derived or computed keys.

```js
import { indexByFn } from './db/db.js';

const byDay = indexByFn(artefacts, x => new Date(x.createdAt).toISOString().slice(0, 10));
const items = byDay['2026-01-29'] ?? [];
```

### `indexByMap(list, key)`

Same as `indexBy` but returns a `Map`. Useful when keys are non-strings.

---

## Typical Workflow

```js
// Insert
db.insert('artefacts', obj);

// Simple search
const [item] = db.find('artefacts', x => x.id === uuid);

// Indexed repeated search
const list  = db.get('artefacts');
const idx   = indexBy(list, 'participantId');
const items = idx['0007:123'] ?? [];
```

---

## Writing a Custom Adapter

Implement these methods and pass to `createDb`:

```js
const myAdapter = {
  get:                    (collection)                => { /* return array */ },
  find:                   (collection, predicate)     => { /* return filtered array */ },
  insert:                 (collection, item)          => { /* persist */ },
  update:                 (collection, item, key)     => { /* return bool */ },
  upsert:                 (collection, item, key)     => { /* insert or update */ },
  replace:                (collection, value)         => { /* replace collection */ },
  remove:                 (collection, keyValue, key) => { /* delete */ },
  clear:                  (collection)                => { /* empty collection */ },
  artefactsByParticipant: (collection, pid)           => { /* optimised lookup */ },
};

const db = createDb(myAdapter);
```

---

## Performance Expectations

| Records | JSON File       | DynamoDB   |
|---------|-----------------|------------|
| 1k      | Instant         | ~10ms      |
| 5k      | Instant         | ~10ms      |
| 10k     | Fine            | ~10ms      |
| 50k     | Noticeable      | ~10ms      |
| 100k+   | Consider SQLite | ~10ms      |

---

## File Safety

```bash
chmod 600 ~/.node42/db.json
```

---

## When to Upgrade

Switch to DynamoDB if:
- Deploying to Lambda / ECS
- Multi-user or multi-instance writes
- Records exceed 50k+

Switch to SQLite if:
- Complex joins or multi-field queries
- Staying local but need more power

---

## Summary

| Property        | Value                           |
|-----------------|---------------------------------|
| Default backend | JSON file (`~/.node42/db.json`) |
| Swappable       | Yes — adapter pattern           |
| DynamoDB        | Optional, via env config        |
| Scale           | Up to ~10k records locally      |
| Dependencies    | None (JSON adapter)             |