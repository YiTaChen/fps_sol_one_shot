const STORAGE_KEY = 'cinderline.controls.v1';

export const DEFAULT_CONTROLS = Object.freeze({
  sensitivity: 100,
  adsSensitivity: 65,
  volume: 72,
  quality: "medium",
  reducedMotion: false,
});

export function normalizeControls(settings) {
  function boundedNumber(value, fallback, minimum, maximum) {
    return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  }

  return {
    sensitivity: boundedNumber(settings?.sensitivity, DEFAULT_CONTROLS.sensitivity, 20, 220),
    adsSensitivity: boundedNumber(settings?.adsSensitivity, DEFAULT_CONTROLS.adsSensitivity, 25, 100),
    volume: boundedNumber(settings?.volume, DEFAULT_CONTROLS.volume, 0, 100),
    quality: ["low", "medium", "high"].includes(settings?.quality) ? settings.quality : DEFAULT_CONTROLS.quality,
    reducedMotion: settings?.reducedMotion === true,
  };
}

export function readControls() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeControls(JSON.parse(stored));
  } catch {
    // Settings still apply for this session when storage is unavailable.
  }
  return {
    ...DEFAULT_CONTROLS,
    reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}

export function saveControls(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // An unavailable localStorage must not interfere with playing.
  }
}
