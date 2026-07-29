import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const IK_TARGET = new THREE.Vector3();
const IK_SHOULDER = new THREE.Vector3();
const IK_DIRECTION = new THREE.Vector3();
const IK_ELBOW = new THREE.Vector3();
const IK_BEND = new THREE.Vector3();
const IK_UPPER_DIRECTION = new THREE.Vector3();
const IK_LOWER_DIRECTION = new THREE.Vector3();
const IK_LOCAL_DIRECTION = new THREE.Vector3();
const IK_INVERSE = new THREE.Quaternion();

function taperedGeometry(
  shoulderWidth,
  waistWidth,
  height,
  depth,
  bevel = 0.025,
) {
  const shape = new THREE.Shape();
  shape.moveTo(-waistWidth * 0.5, -height * 0.5);
  shape.lineTo(waistWidth * 0.5, -height * 0.5);
  shape.lineTo(shoulderWidth * 0.5, height * 0.32);
  shape.lineTo(shoulderWidth * 0.42, height * 0.5);
  shape.lineTo(-shoulderWidth * 0.42, height * 0.5);
  shape.lineTo(-shoulderWidth * 0.5, height * 0.32);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function clothLimbGeometry(
  length,
  topRadius,
  bottomRadius,
  {
    radialSegments = 10,
    heightSegments = 6,
    depthScale = 0.9,
    fold = 0.045,
    seam = 0.055,
  } = {},
) {
  const ringSize = radialSegments + 1;
  const vertexCount = (heightSegments + 1) * ringSize + 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];
  let vertex = 0;

  for (let ring = 0; ring <= heightSegments; ring += 1) {
    const t = ring / heightSegments;
    const y = length * (0.5 - t);
    const taper = THREE.MathUtils.lerp(topRadius, bottomRadius, t);
    const jointEase = Math.sin(Math.PI * t);
    const clothBreak = Math.sin(t * Math.PI * 3.5 + 0.4) * fold * jointEase;
    const lateralBulge = 1 + 0.055 * Math.sin(Math.PI * t) - clothBreak * 0.3;
    const frontBulge = 1 + 0.04 * Math.sin(Math.PI * (t + 0.13)) + clothBreak;

    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const u = segment / radialSegments;
      const angle = u * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const sideSeam = Math.abs(cosine) ** 14 * seam * jointEase;
      const wrinkle = Math.sin(angle * 3 + t * Math.PI * 5) * fold * taper * jointEase;
      const radiusX = taper * lateralBulge + sideSeam * taper + wrinkle;
      const radiusZ = taper * depthScale * frontBulge - wrinkle * 0.45;
      const offset = vertex * 3;
      positions[offset] = cosine * radiusX;
      positions[offset + 1] = y;
      positions[offset + 2] = sine * radiusZ;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = 1 - t;
      vertex += 1;
    }
  }

  for (let ring = 0; ring < heightSegments; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = ring * ringSize + segment;
      const b = a + ringSize;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const topCenter = vertex;
  positions[vertex * 3 + 1] = length * 0.5;
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;
  vertex += 1;
  const bottomCenter = vertex;
  positions[vertex * 3 + 1] = -length * 0.5;
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;

  const bottomRing = heightSegments * ringSize;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    indices.push(topCenter, segment + 1, segment);
    indices.push(bottomCenter, bottomRing + segment, bottomRing + segment + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function radialProfileGeometry(profile, radialSegments = 20, depthScale = 0.92) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
    radialSegments,
  );
  geometry.scale(1, 1, depthScale);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function solveTwoBoneArm(arm, target, side) {
  const upperLength = arm.upperLength;
  const lowerLength = arm.lowerLength;
  IK_SHOULDER.copy(arm.shoulder.position);
  IK_DIRECTION.subVectors(target, IK_SHOULDER);
  let distance = IK_DIRECTION.length();
  if (distance < 0.001) return;
  IK_DIRECTION.multiplyScalar(1 / distance);
  distance = THREE.MathUtils.clamp(
    distance,
    Math.abs(upperLength - lowerLength) + 0.015,
    upperLength + lowerLength - 0.015,
  );

  const along = (
    upperLength * upperLength -
    lowerLength * lowerLength +
    distance * distance
  ) / (2 * distance);
  const bendHeight = Math.sqrt(Math.max(0.0001, upperLength * upperLength - along * along));
  IK_BEND.set(side * 0.72, -1, 0.16);
  IK_BEND.addScaledVector(IK_DIRECTION, -IK_BEND.dot(IK_DIRECTION));
  if (IK_BEND.lengthSq() < 0.001) IK_BEND.set(side, 0, 0);
  else IK_BEND.normalize();

  IK_ELBOW.copy(IK_SHOULDER)
    .addScaledVector(IK_DIRECTION, along)
    .addScaledVector(IK_BEND, bendHeight);
  IK_UPPER_DIRECTION.subVectors(IK_ELBOW, IK_SHOULDER).normalize();
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, IK_UPPER_DIRECTION);

  IK_LOWER_DIRECTION.subVectors(target, IK_ELBOW).normalize();
  IK_INVERSE.copy(arm.shoulder.quaternion).invert();
  IK_LOCAL_DIRECTION.copy(IK_LOWER_DIRECTION).applyQuaternion(IK_INVERSE).normalize();
  arm.elbow.quaternion.setFromUnitVectors(DOWN, IK_LOCAL_DIRECTION);
}

