/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import fs            from 'fs';
import path          from 'path';
import crypto        from 'crypto';

import { C, c } from '../cli/color.js'
import { getUserCertsDir } from '../cli/paths.js';

import { 
  N42Error,
  N42ErrorCode 
} from '../core/error.js';

export function extractCertFields(cert, type = 'subject') {
  const fields = {};
  const data = type === 'issuer' ? cert.issuer : cert.subject;
  const parts = data.split('\n');
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      fields[key.trim()] = value.trim();
    }
  }
  
  return fields;
}

/**
 * Parse a PEM certificate and return a crypto.X509Certificate object.
 */
export function parseCert(pem) {
  const pemStr = Buffer.isBuffer(pem) ? pem.toString('utf-8') : pem;
  return new crypto.X509Certificate(pemStr);
}

/**
 * Return a summary string: CN=... | O=...
 */
export function getCertInfo(pem) {
  if (!pem) return '';
  try {
    const cert    = parseCert(pem);
    const subject = cert.subject;
    const parts   = [];
    for (const line of subject.split('\n')) {
      const [key, val] = line.split('=');
      if (['CN', 'OU', 'O'].includes(key?.trim())) parts.push(`${key.trim()}=${val?.trim()}`);
    }
    return parts.join(' | ');
  } catch {
    return '(unreadable)';
  }
}

