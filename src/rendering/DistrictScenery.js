import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PALETTE = {
  steel: 0x485055,
  frame: 0x2a3439,
  oxidized: 0x6e493e,
  furnace: 0x574b48,
  enamel: 0x526160,
  amber: 0xffbf73,
};

function makeInstances(name, geometry, material, transforms, receiveShadow = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const object = new THREE.Object3D();
  transforms.forEach(({ position, scale, rotation, color }, index) => {
    object.position.copy(position);
    object.scale.copy(scale);
    object.rotation.set(rotation.x, rotation.y, rotation.z, rotation.order);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
    if (color !== undefined) mesh.setColorAt(index, new THREE.Color(color));
  });
  mesh.name = name;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function transform(position, scale, color, rotation = [0, 0, 0]) {
  return {
    position: new THREE.Vector3(...position),
    scale: new THREE.Vector3(...scale),
    rotation: new THREE.Euler(...rotation),
    color,
  };
}

function beam(start, end, width, depth, color) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const axis = b.clone().sub(a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), axis.clone().normalize(),
  );
  return {
    position: a.lerp(b, 0.5),
    scale: new THREE.Vector3(width, axis.length(), depth),
    rotation: new THREE.Euler().setFromQuaternion(rotation),
    color,
  };
}

function addExchangeFacade(addBox, addPipe) {
  // The closed service bay fits between the storefront and the personnel door.
  const x = -37.43;
  const shutterWidth = 2.84;
  const wall = 6.85;
  addBox([x, 1.36, wall], [shutterWidth + 0.10, 2.20, 0.12], PALETTE.frame);
  for (let row = 0; row < 23; row += 1) {
    const y = 0.35 + row * 0.093;
    const patina = row % 8 === 0 ? 0x514846 : row % 5 === 0 ? 0x495b5c : 0x405052;
    addBox([x, y, wall - 0.067], [shutterWidth - 0.10, 0.072, 0.028], patina);
    addBox([x, y - 0.036, wall - 0.071], [shutterWidth - 0.10, 0.017, 0.025], PALETTE.frame);
  }
  for (const side of [-1, 1]) {
    const edge = x + side * (shutterWidth / 2);
    addBox([edge, 1.38, wall - 0.086], [0.12, 2.28, 0.08], PALETTE.steel);
    addBox([edge + side * 0.048, 1.38, wall - 0.10], [0.038, 2.27, 0.05], PALETTE.oxidized);
    for (const y of [0.38, 0.92, 1.53, 2.13, 2.44]) {
      addBox([edge, y, wall - 0.138], [0.034, 0.038, 0.024], 0x828176);
    }
  }
  addBox([x, 2.5, wall - 0.092], [shutterWidth + 0.29, 0.24, 0.20], PALETTE.steel);
  addBox([x, 2.395, wall - 0.18], [shutterWidth + 0.21, 0.048, 0.04], PALETTE.oxidized);
  addBox([x, 0.28, wall - 0.064], [shutterWidth + 0.19, 0.12, 0.17], PALETTE.frame);
  addBox([x + 0.56, 0.94, wall - 0.10], [0.19, 0.21, 0.044], PALETTE.oxidized);
  addBox([x + 0.56, 0.94, wall - 0.145], [0.32, 0.045, 0.048], PALETTE.frame);
  addBox([x + 0.54, 1.14, wall - 0.087], [0.19, 0.082, 0.019], 0x9b8152);

  // The small electrical cabinet and paired conduits run above the fascia.
  const cabinetX = -32.96;
  addBox([cabinetX, 1.54, wall - 0.07], [0.57, 0.74, 0.16], PALETTE.frame);
  addBox([cabinetX, 1.55, wall - 0.159], [0.48, 0.64, 0.03], PALETTE.enamel);
  addBox([cabinetX + 0.135, 1.54, wall - 0.191], [0.035, 0.13, 0.04], PALETTE.frame);
  addBox([cabinetX - 0.07, 1.73, wall - 0.179], [0.13, 0.095, 0.02], 0x9b8152);
  for (const offset of [-0.059, 0.061]) {
    const height = 3.40 + offset;
    const lineX = cabinetX + offset;
    const lineZ = wall - 0.049;
    const rotation = [0, 0, Math.PI / 2];
    addPipe([lineX, (height + 1.88) * 0.5, lineZ], 0.047, height - 1.88,
      PALETTE.steel);
    addPipe([(lineX - 45.2) * 0.5, height, lineZ], 0.047, lineX + 45.2,
      PALETTE.steel, rotation);
    addPipe([lineX, height, lineZ], 0.085, 0.08, PALETTE.oxidized, rotation);
    for (let support = -44.7; support < -33.1; support += 1.37) {
      addBox([support, height, lineZ], [0.067, 0.105, 0.071], PALETTE.frame);
    }
  }
}

