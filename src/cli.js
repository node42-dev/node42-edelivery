/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import './env.js';
import pkg from '../package.json' with { type: 'json' };

import { registerCommands } from './commands.js';
import { initWorkspace }    from './cli/paths.js';

initWorkspace();

import { Command } from 'commander';
const program = new Command();

program
  .name('n42-edelivery')
  .description('Node42 — eDelivery utilities')
  .version(pkg.version);

registerCommands(program);
program.parse(process.argv);