export function getTruststore(context) {
  const certsDir = getUserCertsDir();
  const truststorePath = context.truststore 
    ? path.resolve(context.truststore) 
    : path.join(certsDir, 'truststore.pem');

  if (!fs.existsSync(truststorePath)) {
    throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Truststore bundle not present in ${c(C.BOLD, truststorePath)}` });
  }
  return truststorePath;
}

/**
 * Return the CN value from a PEM certificate.
 */
export function getCertCommonName(pem) {
  const cert    = parseCert(pem);
  const subject = cert.subject;
  for (const line of subject.split('\n')) {
    const [key, val] = line.split('=');
    if (key?.trim() === 'CN') return val?.trim();
  }
  return null;
}

/**
 * Return key info string for a PEM private key file.
 */
export function getKeyInfo(keyPath) {
  try {
    const pem = fs.readFileSync(keyPath);
    const key = crypto.createPrivateKey(pem);
    const det = key.asymmetricKeyDetails;
    if (key.asymmetricKeyType === 'rsa') return `RSA ${det.modulusLength}-bit`;
    if (key.asymmetricKeyType === 'ec')  return `EC ${det.namedCurve}`;
    return 'Unknown key type';
  } catch {
    return '(unreadable)';
  }
}

/**
 * Return full certificate info for CLI display.
 */
export function getCertDetails(context) {
  if (!context.senderCert) return null;

  const cert       = parseCert(context.senderCert);
  const now        = new Date();
  const validTo    = new Date(cert.validTo);
  const validFrom  = new Date(cert.validFrom);
  const daysLeft   = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

  const parseField = (str, field) => {
    const match = str.split('\n').find(l => l.trim().startsWith(`${field}=`));
    return match ? match.split('=').slice(1).join('=').trim() : null;
  };

  return {
    cn:           parseField(cert.subject, 'CN'),
    subject:      cert.subject,
    issuer:       cert.issuer,
    validFrom:    validFrom.toISOString().split('T')[0],
    validTo:      validTo.toISOString().split('T')[0],
    daysLeft,
    expired:      daysLeft < 0,
    expiringSoon: daysLeft >= 0 && daysLeft <= 30,
    fingerprint:  cert.fingerprint256,
    path:         context.cert
  };
}

/**
 * Return full private key info for CLI display.
 */
export function getKeyDetails(context) {
  if (!context.senderKey) return null;

  const pemStr = Buffer.isBuffer(context.senderKey) ? context.senderKey.toString('utf-8') : context.senderKey;

  let keyObj;
  let passwordProtected = false;

  try {
    keyObj = crypto.createPrivateKey(pemStr);
  } catch(e) {
    if (e.message.includes('encrypted')) {
      passwordProtected = true;
      if (context?.keyPass) {
        try {
          keyObj = crypto.createPrivateKey({ key: pemStr, passphrase: context.keyPass });
        } catch {
          return {
            type:              null,
            size:              null,
            passwordProtected: true,
            matchesCert:       null,
            error:             'Key is password protected — passphrase incorrect',
          };
        }
      } else {
        return {
          type:              null,
          size:              null,
          passwordProtected: true,
          matchesCert:       null,
          error:             'Key is password protected — no passphrase in context',
        };
      }
    } else {
      throw new N42Error(N42ErrorCode.CRYPTO_FAILED, { details: e.message});
    }
  }

  const keyType = keyObj.asymmetricKeyType;
  const keySize = keyObj.asymmetricKeyDetails?.modulusLength ?? null;

  let matchesCert = null;
  if (context.senderCert) {
    try {
      const cert       = parseCert(context.senderCert);
      const certPubKey = cert.publicKey;
      const derivedPub = crypto.createPublicKey(keyObj);
      matchesCert = certPubKey.export({ type: 'spki', format: 'pem' }) ===
                    derivedPub.export({ type: 'spki', format: 'pem' });
    } catch(e) {
      console.log(e);
      matchesCert = null;
    }
  }

  return {
    type:              keyType?.toUpperCase() ?? 'unknown',
    size:              keySize ? `${keySize} bit` : null,
    passwordProtected,
    matchesCert,
    path:              context.key
  };
}

export function getTruststoreDetails(context) {
  const truststore = getTruststore(context);
  const truststorePem = fs.readFileSync(truststore, 'utf-8');
  const pemBlocks  = truststorePem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];

  const parseField = (str, field) => {
    const match = str.split('\n').find(l => l.trim().startsWith(`${field}=`));
    return match ? match.split('=').slice(1).join('=').trim() : null;
  };

  const certs = pemBlocks.map(pem => {
    const cert     = new crypto.X509Certificate(pem);
    const now      = new Date();
    const validTo  = new Date(cert.validTo);
    const daysLeft = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
    return {
      cn:          parseField(cert.subject, 'CN'),
      subject:     cert.subject,
      issuer:      cert.issuer,
      validFrom:   new Date(cert.validFrom).toISOString().split('T')[0],
      validTo:     validTo.toISOString().split('T')[0],
      daysLeft,
      expired:     daysLeft < 0,
      expiringSoon: daysLeft >= 0 && daysLeft <= 30,
      fingerprint: cert.fingerprint256,
    };
  });

  return { path: truststore, count: certs.length, certs };
}

/**
 * Validate a PEM certificate against the Peppol trust store.
 * Throws N42Error on failure.
 */
export function validateCert(context) {
  const certPem = context.role === 'receiver' 
    ? context.senderCert      // validate the incoming sender's cert
    : context.receiverCert;   // validate the outgoing receiver's cert

  const cert = parseCert(certPem);
  const truststore = getTruststore(context);

  // Check expiry
  const now = new Date();
  if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) {
    throw new N42Error(N42ErrorCode.CERT_EXPIRED, { details: cert.validTo });
  }

  // Load trust roots and try to verify chain
  if (!fs.existsSync(truststore)) {
    throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, { details: `Truststore not found at ${truststore}` });
  }

  const truststorePem  = fs.readFileSync(truststore, 'utf-8');
  const pemBlocks   = truststorePem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];

  let trusted = false;
  for (const rootPem of pemBlocks) {
    try {
      const root = new crypto.X509Certificate(rootPem);
      if (cert.verify(root.publicKey)) {
        trusted = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!trusted) {
    const subject = extractCertFields(cert, 'subject');
    throw new N42Error(N42ErrorCode.CERT_NOT_TRUSTED, { details: `CN: ${subject.CN}` });
  }
}
