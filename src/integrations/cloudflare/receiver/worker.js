/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import { N42Context } from '../../../model/context.js';
import { N42Environment } from '../../../model/environment.js';
import { receiveAs4Message } from '../../../receiver/as4.js';


export default {
  async fetch(request, env, _ctx) {
    const runtimeEnv = new N42Environment(env);
    console.log('--- [ PLATFORM: ' + (runtimeEnv.platform ?? 'node') + ' ] ---');

    const route = runtimeEnv.get('N42_RECEIVER_INBOUND_PATH', 'as4');
    const endpointPath = `/${route}`;
    if (request.method !== 'POST' || new URL(request.url).pathname !== endpointPath) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }

    const rawBody = await request.arrayBuffer();
    console.log('Raw body size (bytes):', rawBody.byteLength);

    const event = { 
      headers, 
      body: rawBody,
    };

    const context = new N42Context({
        role:       'receiver',
        certId:     runtimeEnv.get('N42_RECEIVER_CERT_ID'),
        schematron: 'src/assets/schematrons/billing',
        truststore: 'src/assets/certs/truststore.pem',
        env:        runtimeEnv.get('N42_ENV'),
        runtimeEnv,
    });
    
    const result = await receiveAs4Message(context, event);

    return new Response(result.body, {
      status: result.statusCode,
      headers: result.headers,
    });
  }
}