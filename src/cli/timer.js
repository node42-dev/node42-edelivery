/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

export class N42Timer {
  constructor() {
    this.times = [];
    this.last = performance.now();
  }

  mark(label) {
    const now = performance.now();
    this.times.push({ label, ms: (now - this.last).toFixed(0) });
    this.last = now;
  }

  done() {
    const total = this.times.reduce((sum, t) => sum + parseFloat(t.ms), 0);
    
    console.table(this.times.map(t => ({
      label: t.label,
      ms: t.ms,
      '%': ((parseFloat(t.ms) / total) * 100).toFixed(0),
    })));

    console.log(`Total: ${total.toFixed(0)} ms`);
    console.log();
    
    return this.times;
  }
}