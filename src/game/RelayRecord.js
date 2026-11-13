const STORAGE_KEY = "cinderline.relay-record.v1";

export function normalizeRelayRecord(value) {
  if (!value || !Number.isSafeInteger(value.clears) || value.clears < 1
    || !Number.isSafeInteger(value.bestMilliseconds) || value.bestMilliseconds < 1) return null;
  return { clears: value.clears, bestMilliseconds: value.bestMilliseconds };
}

export function readRelayRecord() {
  try {
    return normalizeRelayRecord(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY)));
  } catch {
    return null;
  }
}

export function recordExtraction(previous, seconds) {
  const time = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(time) || time < 1) return { record: previous, personalBest: false };
  const personalBest = !previous || time < previous.bestMilliseconds;
  const record = {
    clears: Math.min(Number.MAX_SAFE_INTEGER, (previous?.clears ?? 0) + 1),
    bestMilliseconds: personalBest ? time : previous.bestMilliseconds,
  };
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Keep this session's record available when storage is restricted.
  }
  return { record, personalBest };
}
