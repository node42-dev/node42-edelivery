/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: Apache-2.0
*/

import crypto  from 'crypto';
import fs      from 'fs';
import { el, buildDigestReference, c14nDigest, c14nSignedInfo } from './xmlsig.js';
import { parseCert } from './pki.js';
import {
  DS_NS, WSSE_NS, WSU_NS, ENC11_NS,
  SOAP_ENV_NS, XML_CANONICAL_C14N, XML_RSA_SHA256,
  XML_RSA_OAEP, XML_MGF_SHA256, XML_SHA256, XML_AES128_GCM,
  SWA_ATT_SIG_TRANS, SWA_ATT_ENC_TRANS,
  SWA_ATT_CONT_ONLY_TYPE, WSS11_ENC_KEY_TOKEN_TYPE,
  WSS_BASE64B_ENCODING_TYPE, WSS_X509TOKEN, WSSEC_NAMESPACES
} from '../core/constants.js';


export function addExtraNs(ns, node) {
  const XMLNS = 'http://www.w3.org/2000/xmlns/';
  for (const [attr, uri] of Object.entries(ns)) {
      node.setAttributeNS(XMLNS, `xmlns:${attr}`, uri);
  }
}

// ── BinarySecurityToken ──────────────────────────────────────────────────────

export function buildBinarySecurityToken(doc, identifier, pem) {
  const cert    = parseCert(pem);
  const b64cert = cert.raw.toString('base64');

  const node = el(doc, 'wsse', 'BinarySecurityToken', {
    'wsu:Id':    identifier,
    EncodingType: WSS_BASE64B_ENCODING_TYPE,
    ValueType:    WSS_X509TOKEN,
  }, b64cert);

  return node;
}

// ── KeyInfo ──────────────────────────────────────────────────────────────────

export function buildKeyInfo(doc, securityToken) {
  const id        = securityToken.getAttributeNS(WSU_NS, 'Id');
  const valueType = securityToken.getAttribute('ValueType');

  const keyInfo = el(doc, 'ds', 'KeyInfo');
  const str     = el(doc, 'wsse', 'SecurityTokenReference', { 'wsse:TokenType': valueType });
  str.appendChild(el(doc, 'wsse', 'Reference', { URI: `#${id}`, ValueType: valueType }));
  keyInfo.appendChild(str);

  return keyInfo;
}

// ── Sign ─────────────────────────────────────────────────────────────────────

