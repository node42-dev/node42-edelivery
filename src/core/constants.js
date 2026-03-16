/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

export const XML_NS = 'http://www.w3.org/2000/xmlns/';
export const SOAP_ENV_NS = 'http://www.w3.org/2003/05/soap-envelope';

// ebMS 3.0 / AS4 core
export const EBMS_NS = 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/';
export const EBMS_ROLE_INIT = 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/initiator';
export const EBMS_ROLE_RESP = 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/responder';

// WS-Security 1.0 / 1.1 base
export const WSS_BASE = 'http://docs.oasis-open.org/wss/2004/01/';
export const WSSE_NS = WSS_BASE + 'oasis-200401-wss-wssecurity-secext-1.0.xsd';
export const WSU_NS = WSS_BASE + 'oasis-200401-wss-wssecurity-utility-1.0.xsd';
export const WSSE11_SECEXT_NS = 'http://docs.oasis-open.org/wss/oasis-wss-wssecurity-secext-1.1.xsd';

// XML Security
export const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
export const ENC_NS = 'http://www.w3.org/2001/04/xmlenc#';
export const ENC11_NS = 'http://www.w3.org/2009/xmlenc11#';

// Digest & signature algorithms
export const XML_AES128_GCM = "http://www.w3.org/2009/xmlenc11#aes128-gcm";
export const XML_RSA_OAEP = 'http://www.w3.org/2009/xmlenc11#rsa-oaep';
export const XML_MGF_SHA256 = 'http://www.w3.org/2009/xmlenc11#mgf1sha256';
export const XML_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
export const XML_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

// Canonicalization & transforms
export const XML_CANONICAL_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
export const SWA_ATT_SIG_TRANS = 'http://docs.oasis-open.org/wss/oasis-wss-SwAProfile-1.1#Attachment-Content-Signature-Transform';
export const SWA_ATT_ENC_TRANS = 'http://docs.oasis-open.org/wss/oasis-wss-SwAProfile-1.1#Attachment-Ciphertext-Transform';

// Encoding & token types
export const SWA_ATT_CONT_ONLY_TYPE='http://docs.oasis-open.org/wss/oasis-wss-SwAProfile-1.1#Attachment-Content-Only';
export const WSS11_ENC_KEY_TOKEN_TYPE='http://docs.oasis-open.org/wss/oasis-wss-soap-message-security-1.1#EncryptedKey';

export const WSS_BASE64B_ENCODING_TYPE = WSS_BASE + 'oasis-200401-wss-soap-message-security-1.0#Base64Binary';
export const WSS_X509TOKEN = WSS_BASE + 'oasis-200401-wss-x509-token-profile-1.0#X509v3';

// Schematron Validation Report Language (SVRL) namespace
export const SVRL_NS='http://purl.oclc.org/dsdl/svrl';

// Standard Business Document Header (PEPPOL / eDelivery)
export const SBDH_NS = 'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader';

// Peppol Access Point
export const PEPPOL_AS4 = {
  SERVICE_TYPE: 'cenbii-procid-ubl',
  AGREEMENT: 'urn:fdc:peppol.eu:2017:agreements:tia:ap_provider',
  MEP: 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/oneWay',
  MEP_BINDING: 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/push',
  PARTY_TYPE: 'urn:fdc:peppol.eu:2017:identifiers:ap',
  MPC: 'http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/defaultMPC',
};

// Peppol SMP
export const SMP_NS = 'http://busdox.org/serviceMetadata/publishing/1.0/';
export const WSA_NS = 'http://www.w3.org/2005/08/addressing';

// UBL namespace constants
export const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
export const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

// ────────────────────────────────────────────────────────────────
// Convenience mappings
// ────────────────────────────────────────────────────────────────

export const EBMS_AS4_NAMESPACES = {
    'env': SOAP_ENV_NS,
    'ns2': EBMS_NS,
    'wsu': WSU_NS,
    'wsse': WSSE_NS,
    'stbh': SBDH_NS
};

export const WSSEC_NAMESPACES = {
    'wsse11': WSSE11_SECEXT_NS,
    'ec': XML_CANONICAL_C14N,
    'xenc': ENC_NS,
    'xenc11': ENC11_NS,
    'ds': DS_NS
};

