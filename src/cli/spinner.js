/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { c, C } from './color.js';

const FRAMES = ['|', '/', '─', '\\'];

export class Spinner {
  constructor() {
    this._label    = '';
    this._interval = null;
    this._frame    = 0;
  }

  start(label = '') {
    this._label = label;
    this._frame = 0;
    this._interval = setInterval(() => {
      const frame = FRAMES[this._frame % FRAMES.length];
      process.stdout.write(`\r  ${c(C.YELLOW, frame)}  ${c(C.GRAY, this._label)}                        `);
      this._frame++;
    }, 100);
  }

  update(label) {
    this._label = label;
  }

  done(label, ok = true) {
    clearInterval(this._interval);
    this._interval = null;
    const icon = ok ? c(C.DARK_GREEN, '✓') : c(C.RED, '✗');
    const text = c(ok ? C.DARK_GREEN : C.RED, label);
    process.stdout.write(`\r  ${icon}  ${text}                           \n`);
  }

  fail(label) {
    this.done(label, false);
  }
}
