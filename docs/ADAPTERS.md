## Database Adapter Support

| Method | sender-json-db | sender-aws-dynamo-db | sender-azure-cosmos-db | receiver-aws-dynamo-db | receiver-azure-cosmos-db |
|--------|----------------|----------------------|------------------------|------------------------|--------------------------|
| `insert` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `update` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `upsert` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `replace` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `set` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `remove` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `clear` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `getAll` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `getOne` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `find` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `artefactsByParticipant` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `invalidateArtefactIndex` | ✅ | ❌ | ❌ | ❌ | ❌ |

## Storage Adapter Support

| Method | receiver-aws-s3 | receiver-azure-blob |
|--------|-----------------|---------------------|
| `store` | ✅ | ✅ |
| `get` | ✅ | ✅ |
| `getUploadUrl` | ✅ | ✅ |

## Secrets Adapter Support

| Method | receiver-aws-sec-mgr |
|--------|----------------------|
| `store` | ❌ |
| `get` | ✅ |