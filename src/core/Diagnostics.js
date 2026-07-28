export class Diagnostics {
  constructor() {
    this.frames = new Float32Array(360);
    this.frameIndex = 0;
    this.frameCount = 0;
    this.counters = Object.create(null);
    this.errors = [];
    this.warnings = [];
    this.startTime = performance.now();
  }

  recordFrame(seconds) {
    this.frames[this.frameIndex] = seconds;
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    this.frameCount = Math.min(this.frames.length, this.frameCount + 1);
  }

  increment(name, amount = 1) {
    this.counters[name] = (this.counters[name] || 0) + amount;
  }

  set(name, value) {
    this.counters[name] = value;
  }

  recordError(error) {
    this.errors.push(String(error?.stack || error));
    if (this.errors.length > 32) this.errors.shift();
  }

  snapshot() {
    const samples = [];
    for (let i = 0; i < this.frameCount; i += 1) {
      const index = (this.frameIndex - this.frameCount + i + this.frames.length)
        % this.frames.length;
      samples.push(this.frames[index]);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted.length
      ? sorted[Math.floor(sorted.length * 0.5)]
      : 0;
    const p95 = sorted.length
      ? sorted[Math.floor(sorted.length * 0.95)]
      : 0;
    return {
      frameCount: this.frameCount,
      medianFrameMs: median * 1000,
      p95FrameMs: p95 * 1000,
      medianFps: median > 0 ? 1 / median : 0,
      elapsedMs: performance.now() - this.startTime,
      counters: { ...this.counters },
      errors: [...this.errors],
      renderer: this.rendererInfo ? structuredClone(this.rendererInfo) : null,
    };
  }
}

export default Diagnostics;