function addFoundryStructures(group) {
  const boxes = [];
  const pipes = [];
  const lights = [];
  const addBox = (position, size, color) => boxes.push(transform(position, size, color));
  const addPipe = (position, diameter, length, color, rotation) => {
    pipes.push(transform(position, [diameter, length, diameter], color, rotation));
  };

  addExchangeFacade(addBox, addPipe);

  // The transfer bridge crosses the street high above the pedestrian lanes.
  for (const x of [27.1, 28.9]) {
    for (const y of [6.55, 7.94]) {
      addBox([x, y, 0], [0.18, 0.22, 14.35], PALETTE.steel);
    }
    for (let z = -7; z < 7; z += 1.4) {
      const high = Math.round(z * 10) % 28 === 0;
      boxes.push(beam([x, high ? 7.94 : 6.55, z], [x, high ? 6.55 : 7.94, z + 1.4],
        0.085, 0.10, PALETTE.enamel));
      addBox([x, 7.25, z], [0.10, 1.52, 0.11], PALETTE.steel);
      addBox([28, 7.94, z], [1.98, 0.11, 0.11], PALETTE.frame);
    }
  }
  for (const x of [27.66, 28.29]) {
    addPipe([x, 7.14, 0], 0.44, 15.05, PALETTE.oxidized, [Math.PI / 2, 0, 0]);
    for (let z = -6.8; z < 7; z += 1.85) {
      addPipe([x, 7.14, z], 0.50, 0.11, PALETTE.frame, [Math.PI / 2, 0, 0]);
    }
  }
  for (const z of [-7.05, 7.05]) {
    addBox([28, 6.88, z], [2.04, 0.46, 0.55], PALETTE.frame);
    addBox([28, 6.43, z], [0.58, 0.64, 0.52], PALETTE.steel);
  }
  for (const z of [-6.7, 6.7]) {
    addBox([27.04, 6.55, z], [0.48, 0.24, 0.46], PALETTE.frame);
    lights.push(transform([26.78, 6.54, z], [0.032, 0.14, 0.31], PALETTE.amber));
  }

  // The elevated reservoir marks the middle of the district above the shops.
  const tankX = 6.8;
  const tankZ = -11.2;
  for (const dx of [-1.36, 1.36]) {
    for (const dz of [-1.36, 1.36]) {
      const foot = [tankX + dx, 9.42, tankZ + dz];
      const seat = [tankX + dx * 0.77, 14.2, tankZ + dz * 0.77];
      boxes.push(beam(foot, seat, 0.15, 0.16, PALETTE.frame));
      boxes.push(beam([foot[0], 9.75, tankZ - dz], seat, 0.088, 0.088, PALETTE.steel));
      boxes.push(beam([tankX - dx, 9.75, foot[2]], seat, 0.088, 0.088, PALETTE.steel));
    }
  }
  addPipe([tankX, 14.08, tankZ], 3.48, 0.25, PALETTE.frame);
  addPipe([tankX, 15.53, tankZ], 3.22, 2.80, PALETTE.enamel);
  addPipe([tankX, 16.94, tankZ], 3.43, 0.21, PALETTE.steel);
  addPipe([tankX, 15.15, tankZ], 3.26, 0.09, PALETTE.oxidized);
  addPipe([tankX, 16.33, tankZ], 3.26, 0.09, PALETTE.oxidized);
  addPipe([tankX + 0.74, 17.21, tankZ - 0.4], 0.49, 0.45, PALETTE.steel);
  addPipe([tankX + 0.74, 17.50, tankZ - 0.4], 0.58, 0.15, PALETTE.frame);
  addPipe([tankX - 1.57, 11.80, tankZ + 0.80], 0.20, 4.7, PALETTE.oxidized);
  for (const dx of [-0.21, 0.21]) {
    addBox([tankX + dx, 12.06, tankZ + 1.8], [0.068, 5.14, 0.065], PALETTE.steel);
  }
  for (let y = 9.57; y < 14.66; y += 0.27) {
    addBox([tankX, y, tankZ + 1.8], [0.46, 0.049, 0.049], PALETTE.steel);
  }
  lights.push(transform([tankX - 0.15, 17.13, tankZ + 0.88], [0.15, 0.24, 0.16], 0xff8051));

  // The skyline is real geometry so silhouettes shift as the player moves.
  const plant = [
    [[61, 4.2, -12], [17, 8.4, 18], PALETTE.frame],
    [[64, 6.5, -16], [12, 13, 11], PALETTE.furnace],
    [[65, 5.2, 12], [18, 10.4, 14], PALETTE.steel],
    [[76, 5.7, 29], [18, 11.4, 19], PALETTE.furnace],
    [[-61, 5.2, -9], [15, 10.4, 17], PALETTE.steel],
    [[-65, 5.9, 20], [19, 11.8, 17], PALETTE.frame],
    [[-27, 5.6, -65], [22, 11.2, 16], PALETTE.furnace],
    [[14, 4.6, -70], [27, 9.2, 12], PALETTE.steel],
  ];
  for (const [position, size, color] of plant) {
    addBox(position, size, color);
    const [x, y, z] = position;
    const [width, height, depth] = size;
    addBox([x, y + height / 2, z], [width + 0.44, 0.34, depth + 0.38], PALETTE.frame);
    for (let offset = -depth / 2 + 1; offset < depth / 2; offset += 1.62) {
      addBox([x - width / 2, y, z + offset], [0.15, height, 0.12], PALETTE.enamel);
    }
  }
  for (const [x, z, height, diameter] of [
    [62, -6, 20.8, 1.85], [63.5, -11.2, 16.3, 1.65], [66.5, -16.3, 18.3, 1.8],
    [70, 20.5, 23.5, 2.28], [75, 25, 16.9, 1.32], [-63, -9.5, 18.9, 1.85],
    [-67, 24, 21.7, 1.95], [-31, -62, 17.7, 1.4],
  ]) {
    addPipe([x, height / 2, z], diameter, height, PALETTE.furnace);
    for (let y = 2; y < height; y += 2.3) {
      addPipe([x, y, z], diameter * 1.08, 0.13, PALETTE.steel);
    }
    addPipe([x, height - 0.09, z], diameter * 1.14, 0.28, PALETTE.frame);
    addPipe([x, height - 1.55, z], diameter * 1.35, 0.18, PALETTE.steel);
    lights.push(transform([x - diameter * 0.62, height - 1.45, z],
      [0.19, 0.20, 0.22], 0xff613e));
  }
  for (const [x, z, height] of [[54, -10, 12.2], [55, 11.7, 14.2], [-54, 11.8, 10.4]]) {
    for (const edge of [-1, 1]) {
      boxes.push(beam([x + edge * 1.7, 0, z], [x + edge * 0.24, height, z],
        0.18, 0.20, PALETTE.frame));
      boxes.push(beam([x, 0, z + edge * 1.7], [x, height, z + edge * 0.24],
        0.18, 0.20, PALETTE.steel));
    }
    for (let y = 4; y < height; y += 2) {
      const width = 3.4 - (y / height) * 2.9;
      addBox([x, y, z], [width, 0.08, 0.12], PALETTE.frame);
    }
    addBox([x, height, z], [1.05, 0.18, 1.05], PALETTE.steel);
    lights.push(transform([x, height + 0.16, z], [0.19, 0.25, 0.19], 0xff7944));
  }

  const structure = new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.46 });
  group.add(
    makeInstances('Weathered steel structures', new THREE.BoxGeometry(), structure, boxes),
    makeInstances('Transfer pipes and stacks', new THREE.CylinderGeometry(0.49, 0.5, 1, 12), structure, pipes),
    makeInstances('Service and obstruction lights', new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(2.4) }), lights, false),
  );
}

