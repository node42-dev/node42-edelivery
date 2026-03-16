## Deployment Support

| Platform | Type | Sender | Receiver |
|---|---|---|---|
| Local | CLI / npm | ✅ | ➖ |
| AWS | Lambda | 🚧 | ✅ |
| Azure | Functions | 🚧 | ✅ |
| Cloudflare | Workers | 🚧 | ✅ |


### Mix and Match

Node42 eDelivery is a **stateless AP toolkit** — the sender, receiver, database, and storage are fully decoupled and can be mixed and matched across any supported platform.

For example:
- Receiver on **Azure Functions** + **CosmosDB** + **Azure Blob Storage**
- Receiver on **AWS Lambda** + **DynamoDB** + **S3**
- Receiver on **Cloudflare Workers** + **DynamoDB** + **S3**

The possibilities are endless — **deploy each component where it makes most sense for your infrastructure**, compliance requirements, or cost model.