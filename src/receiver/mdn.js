/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import crypto from 'crypto';
import os from 'os';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { el } from '../../src/security/xmlsig.js';
import { EBMS_NS } from '../../src/core/constants.js';

const parser = new DOMParser();
const serializer = new XMLSerializer();

/**
 * Generate AS4 MDN (Message Disposition Notification)
 * Reverses: parseAs4Signal from sender
 * 
 * Two types:
 * 1. Receipt (success) - isReceipt = true
 * 2. Error (failure) - errors array populated
 * 
 * Input: { refToMessageId, timestamp, status, errorCode?, errorMessage? }
 * Output: XML string (SOAP envelope with SignalMessage)
 */
export function generateMDN(options) {
  const {
    refToMessageId,
    timestamp,
    status, // 'success' or 'error'
    errorCode = null,
    errorMessage = null,
    errorDetails = null,
  } = options;
  
  const hostname = os.hostname();
  const messageId = `${crypto.randomUUID()}@${hostname}`;
  
  const doc = parser.parseFromString('<root/>', 'application/xml');
  const e = (prefix, tag, attrs = {}, text = null) => el(doc, prefix, tag, attrs, text);
  
  // SignalMessage
  const signalMessage = e('ns2', 'SignalMessage');
  
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
  messaging.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:ns2', EBMS_NS);
  
  // Body (empty for SignalMessage)
  const body = e('env', 'Body');
  
  // Header
  const header = e('env', 'Header');
  header.appendChild(messaging);
  
  // Envelope
  const envelope = e('env', 'Envelope');
  envelope.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:env', 'http://www.w3.org/2003/05/soap-envelope');
  envelope.appendChild(header);
  envelope.appendChild(body);
  
  doc.replaceChild(envelope, doc.documentElement);
  
  const xml = serializer.serializeToString(doc);
  
  return xml;
}

// DS_NS for digital signature namespace
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