export const SM_NAMESPACES = {
    'S12': SOAP_ENV_NS,
    'eb':  EBMS_NS,
};

export const NS = {
  env:    SOAP_ENV_NS,
  ns2:    EBMS_NS,
  wsu:    WSU_NS,
  wsse:   WSSE_NS,
  wsse11: WSSE11_SECEXT_NS,
  ds:     DS_NS,
  xenc:   ENC_NS,
  xenc11: ENC11_NS,
};

export const PEPPOL_ORG_ID_TYPES = {
  EAN:        '0088',
  'DK:CVR':   '0184',
  'NO:ORGNR': '0192',
  'IS:KT':    '0196',
  'FR:SIRENE':'0002',
  'SE:ORGNR': '0007',
  'FR:SIRET': '0009',
  DUNS:       '0060',
  GLN:        '0088',
  'DK:P':     '0096',
  'IT:FTI':   '0097',
  'NL:KVK':   '0106',
  'EU:NAL':   '0130',
  'IT:SIA':   '0135',
  'IT:SECETI':'0142',
  'AU:ABN':   '0151',
  'CH:UIDB':  '0183',
  'DK:DIGST': '0184',
  'JP:SST':   '0188',
  'NL:OINO':  '0190',
  'EE:CC':    '0191',
  'NO:ORG':   '0192',
  UBLBE:      '0193',
  'SG:UEN':   '0195',
  'IS:KTNR':  '0196',
  'DK:ERST':  '0198',
  LEI:        '0199',
  'LT:LEC':   '0200',
  'IT:CUUO':  '0201',
  'DE:LWID':  '0204',
  'IT:COD':   '0205',
  'BE:EN':    '0208',
  GS1:        '0209',
  'IT:CFI':   '0210',
  'IT:IVA':   '0211',
  'FI:OVT2':  '0216',
  'LV:URN':   '0218',
  'JP:IIN':   '0221',
  'FR:CTC':   '0225',
  'MY:EIF':   '0230',
  'AE:TIN':   '0235',
  'LU:MAT':   '0240',
  SPIS:       '0242',
  'HU:VAT':   '9910',
  'EU:REID':  '9913',
  'AT:VAT':   '9914',
  'AT:GOV':   '9915',
  IBAN:       '9918',
  'AT:KUR':   '9919',
  'ES:VAT':   '9920',
  'AD:VAT':   '9922',
  'AL:VAT':   '9923',
  'BA:VAT':   '9924',
  'BE:VAT':   '9925',
  'BG:VAT':   '9926',
  'CH:VAT':   '9927',
  'CY:VAT':   '9928',
  'CZ:VAT':   '9929',
  'DE:VAT':   '9930',
  'EE:VAT':   '9931',
  'GB:VAT':   '9932',
  'GR:VAT':   '9933',
  'HR:VAT':   '9934',
  'IE:VAT':   '9935',
  'LI:VAT':   '9936',
  'LT:VAT':   '9937',
  'LU:VAT':   '9938',
  'LV:VAT':   '9939',
  'MC:VAT':   '9940',
  'ME:VAT':   '9941',
  'MK:VAT':   '9942',
  'MT:VAT':   '9943',
  'NL:VAT':   '9944',
  'PL:VAT':   '9945',
  'PT:VAT':   '9946',
  'RO:VAT':   '9947',
  'RS:VAT':   '9948',
  'SI:VAT':   '9949',
  'SK:VAT':   '9950',
  'SM:VAT':   '9951',
  'TR:VAT':   '9952',
  'VA:VAT':   '9953',
  'FR:VAT':   '9957',
  'US:EIN':   '9959',
};

export const PEPPOL_REV_ORG_ID_TYPES = Object.fromEntries(
  Object.entries(PEPPOL_ORG_ID_TYPES).map(([k, v]) => [v, k])
);

export const PEPPOL_END_USER_STAT_SCH_XSLS  = ['peppol-end-user-statistics-reporting-1.1.4.xsl'];
export const PEPPOL_TRANS_STAT_SCH_XSLS     = ['peppol-transaction-statistics-reporting-1.0.4.xsl'];
