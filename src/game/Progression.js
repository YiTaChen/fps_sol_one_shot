import { hashSeed } from "../core/Rng.js";

export const PROGRESSION_STORAGE_KEY =
  "cinderline.highest-cleared-level.v1";
export const MAX_PROGRESSION_LEVEL = 100_000;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  return globalThis.localStorage;
}

/**
 * Treat persisted progression as untrusted input. A zero return value means
 * there is no valid completed operation to display.
 */
export function normalizeClearedLevel(value) {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return 0;
  return Math.min(numeric, MAX_PROGRESSION_LEVEL);
}

export function readHighestClearedLevel(storage, key = PROGRESSION_STORAGE_KEY) {
  try {
    const resolved = resolveStorage(storage);
    if (!resolved || typeof resolved.getItem !== "function") return 0;
    return normalizeClearedLevel(resolved.getItem(key));
  } catch {
    return 0;
  }
}

/**
 * Persists only a monotonic maximum. If storage is unavailable, the return
 * value remains the last value that was verifiably stored.
 */
export function writeHighestClearedLevel(
  level,
  storage,
  key = PROGRESSION_STORAGE_KEY,
) {
  const current = readHighestClearedLevel(storage, key);
  const candidate = normalizeClearedLevel(level);
  if (candidate <= current) return current;

  try {
    const resolved = resolveStorage(storage);
    if (!resolved || typeof resolved.setItem !== "function") return current;
    resolved.setItem(key, String(candidate));
    return candidate;
  } catch {
    return current;
  }
}

export function deriveLevelSeed(baseSeed, level) {
  const normalizedLevel = normalizeClearedLevel(level) || 1;
  return hashSeed(`${String(baseSeed)}:operation:${normalizedLevel}`);
}
