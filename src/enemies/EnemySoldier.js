import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createEnemyWardrobeGeometries, UNIFORMS } from './EnemyWardrobe.js';

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

function loftedBodyGeometry(
  rings,
  {
    radialSegments = 16,
    contour = 0.035,
  } = {},
) {
  const ringSize = radialSegments + 1;
  const vertexCount = rings.length * ringSize + 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];
  let vertex = 0;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const [y, halfWidth, halfDepth, offsetX = 0, offsetZ = 0] = rings[ringIndex];
    const v = ringIndex / Math.max(1, rings.length - 1);
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const u = segment / radialSegments;
      const angle = u * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const faceting = 1 + Math.cos(angle * 4) * contour;
      const frontShape = sine < 0 ? 1.055 : 0.965;
      const offset = vertex * 3;
      positions[offset] = offsetX + cosine * halfWidth * faceting;
      positions[offset + 1] = y;
      positions[offset + 2] =
        offsetZ + sine * halfDepth * frontShape * (2 - faceting);
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      vertex += 1;
    }
  }

  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = ring * ringSize + segment;
      const b = a + ringSize;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const bottomCenter = vertex;
  const bottom = rings[0];
  positions[vertex * 3] = bottom[3] ?? 0;
  positions[vertex * 3 + 1] = bottom[0];
  positions[vertex * 3 + 2] = bottom[4] ?? 0;
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;
  vertex += 1;
  const topCenter = vertex;
  const top = rings.at(-1);
  positions[vertex * 3] = top[3] ?? 0;
  positions[vertex * 3 + 1] = top[0];
  positions[vertex * 3 + 2] = top[4] ?? 0;
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;

  const topRing = (rings.length - 1) * ringSize;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    indices.push(bottomCenter, segment + 1, segment);
    indices.push(topCenter, topRing + segment, topRing + segment + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function footLoftGeometry(sections, radialSegments = 12) {
  const ringSize = radialSegments + 1;
  const vertexCount = sections.length * ringSize + 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];
  let vertex = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const [z, centerY, halfWidth, halfHeight] = sections[sectionIndex];
    const v = sectionIndex / Math.max(1, sections.length - 1);
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const u = segment / radialSegments;
      const angle = u * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const offset = vertex * 3;
      positions[offset] = cosine * halfWidth;
      positions[offset + 1] = centerY + sine * halfHeight;
      positions[offset + 2] = z;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      vertex += 1;
    }
  }

  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = section * ringSize + segment;
      const b = a + ringSize;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const heelCenter = vertex;
  const heel = sections[0];
  positions[vertex * 3 + 1] = heel[1];
  positions[vertex * 3 + 2] = heel[0];
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;
  vertex += 1;
  const toeCenter = vertex;
  const toe = sections.at(-1);
  positions[vertex * 3 + 1] = toe[1];
  positions[vertex * 3 + 2] = toe[0];
  uvs[vertex * 2] = 0.5;
  uvs[vertex * 2 + 1] = 0.5;

  const toeRing = (sections.length - 1) * ringSize;
  for (let segment = 0; segment < radialSegments; segment += 1) {
    indices.push(heelCenter, segment, segment + 1);
    indices.push(toeCenter, toeRing + segment + 1, toeRing + segment);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function sideProfileGeometry(points, width, bevel = 0.008, holes = []) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], index) => {
    if (index === 0) shape.moveTo(-z, y);
    else shape.lineTo(-z, y);
  });
  shape.closePath();
  for (const holePoints of holes) {
    const hole = new THREE.Path();
    holePoints.forEach(([z, y], index) => {
      if (index === 0) hole.moveTo(-z, y);
      else hole.lineTo(-z, y);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 2,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-width * 0.5, 0, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
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
      indices.push(a, a + 1, b, b, a + 1, b + 1);
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
  IK_BEND.set(
    side * (arm.bendOut ?? 0.72),
    arm.bendDown ?? -1,
    arm.bendForward ?? 0.16,
  );
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
    const grain = 207 + ((state >>> 26) & 31);
    const warp = Math.round(
      4 * Math.sin((i % size) * Math.PI * 20 / size) +
      3 * Math.sin(Math.floor(i / size) * Math.PI * 30 / size),
    );
    values[i] = Math.max(126, Math.min(235, grain + warp));
  }
  for (let i = 0; i < values.length; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    const edgeWear = (x % 17 === 0 || y % 23 === 0) ? 5 : 0;
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
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeContactShadowMap() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const radius = Math.hypot(2 * x / (size - 1) - 1, 2 * y / (size - 1) - 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255 * (1 - THREE.MathUtils.smoothstep(radius, 0.15, 0.99));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
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

  const contactMap = makeContactShadowMap();
  const palettes = UNIFORMS.map((colors) => ({
    cloth: material(colors.cloth, 0.88, 0.01, fabricMap, { roughnessMap: fabricRoughness }),
    clothDark: material(colors.clothDark, 0.91, 0, fabricMap, { roughnessMap: fabricRoughness }),
    armour: material(colors.armour, 0.64, 0.12, polymerMap, { roughnessMap: hardRoughness }),
    accent: material(colors.textile, 0.87, 0.02, fabricMap, { roughnessMap: fabricRoughness }),
    shell: material(colors.shell, 0.49, 0.18, polymerMap, { roughnessMap: hardRoughness }),
    visor: new THREE.MeshPhysicalMaterial({
      color: colors.lens, roughness: 0.18, metalness: 0.46, clearcoat: 0.86,
      clearcoatRoughness: 0.11, envMapIntensity: 1.7,
      emissive: colors.lensLight, emissiveIntensity: 0.033,
    }),
    signal: material(colors.stripe, 0.52, 0.09, null, {
      emissive: colors.stripe, emissiveIntensity: 0.11,
    }),
  }));

  const sharedMaterials = {
    glove: material(0x2a302c, 0.78, 0.01, polymerMap, { roughnessMap: hardRoughness }),
    boot: material(0x353c3b, 0.67, 0.02, polymerMap, { roughnessMap: hardRoughness }),
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
    torso: loftedBodyGeometry([
      [-0.31, 0.18, 0.11, 0, 0.012],
      [-0.24, 0.205, 0.125],
      [-0.07, 0.225, 0.137],
      [0.13, 0.252, 0.145],
      [0.265, 0.265, 0.132],
      [0.31, 0.205, 0.105],
    ], { radialSegments: 18, contour: 0.028 }),
    vest: loftedBodyGeometry([
      [-0.235, 0.195, 0.145, 0, -0.008],
      [-0.17, 0.222, 0.16, 0, -0.012],
      [0.06, 0.255, 0.174, 0, -0.016],
      [0.225, 0.265, 0.158, 0, -0.006],
      [0.255, 0.205, 0.125],
    ], { radialSegments: 16, contour: 0.045 }),
    pelvis: loftedBodyGeometry([
      [-0.14, 0.15, 0.105],
      [-0.08, 0.205, 0.14],
      [0.055, 0.215, 0.145],
      [0.14, 0.178, 0.115],
    ], { radialSegments: 16, contour: 0.025 }),
    pouch: loftedBodyGeometry([
      [-0.085, 0.052, 0.038],
      [-0.058, 0.073, 0.052],
      [0.055, 0.073, 0.052],
      [0.085, 0.056, 0.04],
    ], { radialSegments: 12, contour: 0.03 }),
    pack: new RoundedBoxGeometry(0.38, 0.43, 0.16, 3, 0.045),
    limbUpper: clothLimbGeometry(0.385, 0.108, 0.078, {
      radialSegments: 12,
      depthScale: 0.86,
      fold: 0.046,
      seam: 0.048,
    }),
    limbLower: clothLimbGeometry(0.35, 0.087, 0.061, {
      radialSegments: 12,
      depthScale: 0.84,
      fold: 0.052,
      seam: 0.052,
    }),
    legUpper: clothLimbGeometry(0.445, 0.132, 0.101, {
      radialSegments: 14,
      depthScale: 0.82,
      fold: 0.055,
      seam: 0.058,
    }),
    legLower: clothLimbGeometry(0.405, 0.103, 0.073, {
      radialSegments: 14,
      depthScale: 0.8,
      fold: 0.05,
      seam: 0.058,
    }),
    hand: loftedBodyGeometry([
      [-0.055, 0.037, 0.025, 0, -0.015],
      [-0.030, 0.052, 0.036, 0, -0.009],
      [0.014, 0.055, 0.036],
      [0.045, 0.041, 0.030],
      [0.061, 0.034, 0.026],
    ], { radialSegments: 12, contour: 0.045 }),
    finger: new THREE.CapsuleGeometry(0.013, 0.043, 3, 7),
    fingerTip: new THREE.CapsuleGeometry(0.0115, 0.032, 3, 7),
    thumb: new THREE.CapsuleGeometry(0.016, 0.052, 3, 7),
    knucklePlate: new RoundedBoxGeometry(0.092, 0.025, 0.064, 2, 0.009),
    head: radialProfileGeometry([
      [0, 0.155],
      [0.077, 0.145],
      [0.12, 0.102],
      [0.134, 0.035],
      [0.129, -0.045],
      [0.112, -0.105],
      [0.078, -0.145],
      [0.028, -0.162],
      [0, -0.164],
    ], 22, 0.84),
    neck: loftedBodyGeometry([
      [-0.085, 0.067, 0.061],
      [0.025, 0.071, 0.065],
      [0.085, 0.062, 0.058],
    ], { radialSegments: 12, contour: 0.01 }),
    helmet: radialProfileGeometry([
      [0.154, -0.022],
      [0.158, 0.018],
      [0.15, 0.078],
      [0.128, 0.132],
      [0.08, 0.173],
      [0.025, 0.19],
      [0, 0.192],
    ], 22, 0.91),
    helmetRim: loftedBodyGeometry([
      [-0.017, 0.158, 0.143],
      [0.017, 0.158, 0.143],
    ], { radialSegments: 18, contour: 0.015 }),
    helmetRail: new RoundedBoxGeometry(0.039, 0.07, 0.115, 2, 0.011),
    collar: loftedBodyGeometry([
      [-0.055, 0.105, 0.095],
      [0.035, 0.125, 0.105],
      [0.065, 0.09, 0.082],
    ], { radialSegments: 12, contour: 0.025 }),
    belt: loftedBodyGeometry([
      [-0.038, 0.205, 0.135],
      [0.038, 0.205, 0.135],
    ], { radialSegments: 14, contour: 0.02 }),
    shoulderPad: loftedBodyGeometry([
      [-0.065, 0.065, 0.078],
      [0.015, 0.083, 0.098],
      [0.065, 0.06, 0.075],
    ], { radialSegments: 12, contour: 0.025 }),
    elbowPad: new RoundedBoxGeometry(0.12, 0.13, 0.055, 2, 0.025),
    cuff: new RoundedBoxGeometry(0.12, 0.075, 0.11, 2, 0.02),
    thighPocket: new RoundedBoxGeometry(0.13, 0.18, 0.07, 2, 0.02),
    boot: footLoftGeometry([
      [0.105, 0.13, 0.069, 0.115],
      [0.025, 0.12, 0.082, 0.108],
      [-0.075, 0.088, 0.09, 0.073],
      [-0.18, 0.063, 0.092, 0.051],
      [-0.235, 0.055, 0.075, 0.041],
    ], 14),
    bootSole: footLoftGeometry([
      [0.115, 0.03, 0.076, 0.025],
      [0.015, 0.029, 0.09, 0.024],
      [-0.09, 0.027, 0.098, 0.023],
      [-0.19, 0.026, 0.101, 0.022],
      [-0.245, 0.029, 0.082, 0.025],
    ], 12),
    rifleReceiver: sideProfileGeometry([
      [-0.23, 0.06],
      [0.17, 0.072],
      [0.23, 0.034],
      [0.2, -0.044],
      [0.075, -0.068],
      [-0.19, -0.057],
    ], 0.105, 0.007),
    rifleHandguard: sideProfileGeometry([
      [-0.2, 0.045],
      [0.17, 0.056],
      [0.205, 0.022],
      [0.17, -0.052],
      [-0.18, -0.047],
      [-0.22, -0.015],
    ], 0.092, 0.006),
    rifleStock: sideProfileGeometry(
      [
        [-0.16, 0.038],
        [0.125, 0.06],
        [0.17, 0.024],
        [0.15, -0.085],
        [0.055, -0.092],
        [-0.02, -0.038],
        [-0.15, -0.024],
      ],
      0.105,
      0.009,
      [[
        [-0.065, 0.012],
        [0.075, 0.032],
        [0.11, 0.005],
        [0.075, -0.052],
        [0.02, -0.054],
        [-0.045, -0.018],
      ]],
    ),
    rifleGrip: sideProfileGeometry([
      [-0.052, 0.058],
      [0.052, 0.04],
      [0.038, -0.102],
      [-0.006, -0.125],
      [-0.055, -0.103],
    ], 0.074, 0.006),
    rifleMag: sideProfileGeometry([
      [-0.06, 0.13],
      [0.055, 0.112],
      [0.067, -0.093],
      [0.014, -0.15],
      [-0.055, -0.128],
      [-0.075, -0.018],
    ], 0.094, 0.007),
    barrel: new THREE.CylinderGeometry(0.021, 0.021, 0.46, 12),
    muzzle: new THREE.CylinderGeometry(0.036, 0.029, 0.105, 12),
    optic: sideProfileGeometry([
      [-0.08, -0.043],
      [0.08, -0.043],
      [0.072, 0.036],
      [0.035, 0.06],
      [-0.048, 0.058],
      [-0.082, 0.022],
    ], 0.073, 0.006),
    opticLens: new THREE.CylinderGeometry(0.037, 0.037, 0.006, 12),
    rail: new RoundedBoxGeometry(0.087, 0.019, 0.49, 2, 0.006),
    rifleCheek: new RoundedBoxGeometry(0.096, 0.031, 0.2, 2, 0.007),
    rifleGasBlock: new RoundedBoxGeometry(0.075, 0.075, 0.052, 2, 0.011),
    earpiece: new THREE.CylinderGeometry(0.04, 0.04, 0.025, 10),
    antenna: new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6),
    rifleControl: new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8),
    magazineBase: new RoundedBoxGeometry(0.115, 0.025, 0.15, 2, 0.007),
    rifleVent: new RoundedBoxGeometry(0.11, 0.01, 0.031, 1, 0.003),
  };

  const lowerSleeve = geometries.limbLower;
  const sleeveGusset = new THREE.SphereGeometry(0.079, 12, 8);
  geometries.limbLower = mergeGeometryParts([
    { geometry: lowerSleeve },
    { geometry: sleeveGusset, position: [0, 0.171, 0], scale: [1, 0.84, 0.92] },
  ]);
  lowerSleeve.dispose();
  sleeveGusset.dispose();

  const ownedMaterials = [
    ...palettes.flatMap((entry) => Object.values(entry)),
    ...Object.values(sharedMaterials),
  ];
  const wardrobe = createEnemyWardrobeGeometries(geometries, mergeGeometryParts);

  return {
    fabricMap,
    polymerMap,
    fabricRoughness,
    hardRoughness,
    contactMap,
    palettes,
    materials: sharedMaterials,
    geometries,
    wardrobe,
    dispose() {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      wardrobe.roles.forEach((role) => Object.values(role).forEach((geometry) => geometry.dispose()));
      wardrobe.shoulderPlate.dispose();
      wardrobe.kneePlate.dispose();
      wardrobe.padMark.dispose();
      ownedMaterials.forEach((value) => value.dispose());
      fabricMap.dispose();
      polymerMap.dispose();
      fabricRoughness.dispose();
      hardRoughness.dispose();
      contactMap.dispose();
    },
  };
}

function createRifle(assets, enemyId) {
  const { geometries: geometry, materials: materials } = assets;
  const rifle = new THREE.Group();
  rifle.name = `enemy-${enemyId}-carbine`;

  const weaponGeometry = mergeGeometryParts([
    { geometry: geometry.rifleReceiver },
    { geometry: geometry.rifleHandguard, position: [0, 0, -0.31] },
    { geometry: geometry.rifleStock, position: [0, -0.005, 0.28] },
    { geometry: geometry.rifleGrip, position: [0, -0.145, 0.1], rotation: [-0.18, 0, 0] },
    { geometry: geometry.magazineBase, position: [0, -0.35, -0.02], rotation: [-0.14, 0, 0] },
    { geometry: geometry.optic, position: [0, 0.16, -0.08] },
  ]);
  const edgeParts = [
    { geometry: geometry.rifleMag, position: [0, -0.21, -0.04], rotation: [-0.14, 0, 0] },
    { geometry: geometry.barrel, position: [0, 0, -0.64], rotation: [Math.PI / 2, 0, 0] },
    { geometry: geometry.muzzle, position: [0, 0, -0.915], rotation: [Math.PI / 2, 0, 0] },
    { geometry: geometry.rail, position: [0, 0.092, -0.14] },
    { geometry: geometry.rifleCheek, position: [0, 0.075, 0.285] },
    { geometry: geometry.rifleGasBlock, position: [0, 0.012, -0.48] },
    {
      geometry: geometry.magazineBase,
      position: [0, 0.075, 0.09],
      scale: [0.62, 0.52, 0.25],
    },
  ];
  for (let i = 0; i < 5; i += 1) {
    edgeParts.push({
      geometry: geometry.rifleVent,
      position: [0, 0.06, -0.18 - i * 0.052],
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
  rifle.userData.muzzle.position.set(0, 0, -0.98);
  rifle.add(rifle.userData.muzzle);
  markHitZone(rifle, enemyId, 'weapon');
  return rifle;
}

function animateLeg(leg, side, stride, motion, aim, hipHeight) {
  const phase = (stride / (Math.PI * 2) + (side > 0 ? 0.5 : 0)) % 1;
  const support = 0.59;
  const swing = Math.max(0, (phase - support) / (1 - support));
  const reach = motion * 0.27;
  const travel = phase < support
    ? THREE.MathUtils.lerp(-reach, reach, phase / support)
    : THREE.MathUtils.lerp(reach, -reach, THREE.MathUtils.smoothstep(swing, 0, 1));
  const lift = Math.sin(swing * Math.PI) * motion * 0.116;
  const targetZ = travel + aim * (side < 0 ? -0.071 : 0.085);
  const drop = hipHeight - 0.078 - lift;
  const upper = 0.425;
  const shin = 0.397;
  const distance = Math.min(upper + shin - 0.0001, Math.hypot(drop, targetZ));
  const hipTriangle = THREE.MathUtils.clamp((upper ** 2 + distance ** 2 - shin ** 2) / (2 * upper * distance), -1, 1);
  const kneeTriangle = THREE.MathUtils.clamp((distance ** 2 - upper ** 2 - shin ** 2) / (2 * upper * shin), -1, 1);
  const hipPitch = Math.atan2(-targetZ, drop) + Math.acos(hipTriangle);
  const kneePitch = -Math.acos(kneeTriangle);
  const toeRoll = Math.sin(swing * Math.PI * 2) * motion * 0.15;
  leg.upperPivot.position.set(side * (0.125 + aim * 0.011), hipHeight, 0);
  leg.upperPivot.rotation.set(hipPitch, -side * (0.038 + aim * 0.064), side * 0.016);
  leg.knee.rotation.set(kneePitch, 0, 0);
  leg.ankle.rotation.set(-hipPitch - kneePitch + toeRoll, 0, -side * 0.016);
}

export function createEnemySoldier(id, visualVariant, assets) {
  const uniformIndex = ((visualVariant % UNIFORMS.length) + UNIFORMS.length) % UNIFORMS.length;
  const uniform = UNIFORMS[uniformIndex];
  const palette = assets.palettes[uniformIndex];
  const gear = assets.wardrobe.roles[uniformIndex];
  const geometry = assets.geometries;
  const materials = assets.materials;
  const root = new THREE.Group();
  root.name = `enemy-soldier-${id}`;
  root.userData.enemyId = id;
  root.userData.enemyRoot = true;
  root.userData.uniformRole = uniform.id;
  const bodyRoot = new THREE.Group();
  bodyRoot.name = `enemy-soldier-${id}-body`;
  root.add(bodyRoot);

  const pelvis = mesh(geometry.pelvis, palette.clothDark, 'pelvis');
  pelvis.position.y = 0.91;
  bodyRoot.add(pelvis);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.22;
  bodyRoot.add(torsoPivot);
  const torso = mesh(geometry.torso, palette.cloth, 'combat-shirt');
  const vest = mesh(geometry.vest, palette.armour, 'layered-armour-vest');
  vest.position.z = -0.005;
  torsoPivot.add(torso, vest);
  markHitZone(torsoPivot, id, 'torso');

  const collar = mesh(geometry.collar, palette.clothDark, 'raised-combat-collar');
  collar.position.set(0, 0.315, 0.005);
  const belt = mesh(geometry.belt, palette.accent, 'load-bearing-belt');
  belt.position.set(0, -0.295, 0.005);
  const beltBuckle = mesh(geometry.rifleControl, materials.buckle, 'belt-buckle');
  beltBuckle.rotation.z = Math.PI / 2;
  beltBuckle.scale.set(1.45, 1.4, 1.45);
  beltBuckle.position.set(0, -0.295, -0.142);
  torsoPivot.add(collar, belt, beltBuckle);

  const neck = mesh(geometry.neck, palette.clothDark, 'sealed-neck-gaiter');
  neck.position.y = 0.385;
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.485;
  torsoPivot.add(headPivot);
  const head = mesh(geometry.head, palette.clothDark, 'lined-helmet-hood');
  head.scale.set(0.96, 1.02, 0.96);
  headPivot.add(
    head,
    mesh(gear.shell, palette.shell, 'formed-helmet-shell'),
    mesh(gear.mask, palette.armour, 'sealed-respirator-and-brow'),
    mesh(gear.visor, palette.visor, 'curved-protective-visor', false),
    mesh(gear.hardware, materials.buckle, 'filter-housings-and-comms'),
    mesh(gear.headSignal, palette.signal, 'helmet-role-marking', false),
  );
  markHitZone(headPivot, id, 'head');

  const pack = mesh(geometry.pack, palette.armour, 'equipment-pack');
  pack.position.set(0, 0.01, 0.21);
  torsoPivot.add(pack);
  markHitZone(pack, id, 'torso');

  const torsoGear = [
    mesh(gear.plate, palette.shell, 'layered-chest-protector'),
    mesh(gear.textile, palette.accent, 'stitched-service-pouches'),
    mesh(gear.vestSignal, palette.signal, 'torso-role-markings', false),
  ];
  torsoPivot.add(...torsoGear);
  torsoGear.forEach((part) => markHitZone(part, id, 'torso'));
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
    upperPivot.position.set(side * 0.125, 0.9, 0);
    bodyRoot.add(upperPivot);
    const upper = mesh(geometry.legUpper, palette.cloth, 'tailored-trouser-thigh');
    upper.position.y = -0.212;
    upperPivot.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -0.425;
    upperPivot.add(knee);
    const lower = mesh(geometry.legLower, palette.clothDark, 'reinforced-trouser-shin');
    lower.position.y = -0.197;
    knee.add(lower);
    const kneepad = mesh(assets.wardrobe.kneePlate, palette.shell, 'formed-knee-protector');
    kneepad.position.set(0, 0.008, -0.080);
    const kneeMark = mesh(assets.wardrobe.padMark, palette.armour, 'kneepad-top-binding', false);
    kneeMark.position.copy(kneepad.position);
    knee.add(kneepad, kneeMark);

    const ankle = new THREE.Group();
    ankle.position.y = -0.397;
    knee.add(ankle);
    const boot = mesh(geometry.boot, materials.boot, 'tactical-boot');
    boot.position.y = -0.090;
    boot.scale.z = 0.91;
    const bootSole = mesh(geometry.bootSole, materials.weapon, 'treaded-boot-sole');
    bootSole.position.y = -0.080;
    bootSole.scale.z = 0.91;
    ankle.add(boot, bootSole);
    const thighPocket = mesh(geometry.thighPocket, palette.accent, 'cargo-thigh-pocket');
    thighPocket.position.set(side * 0.09, -0.17, side === (visualVariant % 2 ? -1 : 1) ? -0.07 : 0.025);
    thighPocket.rotation.z = -side * 0.08;
    upperPivot.add(thighPocket);
    markHitZone(upperPivot, id, 'leg');
    return { upperPivot, knee, ankle, boot, bootSole };
  }

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'left-arm' : 'right-arm';
    shoulder.position.set(side * 0.265, 0.225, -0.005);
    torsoPivot.add(shoulder);
    const upper = mesh(geometry.limbUpper, palette.cloth, 'tailored-upper-arm');
    upper.position.y = -0.187;
    shoulder.add(upper);
    const shoulderPad = mesh(geometry.shoulderPad, palette.armour, 'layered-shoulder-pad');
    shoulderPad.position.set(side * 0.025, -0.05, -0.005);
    shoulderPad.scale.set(uniform.shoulder, 1, uniform.shoulder);
    const outerPlate = mesh(assets.wardrobe.shoulderPlate, palette.shell, 'outer-shoulder-protector');
    outerPlate.position.set(side * 0.053, -0.074, -0.052);
    outerPlate.rotation.set(0.09, -side * 0.68, side * 0.13);
    outerPlate.scale.set(uniform.shoulder, 0.94, uniform.shoulder);
    const shoulderMark = mesh(assets.wardrobe.padMark, palette.signal, 'shoulder-role-marking', false);
    shoulderMark.position.copy(outerPlate.position);
    shoulderMark.rotation.copy(outerPlate.rotation);
    shoulderMark.scale.copy(outerPlate.scale);
    shoulder.add(shoulderPad, outerPlate, shoulderMark);
    const elbow = new THREE.Group();
    elbow.position.y = -0.37;
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
    hand.position.y = -0.35;
    elbow.add(hand);
    const handParts = [{ geometry: geometry.hand }];
    const fingerLengths = [0.89, 1.02, 1, 0.84];
    for (let fingerIndex = 0; fingerIndex < fingerLengths.length; fingerIndex += 1) {
      const length = fingerLengths[fingerIndex];
      handParts.push({
        geometry: geometry.finger,
        position: [(fingerIndex - 1.5) * 0.023, -0.040, -0.028],
        rotation: [0.76 + fingerIndex * 0.048, 0, 0],
        scale: [0.91, length, 0.91],
      });
      handParts.push({
        geometry: geometry.fingerTip,
        position: [(fingerIndex - 1.5) * 0.023, -0.051 - length * 0.018, -0.036 - length * 0.023],
        rotation: [1.22 + fingerIndex * 0.043, 0, 0],
        scale: [0.93, length, 0.93],
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
    const knucklePlate = mesh(
      geometry.knucklePlate,
      palette.armour,
      'segmented-knuckle-guard',
    );
    knucklePlate.position.set(0, 0.012, -0.052);
    knucklePlate.rotation.x = -0.1;
    hand.add(knucklePlate);
    markHitZone(shoulder, id, 'arm');
    return {
      shoulder,
      elbow,
      hand,
      upperLength: 0.37,
      lowerLength: 0.35,
      side,
      bendOut: side < 0 ? 0.92 : 0.38,
      bendDown: side < 0 ? -0.62 : -0.92,
      bendForward: side < 0 ? 0.08 : 0.24,
    };
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const rifle = createRifle(assets, id);
  rifle.position.set(0.055, 0.08, -0.205);
  rifle.rotation.set(-0.1, -0.045, -0.012);
  rifle.scale.setScalar(0.84);
  torsoPivot.add(rifle);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x070908,
    map: assets.contactMap,
    transparent: true,
    opacity: 0.38,
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
  const deathAxis = new THREE.Vector3();

  const ownedGeometries = [
    ...straps.map((strap) => strap.geometry),
    ...characterOwnedGeometries,
    ...rifle.userData.ownedGeometries,
    contactShadowGeometry,
  ];
  const ownedMaterials = [contactShadowMaterial];
  const distanceDetails = [];
  const bodyShadows = [];
  const accessoryShadows = [];
  const detailNames = /binding|marking|strap|buckle|cargo-thigh|cuff|knuckle|treaded|carbine-controls|machined|filter-housings/;
  const shadowShapes = /combat-shirt|pelvis|helmet-shell|trouser|reinforced-forearm|tailored-upper|tactical-boot/;
  bodyRoot.traverse((part) => {
    if (!part.isMesh) return;
    if (detailNames.test(part.name)) distanceDetails.push(part);
    if (part.castShadow) {
      const collection = shadowShapes.test(part.name) ? bodyShadows : accessoryShadows;
      collection.push(part);
    }
  });
  let renderDetail = '';

  const rig = {
    root,
    bodyRoot,
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
    uniformRole: uniform.id,
    stride: id * 1.371,
    recoil: 0,
    hit: 0,
    hitInput: 0,
    impactKick: 0,
    death: 0,
    deathTime: 0,
    deathSide: 0,
    corpseVisibility: 1,
    aimWeight: 0,
    lastGroundY: 0,
    setGround(y) {
      root.position.y = y;
      this.lastGroundY = y;
    },
    setRenderDetail(near, highQuality) {
      const tier = `${near}:${highQuality}`;
      if (renderDetail === tier) return;
      renderDetail = tier;
      for (const part of distanceDetails) part.visible = near;
      for (const part of bodyShadows) part.castShadow = near;
      for (const part of accessoryShadows) part.castShadow = near && highQuality;
    },
    setPose(pose) {
      this.pose = pose;
    },
    setCorpseVisibility(visibility = true) {
      const raw = typeof visibility === 'boolean' ? (visibility ? 1 : 0) : Number(visibility);
      const amount = THREE.MathUtils.clamp(Number.isFinite(raw) ? raw : 1, 0, 1);
      const scale = THREE.MathUtils.lerp(0.84, 1, THREE.MathUtils.smoothstep(amount, 0, 1));
      this.corpseVisibility = amount;
      bodyRoot.visible = amount > 0.001;
      bodyRoot.scale.setScalar(amount > 0.001 ? scale : 0.001);
      contactShadow.visible = amount > 0.001;
      contactShadowMaterial.opacity = 0.38 * amount;
      return this;
    },
    animate(dt, motion = 0, aim = 0, firing = false, hit = 0, dead = false) {
      this.stride += dt * (1.5 + motion * 9.2);
      this.recoil = THREE.MathUtils.damp(this.recoil, firing ? 1 : 0, 23, dt);
      this.hit = THREE.MathUtils.damp(this.hit, hit, 13, dt);
      this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aim, 8.5, dt);
      this.impactKick = Math.max(this.impactKick * Math.exp(-dt * 14), Math.min(1, (hit - this.hitInput) * 2.6));
      this.hitInput = hit;

      if (dead) {
        this.deathTime += Math.max(0, dt);
        const kneel = THREE.MathUtils.smoothstep(this.deathTime, 0, 0.25);
        const fall = THREE.MathUtils.smoothstep(this.deathTime, 0.22, 1.2);
        const settle = THREE.MathUtils.smoothstep(this.deathTime, 1.02, 1.2);
        const sideSign = this.deathSide < 0 ? -1 : 1;
        const sideWeight = THREE.MathUtils.lerp(
          0.2,
          0.78,
          THREE.MathUtils.clamp(Math.abs(this.deathSide), 0, 1),
        );
        const forwardWeight = Math.sqrt(Math.max(0, 1 - sideWeight * sideWeight));
        const groundLift = THREE.MathUtils.lerp(
          1.05,
          0.66,
          THREE.MathUtils.inverseLerp(0.2, 0.78, sideWeight),
        );
        this.death = THREE.MathUtils.clamp(this.deathTime / 1.2, 0, 1);

        // Keep the world-facing yaw and grounded root untouched. The body first
        // buckles at the knees, then rotates around its feet into a weighted
        // forward/side fall instead of remaining as an upright bent mannequin.
        deathAxis.set(-forwardWeight, 0, -sideSign * sideWeight).normalize();
        bodyRoot.position.set(
          sideSign * fall * 0.035,
          Math.sin(fall * Math.PI * 0.5) * groundLift + fall * 0.07 - settle * 0.012,
          -fall * 0.035,
        );
        bodyRoot.quaternion.setFromAxisAngle(deathAxis, fall * Math.PI * 0.49);

        leftLeg.upperPivot.position.set(-0.125, 0.9 - kneel * 0.11, -kneel * 0.035);
        rightLeg.upperPivot.position.set(0.125, 0.9 - kneel * 0.15, kneel * 0.04);
        leftLeg.upperPivot.rotation.set(0.18 + kneel * 0.36, 0.045, -0.035);
        rightLeg.upperPivot.rotation.set(-0.08 + kneel * 0.28, -0.04, 0.04);
        leftLeg.knee.rotation.set(0.08 + kneel * 0.82, 0, -sideSign * fall * 0.08);
        rightLeg.knee.rotation.set(0.08 + kneel * 1.02, 0, sideSign * fall * 0.06);
        leftLeg.ankle.rotation.set(-0.13 - kneel * 0.32, 0.07, 0);
        rightLeg.ankle.rotation.set(0.09 - kneel * 0.23, -0.08, 0);

        pelvis.position.y = 0.91 - kneel * 0.13;
        pelvis.rotation.set(
          kneel * 0.16,
          sideSign * kneel * 0.09,
          sideSign * kneel * 0.12,
        );
        torsoPivot.position.set(
          sideSign * kneel * 0.018,
          1.22 - kneel * 0.14,
          kneel * 0.018,
        );
        torsoPivot.rotation.set(
          -0.08 - kneel * 0.58,
          -sideSign * fall * 0.08,
          sideSign * (kneel * 0.24 + fall * 0.2),
        );
        headPivot.position.y = 0.485;
        headPivot.rotation.set(
          kneel * 0.24 + fall * 0.18,
          -sideSign * fall * 0.18,
          sideSign * fall * 0.12,
        );

        leftArm.shoulder.rotation.set(-0.25 - fall * 0.18, 0.08, 0.55 + fall * 0.62);
        rightArm.shoulder.rotation.set(-0.18 + fall * 0.16, -0.05, -0.5 - fall * 0.42);
        leftArm.elbow.rotation.set(-0.22 - fall * 0.28, 0, -0.08);
        rightArm.elbow.rotation.set(-0.35 - fall * 0.2, 0, 0.06);
        leftArm.hand.rotation.set(-0.72, -0.08, 0.22 + fall * 0.18);
        rightArm.hand.rotation.set(-0.28, 0.13, -0.18 - fall * 0.16);

        rifle.position.set(
          0.055 + sideSign * fall * 0.025,
          0.08 + kneel * 0.12,
          -0.205 + fall * 0.035,
        );
        rifle.rotation.set(
          0.1 + kneel * 0.52 + fall * 0.16,
          -0.045 - sideSign * fall * 0.12,
          -sideSign * fall * 0.38,
        );
        contactShadow.position.y = -root.position.y + this.lastGroundY - 0.003;
        contactShadow.scale.set(
          1 + fall * 1.35,
          1 + fall * 0.28,
          1,
        );
        return;
      }

      this.death = 0;
      this.deathTime = 0;
      bodyRoot.position.set(0, 0, 0);
      bodyRoot.quaternion.identity();

      const gait = Math.sin(this.stride);
      const aimRaise = this.aimWeight;
      const breathing = Math.sin(this.stride * 0.31) * (1 - motion * 0.65);
      const hitDirection = id % 2 ? -1 : 1;
      const impact = this.hit * 0.36 + this.impactKick * 0.64;
      const hipHeight = 0.890 - motion * 0.039 - aimRaise * 0.012;
      const weightShift = Math.cos(this.stride * 2) * motion * 0.007;
      animateLeg(leftLeg, -1, this.stride, motion, aimRaise, hipHeight + weightShift);
      animateLeg(rightLeg, 1, this.stride, motion, aimRaise, hipHeight + weightShift);

      pelvis.position.y = hipHeight + 0.016 + breathing * 0.003;
      pelvis.rotation.x = -aimRaise * 0.025 - motion * 0.054;
      pelvis.rotation.y = aimRaise * 0.065 + gait * motion * 0.065;
      pelvis.rotation.z = -aimRaise * 0.018 + gait * motion * 0.033;
      torsoPivot.position.x = aimRaise * 0.014 + gait * motion * 0.018 + impact * hitDirection * 0.013;
      torsoPivot.position.y = hipHeight + 0.33 + breathing * 0.006 + weightShift;
      torsoPivot.position.z = aimRaise * 0.008 - motion * 0.019 + impact * 0.022;
      torsoPivot.rotation.x =
        -aimRaise * 0.095 - motion * 0.061 + impact * 0.19 + breathing * 0.008;
      torsoPivot.rotation.y =
        -aimRaise * 0.105 - gait * motion * 0.063 + impact * hitDirection * 0.15;
      torsoPivot.rotation.z =
        -aimRaise * 0.025 + impact * hitDirection * 0.16 - gait * motion * 0.038;
      headPivot.position.y = 0.485 + breathing * 0.002;
      headPivot.rotation.x = aimRaise * 0.052 + motion * 0.04 + impact * 0.17;
      headPivot.rotation.y =
        aimRaise * 0.095 +
        Math.sin(this.stride * 0.23) * (1 - aimRaise) * 0.11 - impact * hitDirection * 0.19;
      headPivot.rotation.z = aimRaise * 0.022 - gait * motion * 0.012 + impact * hitDirection * 0.07;

      rifle.position.x = 0.055 + aimRaise * 0.026 + this.hit * 0.012;
      rifle.position.y = 0.08 + aimRaise * 0.27;
      rifle.position.z =
        -0.205 - aimRaise * 0.02 + this.recoil * 0.063 + impact * 0.015;
      rifle.rotation.x =
        -0.1 + aimRaise * 0.185 + this.recoil * 0.065 - impact * 0.105;
      rifle.rotation.y = -0.045 + aimRaise * 0.014;
      rifle.rotation.z =
        -0.012 - aimRaise * 0.02 + gait * motion * 0.012;
      rifle.updateMatrix();

      IK_TARGET.set(0.047, -0.16, 0.085).applyMatrix4(rifle.matrix);
      solveTwoBoneArm(rightArm, IK_TARGET, 1);
      IK_TARGET.set(-0.043, -0.052, -0.335).applyMatrix4(rifle.matrix);
      solveTwoBoneArm(leftArm, IK_TARGET, -1);
      rightArm.hand.rotation.set(-0.24, 0.13, -0.18);
      leftArm.hand.rotation.set(-0.78, -0.08, 0.22);

      root.position.y = this.lastGroundY;
      contactShadow.position.y = -root.position.y + this.lastGroundY - 0.003;
      contactShadow.scale.set(1, 1, 1);
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
