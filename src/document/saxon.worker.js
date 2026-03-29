/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { workerData, parentPort } from 'worker_threads';
import SaxonJS from 'saxon-js';

const { xslPath, docSource } = workerData;

try {
  const result = SaxonJS.transform({
    stylesheetFileName: xslPath,
    ...docSource,
    destination: 'serialized',
  }, 'sync');
  parentPort.postMessage({ ok: true, svrlStr: result.principalResult });
} catch (e) {
  parentPort.postMessage({ ok: false, message: e.message });
}