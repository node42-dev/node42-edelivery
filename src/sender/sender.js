/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import os   from 'os';
import fs   from 'fs';
import path from 'path';

import { DOMParser }                         from '@xmldom/xmldom';
import { lookupParticipant }                 from '../lookup.js';
import { lookupCountry }                     from '../core/icd.js'
import { buildAs4Request, sendAs4Message }   from './as4.js';
import { stripSbdh, wrapInSbdh }             from '../document/ubl.js';
import { validateDocument }                  from '../document/validator.js';
import { getCertCommonName, validateCert }   from '../security/pki.js';
import { N42ErrorCode, N42Error }            from '../core/error.js';
import { printPreflight, waitForConfirm }    from '../cli/output.js';
import { c, C }                              from '../cli/color.js' 

import { 
  getUserHomeDir,
  getUserCertsDir, 
  getUserTransactionsDir 
} from '../cli/paths.js';

const parser = new DOMParser();

export async function sendDocument(context, document) {
  if (!context.hostname) context.hostname = os.hostname();

  const docBuf = Buffer.isBuffer(document) ? document : Buffer.from(document);
  const docStr = docBuf.toString('utf-8');

  // ── Extract identifiers from SBDH ────────────────────────────────────────
  const docXml = parser.parseFromString(docStr, 'application/xml');
  //console.log(format(docStr, { indentation: "  ", collapseContent: true }));

  // Extract sender ID
  context.spinner.start('Extracting Sender');
  const senderEls = docXml.getElementsByTagName('Sender');
  if (!context.senderId && senderEls.length) {
    const idEl     = senderEls[0].getElementsByTagName('Identifier')[0];
    if (idEl) {
      const authority = idEl.getAttribute('Authority') ?? 'iso6523-actorid-upis';
      context.senderId = `${authority}::${idEl.textContent.trim()}`;
    }
  }
  context.spinner.done('Extracted Sender');

  // Extract receiver ID
  context.spinner.start('Extracting Receiver');
  const receiverEls = docXml.getElementsByTagName('Receiver');
  if (!context.receiverId && receiverEls.length) {
    const idEl       = receiverEls[0].getElementsByTagName('Identifier')[0];
    if (idEl) {
      const authority  = idEl.getAttribute('Authority') ?? 'iso6523-actorid-upis';
      context.receiverId = `${authority}::${idEl.textContent.trim()}`;
    }
  }
  context.spinner.done('Extracted Receiver')

  // Extract scope values
  context.spinner.start('Extracting Scopes')
  const scopes = docXml.getElementsByTagName('Scope');
  for (let i = 0; i < scopes.length; i++) {
    const type  = scopes[i].getElementsByTagName('Type')[0]?.textContent;
    const value = scopes[i].getElementsByTagName('InstanceIdentifier')[0]?.textContent;

    if (type === 'COUNTRY_C1' && !context.senderCountry) context.senderCountry = value;
    if (type === 'DOCUMENTID' && !context.documentType && value) context.documentType  = value;
    if (type === 'PROCESSID'  && !context.processId && value) context.processId     = value;
  }

  if (!context.documentType) {
    const invoiceEl      = docXml.documentElement;
    const baseNs         = invoiceEl?.namespaceURI?.trim();
    const localName      = invoiceEl?.localName?.trim();
    const customizationId = docXml.getElementsByTagName('cbc:CustomizationID')[0]?.textContent?.trim();

    if (baseNs && localName && customizationId) {
      context.documentType = `${baseNs}::${localName}##${customizationId}::2.1`;
    }
  }

  if (!context.processId) {
    context.processId = docXml.getElementsByTagName('cbc:ProfileID')[0]?.textContent?.trim();
  }
  context.spinner.done('Extracted Scopes')

  // Extract Country
  context.spinner.start('Extracting Country')
  context.receiverCountry = lookupCountry(context.receiverId);
  context.spinner.done('Extracted Country')
  
  // ── SBDH Strip / Wrap ─────────────────────────────────────────────────────
  let workDoc = docXml;
  /*    
    Strip the existing SBDH from the document before sending.
    Use this when the document already contains an SBDH that should be
    replaced — e.g. documents from the Peppol Testbed or other systems
    that embed their own SBD wrapper. The stripped document will be
    re-wrapped below using the context provided via CLI args.
  */
  if (context.stripSbdh) {
    workDoc = stripSbdh(workDoc);
  }

  /*
    If the document has no SBDH — either because it never had one, or because
    it was just stripped above — wrap it using the context provided via CLI args.
    This ensures the outbound SBD reflects the correct sender/receiver/process
    regardless of what the original document contained.
  */
  let docBytes;
  const hasSbdh = !!docXml.getElementsByTagName('StandardBusinessDocumentHeader')[0];
  if (!hasSbdh) {
    context.spinner.start('Wrapping Document');
    const { xml } = wrapInSbdh(context, workDoc.documentElement ?? docXml);
    docBytes = Buffer.from(xml);
    context.spinner.done('Wrapped Document');
  } else {
    docBytes = docBuf;
  }

  if (context.persist) {
    const outDir = getUserTransactionsDir();
    fs.writeFileSync(
      path.join(outDir, `${context.id}_wrapped_document.xml`),
      docBytes
    );
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  /*
    Validate the prepared document against schema and business rules.
    Validation errors do NOT automatically abort execution.
  
    - Errors are printed in structured JSON format for diagnostics.
    - If persistence is enabled, the validation result (including errors)
      is written to file for later inspection and reproducibility.
  
    This allows controlled interoperability testing even with invalid
    documents, while still preserving full validation traceability.
  */
  context.validationErrors = await validateDocument(context, docBytes);
  context.timer.mark('Validated Document');

  // ── SMP lookup ────────────────────────────────────────────────────────────
  /*
    Query SMP for participant metadata.
    Returns:
      - transport_profile: AS4 transport profile identifier
      - endpoint_url: Receiver AS4 endpoint URL
      - receiver_cert: Encryption certificate published in SMP
    
    Note:
    In normal Peppol flow, the receiver_cert from SMP is used for encryption.
    However, if a probe cert_id is supplied, this value may later be overridden
    to enforce deterministic crypto using the persisted probe certificate.
  */
  context.spinner.start('Lookup Participant');
  let profile, endpointUrl, receiverCert;
  try {
    ({ profile, url: endpointUrl, cert: receiverCert } = await lookupParticipant(context));
  } catch {
    context.spinner.fail('Lookup Participant');
    throw new N42Error(N42ErrorCode.SMP_NOT_FOUND, { details: 'Participant' });
  }

  if (!context.transportProfile) context.transportProfile = profile;
  if (!context.endpointUrl)      context.endpointUrl      = endpointUrl;
  else                           context.origEndpointUrl  = endpointUrl;

  if (!context.endpointUrl) {
    context.spinner.fail('Lookup Participant');
    throw new N42Error(N42ErrorCode.SMP_NOT_FOUND, { details: 'Endpoint URL' });
  }
  if (!receiverCert) {
    context.spinner.fail('Lookup Participant');
    throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: 'Receiver certificate' });
  }
  context.spinner.done('Found Participant');

  context.timer.mark('SMP Lookup');

  // ── Load certificates ─────────────────────────────────────────────────────
  context.spinner.start('Processing Certificates');

  let senderCert = null;
  const certPath = context.cert ?? 'cert.pem';

  if (certPath.includes('-----BEGIN')) {
    senderCert = Buffer.from(certPath);
  } else if (fs.existsSync(certPath) && !fs.statSync(certPath).isDirectory()) {
    senderCert = fs.readFileSync(certPath);
  } else {
    const fallback = path.join(getUserCertsDir(), 'cert.pem');
    if (fs.existsSync(fallback)) {
      context.cert = fallback;
      senderCert   = fs.readFileSync(fallback);
    }
  }
  if (!senderCert) {
     const certDir = getUserCertsDir()
    throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Sender certificate not present in ${c(C.BOLD, certDir)}` });
  }

  let senderKey = null;
  const keyPath = context.key ?? 'key.pem';

  if (keyPath.includes('-----BEGIN')) {
    senderKey = Buffer.from(keyPath);
  }
  else if (fs.existsSync(keyPath) && !fs.statSync(keyPath).isDirectory()) {
    senderKey = keyPath;
  } else {
    const fallback = path.join(getUserCertsDir(), 'key.pem');
    if (fs.existsSync(fallback)) {
      context.key = fallback;
      senderKey   = fs.readFileSync(fallback);;
    }
  }
  if (!senderKey) {
    const certDir = getUserCertsDir()
    throw new N42Error(N42ErrorCode.KEY_NOT_FOUND, { details: `Sender key not present in ${c(C.BOLD, certDir)}` });
  }

  context.fromPartyId  = getCertCommonName(senderCert);
  context.toPartyId    = getCertCommonName(receiverCert);
  context.senderCert   = senderCert;
  context.senderKey    = senderKey;
  context.receiverCert = receiverCert;

  /*
    Validate the receiver certificate.
    
    If no PROBE certId is provided, the encryption certificate returned
    from SMP must be validated (including environment-specific checks).
    
    In PROBE mode (certId set), certificate validation is intentionally
    skipped because the certificate is dynamically generated and tied to
    the persisted private key for deterministic crypto testing.
  */
  if (!context.certId) {
    validateCert(context);
  }
  context.spinner.done('Processed Certificates');

  /*
    If a probe cert_id is explicitly provided, override the SMP-discovered
    receiver certificate with the sender certificate used for this exchange.
    
    Rationale:
    In probe mode, the certificate chain is dynamically generated and persisted
    (C3 loads the matching private key based on cert_id). The encryption must
    therefore use the exact same certificate that corresponds to the persisted
    private key on the receiver side.
    
    Even if SMP returns a different encryption certificate, it must be ignored
    in this scenario to ensure deterministic decryption and crypto isolation.
    #
    This guarantees that:
      - The encrypted message matches the persisted key material
      - The receiver can load the correct private key via cert_id
      - No external SMP state interferes with probe-based testing
  */
  if (context.certId) {
    context.origReceiverCert = context.receiverCert;
    context.receiverCert     = context.senderCert;
  }

  // ── Build request ─────────────────────────────────────────────────────────
  const { headers, body } = buildAs4Request(context, docBytes);

  // ── Persist context ───────────────────────────────────────────────────────
  if (context.persist) {
    const outDir = getUserTransactionsDir();
    fs.writeFileSync(path.join(outDir, `${context.id}_message_headers.json`), JSON.stringify(headers, null, 2));
    fs.writeFileSync(path.join(outDir, `${context.id}_message_body.txt`), body.toString());

    const skip   = new Set(['validationErrors', 'senderCert', 'receiverCert', 'origReceiverCert', 'spinner']);
    const ctxOut = Object.fromEntries(
      Object.entries(context).filter(([k]) => !skip.has(k))
    );

    fs.writeFileSync(path.join(outDir, `${context.id}_context.json`),  JSON.stringify(ctxOut, null, 2));
    fs.writeFileSync(path.join(outDir, `${context.id}_validation.json`), JSON.stringify(context.validationErrors, null, 2));

    fs.writeFileSync(path.join(getUserHomeDir(), 'replay.json'), JSON.stringify({
      id: context.id,
      sender: context.senderId,
      receiver: context.receiverId, 
      endpoint: context.endpointUrl
    }));
  }

  printPreflight(context);

  if (context.dryrun) return { body, headers, context };

  await waitForConfirm();
  context.timer.mark('Preflight wait');

  context.signalMessage = await sendAs4Message(context, headers, body);

  return context;
}
