const UINT_MAX_PLUS_ONE = 0x100000000;

export function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0 || 0x6d2b79f5;
}

export class Rng {
  constructor(seed = 1) {
    this.initialSeed = hashSeed(seed);
    this.state = this.initialSeed;
    this.spareGaussian = null;
  }

  reset() {
    this.state = this.initialSeed;
    this.spareGaussian = null;
  }

  uint() {
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  float() {
    return this.uint() / UINT_MAX_PLUS_ONE;
  }

  range(min, max) {
    return min + (max - min) * this.float();
  }

  int(min, maxExclusive) {
    return min + Math.floor(this.float() * Math.max(1, maxExclusive - min));
  }

  chance(probability) {
    return this.float() < probability;
  }

  pick(items) {
    return items[this.int(0, items.length)];
  }

  sign() {
    return this.chance(0.5) ? 1 : -1;
  }

  gaussian(mean = 0, deviation = 1) {
    if (this.spareGaussian !== null) {
      const spare = this.spareGaussian;
      this.spareGaussian = null;
      return mean + spare * deviation;
    }
    let u = 0;
    let v = 0;
    let radius = 0;
    do {
      u = this.range(-1, 1);
      v = this.range(-1, 1);
      radius = u * u + v * v;
    } while (radius === 0 || radius >= 1);
    const scale = Math.sqrt((-2 * Math.log(radius)) / radius);
    this.spareGaussian = v * scale;
    return mean + u * scale * deviation;
  }

  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

export class RngService {
  constructor(seed = 0xc1de71e) {
    this.seed = seed;
    this.streams = new Map();
  }

  stream(name) {
    if (!this.streams.has(name)) {
      this.streams.set(name, new Rng(`${this.seed}:${name}`));
    }
    return this.streams.get(name);
  }

  getStream(name) {
    return this.stream(name);
  }

  fork(name) {
    return this.stream(name);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.streams.clear();
  }
}

export default RngService;

