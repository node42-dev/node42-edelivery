/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { N42Context } from '../../../model/context.js';
import { N42Environment } from '../../../model/environment.js';


export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = new N42Environment(env, ctx);
    console.log('--- [ PLATFORM: ' + (runtimeEnv.platform ?? 'node') + ' ] ---');

    const route = runtimeEnv.get('N42_SENDER_INBOUND_PATH', 'as4');
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
      role:       'sender',
      certId:     runtimeEnv.get('N42_RECEIVER_CERT_ID'),
      schematron: 'src/assets/schematrons/billing',
      truststore: 'src/assets/certs/truststore.pem',
      env:        runtimeEnv.get('N42_ENV'),
      runtimeEnv,
    });

    return new Response('Not Implemented', { status: 501 });
  }
}