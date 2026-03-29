/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import fs from 'fs';


export function getParticipantValue(identifier) {
  return identifier?.includes('::') ? identifier.split('::')[1] : identifier;
}

export function checkRequiredForSend(opts) {
  const missing = [];
  if (!opts.senderId) missing.push('senderId');
  if (!opts.receiverId) missing.push('receiverId');
  if (!opts.senderCountry) missing.push('senderCountry');
  return missing;
}

export function checkRequiredForCertChain(opts) {
  const missing = [];
  if (!opts.type) missing.push('type');
  if (!opts.service) missing.push('service');
  if (!opts.org) missing.push('org');
  if (!opts.country) missing.push('country');
  if (!opts.dnsName) missing.push('dns-name');
  return missing;
}

export function checkRequiredForCertRoot(opts) {
  const missing = [];
  if (!opts.type) missing.push('type');
  if (!opts.org) missing.push('org');
  if (!opts.country) missing.push('country');
  return missing;
}

export function checkRequiredForCertCa(opts) {
  const missing = [];
  if (!opts.type) missing.push('type');
  if (!opts.service) missing.push('service');
  if (!opts.org) missing.push('org');
  if (!opts.country) missing.push('country');
  return missing;
}

export function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === dateStr;
}

export function normalizeFilename(filename) {
  return filename.toLowerCase().replace(/[\s.]/g, '_');
}

export function detectPayloadType(event) {
  let body = event.body || '';

  // Decode if base64 (API Gateway etc.)
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }

  // Remove BOM + trim
  const cleaned = body.replace(/^\uFEFF/, '').trim();

  // Header hint (optional but useful)
  const contentType =
    event.headers?.['content-type'] ||
    event.headers?.['Content-Type'] ||
    '';

  if (contentType.includes('application/json')) return 'json';
  if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'xml';

  // Fallback sniffing
  if (cleaned.startsWith('<')) return 'xml';
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) return 'json';

  return 'unknown';
}

export function createSoapHttpResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
    },
    body,
  };
}

export function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return                          `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function getFileSize(filePath) {
  return formatSize(fs.statSync(filePath).size);
}

export function isFileLargerThanMB(filePath, threshold) {
  try {
    return fs.statSync(filePath).size > threshold * 1024 * 1024; // MB
  } catch {
    return false;
  }
}