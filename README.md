[![CI](https://github.com/node42-dev/node42-edelivery/actions/workflows/ci.yml/badge.svg)](https://github.com/node42-dev/node42-edelivery/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/node42-dev/node42-edelivery/graph/badge.svg)](https://codecov.io/gh/node42-dev/node42-edelivery)
[![npm](https://img.shields.io/npm/v/@n42/edelivery.svg)](https://www.npmjs.com/package/@n42/edelivery)

# Node42 eDelivery

**Pure Node.js Peppol AS4 Sender, Receiver & Toolkit**

- **Local CLI** — interoperability testing, validation, troubleshooting, and controlled AS4 message transmission

- **Cloud Sender** — deploy to **AWS** Lambda, **Azure** Functions, or **Cloudflare** Workers to send Peppol AS4 messages

- **Cloud Receiver** — deploy to **AWS** Lambda, **Azure** Functions, or **Cloudflare** Workers to receive, validate, decrypt and persist incoming Peppol AS4 messages

## Low-Level Cryptographic Implementation

A deliberate choice was made to keep this a super lightweight, pure **Node.js** implementation with zero platform dependencies.

All cryptographic operations:

- `RSA-OAEP` key wrapping
- `AES-128-GCM` encryption
- `RSA-SHA256` signing
- `X.509` certificate handling

are implemented directly using Node.js's built-in `crypto` module and the `xml-crypto` library, with no native addons, no external binaries, and no compilation required.

## Features

**Sender:**
- SML lookup + Peppol SMP discovery 
- Send AS4 messages (validate, sign, encrypt, verify) 
- Built-in schematron validation
- Transaction reporting
- Replay last message byte-for-byte
- Zero native dependencies, zero compilation
- Works on Linux, macOS and Windows

**Receiver:**

## Background

If you’d like a deeper understanding of the protocol before exploring the code, the accompanying **Medium articles** provide additional context. They walk through the **AS4 transport protocol**, explain how Peppol messaging works in practice, and describe the reasoning behind building this implementation.

- **[Peppol AS4 Under the Microscope: From TCP Handshake to Encrypted Invoice](https://medium.com/@node42-dev/peppol-as4-under-the-microscope-from-tcp-handshake-to-encrypted-invoice-4da0e02b4e3c)**

- **[A Fully Working Peppol AS4 Sender in Node.js - In ~500 Lines of Code](https://medium.com/@node42-dev/a-fully-working-peppol-as4-sender-in-node-js-in-500-lines-of-code-bad807b0e071)**

## Installation

### Requirements

-   Node.js **18+** (Node 20 recommended)
-   npm

### Install globally

``` bash
npm install -g @n42/edelivery
```

Verify installation:

``` bash
n42-edelivery --version
```

## Commands

### `init`

Initialize local Node42 workspace with certificates, schematrons, and JSON control structure (for dynamic UBL document creation)

```bash
.node42/
    ├── certs/
    │     ├── cert.pem
    │     ├── key.pem
    │     └── truststore.pem
    └── templates/
            └── ubl.json
```

Certificates can be placed in `~/.node42/certs/` using the naming convention above, or their paths specified explicitly via `--cert`, `--key` and `--truststore` flags.

### `pki`

Display PKI configuration — certificate, private key and truststore used for AS4 signing, encryption and peer validation.

### `send peppol`

Send a Peppol UBL document via AS4.

| Argument           | Description                                          |
|--------------------|------------------------------------------------------|
| `--replay`         | Re-send transaction using stored artefacts           |
| `--document`       | Path to the UBL XML document to send                 |
| `--ubl`            | Path to UBL document descriptor                      |
| `--schematron`     | Path to schematron XSL files for validation          |
| `--env`            | Target environment: `test` or `prod`                 |
| `--cert-id`        | Node42 Probe certificate ID                          |
| `--cert`           | Public certificate (PEM)                             |
| `--key`            | Private key (PEM)                                    |
| `--key-pass`       | Private key passphrase                               |
| `--truststore`     | Truststore (PEM)                                     |
| `--sender-id`      | Peppol participant ID of sender                      |
| `--receiver-id`    | Peppol participant ID of receiver                    |
| `--sender-country` | Sender country code                                  |
| `--endpoint-url`   | Override the SMP-discovered endpoint URL             |
| `--hostname`       | Hostname used in message IDs                         |
| `--strip-sbdh`     | Strip SBDH and re-wrap using provided context        |
| `--dryrun`         | Prepare and resolve but do not transmit              |
| `--persist`        | Persist transaction data to disk                     |
| `--verbose`        | Enable detailed output                               |

### `validate peppol`

Validate a Peppol UBL document against schematron rules.

| Argument        | Description                                |
|-----------------|--------------------------------------------|
| `--document`    | Path to UBL XML document *(required)*      |
| `--schematron`  | Path to schematron XSL files               |
| `--persist`     | Persist validation errors to disk          |
| `--verbose`     | Enable detailed output                     |

### `report peppol`

Generate Peppol reporting data

| Argument        | Description                          |
|-----------------|--------------------------------------|
| `--from`        | Start date of the reporting period   |
| `--to`          | End date of the reporting period     |

## Usage

Send a prepared document directly:

```bash
n42-edelivery send peppol \
    --env "test" \
    --document "~/<path_to_document>/invoice.xml"
```

Send a test document dynamically built from CLI arguments and an UBL document descriptor:

```bash
n42-edelivery send peppol \
    --env "test" \
    --sender-id "iso6523-actorid-upis::0007:node42" \
    --receiver-id "iso6523-actorid-upis::0007:node42" \
    --sender-country SE \
    --ubl "./ubl.json"
```

The `--ubl` document descriptor:

```json
{
    "document_type" : "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
    "process_id" : "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
    "seller": {
        "name": "Test Sender",
        "endpoint_scheme": "0007",
        "street": "Sender Street 1",
        "city": "Stockholm",
        "zip": "11122",
        "vat": "SE556677889901",
        "company_id": "5566778899"
    },
    "buyer": {
        "name": "Test Receiver",
        "endpoint_scheme": "0008",
        "street": "Receiver Street 1",
        "city": "Brussels",
        "zip": "1000",
        "country": "BE",
        "company_id": "6677889900"
    },
    "invoice": {
        "currency": "EUR",
        "payment_means": "30",
        "items": [
            {
                "name": "Consulting Services",
                "quantity": 2,
                "unit": "HUR",
                "unit_price": "100.00",
                "net_amount": "200.00",
                "vat_percent": 25
            },
            {
                "name": "Software License",
                "quantity": 1,
                "unit": "EA",
                "unit_price": "50.00",
                "net_amount": "50.00",
                "vat_percent": 25
            }
        ]
    }
}
```

Validate a document:

```bash
n42-edelivery validate peppol \
    --document "~/<path_to_document>/invoice.xml"
```

## Replay

The `replay` command resends a previously sent AS4 message byte-for-byte using its stored artefacts.
```bash
n42-edelivery replay
```

The last sent transaction is automatically selected. To replay a specific transaction, pass its ID:
```bash
n42-edelivery replay <transactionId>
```

The original message headers, and body are loaded from disk and transmitted as-is to the original endpoint — identical bytes, identical message ID.
- **The receiving Access Point (C3) must have duplicate message detection disabled before replaying**. \
By default, most AS4 implementations reject messages with a previously seen message ID.

## Persistence

When `--persist` is enabled, the tool stores execution artefacts for later inspection.
```
.node42/
    └── artefacts/
            ├── discovery/
            ├── validations/
            └── transactions/
                     ├── <uuid>_context.json
                     ├── <uuid>_document.xml
                     ├── <uuid>_validation.xml
                     ├── <uuid>_soap_envelope.xml
                     ├── <uuid>_signing_input.txt
                     ├── <uuid>_message_headers.json
                     ├── <uuid>_message_body.txt
                     └── <uuid>_as4_signal.json
```

## Workspace

Node42 stores runtime data, generated artefacts, certificates, and configuration in the user workspace located at `~/.node42`.

```bash
.node42/
    ├── artefacts/
    ├── certs/
    ├── schematrons/
    │       ├── billing/
    │       ├── reporting/
    │       └── schxslt/
    ├── templates/
    ├── reports/ 
    ├── db.json
    ├── replay.txt
    └── .env.test # or .env.prod
```
This directory contains all local data required by the CLI, including cached artefacts, validation rules, certificates, templates, and execution history.

## Disclaimer

Production deployment requires proper certificate lifecycle management, secure key storage, monitoring, and full compliance with applicable Peppol policies and transport requirements.

## License

AGPL-3.0-only

## Author

**Alex Olsson** \
**[LinkedIn](https://www.linkedin.com/in/alex-o-33165720)**