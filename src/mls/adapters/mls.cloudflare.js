/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { 
  N42Error, 
  N42ErrorCode 
} from '../../core/error.js';


export async function createCloudflareMlsAdapter() {
  async function send(context, mlsXml, c2Spid) {
    // TODO: Implement send logic <a1exnd3r 2026-03-16 p:1>

    // 1. SMP LOOKUP
    // Look up c2Spid in the Peppol SMP to find their endpoint URL
    // Use the MLS document type identifier:
    //   urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:peppol:edec:mls:1.0::2.1
    
    // If c2Spid has no MLS registration in SMP → they don't support MLS → skip silently
    // This uses your existing runDiscovery/SMP lookup code

    // 2. BUILD SEND CONTEXT
    // Create a new N42Context for the outbound MLS send:
    //   - senderId  = context.receiverId  (we are now C3 sending)
    //   - receiverId = c2Spid             (C2 is now the receiver)
    //   - document  = Buffer.from(mlsXml) (the UBL ApplicationResponse)
    //   - cert      = context.cert        (our AP cert)
    //   - key       = context.key         (our AP key)
    //   - processId = 'urn:peppol:edec:mls'
    //   - documentType = full MLS document type identifier above
    //   - endpointUrl  = result from SMP lookup in step 1

    // 3. SEND
    // Call sendDocument(mlsContext, mlsXml)
    // Reuse existing AS4 sender — sign, encrypt, wrap in SBDH, POST

    // Ensure MLS is sent only once per transaction, 
    // use transaction ID or receipt hash as idempotency key
    throw new N42Error(N42ErrorCode.NOT_IMPLEMENTED, { details: 'send()' }); 
  }

  return { send }
}