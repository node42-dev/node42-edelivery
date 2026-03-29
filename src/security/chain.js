/*
  Author: Alex Olsson
  Copyright (C) 2025-2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import forge from 'node-forge';

const MIN = 90000;
const MAX = 100000;

function generatePeppolSerial(country) {
  const number = MIN + Math.floor(Math.random() * (MAX - MIN + 1));
  return `P${country}${String(number).padStart(6, '0')}`;
}

function buildSubject(country, org, service, cn) {
  return [
    { name: 'countryName',            value: country },
    { name: 'organizationName',       value: org },
    { name: 'organizationalUnitName', value: `${org.toUpperCase()} TEST ${service.toUpperCase()} PROBE` },
    { name: 'commonName',             value: cn },
  ];
}

function randomSerial() {
  // 128-bit positive serial (RFC 5280 compliant)
  return new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.random.getBytesSync(16)), 16).abs().toString(16);
}

function nowOffsetDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Generate a Peppol-like end-entity X.509 certificate.
 * Matches real Peppol TLS certificate profile:
 *  - RSA 2048, SHA256withRSA
 *  - BasicConstraints: CA=false
 *  - KeyUsage: digitalSignature, keyEncipherment, keyAgreement
 *  - ExtendedKeyUsage: clientAuth
 *  - SAN (DNS)
 *  - SKI / AKI
 */
export function generateCert({ service, org, country, cn, dnsName, caCertPem, caKeyPem }) {
  const serviceStr = String(service);
  const cnStr = String(cn);
  const orgStr = String(org);
  const countryStr = String(country);
  const dnsNameStr = String(dnsName);

  const commonName = (cnStr && cnStr.trim().length > 6) ? cnStr : generatePeppolSerial(countryStr);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert  = forge.pki.createCertificate();

  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey  = forge.pki.privateKeyFromPem(caKeyPem);

  cert.publicKey    = keys.publicKey;
  cert.serialNumber = randomSerial();

  const notBefore = new Date(); notBefore.setSeconds(notBefore.getSeconds() - 60);
  const notAfter  = nowOffsetDays(365);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter  = notAfter;

  cert.setSubject(buildSubject(countryStr, orgStr, serviceStr, commonName));
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    {
      name: 'keyUsage', critical: true,
      digitalSignature: true,
      keyEncipherment:  true,
      keyAgreement:     true,
    },
    {
      name: 'extKeyUsage',
      clientAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: dnsNameStr }], // type 2 = DNS
    },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  return {
    certPem:    forge.pki.certificateToPem(cert),
    privKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    commonName,
    validFrom:  notBefore,
    validUntil: notAfter,
  };
}

/**
 * Generate an intermediate CA certificate.
 * CA=true, pathLen=0 (cannot issue further CAs)
 */
export function generateIntermediateCa({ service, org, country, rootCertPem, rootKeyPem }) {
  const serviceStr = String(service);
  const orgStr = String(org);
  const countryStr = String(country);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert  = forge.pki.createCertificate();

  const rootCert = forge.pki.certificateFromPem(rootCertPem);
  const rootKey  = forge.pki.privateKeyFromPem(rootKeyPem);

  cert.publicKey    = keys.publicKey;
  cert.serialNumber = randomSerial();

  const notBefore = new Date(); notBefore.setSeconds(notBefore.getSeconds() - 60);
  const notAfter  = nowOffsetDays(1825); // 5 years
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter  = notAfter;

  cert.setSubject([
    { name: 'commonName',             value: `${orgStr.toUpperCase()} ${serviceStr.toUpperCase()} TEST CA` },
    { name: 'organizationalUnitName', value: 'FOR TEST ONLY' },
    { name: 'organizationName',       value: orgStr },
    { name: 'countryName',            value: countryStr },
  ]);
  cert.setIssuer(rootCert.subject.attributes);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
    { name: 'keyUsage', critical: true, keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);

  cert.sign(rootKey, forge.md.sha256.create());

  return {
    certPem:    forge.pki.certificateToPem(cert),
    privKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    validFrom:  notBefore,
    validUntil: notAfter,
  };
}

/**
 * Generate a self-signed Root CA certificate.
 * pathLen=1 (can issue one level of intermediate CAs)
 */
export function generateRootCa({ org, country }) {
  const orgStr = String(org);
  const countryStr = String(country);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert  = forge.pki.createCertificate();

  cert.publicKey    = keys.publicKey;
  cert.serialNumber = randomSerial();

  const notBefore = new Date(); notBefore.setSeconds(notBefore.getSeconds() - 60);
  const notAfter  = nowOffsetDays(3650); // 10 years
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter  = notAfter;

  const attrs = [
    { name: 'commonName',             value: `${orgStr.toUpperCase()} Root TEST CA` },
    { name: 'organizationalUnitName', value: 'FOR TEST ONLY' },
    { name: 'organizationName',       value: orgStr },
    { name: 'countryName',            value: countryStr },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 1, critical: true },
    { name: 'keyUsage', critical: true, keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create()); // self-signed

  return {
    certPem:    forge.pki.certificateToPem(cert),
    privKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    validFrom:  notBefore,
    validUntil: notAfter,
  };
}

export function generateChain(service, org, country, cn, dnsName = 'ap.node42.dev') {
  const root = generateRootCa({ org, country });
  const ica  = generateIntermediateCa({ service, org, country, rootCertPem: root.certPem, rootKeyPem: root.privKeyPem });
  const leaf = generateCert({ service, org, country, cn, dnsName, caCertPem: ica.certPem, caKeyPem: ica.privKeyPem });
  
  return {
    root,
    ica,
    leaf
  }
}