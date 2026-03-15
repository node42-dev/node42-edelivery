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