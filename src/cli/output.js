/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import readline from 'readline';
import path from 'path';
import { c, C } from './color.js';
import { getParticipantValue } from '../core/utils.js';
import { getCertInfo, getKeyInfo } from '../security/pki.js';
import { getUserTransactionsDir } from './paths.js';

const WIDTH = 72;

export function divider() {
  console.log(c(C.DIM, '─'.repeat(WIDTH)));
}

function section(title) {
  console.log(`\n  ${c(C.BOLD, title.toUpperCase())}`);
}

function subSection(label) {
  console.log(`\n  ${c(C.BOLD, label)}`);
}

function row(label, value, color = C.BOLD) {
  console.log(`${c(C.GRAY, `  ${label.padEnd(22)}`)}${c(color, value)}`);
}

export function printHeader(title) {
    divider();
    console.log(`  ${c(C.GRAY, title)}`);
    console.log();
}

export function printPreflight(context) {
  const env              = context.env                ?? 'test';
  const ts               = context.timestamp          ?? '';
  const sender           = context.senderId           ?? '';
  const receiver         = context.receiverId         ?? '';
  const fromAp           = context.fromPartyId        ?? '';
  const toAp             = context.toPartyId          ?? '';
  const docType          = context.documentType       ?? '';
  const country          = context.senderCountry      ?? '';
  const endpoint         = context.endpointUrl        ?? '';
  const origEndpoint     = context.origEndpointUrl    ?? '';
  const cert             = String(context.cert        ?? '');
  const key              = String(context.key         ?? '');
  const senderCert       = context.senderCert         ?? '';
  const senderKey        = context.senderKey          ?? '';
  const receiverCert     = context.receiverCert       ?? '';
  const origReceiverCert = context.origReceiverCert   ?? '';
  const validationErrors = context.validationErrors   ?? [];
  const dryrun           = context.dryrun             ?? false;
  const persist          = context.persist            ?? false;
  const msgId            = context.id                 ?? '';
  const saxonAvailable   = context.saxonAvailable     ?? false;

  const timestamp = new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const shortDoc  = docType ? docType.split('::')[0].split(':').pop() : '';
  const valErr    = validationErrors.length;

  const checks = [
    ['Sender identity resolved',     !!sender],
    ['Receiver identity resolved',   !!receiver],
    ['SMP endpoint discovered',      !!endpoint],
    [`Document validation${valErr ? ` (${valErr} errors)` : ''}`, (saxonAvailable && valErr === 0)],
    ['Receiver certificate loaded',  !!receiverCert],
    ['Sender certificate loaded',    !!senderCert],
    ['Sender private key loaded',    !!senderKey],
  ];
  const allOk = checks.every(([, ok]) => ok);

  console.log();
  divider();
  const envBadge = env === 'test'
    ? c(C.BLACK + C.BG_YELLOW, ` ${env.toUpperCase()} `)
    : c(C.BLACK + C.BG_RED,    ` ${env.toUpperCase()} `);
  console.log(`  ${envBadge}  ${c(C.GRAY, 'Transaction                             ')}  ${c(C.DIM, timestamp)}`);

  section('Participants');
  row('Sender',   getParticipantValue(sender),   C.BLUE);
  row('Receiver', getParticipantValue(receiver), C.BLUE);
  row(' ', '');
  row('<From>', fromAp, C.GRAY);
  row('<To>',   toAp,   C.GRAY);

  section('Document');
  row('Document Type',  shortDoc, C.ORANGE);
  row('Sender Country', country,  C.BOLD);

  section('Encryption');
  row('Sender Cert',  getCertInfo(senderCert), C.GRAY);
  row('           ',  cert,                    C.GRAY);
  row(' ', '');
  row('Sender Key',   getKeyInfo(senderKey),   C.GRAY);
  row('           ',  key,                     C.GRAY);
  row(' ', '');
  row('Receiver Cert', getCertInfo(receiverCert), C.GRAY);

  if (origReceiverCert) {
    row('             ', getCertInfo(origReceiverCert), C.STRIKE);
  }

  section('Transport');
  row('Endpoint', endpoint || '— not found', endpoint ? C.DARK_GREEN : C.RED);
  
  if (origEndpoint) {
    row('        ', origEndpoint, C.STRIKE);
  }

  section('Pre-flight');
  const COL = 36;
  let leftAnsi = null, leftPlain = null;
  for (let i = 0; i < checks.length; i++) {
    const [label, ok] = checks[i];
    const icon  = ok ? c(C.DARK_GREEN, '✓') : c(C.RED, '✗');
    const text  = c(ok ? C.GRAY : C.RED, label);
    const plain = `     ${label}`;
    const entry = `  ${icon}  ${text}`;

    if (i % 2 === 0) {
      leftAnsi  = entry;
      leftPlain = plain;
    } else {
      const pad = ' '.repeat(Math.max(0, COL - leftPlain.length));
      console.log(`${leftAnsi}${pad}${entry}`);
      leftAnsi = leftPlain = null;
    }
  }
  if (leftAnsi) console.log(leftAnsi);

  console.log();
  divider();

  const status   = allOk ? c(C.DARK_GREEN, '✓ all checks passed') : c(C.RED, '✗ checks failed');
  const persistS = persist ? c(C.BLUE, '● persist on')   : c(C.GRAY, '○ persist off');
  const modeS    = dryrun  ? c(C.YELLOW, '⚡ dry-run')    : c(C.GRAY, '→ live send');
  const idS      = c(C.DIM, `id: ${msgId.slice(0, 8)}…`);
  console.log(`  ${status}    ${persistS}     ${modeS}     ${idS}`);
  divider();
  console.log();
}

