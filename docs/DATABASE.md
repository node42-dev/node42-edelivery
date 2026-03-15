# Node42 Database Layer – Usage Guide

This guide covers the Node42 database layer used across all Node42 packages. The architecture supports swappable backends configured via environment variables.

## Architecture

The DB layer is split into two parts:

- **Adapter** — handles the actual read/write (JSON file, DynamoDB, CosmosDB etc.)
- **`createDb(adapter)`** — wraps the adapter and exposes a consistent API

```js
import { 
  createDb, 
  getDbAdapter 
} from '../db/db.js';

let db = null;
async function getDb(context) {
  if (!db) db = createDb(await getDbAdapter(context));
  return db;
}

db = await getDb(context);
```

The CLI wires this up automatically via `getDbAdapter()`, which reads `N42_DB_ADAPTER` from the environment.

---

## Environment Configuration

```dotenv
# Default (no config needed) — uses JSON file
N42_DB_ADAPTER=sender-json-db

# AWS DynamoDB (requires AWS SDK installed separately)
N42_DB_ADAPTER=sender-aws-dynamo-db
N42_DB_TABLE=<your-table>
AWS_REGION=<your-region>
AWS_PROFILE=<your-sso-profile>

# Azure CosmosDB (requires Azure SDK installed separately)
N42_DB_ADAPTER=sender-azure-cosmos-db
COSMOS_ENDPOINT=https://<your-account.documents.azure.com>:443/
COSMOS_KEY=<your-key>
COSMOS_DATABASE=<your-database>

# Receiver DynamoDB
N42_DB_ADAPTER=receiver-aws-dynamo-db
AWS_REGION=<your-region>
AWS_PROFILE=<your-sso-profile>

# Receiver CosmosDB
N42_DB_ADAPTER=receiver-azure-cosmos-db
COSMOS_ENDPOINT=https://<your-account.documents.azure.com>:443/
COSMOS_KEY=<your-key>
COSMOS_DATABASE=<your-database>
```

Place this in `~/.node42/.env.<environment>` for local development.

---

## Available Adapters

| Adapter | Use Case | Required Package |
|---|---|---|
| `sender-json-db`            | Local CLI, development    | None |
| `sender-aws-dynamo-db`      | AWS Lambda, ECS           | `@aws-sdk/client-dynamodb` `@aws-sdk/lib-dynamodb` |
| `sender-azure-cosmos-db`    | Azure Functions           | `@azure/cosmos` |
| `receiver-aws-dynamo-db`    | AWS Lambda receiver       | `@aws-sdk/client-dynamodb` `@aws-sdk/lib-dynamodb` |
| `receiver-azure-cosmos-db`  | Azure Functions receiver  | `@azure/cosmos` |


## Choosing an Adapter

| Deployment | DB Adapter | Storage Adapter |
|---|---|---|
| Local CLI          | `sender-json-db`           | — |
| AWS Lambda         | `receiver-aws-dynamo-db`   | `receiver-aws-s3` |
| Azure Functions    | `receiver-azure-cosmos-db` | `receiver-azure-blob` |
| Cloudflare Workers | `receiver-aws-dynamo-db`   | `receiver-aws-s3` |

## Default Storage (sender-json-db)

Location (Linux/macOS/Windows):
```
~/.node42/db.json
```

Intended scale: **1 – 10,000 records**.

### Performance Expectations

| Records | JSON File       | DynamoDB | CosmosDB |
|---------|-----------------|----------|----------|
| 1k      | Instant         | ~10ms    | ~10ms    |
| 5k      | Instant         | ~10ms    | ~10ms    |
| 10k     | Fine            | ~10ms    | ~10ms    |
| 50k     | Noticeable      | ~10ms    | ~10ms    |
| 100k+   | Consider SQLite | ~10ms    | ~10ms    |


## Data Structure

Example `db.json`:

```json
{
  "User": [],
  "Transactions": [],
  "Discovery": []
}
```

Collections are flexible and can hold any object structure.

## Core API

### `db.getAll(collection)`

Returns a collection array or an empty array. Never throws if missing.

```js
const artefacts = await db.getAll('Discovery');
```

### `db.insert(collection, item)`

Adds an item and persists.

```js
await db.insert('Discovery', {
  id:            'uuid',
  participantId: '0007:123',
  createdAt:     Date.now()
});
```

### `db.find(collection, predicate)`

Filters a collection by predicate.

```js
const results = await db.find('Discovery', x => x.participantId === pid);
```

### `db.upsert(collection, item, key?)`

Inserts or updates by key (default `id`). Automatically sets `createdAt` / `updatedAt`.

```js
await db.upsert('User', { id: 'abc', userName: 'Alex' });
```

### `db.update(collection, item, key?)`

Updates an existing item by key. Returns `false` if not found.

```js
await db.update('User', { id: 'abc', userName: 'Updated' });
```

### `db.remove(collection, keyValue, key?)`

Removes an item by key value.

```js
await db.remove('Discovery', 'uuid');
```

### `db.replace(collection, value)`

Replaces an entire collection.

```js
await db.replace('Discovery', []);
```

### `db.clear(collection)`

Empties a collection.

```js
await db.clear('Discovery');
```

### `db.getOne(collection, key, value)`

Returns a single item by PK/SK lookup. Used by receiver adapters.

```js
const cert = await db.getOne('Identity', 'SYSTEM', 'CERT#051729ab-...');
```

### `db.artefactsByParticipant(collection, participantId)`

Returns all artefacts for a participant. Uses GSI1 index on DynamoDB, query on CosmosDB.

```js
const artefacts = await db.artefactsByParticipant('Discovery', '0007:123');
```

## Indexing (Fast Lookup)

### `indexBy(list, key)`

Builds an in-memory index for repeated queries.

```js
import { indexBy } from './db/db.js';

const artefacts = await db.getAll('Discovery');
const byPid     = indexBy(artefacts, 'participantId');
const results   = byPid['0007:123'] ?? [];
```

### `indexByFn(list, fn)`

Derived or computed keys.

```js
import { indexByFn } from './db/db.js';

const byDay = indexByFn(artefacts, x => new Date(x.createdAt).toISOString().slice(0, 10));
const items = byDay['2026-01-29'] ?? [];
```

### `indexByMap(list, key)`

Same as `indexBy` but returns a `Map`. Useful when keys are non-strings.


## Writing a Custom Adapter

Implement these methods and pass to `createDb`:

```js
const myAdapter = {
  getAll:                 (collection)                => { /* return array */ },
  find:                   (collection, predicate)     => { /* return filtered array */ },
  getOne:                 (collection, key, value)    => { /* return single item */ },
  insert:                 (collection, item)          => { /* persist */ },
  update:                 (collection, item, key)     => { /* return bool */ },
  upsert:                 (collection, item, key)     => { /* insert or update */ },
  replace:                (collection, value)         => { /* replace collection */ },
  remove:                 (collection, keyValue, key) => { /* delete */ },
  clear:                  (collection)                => { /* empty collection */ },
  set:                    (collection, key, value)    => { /* set key/value */ },
  artefactsByParticipant: (collection, pid)           => { /* optimised lookup */ },
};

const db = createDb(myAdapter);
```

## File Safety

```bash
chmod 600 ~/.node42/db.json
```