import * as THREE from 'three';

const SIZE = 256;
const WEAPON_MARKS = {
  vesper: ['CR-27 VESPER', 'ASH WORKS  /  027'],
  smg: ['SR-9 FLICKER', 'ASH WORKS  /  009'],
  precision: ['LR-4 MERIDIAN', 'ASH WORKS  /  004'],
  sidearm: ['P-12 EMBER', 'ASH WORKS  /  012'],
  'heavy-sidearm': ['H-7 CINDER', 'ASH WORKS  /  007'],
  melee: ['ARC CUTTER', 'ASH WORKS  /  018'],
};
const MARK_IDS = Object.keys(WEAPON_MARKS);
const MARK_ROW = 48;

const SURFACES = {
  metal: { seed: 1079, tone: [145, 150, 151], roughness: 168, relief: 0.48, repeat: 2.6 },
  polymer: { seed: 2693, tone: [125, 129, 127], roughness: 224, relief: 0.64, repeat: 3.1 },
  fabric: { seed: 4157, tone: [147, 150, 138], roughness: 238, relief: 0.72, repeat: 4.0 },
};

let library = null;
let users = 0;

function sampleHash(x, y, seed) {
  let hash = Math.imul(x + 91, 374761393) ^ Math.imul(y + 37, 668265263) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 - 0.5;
}

function tiledNoise(x, y, columns, rows, seed) {
  const u = x * columns / SIZE;
  const v = y * rows / SIZE;
  const column = Math.floor(u);
  const row = Math.floor(v);
  const sx = u - column;
  const sy = v - row;
  const tx = sx * sx * (3 - 2 * sx);
  const ty = sy * sy * (3 - 2 * sy);
  const right = (column + 1) % columns;
  const bottom = (row + 1) % rows;
  const a = THREE.MathUtils.lerp(sampleHash(column, row, seed), sampleHash(right, row, seed), tx);
  const b = THREE.MathUtils.lerp(sampleHash(column, bottom, seed), sampleHash(right, bottom, seed), tx);
  return THREE.MathUtils.lerp(a, b, ty);
}

function texture(data, name, repeat, colorSpace = THREE.NoColorSpace) {
  const map = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  map.name = name;
  map.colorSpace = colorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

function makeFinish(kind, { seed, tone, roughness, relief, repeat }) {
  const count = SIZE * SIZE;
  const albedo = new Uint8ClampedArray(count * 4);
  const rough = new Uint8ClampedArray(count * 4);
  const normal = new Uint8ClampedArray(count * 4);
  const height = new Float32Array(count);
  const metal = kind === 'metal';
  const fabric = kind === 'fabric';
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const broad = tiledNoise(x, y, 7, 9, seed);
      const flecks = tiledNoise(x, y, 63, 61, seed + 23);
      const grain = tiledNoise(x, y, metal ? 77 : 31, metal ? 12 : 35, seed + 41);
      const weave = fabric ? Math.cos(x * Math.PI / 2) * Math.cos(y * Math.PI / 2) : 0;
      const scratch = metal && grain > 0.30 ? (grain - 0.30) * 5 : 0;
      const variation = broad * 6 + flecks * 6 + grain * 5 + scratch * 10 + weave * 4;
      const index = y * SIZE + x;
      const pixel = index * 4;
      height[index] = (flecks * 0.30 + grain * 0.27 + broad * 0.025 - scratch * 0.16 + weave * 0.09) * relief;
      const finish = roughness + broad * 9 + flecks * 8 - scratch * 20 + weave * 5;
      for (let channel = 0; channel < 3; channel += 1) {
        albedo[pixel + channel] = tone[channel] + variation;
        rough[pixel + channel] = finish;
      }
      albedo[pixel + 3] = 255;
      rough[pixel + 3] = 255;
    }
  }
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = height[y * SIZE + (x + SIZE - 1) % SIZE] - height[y * SIZE + (x + 1) % SIZE];
      const dy = height[((y + SIZE - 1) % SIZE) * SIZE + x] - height[((y + 1) % SIZE) * SIZE + x];
      const length = Math.hypot(dx, dy, 1);
      const pixel = (y * SIZE + x) * 4;
      normal[pixel] = (1 + dx / length) * 127.5;
      normal[pixel + 1] = (1 + dy / length) * 127.5;
      normal[pixel + 2] = (1 + 1 / length) * 127.5;
      normal[pixel + 3] = 255;
    }
  }
  // Use Uint8Array views for WebGL uploads while keeping clamped rounding above.
  return {
    map: texture(new Uint8Array(albedo.buffer), `${kind}-albedo`, repeat, THREE.SRGBColorSpace),
    roughnessMap: texture(new Uint8Array(rough.buffer), `${kind}-roughness`, repeat),
    normalMap: texture(new Uint8Array(normal.buffer), `${kind}-normal`, repeat),
  };
}

function makeMarkAtlas() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = MARK_ROW * MARK_IDS.length;
  const pen = canvas.getContext('2d');
  if (!pen) return null;
  pen.textBaseline = 'middle';
  for (const [index, id] of MARK_IDS.entries()) {
    const [model, stamp] = WEAPON_MARKS[id];
    const y = index * MARK_ROW;
    pen.fillStyle = '#afc2be';
    pen.fillRect(4, y + 7, 4, 29);
    pen.font = 'bold 21px sans-serif';
    pen.fillText(model, 16, y + 15);
    pen.fillStyle = '#c7a272';
    pen.font = 'bold 12px monospace';
    pen.fillText(stamp, 17, y + 33);
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.name = 'armory-model-stencils';
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

export function acquireWeaponSurfaces() {
  if (!library) {
    library = Object.fromEntries(Object.entries(SURFACES).map(([kind, config]) => [kind, makeFinish(kind, config)]));
    library.marks = makeMarkAtlas();
  }
  users += 1;
  return {
    ...library,
    release() {
      users -= 1;
      if (users !== 0) return;
      for (const kind of Object.keys(SURFACES)) {
        for (const map of Object.values(library[kind])) map.dispose();
      }
      library.marks?.dispose();
      library = null;
    },
  };
}

export function makeWeaponMark(id, atlas, parent, ownedMaterials) {
  if (!atlas || !Object.hasOwn(WEAPON_MARKS, id)) return undefined;
  const material = new THREE.MeshBasicMaterial({
    map: atlas, transparent: true, alphaTest: 0.12, depthWrite: false, opacity: 0.87,
  });
  ownedMaterials.push(material);
  const bottom = 1 - (MARK_IDS.indexOf(id) + 1) / MARK_IDS.length;
  return ({ x, y, z, width, height, side }) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute('uv');
    for (let index = 0; index < uv.count; index += 1) {
      uv.setY(index, bottom + THREE.MathUtils.lerp(0.04, 0.96, uv.getY(index)) / MARK_IDS.length);
    }
    const mark = new THREE.Mesh(geometry, material);
    mark.name = `${id}-identity-stencil`;
    mark.position.set(x, y, z);
    mark.rotation.y = side * Math.PI / 2;
    parent.add(mark);
  };
}