function makeNoiseTexture(seed = 0x6d2b79f5, size = 128) {
  const data = new Uint8Array(size * size * 4);
  let state = seed >>> 0;
  const values = new Uint8Array(size * size);
  for (let i = 0; i < values.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const grain = 188 + ((state >>> 26) & 31);
    const warp = Math.round(
      15 * Math.sin((i % size) * 0.63) +
      11 * Math.sin(Math.floor(i / size) * 0.47),
    );
    values[i] = Math.max(126, Math.min(235, grain + warp));
  }
  for (let i = 0; i < values.length; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    const edgeWear = (x % 17 === 0 || y % 23 === 0) ? 16 : 0;
    const v = Math.min(255, values[i] + edgeWear);
    const j = i * 4;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function material(color, roughness, metalness, map, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    map,
    ...extra,
  });
}

function mesh(geometry, materialValue, name, castShadow = true) {
  const value = new THREE.Mesh(geometry, materialValue);
  value.name = name;
  value.castShadow = castShadow;
  value.receiveShadow = true;
  return value;
}

function mergeGeometryParts(parts) {
  const transformed = parts.map((part) => {
    let geometry = part.geometry.clone();
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const position = part.position ?? [0, 0, 0];
    const rotation = part.rotation ?? [0, 0, 0];
    const scale = part.scale ?? [1, 1, 1];
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(position[0], position[1], position[2]),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'),
      ),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
    geometry.applyMatrix4(matrix);
    return geometry;
  });
  const merged = mergeGeometries(transformed, false);
  transformed.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Unable to merge procedural enemy geometry');
  merged.computeBoundingSphere();
  return merged;
}

function markHitZone(object, enemyId, zone) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.enemyId = enemyId;
    child.userData.hitZone = zone;
    child.userData.enemyHitbox = true;
  });
}

function createStrapCurve(x, y, z, side) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(x + side * 0.035, y - 0.2, z - 0.045),
    new THREE.Vector3(x + side * 0.015, y - 0.43, z),
  ]);
}

