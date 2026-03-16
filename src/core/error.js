/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { c, C } from '../cli/color.js';

/**
 * Frozen map of all Node42 error definitions.
 * Each entry contains a numeric code, area, HTTP status, message template and retryable flag.
 * @readonly
 * @enum {Object}
 */
export const N42ErrorCode = Object.freeze({
  // Auth
  AUTH_TOKEN_EXPIRED:   { code: 9032,  area: 'AUTH', http: 401, message: 'Token expired: {details}',                   retryable: false },
  TOKEN_MISSING:        { code: 9033,  area: 'AUTH', http: 400, message: 'Token missing: {details}',                   retryable: false },
  TOKEN_REFRESH_FAILED: { code: 9034,  area: 'AUTH', http: 401, message: 'Token refresh failed: {details}',            retryable: false },
  INVALID_OUTPUT:       { code: 6123,  area: 'SYS',  http: 500, message: 'Invalid output: {details}',                  retryable: false },
  SIGNIN_FAILED:        { code: 10108, area: 'USER', http: 401, message: 'Sign in failed: {details}',                  retryable: false },

  // Rate limit
  RATE_LIMITED:         { code: 5101,  area: 'BILL', http: 500, message: 'Rate limit exceeded: {details}',             retryable: false },

  // Network
  SERVER_ERROR:         { code: 6122,  area: 'REQ',  http: 503,  message: 'Service temporarily unavailable: {details}', retryable: true  },
  REQ_TIMEOUT:          { code: 6126,  area: 'REQ',  http: 503,  message: 'Request timed out',                          retryable: true  },
  DNS_ERROR:            { code: 6127,  area: 'REQ',  http: 503,  message: 'DNS resolution failed',                      retryable: true  },

  // SMP
  SMP_NOT_FOUND:        { code: 6128,  area: 'DISC', http: 502, message: 'SMP not found: {details}',                   retryable: false },
  SMP_ERROR:            { code: 6129,  area: 'DISC', http: 502, message: 'SMP error: {details}',                       retryable: true  },

  // Input
  INVALID_INPUT:        { code: 7020,  area: 'APP',  http: 400, message: 'Invalid input: {details}',                   retryable: false },

  // File system
  DIR_NOT_FOUND:        { code: 21105, area: 'ART',  http: 400, message: 'Directory not found: {details}',             retryable: false },
  FILE_NOT_FOUND:       { code: 21106, area: 'ART',  http: 400, message: 'File not found: {details}',                  retryable: false },
  MODULE_NOT_FOUND:     { code: 21107, area: 'ART',  http: 400, message: 'Module not found: {details}',                retryable: false },
  
  // Documents
  DOC_INVALID:          { code: 7021,  area: 'APP',  http: 400, message: 'Document is invalid: {details}',             retryable: false },
  DOC_NOT_FOUND:        { code: 21108, area: 'ART',  http: 400, message: 'Document not found: {details}',              retryable: false },

  // Certificates
  CERT_EXPIRED:         { code: 11103, area: 'CERT', http: 400, message: 'Certificate has expired',                    retryable: false },
  CERT_UNTRUSTED:       { code: 11104, area: 'CERT', http: 400, message: 'Certificate is not trusted',                 retryable: false },
  CERT_NOT_FOUND:       { code: 11105, area: 'CERT', http: 401, message: 'Certificate not found: {details}',           retryable: false },
  CERT_INVALID:         { code: 11106, area: 'CERT', http: 400, message: 'Certificate is invalid',                     retryable: false },
  KEY_NOT_FOUND:        { code: 11107, area: 'CERT', http: 400, message: 'Private key not found: {details}',           retryable: false },

  // Crypto
  CRYPTO_FAILED:        { code: 19205, area: 'CRYPTO', http: 500, message: 'Cryptographic operation failed',           retryable: false },

  // Discovery
  DISCOVERY_FAILED:     { code: 12105, area: 'DISC',   http: 502, message: 'Discovery failed: {details}',              retryable: false },

  // Validation
  VALIDATION_FAILED:    { code: 12106, area: 'VAL',   http: 400,  message: 'Validation failed: {details}',             retryable: false },
  
  // Transaction
  TRANSACTION_FAILED:   { code: 12108, area: 'TRX',   http: 400,  message: 'Transaction failed: {details}',            retryable: false },

  // AWS
  SSO_SESSION_EXPIRED: { code: 9036,  area: "AUTH",  http: 500,  message: "SSO session expired: {details}",             retryable: false},
  
  // Storage
  DATABASE_ERROR:      { code: 8011,  area: "DB",  http: 500,  message: "Database error: {details}",                    retryable: false},
  STORAGE_ERROR:       { code: 8012,  area: "ART", http: 500,  message: "Storage error: {details}",                     retryable: false},
  SECRETS_ERROR:       { code: 8014,  area: "SEC", http: 500,  message: "Secrets error: {details}",                     retryable: false},

  NOT_IMPLEMENTED:     { code: 6126,  area: "SYS",  http: 500,  message: "Not implemented: {details}",                  retryable: false},
});

function formatMessage(template, variables = {}) {
  return template.replace(/\{(\w+)\}/g, (_, k) => variables[k] ?? `{${k}}`);
}

/**
 * Node42 application error.
 * Extends Error with Peppol-specific fields: error code, HTTP status, retryability and URL context.
 * @class
 * @extends Error
 * @example
 * throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, { details: 'invoice.xml' });
 */
export class N42Error extends Error {
  constructor(errorDef, variables = {}, { url = null, retryable = null } = {}) {
    const message = formatMessage(errorDef.message, variables);
    super(message);
    this.name      = 'N42Error';
    this.code      = errorDef.code;
    this.http      = errorDef.http;
    this.reason    = message;
    this.url       = url;
    this.retryable = retryable !== null ? retryable : errorDef.retryable;
  }

  pretty() {
    const W = 60;
    const row = (label, value) => {
      if (!value) return '';
      return `${c(C.BOLD, label.padEnd(9))} ${c(C.GRAY, String(value))}\n`;
    };
    let lines = '\n';
    lines += `${c(C.RED, '── Error ' + '─'.repeat(W))}\n`;
    lines += row('code',    this.code);
    lines += row('message', this.reason);
    lines += row('url',     this.url);
    lines += row('retry',   this.retryable ? 'yes' : 'no');
    return lines;
  }
}

export function handleError(e, printStack = false) {
  if (e instanceof N42Error) {
    console.log(e.pretty());
  } else {
    console.error(`Error: ${e.message}`);
    if (printStack) {
      console.error(e.stack);
    }
  }
}