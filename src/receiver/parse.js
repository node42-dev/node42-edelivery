/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { DOMParser } from '@xmldom/xmldom';
import { N42Error, N42ErrorCode } from '../../src/core/error.js';
import { EBMS_NS } from '../../src/core/constants.js';

const parser = new DOMParser();

/**
 * Parse multipart/related AS4 message
 * Reverses: buildAs4Request from sender
 * 
 * Input: Raw HTTP body (multipart/related with SOAP + encrypted attachment)
 * Output: { envelope: XMLDocument, attachment: Buffer, messageId, from, to }
 */
export async function parseAs4Message(contentType, body) {
  //console.log(body);
  
  // Extract boundary from Content-Type header
  const boundaryMatch = contentType.match(/boundary="?([^";,]+)"?/);
  if (!boundaryMatch) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'Invalid Content-Type; No boundary found in Content-Type header' }
    );
  }
  
  const boundary = boundaryMatch[1];
  console.log('Boundary:', boundary);
  
  // Split multipart body into parts
  const bodyStr = Buffer.isBuffer(body) ? body.toString('utf-8') : body;
  const parts = parseMultipart(bodyStr, boundary);
  
  if (parts.length < 2) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: `Invalid Multipart; Expected at least 2 parts, got ${parts.length}` }
    );
  }
  
  // Part 1: SOAP envelope (application/soap+xml)
  const soapPart = parts.find(p => 
    p.headers['content-type']?.includes('application/soap+xml')
  );
  
  if (!soapPart) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'No SOAP envelope found in multipart message' }
    );
  }
  
  // Part 2: Encrypted attachment (application/octet-stream, base64)
  const attachmentPart = parts.find(p => 
    p.headers['content-type']?.includes('application/octet-stream') ||
    p.headers['content-transfer-encoding'] === 'base64'
  );
  
  if (!attachmentPart) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'No encrypted attachment found in multipart message' }
    );
  }
  
  // Parse SOAP envelope XML
  const envelopeDoc = parser.parseFromString(soapPart.body, 'application/xml');
  
  // Extract ebMS3 metadata
  const messageInfo = envelopeDoc.getElementsByTagNameNS(EBMS_NS, 'MessageInfo')[0];
  if (!messageInfo) {
    throw new N42Error(
      N42ErrorCode.TRANSACTION_FAILED,
      { details: 'No ebMS3 MessageInfo found in envelope' }
    );
  }
  
  const messageId = messageInfo.getElementsByTagNameNS(EBMS_NS, 'MessageId')[0]?.textContent;
  
  // Extract sender/receiver PartyId
  const partyInfo = envelopeDoc.getElementsByTagNameNS(EBMS_NS, 'PartyInfo')[0];
  const fromParty = partyInfo?.getElementsByTagNameNS(EBMS_NS, 'From')[0];
  const toParty = partyInfo?.getElementsByTagNameNS(EBMS_NS, 'To')[0];
  
  const from = fromParty?.getElementsByTagNameNS(EBMS_NS, 'PartyId')[0]?.textContent;
  const to = toParty?.getElementsByTagNameNS(EBMS_NS, 'PartyId')[0]?.textContent;
  
  console.log('Message ID:', messageId);
  console.log('From:', from);
  console.log('To:', to);
  
  // Decode base64 attachment
  const attachmentB64 = attachmentPart.body
    .replace(/\r\n/g, '') // Remove CRLF line breaks
    .replace(/\n/g, '')   // Remove LF
    .trim();
  
  const attachment = Buffer.from(attachmentB64, 'base64');
  
  console.log('SOAP envelope size:', soapPart.body.length, 'bytes');
  console.log('Encrypted attachment size:', attachment.length, 'bytes');
  
  return {
    envelope: envelopeDoc,
    attachment,
    messageId,
    from,
    to,
  };
}

/**
 * Parse multipart/related body into parts
 * Handles CRLF line endings (RFC 2822)
 */
function parseMultipart(body, boundary) {
  const parts = [];
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;
  
  // Split by boundary
  const sections = body.split(delimiter);
  
  for (let section of sections) {
    section = section.trim();
    
    // Skip empty sections and end delimiter
    if (!section || section === '--' || section.startsWith('--')) {
      continue;
    }
    
    // Remove end delimiter if present
    if (section.includes(endDelimiter)) {
      section = section.replace(endDelimiter, '');
    }
    
    // Split headers and body
    const separatorIndex = section.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      // Try LF only
      const lfIndex = section.indexOf('\n\n');
      if (lfIndex === -1) continue;
      
      const headerText = section.substring(0, lfIndex);
      const bodyText = section.substring(lfIndex + 2);
      parts.push(parsePart(headerText, bodyText));
    } else {
      const headerText = section.substring(0, separatorIndex);
      const bodyText = section.substring(separatorIndex + 4); // Skip \r\n\r\n
      parts.push(parsePart(headerText, bodyText));
    }
  }
  
  return parts;
}

/**
 * Parse individual multipart part
 */
function parsePart(headerText, bodyText) {
  const headers = {};
  const headerLines = headerText.split(/\r?\n/);
  
  for (const line of headerLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const name = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    headers[name] = value;
  }
  
  return { headers, body: bodyText.trim() };
}