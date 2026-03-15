/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import dotenv from 'dotenv';
import path   from 'path';
import { getN42Home } from './cli/paths.js';
import { N42Environment } from './model/environment.js';
  
const runtimeEnv = new N42Environment();

const environment = runtimeEnv.get('N42_ENV') ?? 'test';
dotenv.config({ path: path.join(getN42Home(), `.env.${environment}`), quiet: true });