# Integrating @n42/edelivery

`@n42/edelivery` can be used as a library in your own Node.js application to send Peppol documents programmatically — no CLI required.

## Installation

```bash
npm install @n42/edelivery
```

## Requirements

- Node.js 20 or higher
- A valid Peppol Access Point `certificate` and `private key`

## Integration Types

Node42 eDelivery supports two integration patterns:


### CLI Embedding
Use `registerCommands` to embed all Node42 eDelivery commands into your own Commander-based CLI. 
Best for building your own CLI toolchain on top of Node42.

```javascript
import { registerCommands as registerEdeliveryCommands } from '@n42/edelivery';

import { Command } from 'commander';
const program = new Command();

program.name('my-cli').version('1.0.0');

const edelivery = program.command('edelivery').description('Peppol eDelivery tools');
registerEdeliveryCommands(edelivery);

registerMyCommands(program);

program.parse(process.argv);
```

This registers all `n42-edelivery` commands — `send`, `validate` and more — onto your own CLI.

### Programmatic
Use `sendDocument` and other exported functions directly in your own Node.js application. 
Full control over context, error handling and document loading. Best for backend services, 
automation scripts and custom workflows.

```javascript
import fs from 'fs';
import { N42Context, sendDocument } from '@n42/edelivery';

const context = new N42Context({
    env:     'test',                    // 'test' or 'prod'. Defaults to 'test'
    cert:    '<path_to_cert>/cert.pem', // optional — defaults to ~/.node42/certs/cert.pem
    key:     '<path_to_key>/key.pem',   // optional — defaults to ~/.node42/certs/key.pem
    keyPass: 'your-passphrase',         // private key passphrase (if any)
});

const document = fs.readFileSync('invoice.xml');

// sender, receiver and country are extracted from the document automatically
await sendDocument(context, document);
```

## Context Options

| Option            | Type      | Req | Description                           |
|-------------------|-----------|-----|---------------------------------------|
| `env`             | `string`  | No  | `test` or `prod`. Defaults to `test`  |
| `cert`            | `string`  | No  | Path to sender certificate (PEM)      |
| `key`             | `string`  | No  | Path to sender private key (PEM)      |
| `keyPass`         | `string`  | No  | Private key passphrase                |
| `truststore`      | `string`  | No  | Path to truststore (PEM)              |
| `senderId`        | `string`  | No  | Sender participant ID                 |
| `receiverId`      | `string`  | No  | Receiver participant ID               |
| `senderCountry`   | `string`  | No  | ISO 3166 country code                 |
| `endpointUrl`     | `string`  | No  | Override SMP endpoint discovery       |
| `hostname`        | `string`  | No  | Hostname used for message IDs         |
| `dryrun`          | `boolean` | No  | Prepare but do not transmit           |
| `persist`         | `boolean` | No  | Persist transaction artefacts to disk |

## Error Handling

```javascript
import { N42Context, N42Error, sendDocument } from '@n42/edelivery';

try {
  await sendDocument(context, document);
} catch (e) {
  if (e instanceof N42Error) {
    console.error(`[${e.code}] ${e.reason}`);
    console.error(`Retryable: ${e.retryable}`);
  } else {
    throw e;
  }
}
```

## Error Codes

| Code                | Area        | Description                       |
|---------------------|-------------|-----------------------------------|
| `DNS_ERROR`         | Network     | DNS resolution failed             |
| `REQ_TIMEOUT`       | Network     | Request timed out                 |
| `SERVER_ERROR`      | Network     | Service temporarily unavailable   |
| `SMP_NOT_FOUND`     | Discovery   | Receiver not found in Peppol SMP  |
| `CERT_EXPIRED`      | Certificate | Certificate has expired           |
| `CERT_INVALID`      | Certificate | Certificate is invalid            |
| `KEY_NOT_FOUND`     | Certificate | Private key not found             |
| `DOC_INVALID`       | Document    | Document failed validation        |
| `VALIDATION_FAILED` | Validation  | Schematron validation failed      |

## Links

- [GitHub](https://github.com/node42-dev/node42-edelivery)
- [npm](https://www.npmjs.com/package/@n42/edelivery)
- [Support](mailto:support@node42.dev)