export function createEnemySharedAssets() {
  const fabricMap = makeNoiseTexture(0x0f4aa83b);
  const polymerMap = makeNoiseTexture(0x79d14f2d, 64);
  const fabricRoughness = makeNoiseTexture(0x3771b4a9);
  const hardRoughness = makeNoiseTexture(0xa57cc439, 64);
  polymerMap.repeat.set(5, 5);
  fabricRoughness.colorSpace = THREE.NoColorSpace;
  hardRoughness.colorSpace = THREE.NoColorSpace;
  hardRoughness.repeat.set(5, 5);

  const palettes = [
    { cloth: 0x69735e, clothDark: 0x333b34, armour: 0x454c42, accent: 0x9a7c4d },
    { cloth: 0x716454, clothDark: 0x39342f, armour: 0x4d5044, accent: 0x90754f },
    { cloth: 0x5d696d, clothDark: 0x31383b, armour: 0x41494b, accent: 0x7e8666 },
    { cloth: 0x756f5d, clothDark: 0x3b3c35, armour: 0x4a4f42, accent: 0x947650 },
  ].map((colors) => ({
    cloth: material(colors.cloth, 0.88, 0.01, fabricMap, { roughnessMap: fabricRoughness }),
    clothDark: material(colors.clothDark, 0.91, 0, fabricMap, { roughnessMap: fabricRoughness }),
    armour: material(colors.armour, 0.66, 0.1, polymerMap, { roughnessMap: hardRoughness }),
    accent: material(colors.accent, 0.82, 0.02, fabricMap, { roughnessMap: fabricRoughness }),
  }));

  const sharedMaterials = {
    skin: material(0x8d6954, 0.82, 0, fabricMap, { roughnessMap: fabricRoughness }),
    glove: material(0x2a302c, 0.78, 0.01, polymerMap, { roughnessMap: hardRoughness }),
    boot: material(0x222724, 0.7, 0.02, polymerMap, { roughnessMap: hardRoughness }),
    weapon: material(0x242929, 0.38, 0.68, polymerMap, { roughnessMap: hardRoughness }),
    weaponEdge: material(0x68706c, 0.26, 0.84, polymerMap, { roughnessMap: hardRoughness }),
    optic: material(0x183536, 0.12, 0.1, null, {
      emissive: 0x0a2728,
      emissiveIntensity: 0.45,
    }),
    lens: material(0x1c4c4a, 0.06, 0.1, null, {
      transparent: true,
      opacity: 0.72,
      emissive: 0x164b46,
      emissiveIntensity: 0.72,
    }),
    buckle: material(0x858a80, 0.32, 0.72, polymerMap, { roughnessMap: hardRoughness }),
  };

  const geometries = {
    torso: taperedGeometry(0.51, 0.38, 0.64, 0.25, 0.022),
    vest: taperedGeometry(0.55, 0.43, 0.49, 0.32, 0.018),
    pelvis: new RoundedBoxGeometry(0.39, 0.25, 0.25, 3, 0.06),
    pouch: new RoundedBoxGeometry(0.14, 0.17, 0.09, 2, 0.025),
    pack: new RoundedBoxGeometry(0.38, 0.43, 0.16, 3, 0.045),
    limbUpper: clothLimbGeometry(0.39, 0.098, 0.073, {
      depthScale: 0.88,
      fold: 0.052,
      seam: 0.06,
    }),
    limbLower: clothLimbGeometry(0.35, 0.079, 0.057, {
      depthScale: 0.86,
      fold: 0.06,
      seam: 0.065,
    }),
    legUpper: clothLimbGeometry(0.45, 0.119, 0.09, {
      radialSegments: 12,
      depthScale: 0.84,
      fold: 0.07,
      seam: 0.072,
    }),
    legLower: clothLimbGeometry(0.41, 0.094, 0.066, {
      radialSegments: 12,
      depthScale: 0.82,
      fold: 0.065,
      seam: 0.075,
    }),
    hand: new RoundedBoxGeometry(0.11, 0.12, 0.082, 2, 0.025),
    finger: new THREE.CapsuleGeometry(0.012, 0.052, 3, 6),
    thumb: new THREE.CapsuleGeometry(0.015, 0.055, 3, 6),
    head: radialProfileGeometry([
      [0, 0.17],
      [0.09, 0.155],
      [0.132, 0.105],
      [0.148, 0.035],
      [0.142, -0.045],
      [0.125, -0.105],
      [0.09, -0.155],
      [0.035, -0.178],
      [0, -0.18],
    ], 20, 0.88),
    neck: new THREE.CylinderGeometry(0.07, 0.08, 0.13, 10),
    helmet: radialProfileGeometry([
      [0.176, -0.035],
      [0.18, 0.015],
      [0.172, 0.085],
      [0.145, 0.145],
      [0.09, 0.19],
      [0.03, 0.208],
      [0, 0.212],
    ], 22, 0.96),
    helmetRim: new THREE.CylinderGeometry(0.175, 0.175, 0.035, 16),
    helmetMount: new RoundedBoxGeometry(0.07, 0.07, 0.035, 2, 0.01),
    helmetRail: new RoundedBoxGeometry(0.045, 0.08, 0.13, 2, 0.012),
    faceMask: new RoundedBoxGeometry(0.225, 0.105, 0.07, 3, 0.025),
    goggleFrame: new RoundedBoxGeometry(0.235, 0.078, 0.05, 3, 0.022),
    goggleLens: new RoundedBoxGeometry(0.084, 0.043, 0.012, 2, 0.008),
    collar: new RoundedBoxGeometry(0.19, 0.1, 0.2, 2, 0.025),
    belt: new RoundedBoxGeometry(0.42, 0.075, 0.27, 2, 0.018),
    shoulderPad: new RoundedBoxGeometry(0.15, 0.105, 0.18, 3, 0.035),
    elbowPad: new RoundedBoxGeometry(0.12, 0.13, 0.055, 2, 0.025),
    cuff: new RoundedBoxGeometry(0.12, 0.075, 0.11, 2, 0.02),
    thighPocket: new RoundedBoxGeometry(0.13, 0.18, 0.07, 2, 0.02),
    boot: new RoundedBoxGeometry(0.165, 0.19, 0.31, 3, 0.04),
    bootSole: new RoundedBoxGeometry(0.178, 0.045, 0.345, 2, 0.014),
    bootToe: new RoundedBoxGeometry(0.17, 0.09, 0.16, 2, 0.03),
    kneepad: new RoundedBoxGeometry(0.13, 0.15, 0.055, 2, 0.025),
    rifleReceiver: new RoundedBoxGeometry(0.12, 0.16, 0.43, 3, 0.024),
    rifleHandguard: new RoundedBoxGeometry(0.105, 0.12, 0.38, 2, 0.02),
    rifleStock: new RoundedBoxGeometry(0.13, 0.18, 0.3, 3, 0.035),
    rifleGrip: new RoundedBoxGeometry(0.09, 0.2, 0.105, 2, 0.02),
    rifleMag: new RoundedBoxGeometry(0.105, 0.28, 0.14, 2, 0.025),
    barrel: new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10),
    muzzle: new THREE.CylinderGeometry(0.043, 0.035, 0.12, 10),
    optic: new RoundedBoxGeometry(0.09, 0.1, 0.17, 2, 0.02),
    opticLens: new THREE.CylinderGeometry(0.037, 0.037, 0.006, 12),
    rail: new RoundedBoxGeometry(0.095, 0.025, 0.5, 2, 0.008),
    earpiece: new THREE.CylinderGeometry(0.04, 0.04, 0.025, 10),
    antenna: new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6),
    rifleControl: new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8),
    magazineBase: new RoundedBoxGeometry(0.115, 0.025, 0.15, 2, 0.007),
    rifleVent: new THREE.BoxGeometry(0.125, 0.012, 0.035),
  };

  const ownedMaterials = [
    ...palettes.flatMap((entry) => Object.values(entry)),
    ...Object.values(sharedMaterials),
  ];

  return {
    fabricMap,
    polymerMap,
    fabricRoughness,
    hardRoughness,
    palettes,
    materials: sharedMaterials,
    geometries,
    dispose() {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((value) => value.dispose());
      fabricMap.dispose();
      polymerMap.dispose();
      fabricRoughness.dispose();
      hardRoughness.dispose();
    },
  };
}

