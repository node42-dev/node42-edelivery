/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { randomUUID } from 'crypto';

import { createCloudflareMlsAdapter } from './adapters/mls.cloudflare.js'
import { createLambdaMlsAdapter } from './adapters/mls.lambda.js'
import { createAzureMlsAdapter } from './adapters/mls.azure.js'
import { 
  UBL_NS, CAC_NS, CBC_NS,
  MLS_RESPONSE_CODE, MLS_STATUS_REASON 
} from '../core/constants.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../core/error.js';

/**
 * Generate a Peppol MLS (Message Level Status) UBL ApplicationResponse.
 *
 * @param {object}   options
 * @param {string}   options.mlsId               - Unique MLS message UUID
 * @param {string}   options.issueDate            - ISO date YYYY-MM-DD (no timezone)
 * @param {string}   options.issueTime            - ISO time HH:MM:SSZ (with timezone)
 * @param {string}   options.senderSpid           - C3 SPID (our AP identifier)
 * @param {string}   options.senderSchemeId       - C3 scheme ID e.g. '0088'
 * @param {string}   options.receiverSpid         - C2 SPID (sender's AP identifier)
 * @param {string}   options.receiverSchemeId     - C2 scheme ID
 * @param {string}   options.originalInstanceId   - SBDH InstanceIdentifier of original message
 * @param {string}   options.responseCode         - MLS_RESPONSE_CODE value
 * @param {string}   [options.description]        - Required for RE, optional for AB
 * @param {Array}    [options.lineResponses]       - Required for RE — list of issues
 * @returns {string} UBL ApplicationResponse XML
 */
export function generateMls(options) {
  const {
    mlsId = randomUUID(),
    issueDate,
    issueTime,
    senderSpid,
    senderSchemeId,
    receiverSpid,
    receiverSchemeId,
    originalInstanceId,
    responseCode,
    description  = null,
    lineResponses = [],
  } = options;

  const cbc = (tag, text, attrs = {}) => {
    const attrStr = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<cbc:${tag}${attrStr}>${text}</cbc:${tag}>`;
  };

  // Line responses (only for RE)
  const lineResponsesXml = lineResponses.map(lr => `
    <cac:LineResponse>
      <cac:LineReference>
        ${cbc('LineID', lr.lineId ?? 'NA')}
      </cac:LineReference>
      <cac:Response>
        ${cbc('Description', lr.description ?? '')}
        <cac:Status>
          ${cbc('StatusReasonCode', lr.statusReasonCode ?? 'BV')}
        </cac:Status>
      </cac:Response>
    </cac:LineResponse>`).join('');

  // DocumentResponse
  const documentResponse = `
    <cac:DocumentResponse>
      <cac:Response>
        ${cbc('ResponseCode', responseCode)}
        ${description ? cbc('Description', description) : ''}
      </cac:Response>
      <cac:DocumentReference>
        ${cbc('ID', originalInstanceId)}
      </cac:DocumentReference>
      ${lineResponsesXml}
    </cac:DocumentResponse>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ubl:ApplicationResponse
  xmlns:ubl="${UBL_NS}"
  xmlns:cac="${CAC_NS}"
  xmlns:cbc="${CBC_NS}">
  ${cbc('CustomizationID', 'urn:peppol:edec:mls:1.0')}
  ${cbc('ProfileID', 'urn:peppol:edec:mls')}
  ${cbc('ID', mlsId)}
  ${cbc('IssueDate', issueDate)}
  ${cbc('IssueTime', issueTime)}
  <cac:SenderParty>
    ${cbc('EndpointID', senderSpid, { schemeID: senderSchemeId })}
  </cac:SenderParty>
  <cac:ReceiverParty>
    ${cbc('EndpointID', receiverSpid, { schemeID: receiverSchemeId })}
  </cac:ReceiverParty>
  ${documentResponse}
</ubl:ApplicationResponse>`;

  return xml;
}

/**
 * Determine MLS response code and build options from receiver context.
 * Called after processing is complete or failed.
 *
 * @param {object}  context        - N42Context after processing
 * @param {boolean} success        - Whether processing succeeded
 * @param {Array}   [errors]       - Validation errors if failed
 * @returns {object} options for generateMls()
 */
export function buildMlsOptions(context, success, errors = []) {
  const now = new Date();

  const base = {
    mlsId:              randomUUID(),
    issueDate:          now.toISOString().slice(0, 10),
    issueTime:          now.toISOString().slice(11, 23) + 'Z',
    senderSpid:         context.receiverId,           // C3 = us
    senderSchemeId:     context.senderSpidScheme,     // TODO: SPIS ICD from OpenPeppol registration <a1exnd3r 2026-03-17 p:1>
    receiverSpid:       context.senderId,             // C2 = original sender
    receiverSchemeId:   context.receiverSpidScheme,   // TODO: from SMP lookup response <a1exnd3r 2026-03-17 p:1>
    originalInstanceId: context.messageId,
  };

  if (success) {
    return {
      ...base,
      responseCode: MLS_RESPONSE_CODE.ACCEPTED_WITH_CONFIRMATION,
    };
  }

  return {
    ...base,
    responseCode: MLS_RESPONSE_CODE.REJECTED,
    description:  'The document was rejected during processing.',
    lineResponses: errors.map(err => ({
      lineId:          'NA',
      description:     err,
      statusReasonCode: MLS_STATUS_REASON.BUSINESS_VIOLATION,
    })),
  };
}

export async function getMlsAdapter(context) {
  switch(context.runtimeEnv.platform) {
    case 'cloudflare-workers': { return createCloudflareMlsAdapter(); }
    case 'aws-lambda': { return createLambdaMlsAdapter(); }
    case 'azure-functions': { return createAzureMlsAdapter(); }
    default: {
      throw new N42Error(N42ErrorCode.NOT_SUPPORTED, { details: `MLS not supported on platform: ${context.runtimeEnv.platform ?? 'local'}` });
    }
  }
}

export function createMlsAdapter(adapter) {
  return {
    send:   (context, mlsXml, c2Spid)   => adapter.send(context, mlsXml, c2Spid),
  };
}