/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { app } from '@azure/functions';
import { N42Context } from '../../../model/context.js';
import { N42Environment } from '../../../model/environment.js';

const route = process.env.N42_SENDER_INBOUND_PATH ?? 'as4';

app.http('node42-transaction-sender', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route,
  handler: async (request, ctx) => {
    try {
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

      const runtimeEnv = new N42Environment();
      console.log('--- [ PLATFORM: ' + (runtimeEnv.platform ?? 'node') + ' ] ---');

      const context = new N42Context({
        role:       'receiver',
        certId:     runtimeEnv.get('N42_SENDER_CERT_ID'),
        schematron: 'src/assets/schematrons/billing',
        truststore: 'src/assets/certs/truststore.pem',
        env:        runtimeEnv.get('N42_ENV'),
        runtimeEnv,
      });

      return {
        status: 501,
        body: 'Not Implemented',
      };
    } 
    catch(e) {
      ctx.log('ERROR:', e.message, e.stack);

      return {
        status: 500,
        body: e.message + '\n' + e.stack,
      } ;
    }
  }
});