/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: GPL-3.0-only
*/

import path  from 'path';
import { N42Context } from '../../../../model/context.js';
import { getFile } from '../../storage/s3.js';
import { sendDocument } from '../../../../sender/sender.js';


export const handler = async (event) => {
    const context = new N42Context({
        certId:     process.env.N42_RECEIVER_CERT_ID,
        schematron: '/var/task/src/assets/schematrons/billing',
        truststore: path.join(process.cwd(), 'src/assets/certs/truststore.pem'),
        env:        event.env,
        userId:     event.userId,
        document:   event.document,
        s3Bucket:   event.s3Bucket,
    });

    const document = getFile(context);

    await sendDocument(context, document);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      body: context.signalMessage,
    };
}