/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { randomUUID } from 'crypto';

export class N42Context {
  constructor(opts = {}) {
    this.command          = opts.command          ?? null;
    this.subcommand       = opts.subcommand       ?? null;
    this.document         = opts.document         ?? null;
    this.ubl              = opts.ubl              ?? null;
    this.id               = opts.id               ?? randomUUID();
    this.timestamp        = opts.timestamp        ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    this.cert             = opts.cert             ?? 'cert.pem';
    this.certId           = opts.certId           ?? null;
    this.key              = opts.key              ?? 'key.pem';
    this.truststore       = opts.truststore       ?? null;
    this.keyPass          = opts.keyPass          ?? 'peppol';
    this.env              = opts.env              ?? 'test';
    this.schematron       = opts.schematron       ?? [];
    this.validationErrors = opts.validationErrors ?? null;
    this.senderId         = opts.senderId         ?? null;
    this.receiverId       = opts.receiverId       ?? null;
    this.senderCountry    = opts.senderCountry    ?? null;
    this.receiverCountry  = opts.receiverCountry  ?? null;
    this.documentType     = opts.documentType     ?? null;
    this.processId        = opts.processId        ?? null;
    this.transportProfile = opts.transportProfile ?? null;
    this.fromPartyId      = opts.fromPartyId      ?? null;
    this.toPartyId        = opts.toPartyId        ?? null;
    this.senderCert       = opts.senderCert       ?? null;
    this.senderKey        = opts.senderKey        ?? null;
    this.receiverCert     = opts.receiverCert     ?? null;
    this.origReceiverCert = opts.origReceiverCert ?? null;
    this.endpointUrl      = opts.endpointUrl      ?? null;
    this.origEndpointUrl  = opts.origEndpointUrl  ?? null;
    this.hostname         = opts.hostname         ?? null;
    this.stripSbdh        = opts.stripSbdh        ?? null;
    this.dryrun           = opts.dryrun           ?? false;
    this.persist          = opts.persist          ?? false;
    this.verbose          = opts.verbose          ?? false;
    this.timeout          = opts.timeout          ?? 20000;
    this.spinner          = opts.spinner          ?? null;
    this.saxonAvailable   = opts.saxonAvailable   ?? false;
  }
}