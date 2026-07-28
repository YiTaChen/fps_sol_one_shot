export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    name: "low",
    dpr: 1,
    renderScale: 0.82,
    shadowMap: 1024,
    shadows: true,
    fogFar: 84,
    particles: 48,
    decals: 24,
    anisotropy: 2,
  }),
  medium: Object.freeze({
    name: "medium",
    dpr: 1.25,
    renderScale: 1,
    shadowMap: 1536,
    shadows: true,
    fogFar: 105,
    particles: 72,
    decals: 36,
    anisotropy: 4,
  }),
  high: Object.freeze({
    name: "high",
    dpr: 1.75,
    renderScale: 1,
    shadowMap: 2048,
    shadows: true,
    fogFar: 128,
    particles: 96,
    decals: 48,
    anisotropy: 8,
  }),
});

export function resolveQuality(name) {
  return QUALITY_PRESETS[name] || QUALITY_PRESETS.high;
}

