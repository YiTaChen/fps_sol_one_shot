import * as THREE from 'three';

const TAU = Math.PI * 2;
const BYTE_MAX = 255;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash32(value) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x21f0aaad);
  result = Math.imul(result ^ (result >>> 15), 0x735a2d97);
  return (result ^ (result >>> 15)) >>> 0;
}

function hash2D(x, y, seed) {
  return hash32(
    (seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77)) >>> 0,
  );
}

function hashUnit(x, y, seed) {
  return hash2D(x, y, seed) / 0xffffffff;
}

function wrap(value, size) {
  const result = value % size;
  return result < 0 ? result + size : result;
}

function periodicValueNoise(x, y, size, cells, seed) {
  const gx = (x / size) * cells;
  const gy = (y / size) * cells;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smoothstep(gx - x0);
  const ty = smoothstep(gy - y0);
  const a = hashUnit(wrap(x0, cells), wrap(y0, cells), seed);
  const b = hashUnit(wrap(x0 + 1, cells), wrap(y0, cells), seed);
  const c = hashUnit(wrap(x0, cells), wrap(y0 + 1, cells), seed);
  const d = hashUnit(wrap(x0 + 1, cells), wrap(y0 + 1, cells), seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function octaveNoise(x, y, size, seed) {
  return (
    periodicValueNoise(x, y, size, 4, seed) * 0.54 +
    periodicValueNoise(x, y, size, 9, seed ^ 0x6d2b79f5) * 0.29 +
    periodicValueNoise(x, y, size, 23, seed ^ 0xa511e9b3) * 0.17
  );
}

function colorMix(target, a, b, amount) {
  target[0] = lerp(a[0], b[0], amount);
  target[1] = lerp(a[1], b[1], amount);
  target[2] = lerp(a[2], b[2], amount);
}

function styleSample(style, x, y, size, seed, sample) {
  const nx = x / size;
  const ny = y / size;
  const macro = octaveNoise(x, y, size, seed);
  const micro = hashUnit(x, y, seed ^ 0x3c6ef372);
  const stain = periodicValueNoise(x, y, size, 3, seed ^ 0xbb67ae85);

  sample.height = macro * 0.68 + micro * 0.32;
  sample.roughnessBias = (micro - 0.5) * 0.2 + (stain - 0.5) * 0.12;
  sample.colorBias = (macro - 0.5) * 0.18 + (stain - 0.5) * 0.12;
  sample.accent = 0;

  switch (style) {
    case 'concrete': {
      const pore = micro > 0.968 ? (micro - 0.968) * 17 : 0;
      const formLine = Math.min(
        Math.abs(((ny * 4) % 1) - 0.5),
        Math.abs(((nx * 2) % 1) - 0.5),
      );
      sample.height -= pore * 0.34;
      sample.colorBias -= pore * 0.42;
      sample.roughnessBias += pore * 0.2;
      sample.accent = formLine > 0.485 ? 0.13 : 0;
      break;
    }
    case 'aggregate': {
      const pebble = periodicValueNoise(x, y, size, 31, seed ^ 0xc2b2ae35);
      const exposed = pebble > 0.66 ? (pebble - 0.66) * 2.7 : 0;
      sample.height += exposed * 0.22;
      sample.colorBias += exposed * (micro > 0.5 ? 0.28 : -0.22);
      sample.roughnessBias += exposed * 0.22;
      sample.accent = exposed * 0.24;
      break;
    }
    case 'brick': {
      const rows = 12;
      const row = Math.floor(ny * rows);
      const localY = (ny * rows) % 1;
      const shiftedX = nx * 6 + ((row & 1) ? 0.5 : 0);
      const localX = shiftedX % 1;
      const mortar = localY < 0.075 || localY > 0.925 || localX < 0.045 || localX > 0.955;
      const brickVariation = hashUnit(Math.floor(shiftedX), row, seed ^ 0x27d4eb2f);
      if (mortar) {
        sample.height = 0.15 + micro * 0.06;
        sample.colorBias = -0.35;
        sample.roughnessBias = 0.18;
        sample.accent = -0.62;
      } else {
        sample.height = 0.55 + macro * 0.32;
        sample.colorBias += (brickVariation - 0.5) * 0.34;
        sample.accent = (brickVariation - 0.5) * 0.16;
      }
      break;
    }
    case 'plaster': {
      const crackWave =
        Math.abs(
          Math.sin(
            TAU * (nx * 1.93 + ny * 1.17 + periodicValueNoise(x, y, size, 5, seed) * 0.52),
          ),
        );
      const crackMask = crackWave < 0.026 && stain > 0.54 ? 1 : 0;
      const chipped = periodicValueNoise(x, y, size, 14, seed ^ 0x165667b1) > 0.77 ? 1 : 0;
      sample.height -= crackMask * 0.46 + chipped * 0.12;
      sample.colorBias -= crackMask * 0.55 + chipped * 0.18;
      sample.roughnessBias += crackMask * 0.22 + chipped * 0.13;
      sample.accent = -chipped * 0.21;
      break;
    }
    case 'asphalt': {
      const stone = periodicValueNoise(x, y, size, 43, seed ^ 0xd3a2646c);
      const lightStone = stone > 0.69 ? (stone - 0.69) * 2.8 : 0;
      const tar = periodicValueNoise(x, y, size, 7, seed ^ 0xfd7046c5);
      sample.height = stone * 0.68 + micro * 0.18 + tar * 0.14;
      sample.colorBias = (stone - 0.5) * 0.28 - (tar - 0.5) * 0.08;
      sample.roughnessBias = (stone - 0.5) * 0.24;
      sample.accent = lightStone * 0.18;
      break;
    }
    case 'earth': {
      const rut =
        Math.sin(TAU * (nx * 5 + periodicValueNoise(x, y, size, 4, seed) * 0.38)) *
        Math.sin(TAU * ny);
      const grit = periodicValueNoise(x, y, size, 29, seed ^ 0x94d049bb);
      sample.height = macro * 0.44 + grit * 0.38 + rut * 0.08 + 0.1;
      sample.colorBias = (macro - 0.5) * 0.25 + (grit - 0.5) * 0.12;
      sample.roughnessBias = (grit - 0.5) * 0.1;
      break;
    }
    case 'sand': {
      const ripples = Math.sin(TAU * (ny * 18 + Math.sin(TAU * nx * 2) * 0.55));
      sample.height = 0.48 + ripples * 0.09 + macro * 0.25 + micro * 0.12;
      sample.colorBias = ripples * 0.045 + (macro - 0.5) * 0.16;
      sample.roughnessBias = (micro - 0.5) * 0.08;
      break;
    }
    case 'paintedMetal': {
      const verticalStreak = periodicValueNoise(x, 0, size, 13, seed ^ 0x2545f491);
      const scratch = hashUnit(x, Math.floor(y / 8), seed ^ 0x9e3779b9) > 0.992 ? 1 : 0;
      const oxidation = stain > 0.73 ? (stain - 0.73) * 2.8 : 0;
      sample.height = 0.54 + verticalStreak * 0.12 + micro * 0.08 - scratch * 0.18;
      sample.colorBias = (verticalStreak - 0.5) * 0.12 - oxidation * 0.3;
      sample.roughnessBias = oxidation * 0.36 + scratch * 0.17;
      sample.accent = -oxidation * 0.32 + scratch * 0.22;
      break;
    }
    case 'brushedMetal': {
      const brush = hashUnit(x, Math.floor(y / 2), seed ^ 0x8f1bbcdc);
      const band = periodicValueNoise(0, y, size, 11, seed);
      sample.height = 0.47 + (brush - 0.5) * 0.12 + band * 0.08;
      sample.colorBias = (band - 0.5) * 0.14 + (brush - 0.5) * 0.06;
      sample.roughnessBias = (brush - 0.5) * 0.2;
      break;
    }
    case 'rust': {
      const oxide = periodicValueNoise(x, y, size, 8, seed ^ 0x4cf5ad43);
      const pitting = periodicValueNoise(x, y, size, 37, seed ^ 0x52dce729);
      const deep = pitting > 0.71 ? (pitting - 0.71) * 2.9 : 0;
      sample.height = macro * 0.38 + oxide * 0.34 + pitting * 0.2 - deep * 0.3;
      sample.colorBias = (oxide - 0.5) * 0.5 + (pitting - 0.5) * 0.2;
      sample.roughnessBias = 0.18 + deep * 0.25;
      sample.accent = (oxide - 0.5) * 0.48;
      break;
    }
    case 'wood': {
      const grain =
        Math.sin(
          TAU *
            (nx * 17 +
              periodicValueNoise(x, y, size, 5, seed) * 2.2 +
              Math.sin(TAU * ny * 2) * 0.23),
        ) *
        0.5 +
        0.5;
      const knot = periodicValueNoise(x, y, size, 3, seed ^ 0x632be59b);
      sample.height = grain * 0.35 + macro * 0.37 + micro * 0.1;
      sample.colorBias = (grain - 0.5) * 0.31 + (knot - 0.5) * 0.17;
      sample.roughnessBias = (micro - 0.5) * 0.12 + (knot - 0.5) * 0.09;
      sample.accent = knot > 0.72 ? -0.17 : 0;
      break;
    }
    case 'glass': {
      const wipe = Math.sin(TAU * (nx + ny + stain * 0.35));
      const dust = micro > 0.985 ? 1 : 0;
      sample.height = 0.5 + wipe * 0.012 + dust * 0.03;
      sample.colorBias = (stain - 0.5) * 0.09 + dust * 0.12;
      sample.roughnessBias = (stain - 0.5) * 0.16 + dust * 0.14;
      break;
    }
    case 'rubber': {
      const diamond =
        Math.abs(((nx * 24 + ny * 24) % 1) - 0.5) +
        Math.abs(((nx * 24 - ny * 24 + 1) % 1) - 0.5);
      sample.height = 0.42 + (diamond < 0.18 ? 0.22 : 0) + micro * 0.06;
      sample.colorBias = (macro - 0.5) * 0.1 + (diamond < 0.18 ? 0.08 : 0);
      sample.roughnessBias = (micro - 0.5) * 0.14;
      break;
    }
    case 'fabric': {
      const warp = Math.sin(TAU * nx * 48) * 0.5 + 0.5;
      const weft = Math.sin(TAU * ny * 42) * 0.5 + 0.5;
      const weave = warp * weft;
      sample.height = 0.37 + weave * 0.31 + macro * 0.13;
      sample.colorBias = (weave - 0.5) * 0.13 + (macro - 0.5) * 0.12;
      sample.roughnessBias = weave * 0.08;
      break;
    }
    case 'polymer': {
      const stipple = periodicValueNoise(x, y, size, 54, seed ^ 0x7f4a7c15);
      sample.height = 0.44 + stipple * 0.16 + macro * 0.08;
      sample.colorBias = (macro - 0.5) * 0.12 + (stipple - 0.5) * 0.06;
      sample.roughnessBias = (stipple - 0.5) * 0.14;
      break;
    }
    case 'ceramic': {
      const cellX = (nx * 8) % 1;
      const cellY = (ny * 8) % 1;
      const grout = cellX < 0.055 || cellX > 0.945 || cellY < 0.055 || cellY > 0.945;
      sample.height = grout ? 0.16 : 0.58 + macro * 0.08;
      sample.colorBias = grout ? -0.29 : (macro - 0.5) * 0.08;
      sample.roughnessBias = grout ? 0.31 : (micro - 0.5) * 0.08;
      sample.accent = grout ? -0.22 : 0;
      break;
    }
    case 'foliage': {
      const vein = Math.abs(Math.sin(TAU * (nx * 5 + ny * 9)));
      sample.height = macro * 0.45 + vein * 0.12 + micro * 0.16;
      sample.colorBias = (macro - 0.5) * 0.34 + (vein - 0.5) * 0.07;
      sample.roughnessBias = (micro - 0.5) * 0.17;
      break;
    }
    case 'frosted': {
      const crystalline = periodicValueNoise(x, y, size, 35, seed ^ 0xe7037ed1);
      sample.height = 0.45 + crystalline * 0.15 + micro * 0.05;
      sample.colorBias = (crystalline - 0.5) * 0.08;
      sample.roughnessBias = (crystalline - 0.5) * 0.09;
      break;
    }
    default:
      break;
  }
}

function writePixel(target, index, r, g, b, a = BYTE_MAX) {
  target[index] = Math.round(clamp01(r) * BYTE_MAX);
  target[index + 1] = Math.round(clamp01(g) * BYTE_MAX);
  target[index + 2] = Math.round(clamp01(b) * BYTE_MAX);
  target[index + 3] = a;
}

function makeTexture(data, size, colorSpace = THREE.NoColorSpace) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Produces a deterministic albedo/normal/roughness triplet from typed arrays.
 * The generator is periodic on both axes, so all families remain tileable.
 */
export function createProceduralTextureSet(recipe, seed, requestedSize = 256) {
  const size = Math.max(32, requestedSize | 0);
  const pixelCount = size * size;
  const albedo = new Uint8Array(pixelCount * 4);
  const normal = new Uint8Array(pixelCount * 4);
  const roughness = new Uint8Array(pixelCount * 4);
  const height = new Float32Array(pixelCount);
  const color = [0, 0, 0];
  const sample = {
    height: 0,
    roughnessBias: 0,
    colorBias: 0,
    accent: 0,
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = y * size + x;
      const byte = pixel * 4;
      styleSample(recipe.style, x, y, size, seed, sample);

      const mixAmount = clamp01(
        0.5 + sample.colorBias + sample.accent * (hashUnit(x, y, seed ^ 0x1b873593) - 0.3),
      );
      colorMix(color, recipe.dark, recipe.light, mixAmount);
      writePixel(albedo, byte, color[0], color[1], color[2]);

      height[pixel] = clamp01(sample.height);
      const rough = clamp01(
        lerp(recipe.roughness[0], recipe.roughness[1], octaveNoise(x, y, size, seed ^ 0x85ebca6b)) +
          sample.roughnessBias,
      );
      writePixel(roughness, byte, rough, rough, rough);
    }
  }

  const normalStrength = recipe.normalStrength ?? 1;
  for (let y = 0; y < size; y += 1) {
    const ym = wrap(y - 1, size);
    const yp = wrap(y + 1, size);
    for (let x = 0; x < size; x += 1) {
      const xm = wrap(x - 1, size);
      const xp = wrap(x + 1, size);
      const byte = (y * size + x) * 4;
      const dx = (height[y * size + xp] - height[y * size + xm]) * normalStrength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * normalStrength;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx * inverseLength;
      const ny = dy * inverseLength;
      const nz = inverseLength;
      writePixel(normal, byte, nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5);
    }
  }

  const colorMap = makeTexture(albedo, size, THREE.SRGBColorSpace);
  const normalMap = makeTexture(normal, size);
  const roughnessMap = makeTexture(roughness, size);
  const repeat = recipe.repeat ?? 2;
  colorMap.repeat.set(repeat, repeat);
  normalMap.repeat.set(repeat, repeat);
  roughnessMap.repeat.set(repeat, repeat);

  colorMap.name = `${recipe.id}:albedo`;
  normalMap.name = `${recipe.id}:normal`;
  roughnessMap.name = `${recipe.id}:roughness`;
  colorMap.userData.metersPerTile = recipe.metersPerTile;
  normalMap.userData.metersPerTile = recipe.metersPerTile;
  roughnessMap.userData.metersPerTile = recipe.metersPerTile;

  return {
    colorMap,
    normalMap,
    roughnessMap,
  };
}

export function seedFromString(value) {
  let seed = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193);
  }
  return hash32(seed);
}

export function seedFromRng(rng, label) {
  if (!rng) {
    return seedFromString(`static:${label}`);
  }
  if (typeof rng.uint32 === 'function') {
    return rng.uint32() >>> 0;
  }
  if (typeof rng.nextUint32 === 'function') {
    return rng.nextUint32() >>> 0;
  }
  let value;
  if (typeof rng.float === 'function') {
    value = rng.float();
  } else if (typeof rng.nextFloat === 'function') {
    value = rng.nextFloat();
  } else if (typeof rng.next === 'function') {
    const result = rng.next();
    value = typeof result === 'number' ? result : result?.value;
  }
  if (Number.isFinite(value)) {
    return (value * 0x100000000) >>> 0;
  }
  return seedFromString(`static:${label}`);
}