function createRifle(assets, enemyId) {
  const { geometries: geometry, materials: materials } = assets;
  const rifle = new THREE.Group();
  rifle.name = `enemy-${enemyId}-carbine`;

  const weaponGeometry = mergeGeometryParts([
    { geometry: geometry.rifleReceiver },
    { geometry: geometry.rifleHandguard, position: [0, 0, -0.38] },
    { geometry: geometry.rifleStock, position: [0, -0.005, 0.35] },
    { geometry: geometry.rifleGrip, position: [0, -0.145, 0.1], rotation: [-0.18, 0, 0] },
    { geometry: geometry.magazineBase, position: [0, -0.35, -0.02], rotation: [-0.14, 0, 0] },
    { geometry: geometry.optic, position: [0, 0.16, -0.08] },
  ]);
  const edgeParts = [
    { geometry: geometry.rifleMag, position: [0, -0.21, -0.04], rotation: [-0.14, 0, 0] },
    { geometry: geometry.barrel, position: [0, 0, -0.74], rotation: [Math.PI / 2, 0, 0] },
    { geometry: geometry.muzzle, position: [0, 0, -1.03], rotation: [Math.PI / 2, 0, 0] },
    { geometry: geometry.rail, position: [0, 0.095, -0.2] },
    {
      geometry: geometry.magazineBase,
      position: [0, 0.075, 0.09],
      scale: [0.62, 0.52, 0.25],
    },
  ];
  for (let i = 0; i < 5; i += 1) {
    edgeParts.push({
      geometry: geometry.rifleVent,
      position: [0, 0.066, -0.25 - i * 0.072],
    });
  }
  const edgeGeometry = mergeGeometryParts(edgeParts);
  const controlGeometry = mergeGeometryParts([
    {
      geometry: geometry.rifleControl,
      position: [0.07, 0.01, 0.075],
      rotation: [0, 0, Math.PI / 2],
    },
  ]);
  const lensGeometry = mergeGeometryParts([
    {
      geometry: geometry.opticLens,
      position: [0, 0.16, -0.17],
      rotation: [Math.PI / 2, 0, 0],
    },
  ]);
  rifle.add(
    mesh(weaponGeometry, materials.weapon, 'carbine-polymer-and-receiver'),
    mesh(edgeGeometry, materials.weaponEdge, 'carbine-machined-metal'),
    mesh(controlGeometry, materials.buckle, 'carbine-controls'),
    mesh(lensGeometry, materials.lens, 'optic-lens', false),
  );
  rifle.userData.ownedGeometries = [
    weaponGeometry,
    edgeGeometry,
    controlGeometry,
    lensGeometry,
  ];

  rifle.userData.muzzle = new THREE.Object3D();
  rifle.userData.muzzle.position.set(0, 0, -1.1);
  rifle.add(rifle.userData.muzzle);
  markHitZone(rifle, enemyId, 'weapon');
  return rifle;
}