export async function waitForConfirm() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    process.stdout.write(`${c(C.GRAY, 'Press')} ${c(C.BLUE, 'Enter')} ${c(C.GRAY, 'to send or')} ${c(C.RED, 'Ctrl+C')} ${c(C.GRAY, 'to abort')}  `);
    rl.once('line', () => {
      rl.close();
      process.stdout.write('\x1b[1A\x1b[2K');
      resolve();
    });
    rl.once('SIGINT', () => {
      console.log(`\n\n  ${c(C.YELLOW, 'aborted.')}\n`);
      process.exit(0);
    });
  });
}

export function printArtefacts(context) {
  const dir = getUserTransactionsDir();

  const linkContext = `\u001B]8;;file://${path.join(dir,`${context.id}_context.json`)}\u0007View\u001B]8;;\u0007`;
  const linkDocument = `\u001B]8;;file://${path.join(dir,`${context.id}_document.xml`)}\u0007View\u001B]8;;\u0007`;
  const linkValidation = `\u001B]8;;file://${path.join(dir,`${context.id}_validation.json`)}\u0007View\u001B]8;;\u0007`;
  const linkMessageHeaders = `\u001B]8;;file://${path.join(dir,`${context.id}_message_headers.json`)}\u0007View\u001B]8;;\u0007`;
  const linkMessageBody = `\u001B]8;;file://${path.join(dir,`${context.id}_message_body.txt`)}\u0007View\u001B]8;;\u0007`;
  const linkSigningInput = `\u001B]8;;file://${path.join(dir,`${context.id}_signing_input.txt`)}\u0007View\u001B]8;;\u0007`;
  const linkEnvelope = `\u001B]8;;file://${path.join(dir,`${context.id}_soap_envelope.xml`)}\u0007View\u001B]8;;\u0007`;

  const linkResponseHeaders = `\u001B]8;;file://${path.join(dir,`${context.id}_response_headers.json`)}\u0007View\u001B]8;;\u0007`;
  const linkResponseBody = `\u001B]8;;file://${path.join(dir,`${context.id}_response_body.txt`)}\u0007View\u001B]8;;\u0007`;
  const linkSignal = `\u001B]8;;file://${path.join(dir,`${context.id}_as4_signal.xml`)}\u0007View\u001B]8;;\u0007`;
  const linkMdn = `\u001B]8;;file://${path.join(dir,`${context.id}_as4_mdn.json`)}\u0007View\u001B]8;;\u0007`;
  
  console.log(`${c(C.BOLD, "  ARTEFACTS: OUTBOUND")}`);
  console.log(`  Context            [${c(C.BLUE, linkContext)}]`);
  console.log(`  Document           [${c(C.BLUE, linkDocument)}]`);
  console.log(`  Validation         [${c(C.BLUE, linkValidation)}]`);
  console.log(`  SOAP Envelope      [${c(C.BLUE, linkEnvelope)}]`);
  console.log(`  Signing Input      [${c(C.BLUE, linkSigningInput)}]`);
  console.log(`  Message Headers    [${c(C.BLUE, linkMessageHeaders)}]`);
  console.log(`  Message Body       [${c(C.BLUE, linkMessageBody)}]`);
  console.log();

  console.log(`${c(C.BOLD, "  ARTEFACTS: INBOUND")}`);
  console.log(`  Response Headers   [${c(C.BLUE, linkResponseHeaders)}]`);
  console.log(`  Response Body      [${c(C.BLUE, linkResponseBody)}]`);
  console.log(`  AS4 Signal         [${c(C.BLUE, linkSignal)}]`);
  console.log(`  AS4 MDN            [${c(C.BLUE, linkMdn)}]`);
  console.log();
}

