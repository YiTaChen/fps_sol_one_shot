import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  MAX_PROGRESSION_LEVEL,
  PROGRESSION_STORAGE_KEY,
  deriveLevelSeed,
  normalizeClearedLevel,
  readHighestClearedLevel,
  writeHighestClearedLevel,
} from "../src/game/Progression.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

export function runProgressionContract() {
  assert.equal(normalizeClearedLevel(null), 0);
  assert.equal(normalizeClearedLevel(""), 0);
  assert.equal(normalizeClearedLevel("0"), 0);
  assert.equal(normalizeClearedLevel("-1"), 0);
  assert.equal(normalizeClearedLevel("1.5"), 0);
  assert.equal(normalizeClearedLevel("7<script>"), 0);
  assert.equal(normalizeClearedLevel(Number.MAX_SAFE_INTEGER + 1), 0);
  assert.equal(normalizeClearedLevel("12"), 12);
  assert.equal(
    normalizeClearedLevel(String(Number.MAX_SAFE_INTEGER)),
    MAX_PROGRESSION_LEVEL,
  );

  const storage = memoryStorage();
  assert.equal(readHighestClearedLevel(storage), 0);
  assert.equal(writeHighestClearedLevel(3, storage), 3);
  assert.equal(storage.getItem(PROGRESSION_STORAGE_KEY), "3");
  assert.equal(writeHighestClearedLevel(2, storage), 3);
  assert.equal(storage.getItem(PROGRESSION_STORAGE_KEY), "3");
  assert.equal(writeHighestClearedLevel("9", storage), 9);
  assert.equal(readHighestClearedLevel(storage), 9);

  const malformed = memoryStorage({
    [PROGRESSION_STORAGE_KEY]: "<img src=x onerror=alert(1)>",
  });
  assert.equal(readHighestClearedLevel(malformed), 0);

  const blockedStorage = {
    getItem() {
      throw new DOMException("Access denied", "SecurityError");
    },
    setItem() {
      throw new DOMException("Access denied", "SecurityError");
    },
  };
  assert.equal(readHighestClearedLevel(blockedStorage), 0);
  assert.equal(writeHighestClearedLevel(4, blockedStorage), 0);

  const levelOne = deriveLevelSeed(20364033, 1);
  assert.equal(levelOne, deriveLevelSeed(20364033, 1));
  assert.notEqual(levelOne, deriveLevelSeed(20364033, 2));
  assert.notEqual(levelOne, deriveLevelSeed(20364034, 1));
  assert.ok(Number.isInteger(levelOne) && levelOne >= 0 && levelOne <= 0xffffffff);

  return {
    storageKey: PROGRESSION_STORAGE_KEY,
    maximumLevel: MAX_PROGRESSION_LEVEL,
    deterministicSeed: levelOne,
  };
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const result = runProgressionContract();
  console.log(`progression contract passed: ${JSON.stringify(result)}`);
}