export function createEnemySoldier(id, visualVariant, assets) {
  const palette = assets.palettes[visualVariant % assets.palettes.length];
  const geometry = assets.geometries;
  const materials = assets.materials;
  const root = new THREE.Group();
  root.name = `enemy-soldier-${id}`;
  root.userData.enemyId = id;
  root.userData.enemyRoot = true;

  const pelvis = mesh(geometry.pelvis, palette.clothDark, 'pelvis');
  pelvis.position.y = 0.99;
  root.add(pelvis);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.32;
  root.add(torsoPivot);
  const torso = mesh(geometry.torso, palette.cloth, 'combat-shirt');
  const vest = mesh(geometry.vest, palette.armour, 'layered-armour-vest');
  vest.position.z = -0.005;
  torsoPivot.add(torso, vest);
  markHitZone(torsoPivot, id, 'torso');

  const collar = mesh(geometry.collar, palette.clothDark, 'raised-combat-collar');
  collar.position.set(0, 0.315, -0.005);
  const belt = mesh(geometry.belt, palette.accent, 'load-bearing-belt');
  belt.position.set(0, -0.31, 0.005);
  const beltBuckle = mesh(geometry.rifleControl, materials.buckle, 'belt-buckle');
  beltBuckle.rotation.z = Math.PI / 2;
  beltBuckle.scale.set(1.45, 1.4, 1.45);
  beltBuckle.position.set(0, -0.31, -0.15);
  torsoPivot.add(collar, belt, beltBuckle);

  const neck = mesh(geometry.neck, materials.skin, 'neck');
  neck.position.y = 0.37;
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.5;
  torsoPivot.add(headPivot);
  const head = mesh(geometry.head, materials.skin, 'head');
  head.scale.set(0.92, 1.06, 0.94);
  const helmet = mesh(geometry.helmet, palette.armour, 'helmet-shell');
  helmet.position.y = 0.045;
  helmet.rotation.x = -0.04;
  const helmetRim = mesh(geometry.helmetRim, palette.armour, 'helmet-rim');
  helmetRim.position.set(0, -0.003, -0.015);
  const earpiece = mesh(geometry.earpiece, materials.weapon, 'communications-earpiece');
  earpiece.rotation.z = Math.PI / 2;
  earpiece.position.set(-0.155, -0.01, 0);
  const antenna = mesh(geometry.antenna, materials.weaponEdge, 'radio-antenna');
  antenna.position.set(-0.145, 0.13, 0.04);
  antenna.rotation.z = -0.13;
  const faceMask = mesh(geometry.faceMask, palette.clothDark, 'protective-face-wrap');
  faceMask.position.set(0, -0.055, -0.12);
  faceMask.rotation.x = -0.06;
  const goggleFrame = mesh(geometry.goggleFrame, materials.glove, 'ballistic-goggle-frame');
  goggleFrame.position.set(0, 0.038, -0.132);
  const leftLens = mesh(geometry.goggleLens, materials.lens, 'left-goggle-lens', false);
  leftLens.position.set(-0.056, 0.041, -0.161);
  const rightLens = mesh(geometry.goggleLens, materials.lens, 'right-goggle-lens', false);
  rightLens.position.set(0.056, 0.041, -0.161);
  const helmetMount = mesh(geometry.helmetMount, materials.weaponEdge, 'helmet-front-mount');
  helmetMount.position.set(0, 0.14, -0.112);
  helmetMount.rotation.x = -0.3;
  const helmetRailLeft = mesh(geometry.helmetRail, materials.weapon, 'left-helmet-rail');
  helmetRailLeft.position.set(-0.15, 0.055, -0.01);
  const helmetRailRight = mesh(geometry.helmetRail, materials.weapon, 'right-helmet-rail');
  helmetRailRight.position.set(0.15, 0.055, -0.01);
  headPivot.add(
    head,
    faceMask,
    goggleFrame,
    leftLens,
    rightLens,
    helmet,
    helmetRim,
    helmetMount,
    helmetRailLeft,
    helmetRailRight,
    earpiece,
    antenna,
  );
  markHitZone(headPivot, id, 'head');

  const pack = mesh(geometry.pack, palette.armour, 'equipment-pack');
  pack.position.set(0, 0.01, 0.21);
  torsoPivot.add(pack);
  markHitZone(pack, id, 'torso');

  const pouches = [];
  for (let i = 0; i < 4; i += 1) {
    const pouch = mesh(geometry.pouch, palette.accent, `magazine-pouch-${i}`);
    pouch.position.set((i - 1.5) * 0.12, -0.11, -0.19);
    pouch.rotation.x = -0.05;
    torsoPivot.add(pouch);
    pouches.push(pouch);
  }
  const utilityPouch = mesh(geometry.pouch, palette.accent, 'side-utility-pouch');
  utilityPouch.position.set(visualVariant % 2 ? -0.255 : 0.255, -0.25, 0.01);
  utilityPouch.rotation.z = visualVariant % 2 ? 0.09 : -0.09;
  torsoPivot.add(utilityPouch);

  const straps = [-1, 1].map((side) => {
    const curve = createStrapCurve(side * 0.14, 0.25, -0.175, side);
    const strap = mesh(
      new THREE.TubeGeometry(curve, 8, 0.014, 5, false),
      palette.accent,
      side < 0 ? 'left-shoulder-strap' : 'right-shoulder-strap',
    );
    torsoPivot.add(strap);
    return strap;
  });
  const characterOwnedGeometries = [];

  function makeLeg(side) {
    const upperPivot = new THREE.Group();
    upperPivot.name = side < 0 ? 'left-leg' : 'right-leg';
    upperPivot.position.set(side * 0.135, 0.93, 0);
    root.add(upperPivot);
    const upper = mesh(geometry.legUpper, palette.cloth, 'tailored-trouser-thigh');
    upper.position.y = -0.215;
    upperPivot.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -0.43;
    upperPivot.add(knee);
    const lower = mesh(geometry.legLower, palette.clothDark, 'reinforced-trouser-shin');
    lower.position.y = -0.2;
    knee.add(lower);
    const kneepad = mesh(geometry.kneepad, palette.armour, 'kneepad');
    kneepad.position.set(0, 0.02, -0.075);
    knee.add(kneepad);

    const boot = mesh(geometry.boot, materials.boot, 'tactical-boot');
    boot.position.set(0, -0.42, -0.07);
    knee.add(boot);
    const bootSole = mesh(geometry.bootSole, materials.weapon, 'treaded-boot-sole');
    bootSole.position.set(0, -0.49, -0.07);
    knee.add(bootSole);
    const bootToe = mesh(geometry.bootToe, materials.boot, 'reinforced-boot-toe');
    bootToe.position.set(0, -0.425, -0.165);
    knee.add(bootToe);
    const thighPocket = mesh(geometry.thighPocket, palette.accent, 'cargo-thigh-pocket');
    thighPocket.position.set(side * 0.09, -0.17, side === (visualVariant % 2 ? -1 : 1) ? -0.07 : 0.025);
    thighPocket.rotation.z = -side * 0.08;
    upperPivot.add(thighPocket);
    markHitZone(upperPivot, id, 'leg');
    return { upperPivot, knee, boot, bootSole };
  }

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'left-arm' : 'right-arm';
    shoulder.position.set(side * 0.29, 0.22, -0.02);
    torsoPivot.add(shoulder);
    const upper = mesh(geometry.limbUpper, palette.cloth, 'tailored-upper-arm');
    upper.position.y = -0.18;
    shoulder.add(upper);
    const shoulderPad = mesh(geometry.shoulderPad, palette.armour, 'layered-shoulder-pad');
    shoulderPad.position.set(side * 0.015, -0.045, 0);
    shoulder.add(shoulderPad);
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    shoulder.add(elbow);
    const lower = mesh(geometry.limbLower, palette.clothDark, 'reinforced-forearm');
    lower.position.y = -0.17;
    elbow.add(lower);
    const elbowPad = mesh(geometry.elbowPad, palette.armour, 'elbow-pad');
    elbowPad.position.set(0, 0.005, 0.067);
    elbow.add(elbowPad);
    const cuff = mesh(geometry.cuff, palette.accent, 'glove-cuff');
    cuff.position.y = -0.285;
    elbow.add(cuff);
    const hand = new THREE.Group();
    hand.name = 'articulated-gloved-hand';
    hand.position.y = -0.34;
    elbow.add(hand);
    const handParts = [{ geometry: geometry.hand }];
    for (let fingerIndex = 0; fingerIndex < 3; fingerIndex += 1) {
      handParts.push({
        geometry: geometry.finger,
        position: [(fingerIndex - 1) * 0.027, -0.052, -0.028],
        rotation: [0.7, 0, 0],
      });
    }
    handParts.push({
      geometry: geometry.thumb,
      position: [-side * 0.052, -0.006, -0.03],
      rotation: [0.62, 0, side * 0.72],
    });
    const handGeometry = mergeGeometryParts(handParts);
    characterOwnedGeometries.push(handGeometry);
    hand.add(mesh(handGeometry, materials.glove, 'articulated-glove'));
    markHitZone(shoulder, id, 'arm');
    return {
      shoulder,
      elbow,
      hand,
      upperLength: 0.36,
      lowerLength: 0.34,
      side,
    };
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const rifle = createRifle(assets, id);
  rifle.position.set(0.035, 0.05, -0.25);
  rifle.rotation.set(-0.12, -0.025, 0);
  torsoPivot.add(rifle);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x070908,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const contactShadowGeometry = new THREE.CircleGeometry(0.42, 20);
  const contactShadow = mesh(
    contactShadowGeometry,
    contactShadowMaterial,
    'soldier-contact-shadow',
    false,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);

  const ownedGeometries = [
    ...straps.map((strap) => strap.geometry),
    ...characterOwnedGeometries,
    ...rifle.userData.ownedGeometries,
    contactShadowGeometry,
  ];
  const ownedMaterials = [contactShadowMaterial];

  const rig = {
    root,
    torsoPivot,
    headPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    rifle,
    muzzle: rifle.userData.muzzle,
    contactShadow,
    pose: 'idle',
    stride: id * 1.371,
    recoil: 0,
    hit: 0,
    death: 0,
    deathSide: 0,
    aimWeight: 0,
    lastGroundY: 0,
    setGround(y) {
      root.position.y = y;
      this.lastGroundY = y;
    },
    setPose(pose) {
      this.pose = pose;
    },
    animate(dt, motion = 0, aim = 0, firing = false, hit = 0, dead = false) {
      this.stride += dt * (2.2 + motion * 7.5);
      this.recoil = THREE.MathUtils.damp(this.recoil, firing ? 1 : 0, 23, dt);
      this.hit = THREE.MathUtils.damp(this.hit, hit, 13, dt);
      this.death = THREE.MathUtils.damp(this.death, dead ? 1 : 0, 5.2, dt);
      this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aim, 8.5, dt);

      if (this.death > 0.02) {
        const fall = this.death;
        torsoPivot.rotation.x = -0.08 - fall * 0.72;
        torsoPivot.rotation.z = fall * (0.28 + this.deathSide * 0.94);
        headPivot.rotation.x = fall * 0.32;
        leftArm.shoulder.rotation.set(-0.25, 0, 0.55 + fall);
        rightArm.shoulder.rotation.set(-0.18, 0, -0.5 - fall * 0.5);
        leftLeg.upperPivot.rotation.x = 0.24 * fall;
        rightLeg.upperPivot.rotation.x = -0.32 * fall;
        rifle.rotation.x = 0.1 + fall * 0.72;
        rifle.rotation.z = -fall * 0.42;
        contactShadow.scale.setScalar(1 + fall * 0.5);
        return;
      }

      const gait = Math.sin(this.stride);
      const gaitOpposite = Math.sin(this.stride + Math.PI);
      const walkSwing = motion * 0.58;
      leftLeg.upperPivot.rotation.x = 0.025 + gait * walkSwing;
      rightLeg.upperPivot.rotation.x = 0.025 + gaitOpposite * walkSwing;
      leftLeg.upperPivot.rotation.y = 0.045;
      rightLeg.upperPivot.rotation.y = -0.045;
      leftLeg.upperPivot.rotation.z = -0.022;
      rightLeg.upperPivot.rotation.z = 0.022;
      leftLeg.knee.rotation.x = 0.055 + Math.max(0, -gait) * motion * 0.52;
      rightLeg.knee.rotation.x = 0.055 + Math.max(0, -gaitOpposite) * motion * 0.52;

      const aimRaise = this.aimWeight;
      const breathing = Math.sin(this.stride * 0.31) * (1 - motion * 0.65);
      torsoPivot.position.y = 1.32 + breathing * 0.004;
      torsoPivot.rotation.x = -aimRaise * 0.08 + this.hit * 0.11 + breathing * 0.008;
      torsoPivot.rotation.y = breathing * (1 - aimRaise) * 0.014;
      torsoPivot.rotation.z = this.hit * 0.13 + gait * motion * 0.014;
      headPivot.position.y = 0.5 + breathing * 0.002;
      headPivot.rotation.x = aimRaise * 0.04;
      headPivot.rotation.y = Math.sin(this.stride * 0.23) * (1 - aimRaise) * 0.08;
      rifle.position.x = 0.035 + this.hit * 0.012;
      rifle.position.y = 0.05 + aimRaise * 0.1;
      rifle.position.z = -0.25 - aimRaise * 0.035 + this.recoil * 0.075;
      rifle.rotation.x = -0.12 + aimRaise * 0.1 + this.recoil * 0.065;
      rifle.rotation.y = -0.025;
      rifle.rotation.z = -0.015 + gait * motion * 0.012;
      rifle.updateMatrix();

      IK_TARGET.set(0.015, -0.15, 0.08).applyMatrix4(rifle.matrix);
      solveTwoBoneArm(rightArm, IK_TARGET, 1);
      IK_TARGET.set(-0.015, -0.04, -0.32).applyMatrix4(rifle.matrix);
      solveTwoBoneArm(leftArm, IK_TARGET, -1);

      root.position.y = this.lastGroundY + Math.abs(gait) * motion * 0.018;
      contactShadow.position.y = -root.position.y + this.lastGroundY - 0.003;
    },
    faceDirection(direction, rate, dt) {
      const targetYaw = Math.atan2(-direction.x, -direction.z);
      const delta = Math.atan2(
        Math.sin(targetYaw - root.rotation.y),
        Math.cos(targetYaw - root.rotation.y),
      );
      root.rotation.y += THREE.MathUtils.clamp(delta, -rate * dt, rate * dt);
    },
    muzzleWorld(target = new THREE.Vector3()) {
      return this.muzzle.getWorldPosition(target);
    },
    forward(target = new THREE.Vector3()) {
      return this.rifle.getWorldDirection(target).multiplyScalar(-1).normalize();
    },
    dispose() {
      ownedGeometries.forEach((value) => value.dispose());
      ownedMaterials.forEach((value) => value.dispose());
      root.removeFromParent();
    },
  };

  rig.setGround(0);
  rig.animate(0, 0, 0, false, 0, false);
  root.up.copy(UP);
  return rig;
}
