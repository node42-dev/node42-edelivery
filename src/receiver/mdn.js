/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import crypto from 'crypto';
import os from 'os';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { el, c14nDigest, c14nSignedInfo, buildDigestReference } from '../../src/security/xmlsig.js';
import { XML_NS, EBMS_NS, DS_NS } from '../../src/core/constants.js';

const parser = new DOMParser();
const serializer = new XMLSerializer();


/**
 * Generate a signed AS4 MDN (Message Disposition Notification).
 *
 * @param {object}  options
 * @param {string}  options.refToMessageId  - Message ID being acknowledged
 * @param {string}  options.timestamp       - ISO 8601 timestamp
 * @param {string}  options.status          - 'success' | 'error'
 * @param {string}  [options.errorCode]     - EBMS error code (error only)
 * @param {string}  [options.errorMessage]  - Human-readable error message (error only)
 * @param {string}  [options.errorDetails]  - Additional error details (error only)
 * @param {string}  [options.cert]          - AP certificate PEM (for signing)
 * @param {string}  [options.key]           - AP private key PEM (for signing)
 * @returns {string} Serialized SOAP envelope XML
 */
export function generateMDN(options) {
  const {
    refToMessageId,
    timestamp,
    status, // 'success' or 'error'
    errorCode = null,
    errorMessage = null,
    errorDetails = null,
    cert = null,
    key = null,
  } = options;
  
  const hostname = os.hostname();
  const messageId = `${crypto.randomUUID()}@${hostname}`;
  
  const doc = parser.parseFromString('<root/>', 'application/xml');
  const e = (prefix, tag, attrs = {}, text = null) => el(doc, prefix, tag, attrs, text);
  
  // SignalMessage
  const signalMessage = e('ns2', 'SignalMessage');

  // Give SignalMessage an Id for signing
  const signalMsgId = `id-${crypto.randomUUID()}`;
  signalMessage.setAttribute('Id', signalMsgId);
  
  // MessageInfo
  const msgInfo = e('ns2', 'MessageInfo');
  msgInfo.appendChild(e('ns2', 'Timestamp', {}, timestamp));
  msgInfo.appendChild(e('ns2', 'MessageId', {}, messageId));
  if (refToMessageId) {
    msgInfo.appendChild(e('ns2', 'RefToMessageId', {}, refToMessageId));
  }
  signalMessage.appendChild(msgInfo);
  
  if (status === 'success') {
    // Receipt (success)
    const receipt = e('ns2', 'Receipt');
    
    // Non-repudiation receipt (optional, but Phase4 expects it)
    const nonRepReceipt = doc.createElementNS(
      'http://docs.oasis-open.org/ebxml-msg/ns/v3.0/ebbp/201008/',
      'ebbp:NonRepudiationInformation'
    );
    
    const msgPartNrInf = doc.createElementNS(
      'http://docs.oasis-open.org/ebxml-msg/ns/v3.0/ebbp/201008/',
      'ebbp:MessagePartNRInformation'
    );
    
    // Reference to original message
    const ref = doc.createElementNS(DS_NS, 'ds:Reference');
    ref.setAttribute('URI', `#${refToMessageId}`);
    msgPartNrInf.appendChild(ref);
    
    nonRepReceipt.appendChild(msgPartNrInf);
    receipt.appendChild(nonRepReceipt);
    
    signalMessage.appendChild(receipt);
    
    console.log('Generated positive MDN (Receipt)');
    
  } else if (status === 'error') {
    // Error
    const error = e('ns2', 'Error', {
      errorCode: errorCode || 'EBMS:0004',
      severity: 'failure',
      category: 'Processing',
      refToMessageInError: refToMessageId || '',
    });
    
    if (errorMessage) {
      error.appendChild(e('ns2', 'Description', {}, errorMessage));
    }
    
    if (errorDetails) {
      const detailStr = typeof errorDetails === 'object' 
        ? JSON.stringify(errorDetails) 
        : String(errorDetails);
      error.appendChild(e('ns2', 'ErrorDetail', {}, detailStr));
    }
    
    signalMessage.appendChild(error);
    
    console.log('Generated negative MDN (Error)');
  }
  
  // Messaging
  const messaging = e('ns2', 'Messaging', {
    'env:mustUnderstand': 'true',
  });
  messaging.appendChild(signalMessage);
  
  // Add namespace declarations
  messaging.setAttributeNS(XML_NS, 'xmlns:ns2', EBMS_NS);
  
  // Body (empty for SignalMessage)
  const body = e('env', 'Body');
  
  // Header
  const header = e('env', 'Header');
  header.appendChild(messaging);
  
  // Sign if cert and key provided
  if (cert && key) {
    const signatureNode = buildMdnSignature(doc, signalMessage, signalMsgId, cert, key);
    header.appendChild(signatureNode);
  }

  // Envelope
  const envelope = e('env', 'Envelope');
  envelope.setAttributeNS(XML_NS, 'xmlns:env', 'http://www.w3.org/2003/05/soap-envelope');
  envelope.appendChild(header);
  envelope.appendChild(body);
  
  doc.replaceChild(envelope, doc.documentElement);
  
  const xml = serializer.serializeToString(doc);
  
  return xml;
}

function buildMdnSignature(doc, signalMessage, signalMsgId, certPem, keyPem) {
  // Digest the SignalMessage
  const digestValue = c14nDigest(signalMessage);

  // Build SignedInfo
  const signedInfo = el(doc, 'ds', 'SignedInfo');
  signedInfo.appendChild(el(doc, 'ds', 'CanonicalizationMethod', {
    Algorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#'
  }));
  signedInfo.appendChild(el(doc, 'ds', 'SignatureMethod', {
    Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
  }));
  signedInfo.appendChild(buildDigestReference(
    doc,
    signalMsgId,
    'http://www.w3.org/2001/10/xml-exc-c14n#',
    digestValue
  ));

  // Sign SignedInfo
  const c14nSignedInfoStr = c14nSignedInfo(signedInfo);
  const signatureValue = crypto.sign('sha256', Buffer.from(c14nSignedInfoStr), keyPem).toString('base64');

  // Extract cert (strip headers)
  const certB64 = certPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');

  // Build Signature element
  const signature = el(doc, 'ds', 'Signature');
  signature.appendChild(signedInfo);
  signature.appendChild(el(doc, 'ds', 'SignatureValue', {}, signatureValue));

  const keyInfo = el(doc, 'ds', 'KeyInfo');
  const secTokenRef = el(doc, 'wsse', 'SecurityTokenReference');
  const x509Data = el(doc, 'ds', 'X509Data');
  x509Data.appendChild(el(doc, 'ds', 'X509Certificate', {}, certB64));
  keyInfo.appendChild(secTokenRef);
  keyInfo.appendChild(x509Data);
  signature.appendChild(keyInfo);

  return signature;
}