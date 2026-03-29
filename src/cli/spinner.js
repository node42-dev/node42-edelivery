/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import { c, C } from './color.js';

const FRAMES = ['|', '/', '─', '\\'];

export class Spinner {
  constructor() {
    this._label    = '';
    this._showTime  = false;
    this._interval = null;
    this._frame    = 0;
    this._startedAt = null;
  }

  _elapsed() {
    if (!this._startedAt) return '';

    const ms = Date.now() - this._startedAt;
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const s = Math.floor(ms / 1000);
    const min = Math.floor(s / 60);
    return min > 0
      ? `${min}m ${s % 60}s ${ms % 1000}ms`
      : `${s}s ${ms % 1000}ms`;
  }

  start(label = '', showTime = false) {
    this._label = label;
    this._showTime  = showTime;
    this._frame = 0;
    this._startedAt = Date.now();
    this._interval = setInterval(() => {
      const frame = FRAMES[this._frame % FRAMES.length];
      const elapsed = this._elapsed();
      if (showTime) {
        process.stdout.write(`\r  ${c(C.YELLOW, frame)}  ${c(C.GRAY, this._label)} (${c(C.GRAY, elapsed)})                        `);
      } else {
        process.stdout.write(`\r  ${c(C.YELLOW, frame)}  ${c(C.GRAY, this._label)}                        `);
      }
      this._frame++;
    }, 100);
  }

  update(label) {
    this._label = label;
  }

  done(label, ok = true) {
    const elapsed = this._elapsed();
    clearInterval(this._interval);
    this._interval = null;
    this._startedAt = null;
    const icon = ok ? c(C.DARK_GREEN, '✓') : c(C.RED, '✗');
    const text = c(ok ? C.DARK_GREEN : C.RED, label);
    const time = c(C.GRAY, elapsed ? `(${elapsed})` : '');
    if (this._showTime) {
      process.stdout.write(`\r  ${icon}  ${text} ${time}                           \n`);
    } else {
      process.stdout.write(`\r  ${icon}  ${text}                           \n`);
    }
  }

  fail(label) {
    this.done(label, false);
  }
}
