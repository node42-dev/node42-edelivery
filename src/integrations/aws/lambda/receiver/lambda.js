/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import path from 'path';
import { N42Context } from '../../../../model/context.js';
import { N42Environment } from '../../../../model/environment.js';
import { receiveAs4Message } from '../../../../receiver/as4.js';


export const handler = async (event) => {
  const runtimeEnv = new N42Environment();
  console.log('--- [ PLATFORM: ' + (runtimeEnv.platform ?? 'node') + ' ] ---');

  const context = new N42Context({
      role:       'receiver',
      certId:     runtimeEnv.get('N42_RECEIVER_CERT_ID'),
      schematron: '/var/task/src/assets/schematrons/billing',
      truststore: path.join(process.cwd(), 'src/assets/certs/truststore.pem'),
      env:        runtimeEnv.get('N42_ENV'),
      runtimeEnv,
  });

  return await receiveAs4Message(context, event);
};