function addUtilityLines(group) {
  const lines = [];
  for (const [x, y, skew] of [[-30.5, 7.7, 2.2], [-14.7, 7.4, 1.1], [9.9, 8.8, -2.2], [35.4, 8.5, 1.4]]) {
    for (const offset of [0, 0.23]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(x + offset, y, -8.1),
        new THREE.Vector3(x + offset + skew * 0.5, y - 2.85, -0.2),
        new THREE.Vector3(x + offset + skew, y - 0.17, 8.1),
      );
      lines.push(new THREE.TubeGeometry(curve, 18, 0.022, 4, false));
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(lines), new THREE.MeshStandardMaterial({
    color: PALETTE.frame,
    roughness: 0.86,
  }));
  mesh.name = 'Overhead utilities';
  for (const line of lines) line.dispose();
  group.add(mesh);
}

function makeWearTexture() {
  const size = 96;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1) * 2 - 1;
      const v = y / (size - 1) * 2 - 1;
      const theta = Math.atan2(v, u);
      const radius = Math.hypot(u, v);
      const shape = 0.76 + 0.08 * Math.sin(theta * 4 + 1.9)
        + 0.055 * Math.cos(theta * 9) + 0.024 * Math.sin(theta * 17);
      const edge = THREE.MathUtils.clamp((shape - radius) * 8.8, 0, 1);
      const grain = 0.73 + 0.14 * Math.sin(x * 2.7 + y * 3.9) + 0.12 * Math.cos(x * 0.22 - y * 0.13);
      const index = (y * size + x) * 4;
      pixels[index] = 255;
      pixels[index + 1] = 255;
      pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(255 * edge * grain);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function addRoadWear(group) {
  const deposits = [];
  const grates = [];
  let seed = 0x571c0a;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (const z of [-5.8, 5.8]) {
    for (let x = -47; x < 49; x += 1.1 + random() * 2.3) {
      deposits.push(transform([x, 0.044 + random() * 0.002, z + (random() - 0.5) * 1.25],
        [1.6 + random() * 2.8, 0.5 + random() * 1.05, 1],
        random() > 0.29 ? 0x353a3c : 0x77706a, [-Math.PI / 2, 0, (random() - 0.5) * 0.5]));
    }
    for (const x of [-43, -28, -7, 9, 27, 40]) {
      grates.push(transform([x, 0.034, z], [0.68, 0.028, 0.39], 0x171a1c));
      for (let offset = -0.27; offset < 0.28; offset += 0.09) {
        grates.push(transform([x + offset, 0.048, z], [0.044, 0.012, 0.38], PALETTE.steel));
      }
    }
  }
  for (let x = -48; x <= 47; x += 1.8 + random() * 3.4) {
    deposits.push(transform([x, 0.045 + random() * 0.002, (random() - 0.5) * 7.5],
      [1.0 + random() * 2.8, 0.9 + random() * 2.5, 1],
      0x383b3d, [-Math.PI / 2, 0, random() * Math.PI]));
  }
  const map = makeWearTexture();
  const material = new THREE.MeshStandardMaterial({
    map,
    metalness: 0.23,
    roughness: 0.27,
    alphaTest: 0.08,
    transparent: true,
    depthWrite: false,
    opacity: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  group.add(
    makeInstances('Weathered road deposits', new THREE.PlaneGeometry(), material, deposits),
    makeInstances('Curb drainage grilles', new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ metalness: 0.73, roughness: 0.67 }), grates),
  );
  return map;
}

