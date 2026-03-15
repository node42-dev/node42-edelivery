/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import crypto from 'crypto';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { 
  NS, XML_SHA256, SWA_ATT_SIG_TRANS
} from '../core/constants.js';

// ── DOM helpers ──────────────────────────────────────────────────────────────

const parser     = new DOMParser();
const serializer = new XMLSerializer();

export function parseXml(str) {
  return parser.parseFromString(str, 'application/xml');
}

export function serializeXml(node) {
  return serializer.serializeToString(node);
}

export function createElement(doc, ns, qname) {
  return doc.createElementNS(ns, qname);
}

/**
 * Create an element with a namespace prefix.
 */
export function el(doc, prefix, localName, attrs = {}, text = null) {
  const ns   = NS[prefix];
  const node = doc.createElementNS(ns, `${prefix}:${localName}`);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.includes(':')) {
      const [p] = k.split(':');
      node.setAttributeNS(NS[p] ?? null, k, v);
    } else {
      node.setAttribute(k, v);
    }
  }
  if (text !== null) node.textContent = text;
  return node;
}

// ── Canonicalization (C14N exclusive) ───────────────────────────────────────

/**
 * C14N + SHA-256 digest → base64.
 */
export function c14nDigest(node) {
  const canonical = c14nSyncNode(node);
  return crypto.createHash('sha256').update(canonical).digest('base64');
}

/**
 * Synchronous C14N using serialization (xml-crypto style).
 * Injects env namespace into SignedInfo as required by WS-Security.
 */
export function c14nSignedInfo(signedInfoNode) {
  const c14n = new ExclusiveCanonicalization();
  const canonical = c14n.process(signedInfoNode);
  const str = typeof canonical === 'string' ? canonical : canonical.toString();
  return str;
}

/**
 * Exclusive C14N (xml-crypto) — required for WS-Security digest and signing.
 * Must match the Algorithm declared in CanonicalizationMethod and each Transform.
 */
export function c14nSyncNode(node) {
  const c14n = new ExclusiveCanonicalization();
  return c14n.process(node);
}

// ── Digest reference builder ─────────────────────────────────────────────────

export function buildDigestReference(doc, referenceId, transform, digestValue) {
  const isAttachment = transform === SWA_ATT_SIG_TRANS;
  const uri          = isAttachment ? referenceId : '#' + referenceId;
  const ref = el(doc, 'ds', 'Reference', { URI: uri });

  const transforms = el(doc, 'ds', 'Transforms');
  transforms.appendChild(el(doc, 'ds', 'Transform', { Algorithm: transform }));
  ref.appendChild(transforms);

  ref.appendChild(el(doc, 'ds', 'DigestMethod', { Algorithm: XML_SHA256 }));
  ref.appendChild(el(doc, 'ds', 'DigestValue', {}, digestValue));

  return ref;
}
