/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import path  from 'path';
import { N42Context } from '../../../../model/context.js';
import { N42Environment } from '../../../../model/environment.js';
import { createSoapHttpResponse, detectPayloadType } from '../../../../core/utils.js'
import { sendDocument } from '../../../../sender/sender.js';

import { 
  createStorage, 
  getStorageAdapter 
} from '../storage/storage.js';

let storage = null;
async function getStorage(context) {
  if (!storage) storage = createStorage(await getStorageAdapter(context));
  return storage;
}


export const handler = async (event) => {
    const runtimeEnv = new N42Environment();
    console.log('--- [ PLATFORM: ' + (runtimeEnv.platform ?? 'node') + ' ] ---');

    const context = new N42Context({
        certId:     runtimeEnv.get('N42_SENDER_CERT_ID'),
        schematron: '/var/task/src/assets/schematrons/billing',
        truststore: path.join(process.cwd(), 'src/assets/certs/truststore.pem'),
    }); 

    storage = await getStorage(context);

    let document;

    const payloadType = detectPayloadType(event);
    switch(payloadType) {
      case 'json': {
        context.env = event.env;
        context.runtimeEnv = runtimeEnv;

        context.id = event.transactionId;
        context.userId = event.userId;

        context.document = event.document.path; // document key
        document = storage.get(context);       

        if(event.document.validate) {
          //const errors = await validateDocument(context, document);
        }
        break;
      }

      case 'xml': {
        break
      }
    }

    await sendDocument(context, document);
    
    return createSoapHttpResponse(context.signalMessage);
}