export function signAs4Envelope(context, attachmentId, envelope, messaging, body, documentHash) {
  const doc = envelope.ownerDocument;

  const security      = envelope.getElementsByTagNameNS(WSSE_NS, 'Security')[0];
  const securityToken = buildBinarySecurityToken(doc, 'X509-Sign', context.senderCert);
  addExtraNs(WSSEC_NAMESPACES, securityToken)

  const messagingId = messaging.getAttributeNS(WSU_NS, 'Id');
  const bodyId      = body.getAttributeNS(WSU_NS, 'Id');

  const messagingHash = c14nDigest(messaging);
  const bodyHash      = c14nDigest(body);

  const signedInfo = doc.createElementNS(DS_NS, 'ds:SignedInfo');
  signedInfo.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:ds',  DS_NS);
  signedInfo.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:env', SOAP_ENV_NS);

  const c14nMethod = el(doc, 'ds', 'CanonicalizationMethod', { Algorithm: XML_CANONICAL_C14N });
  const inclNs     = doc.createElementNS('http://www.w3.org/2001/10/xml-exc-c14n#', 'ec:InclusiveNamespaces');
  inclNs.setAttribute('PrefixList', 'env');
  
  c14nMethod.appendChild(inclNs);
  signedInfo.appendChild(c14nMethod);

  signedInfo.appendChild(el(doc, 'ds', 'SignatureMethod', { Algorithm: XML_RSA_SHA256 }));
  signedInfo.appendChild(buildDigestReference(doc, bodyId,      XML_CANONICAL_C14N, bodyHash));
  signedInfo.appendChild(buildDigestReference(doc, messagingId, XML_CANONICAL_C14N, messagingHash));
  signedInfo.appendChild(buildDigestReference(doc, attachmentId, SWA_ATT_SIG_TRANS, documentHash));

  const signedInfoStr = c14nSignedInfo(signedInfo);

  const keyPass = context.keyPass || undefined;
  const privateKey = crypto.createPrivateKey({
    key: fs.readFileSync(context.senderKey),
    passphrase: keyPass,
  });

  const sigBuf = crypto.sign('sha256', Buffer.from(signedInfoStr, 'utf-8'), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  const signatureB64 = sigBuf.toString('base64');

  const keyInfo = buildKeyInfo(doc, securityToken);
  const sigEl = el(doc, 'ds', 'Signature');
  addExtraNs(WSSEC_NAMESPACES, sigEl)
  
  sigEl.appendChild(signedInfo);
  sigEl.appendChild(el(doc, 'ds', 'SignatureValue', {}, signatureB64));
  sigEl.appendChild(keyInfo);

  security.appendChild(securityToken);
  security.appendChild(sigEl);
}

// ── Encrypt ──────────────────────────────────────────────────────────────────

export function encryptAs4Envelope(context, attachmentId, envelope, cipherValue) {
  const doc = envelope.ownerDocument;

  const security = envelope.getElementsByTagNameNS(WSSE_NS, 'Security')[0];
  const securityToken = buildBinarySecurityToken(doc, 'X509-Encrypt', context.receiverCert);
  addExtraNs(WSSEC_NAMESPACES, securityToken)
 
  const keyInfo = buildKeyInfo(doc, securityToken);

  const encKeyEl = el(doc, 'xenc', 'EncryptedKey', { Id: 'encryptedkey' });
  addExtraNs(WSSEC_NAMESPACES, encKeyEl)

  const encMethod = el(doc, 'xenc', 'EncryptionMethod', { Algorithm: XML_RSA_OAEP });
  encMethod.appendChild(el(doc, 'ds', 'DigestMethod', { Algorithm: XML_SHA256 }));

  const mgf = doc.createElementNS(ENC11_NS, 'xenc11:MGF');
  mgf.setAttribute('Algorithm', XML_MGF_SHA256);
  encMethod.appendChild(mgf);
  encKeyEl.appendChild(encMethod);

  encKeyEl.appendChild(keyInfo);

  const cipherData = el(doc, 'xenc', 'CipherData');
  cipherData.appendChild(el(doc, 'xenc', 'CipherValue', {}, cipherValue));
  encKeyEl.appendChild(cipherData);

  const refList = el(doc, 'xenc', 'ReferenceList');
  refList.appendChild(el(doc, 'xenc', 'DataReference', { URI: '#encrypteddata' }));
  encKeyEl.appendChild(refList);

  const encDataEl = el(doc, 'xenc', 'EncryptedData', {
    Id:       'encrypteddata',
    MimeType: 'application/octet-stream',
    Type:     SWA_ATT_CONT_ONLY_TYPE,
  });
  addExtraNs(WSSEC_NAMESPACES, encDataEl)
  encDataEl.appendChild(el(doc, 'xenc', 'EncryptionMethod', { Algorithm: XML_AES128_GCM }));

  const dataKeyInfo = el(doc, 'ds', 'KeyInfo');
  const dataStr     = el(doc, 'wsse', 'SecurityTokenReference', {
    'wsse11:TokenType': WSS11_ENC_KEY_TOKEN_TYPE,
  });
  dataStr.appendChild(el(doc, 'wsse', 'Reference', { URI: '#encryptedkey' }));
  dataKeyInfo.appendChild(dataStr);
  encDataEl.appendChild(dataKeyInfo);

  const dataCipher    = el(doc, 'xenc', 'CipherData');
  const cipherRef     = el(doc, 'xenc', 'CipherReference', { URI: attachmentId });
  const transforms    = el(doc, 'xenc', 'Transforms');

  transforms.appendChild(el(doc, 'ds', 'Transform', { Algorithm: SWA_ATT_ENC_TRANS }));
  cipherRef.appendChild(transforms);
  dataCipher.appendChild(cipherRef);
  encDataEl.appendChild(dataCipher);

  security.appendChild(securityToken);
  security.appendChild(encKeyEl);
  security.appendChild(encDataEl);
}