export function printCertInfo(certDetails, keyDetails = null, truststoreDetails = null, verbose = false) {
  const certExpiry = certDetails.expired
    ? c(C.RED,    `✗ expired`)
    : certDetails.expiringSoon
      ? c(C.YELLOW, `⚠ ${certDetails.daysLeft} days left`)
      : c(C.DARK_GREEN, `✓ ${certDetails.daysLeft} days left`);

  console.log();
  console.log(`  ${c(C.BOLD, 'CERTIFICATE')}`);
  divider();

  section('Subject');
  row('CN',      certDetails.cn);
  for (const line of certDetails.subject.split('\n')) {
    const [k, ...v] = line.split('=');
    if (['O', 'OU', 'C'].includes(k?.trim()))
      row(k.trim(), v.join('=').trim(), C.GRAY);
  }

  section('Issuer');
  for (const line of certDetails.issuer.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k?.trim()) row(k.trim(), v.join('=').trim(), C.GRAY);
  }

  section('Validity');
  row('Valid From', certDetails.validFrom);
  row('Valid To',   certDetails.validTo);
  row('Status',     certExpiry);

  section('Fingerprint');
  row('SHA-256', certDetails.fingerprint, C.DIM);

  if (keyDetails) {
    section('Private Key');
    if (keyDetails.error) {
      row('Error', keyDetails.error, C.RED);
    } else {
      row('Type',      keyDetails.type);
      row('Size',      keyDetails.size);
      row('Encrypted', keyDetails.passwordProtected ? c(C.YELLOW, 'yes') : c(C.GRAY, 'no'));
      row('Matches cert', keyDetails.matchesCert === true
        ? c(C.DARK_GREEN, '✓ yes')
        : keyDetails.matchesCert === false
          ? c(C.RED, '✗ no')
          : c(C.GRAY, '—'));
    }
  }

  if (truststoreDetails) {
    section('Truststore');
    row('Roots', `${truststoreDetails.count} certificate${truststoreDetails.count !== 1 ? 's' : ''}`);
    
    if (verbose) {
      divider();

      truststoreDetails.certs.forEach((cert, i) => {
        const caExpiry = cert.expired
          ? c(C.RED,    `✗ expired`)
          : cert.expiringSoon
            ? c(C.YELLOW, `⚠ ${cert.daysLeft} days left`)
            : c(C.DARK_GREEN, `✓ ${cert.daysLeft} days left`);

        subSection(`Root CA #${i + 1}`);
        row('CN',          cert.cn);
        row('Valid From',  cert.validFrom);
        row('Valid To',    cert.validTo);
        row('Status',      caExpiry);
        row('Fingerprint', cert.fingerprint, C.DIM);
      });
    }
  }

  console.log();
  divider();

  section('Locations');
  row('Certificate', certDetails.path, C.DIM);
  row('Provate Key', keyDetails.path, C.DIM);
  row('Truststore', truststoreDetails.path, C.DIM);

  console.log();
}

export function printSignalMessage(context) {
  const signal = context.signalMessage;
  
  const W = 60;
  let out = '';
  out += `  ${c(C.BLUE, '── AS4 Signal ' + '─'.repeat(W - 6))}\n`;
  out += `  ${c(C.BOLD, 'messageId'.padEnd(16))} ${c(C.GRAY, signal.messageId ?? '-')}\n`;
  out += `  ${c(C.BOLD, 'refTo'.padEnd(16))} ${c(C.GRAY, signal.refToMessageId ?? '-')}\n`;
  out += `  ${c(C.BOLD, 'timestamp'.padEnd(16))} ${c(C.GRAY, signal.timestamp ?? '-')}\n`;
  out += `  ${c(C.BOLD, 'receipt'.padEnd(16))} ${c(C.GRAY, signal.isReceipt ? 'yes' : 'no')}\n`;

  if (signal.errors?.length) {
    out += `\n  ${c(C.RED, '── Errors ' + '─'.repeat(W - 2))}\n`;
    for (const e of signal.errors) {
      if (e.errorCode) {
        out += `  ${c(C.BOLD, 'code'.padEnd(16))} ${c(C.RED, e.errorCode)}\n`;
      }
      out += `  ${c(C.BOLD, 'severity'.padEnd(16))} ${c(C.GRAY, e.severity   ?? '-')}\n`;
      out += `  ${c(C.BOLD, 'category'.padEnd(16))} ${c(C.GRAY, e.category   ?? '-')}\n`;
      out += `  ${c(C.BOLD, 'description'.padEnd(16))} ${c(C.GRAY, e.description ?? '-')}\n`;
      out += `  ${c(C.BOLD, 'detail'.padEnd(16))} ${c(C.GRAY, e.detail     ?? '-')}\n`;
    }
  }

  console.log(out);
}