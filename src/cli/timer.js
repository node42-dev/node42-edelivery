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
    this.last = Date.now();
  }

  mark(label, visible=true) {
    const now = Date.now();
    this.times.push({ 
      label, 
      ms: (now - this.last).toFixed(0),
      visible 
    });
    this.last = now;
  }

  done() {
    const total = this.times.reduce((sum, t) => sum + parseFloat(t.ms), 0);
    
    console.table(this.times.filter(t => t.visible).map(t => ({
      label: t.label,
      ms: t.ms,
      '%': ((parseFloat(t.ms) / total) * 100).toFixed(0),
    })));

    console.log(`Total: ${total.toFixed(0)} ms`);
    console.log();
    
    return this.times;
  }
}