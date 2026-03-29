/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { DOMParser } from '@xmldom/xmldom';

const parser = new DOMParser();

const SBDH_NS = 'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader';
const SBDH_PAYLOAD_TAG = 'StandardBusinessDocument';

/**
 * Unwrap SBDH envelope and extract UBL payload
 */
function unwrapSBDH(doc) {
  const root = doc.documentElement;
  
  // Check if it's an SBDH wrapped document
  if (root.localName !== SBDH_PAYLOAD_TAG || root.namespaceURI !== SBDH_NS) {
    return null; // Not SBDH wrapped, return null
  }

  // Find the first non-SBDH child element (the UBL payload)
  const children = root.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 1 && child.namespaceURI !== SBDH_NS) {
      return child; // This is the UBL payload
    }
  }

  return null;
}

export async function validateDocument(context) {

  const documentTypeMap = {
    'Invoice': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'CreditNote': 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    'Order': 'urn:oasis:names:specification:ubl:schema:xsd:Order-2',
    'OrderResponse': 'urn:oasis:names:specification:ubl:schema:xsd:OrderResponse-2',
    'Catalogue': 'urn:oasis:names:specification:ubl:schema:xsd:Catalogue-2',
    'ApplicationResponse': 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
  };

  try {
    const documentStr = context.document.toString('utf-8');
    const doc = parser.parseFromString(documentStr, 'application/xml');

    // Check for parse errors
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      return {
        valid: false,
        errors: ['XML parse error: ' + parseErrors[0].textContent],
      };
    }

    // Unwrap SBDH if present
    let root = doc.documentElement;
    if (root.namespaceURI === SBDH_NS) {
      const payload = unwrapSBDH(doc);
      if (!payload) {
        return {
          valid: false,
          errors: ['SBDH envelope found but no UBL payload inside'],
        };
      }
      root = payload;
    }

    const rootName = root.localName;
    const rootNs = root.namespaceURI;

    // Check for UBL namespace
    const VALID_UBL_NS = Object.values(documentTypeMap);
    if (!rootNs || !VALID_UBL_NS.includes(rootNs)) {
      return {
        valid: false,
        errors: [`Unknown namespace: ${rootNs}`],
      };
    }

    const documentType = documentTypeMap[rootName];
    if (!documentType) {
      return {
        valid: false,
        errors: [`Unknown UBL document type: ${rootName}`],
      };
    }

    // Then validate namespace matches expected for this document type
    if (rootNs !== documentType) {
      return {
        valid: false,
        errors: [`Namespace mismatch. Expected: ${documentType}, got: ${rootNs}`],
      };
    }

    const cbcNs = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
    const idElement = root.getElementsByTagNameNS(cbcNs, 'ID')[0];
    if (!idElement) {
      return {
        valid: false,
        errors: ['Missing required element: cbc:ID'],
      };
    }

    return {
      valid: true,
      documentType,
      documentId: idElement.textContent,
      sbdhWrapped: doc.documentElement.namespaceURI === SBDH_NS, // useful metadata
    };

  } catch (e) {
    return {
      valid: false,
      errors: [e.message],
    };
  }
}