function addPracticalLights(group) {
  const fixtures = [];
  const tubes = [];
  for (const [x, y, z] of [[-42.4, 2.97, -5.6], [-8.0, 3.08, -5.75], [33.7, 3.15, -5.68]]) {
    fixtures.push(transform([x, y, z], [0.93, 0.14, 0.25], PALETTE.frame));
    tubes.push(transform([x, y - 0.08, z + 0.055], [0.71, 0.045, 0.17], PALETTE.amber));
    const lamp = new THREE.PointLight(0xffb981, 22, 6.1, 2.0);
    lamp.position.set(x, y - 0.21, z + 0.17);
    lamp.name = 'Sodium service lamp';
    group.add(lamp);
  }
  group.add(
    makeInstances('Service light housings', new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ roughness: 0.69 }), fixtures),
    makeInstances('Sodium light tubes', new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(3.8) }), tubes, false),
  );
}

export function createDistrictScenery() {
  const group = new THREE.Group();
  group.name = 'Ash Market skyline and streetscape';
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({
    color: 0x565453,
    roughness: 0.98,
  }));
  apron.name = 'Foundry apron beyond the market';
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.16;
  group.add(apron);
  addFoundryStructures(group);
  addUtilityLines(group);
  const roadWear = addRoadWear(group);
  addPracticalLights(group);
  return { group, roadWear };
}
