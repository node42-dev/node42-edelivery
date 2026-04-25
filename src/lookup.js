/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import crypto  from 'crypto';
import dns     from 'dns/promises';
import fetch   from 'node-fetch';
import base32 from "hi-base32";
import { DOMParser } from '@xmldom/xmldom';
import { N42ErrorCode, N42Error } from './core/error.js';
import { SMP_NS, WSA_NS } from './core/constants.js';

const parser = new DOMParser();

// ── Helpers ──────────────────────────────────────────────────────────────────

function findServiceUrl(serviceUrls, documentType) {
  if (!documentType) return serviceUrls[0] ?? null;
  
  return serviceUrls.find(url => {
    const decoded = decodeURIComponent(url);
    const segment = decoded.split('/services/')[1] ?? '';
    // strip scheme prefix e.g. "busdox-docid-qns::" or "peppol-doctype-wildcard::"
    const docPart = segment.includes('::') ? segment.split('::').slice(1).join('::') : segment;
    return docPart === documentType;
  }) ?? null;
}

async function fetchServiceMetadata(url, timeout) {
  let res;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
  } catch(e) {
    throw new N42Error(N42ErrorCode.SERVER_ERROR, { details: e.message }, { url, retryable: true });
  }

  if (!res.ok) {
    const retryable = res.status >= 500;
    throw new N42Error(
      retryable ? N42ErrorCode.SERVER : N42ErrorCode.SMP_NOT_FOUND,
      `HTTP ${res.status}`, { url, retryable }
    );
  }

  const text = await res.text();
  return parser.parseFromString(text, 'application/xml');
}

function parseAs4Endpoint(xml) {
  const endpoints = xml.getElementsByTagNameNS(SMP_NS, 'Endpoint');
  for (let i = 0; i < endpoints.length; i++) {
    const ep      = endpoints[i];
    const profile = ep.getAttribute('transportProfile') ?? '';
    if (!profile.startsWith('peppol-transport-as4')) continue;

    const url  = ep.getElementsByTagNameNS(WSA_NS, 'Address')[0]?.textContent?.trim() ?? null;
    let   cert = ep.getElementsByTagNameNS(SMP_NS, 'Certificate')[0]?.textContent?.trim() ?? null;

    if (cert) {
      const der = Buffer.from(cert.replace(/\s+/g, ''), 'base64');
      cert      = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    }

    return { profile, url, cert };
  }

  throw new N42Error(N42ErrorCode.SMP_NOT_FOUND, { details: 'AS4 endpoint in SMP response' });
}

function base32Encode(hash) {
  return base32.encode(hash)
    .replace(/=+$/, "")
    .toUpperCase();
}

function hashParticipantBase32(participantId) {
  const value = participantId.includes('::') ? participantId.split('::')[1] : participantId;
  const hash  = crypto.createHash('sha256').update(value.toLowerCase()).digest();
  return base32Encode(hash);
}

async function resolveNaptr(domain) {
  let answers;
  try {
    answers = await dns.resolveNaptr(domain);
  } catch(e) {
    const retryable = !e.message.includes('ENOTFOUND') && !e.message.includes('ENODATA');
    throw new N42Error(N42ErrorCode.DNS_EROR, { details: e.message}, { retryable });
  }

  const sorted = answers.sort((a, b) => a.order - b.order);
  for (const rdata of sorted) {
    const flags   = rdata.flags?.toLowerCase() ?? '';
    const service = rdata.service?.toLowerCase() ?? '';
    if (flags !== 'u' || service !== 'meta:smp') continue;

    const regexp  = rdata.regexp;
    const delim   = regexp[0];
    const parts   = regexp.split(delim);
    const pattern = parts[1];
    const replace = parts[2];
    const result  = domain.replace(new RegExp(`^${pattern}$`), replace);

    if (!result.startsWith('http://') && !result.startsWith('https://')) {
      throw new N42Error(N42ErrorCode.DNS_ERROR, { details: 'NAPTR record did not resolve to a valid URL' });
    }

    return result;
  }

  throw new N42Error(N42ErrorCode.DNS_ERROR, { details: 'No usable NAPTR record found' });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function resolveSmpUrl(context) {
  const base   = context.env === 'test'
    ? 'acc.edelivery.tech.ec.europa.eu'
    : 'edelivery.tech.ec.europa.eu';
  const domain = `${hashParticipantBase32(context.receiverId)}.iso6523-actorid-upis.${base}`;

  const smpBase = await resolveNaptr(domain);
  const encoded = encodeURIComponent(context.receiverId);
  return `${smpBase.replace(/\/$/, '')}/${encoded}`;
}

export async function lookupParticipantServiceUrls(context) {
  const smpUrl = await resolveSmpUrl(context);

  let res;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), context.timeout);
    res = await fetch(smpUrl, { signal: ctrl.signal });
    clearTimeout(tid);
  } catch(e) {
    throw new N42Error(N42ErrorCode.SERVER, { details: e.message}, { url: smpUrl, retryable: true });
  }

  if (!res.ok) {
    const retryable = res.status >= 500;
    throw new N42Error(
      retryable ? N42ErrorCode.SERVER : N42ErrorCode.SMP_NOT_FOUND,
      `HTTP ${res.status}`, { url: smpUrl, retryable }
    );
  }

  const text = await res.text();
  const xml  = parser.parseFromString(text, 'application/xml');
  const refs   = xml.getElementsByTagNameNS(SMP_NS, 'ServiceMetadataReference');
  const urls = [];
  for (let i = 0; i < refs.length; i++) {
    const href = refs[i].getAttribute('href');
    if (href) urls.push(href);
  }
  return urls;
}

export async function lookupParticipant(context) {
  const serviceUrls = await lookupParticipantServiceUrls(context);
  const serviceUrl  = findServiceUrl(serviceUrls, context.documentType);

  if (!serviceUrl) {
    throw new N42Error(N42ErrorCode.SMP_NOT_FOUND, { details: `${context.documentType} in SMP` });
  }

  const xml = await fetchServiceMetadata(serviceUrl, context.timeout);
  return parseAs4Endpoint(xml);
}
