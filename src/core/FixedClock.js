export class FixedClock {
  constructor(step = 1 / 60) {
    this.step = step;
    this.accumulator = 0;
    this.lastTime = 0;
    this.elapsed = 0;
    this.maxFrame = 0.25;
    this.maxSteps = 8;
  }

  reset(now = performance.now() * 0.001) {
    this.lastTime = now;
    this.accumulator = 0;
    this.elapsed = 0;
  }

  clearAccumulator(now = performance.now() * 0.001) {
    this.lastTime = now;
    this.accumulator = 0;
  }

  tick(nowSeconds, fixedUpdate) {
    if (!this.lastTime) this.lastTime = nowSeconds;
    const frame = Math.min(this.maxFrame, Math.max(0, nowSeconds - this.lastTime));
    this.lastTime = nowSeconds;
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      fixedUpdate(this.step);
      this.elapsed += this.step;
      this.accumulator -= this.step;
      steps += 1;
    }
    if (steps === this.maxSteps && this.accumulator >= this.step) {
      this.accumulator %= this.step;
    }
    return {
      frame,
      steps,
      alpha: this.accumulator / this.step,
    };
  }
}

export default FixedClock;

