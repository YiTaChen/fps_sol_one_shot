import * as THREE from 'three';
import { LEG_DIMENSIONS } from './EnemyLocomotion.js';

const SEGMENTS = 20;
const { hipHeight, hipSpacing, thigh, shin } = LEG_DIMENSIONS;
const kneeY = hipHeight - thigh;
const ankleY = kneeY - shin;
const FOLD_PHASE = [0, 0.4, 0.8, 1.7, 3.7, 4.1, 4.8, 5.2, 0.1, 1.1, 1.8, 2.6, 4.2, 4.5];
const point = new THREE.Vector3();

function profile(ring, angle) {
  const [y, centerX, width, depth, centerZ, fold = 0] = ring;
  const texture = Math.sin(3 * angle + fold) * 0.51 + Math.sin(7 * angle + fold) * 0.18;
  return [
    centerX + Math.cos(angle) * (width + texture * 0.004),
    y + Math.cos(2 * angle + fold) * 0.0034,
    centerZ + Math.sin(angle) * (depth + texture * 0.0045),
  ];
}

function tint(angle, y, side) {
  const outer = side * Math.cos(angle);
  const seam = THREE.MathUtils.smoothstep(outer, 0.955, 1);
  const knee = 1 - THREE.MathUtils.smoothstep(Math.abs(y - kneeY), 0.045, 0.102);
  const kneePanel = knee * THREE.MathUtils.smoothstep(-Math.sin(angle), 0.65, 0.9);
  return 1 - seam * 0.087 - kneePanel * 0.076;
}

/** A welded waist and inseam feeding into two articulated trouser legs. */
export function createTrousersGeometry() {
  const vertices = [];
  const colors = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const triangles = [];

  function vertex(position, skin, shade = 1) {
    const id = vertices.length / 3;
    const [x, y, z] = position;
    vertices.push(x, y, z);
    colors.push(shade, shade, shade);
    uvs.push((x + z * 0.76) * 2.65, y * 2.65);
    for (let slot = 0; slot < 4; slot += 1) {
      skinIndices.push(skin[slot]?.[0] ?? 0);
      skinWeights.push(skin[slot]?.[1] ?? 0);
    }
    return id;
  }

  function ring(profileValue, count, start, skin) {
    return Array.from({ length: count }, (_, index) => {
      const angle = start + index * Math.PI * 2 / count;
      return vertex(profile(profileValue, angle), skin);
    });
  }

  function bridge(upper, lower) {
    for (let index = 0; index < upper.length; index += 1) {
      const next = (index + 1) % upper.length;
      triangles.push(upper[index], upper[next], lower[index], lower[index], upper[next], lower[next]);
    }
  }

  const branch = ring([hipHeight - 0.026, 0, 0.202, 0.112, 0.001], SEGMENTS * 2, 0, [[0, 1]]);
  const hips = ring([hipHeight + 0.036, 0, 0.202, 0.121, 0.007], SEGMENTS * 2, 0, [[0, 0.78], [5, 0.22]]);
  const waist = ring([hipHeight + 0.114, 0, 0.179, 0.108, 0.005], SEGMENTS * 2, 0, [[5, 1]]);
  bridge(waist, hips);
  bridge(hips, branch);

  // At the crotch the inner half of each leg begins on this same edge.
  // Its two ends already belong to the waist loop and its center sits lower.
  const quarter = SEGMENTS / 2;
  const inseam = [branch[quarter]];
  for (let index = 1; index < SEGMENTS; index += 1) {
    const fraction = index / SEGMENTS;
    const y = hipHeight - 0.026 - 0.123 * Math.sin(Math.PI * fraction);
    const z = THREE.MathUtils.lerp(0.113, -0.111, fraction);
    const shared = Math.sin(Math.PI * fraction) * 0.27;
    inseam.push(vertex([0, y, z], [[0, 1 - 2 * shared], [1, shared], [3, shared]], 0.96));
  }
  inseam.push(branch[quarter * 3]);

  const heights = [
    [hipHeight - 0.156, 0.106, 0.093, 0.004],
    [hipHeight - 0.202, 0.103, 0.097, 0.002],
    [hipHeight - 0.267, 0.094, 0.091, -0.005],
    [hipHeight - 0.335, 0.083, 0.079, -0.008],
    [kneeY + 0.061, 0.076, 0.070, -0.005],
    [kneeY + 0.027, 0.073, 0.067, -0.003],
    [kneeY - 0.006, 0.067, 0.065, 0.001],
    [kneeY - 0.042, 0.065, 0.062, 0.007],
    [kneeY - 0.089, 0.074, 0.067, 0.019],
    [kneeY - 0.158, 0.080, 0.073, 0.024],
    [kneeY - 0.220, 0.071, 0.071, 0.023],
    [kneeY - 0.294, 0.060, 0.060, 0.013],
    [kneeY - 0.355, 0.055, 0.052, 0.009],
    [ankleY + 0.030, 0.050, 0.050, 0.009],
  ];

  for (const side of [1, -1]) {
    const start = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const upperIndex = side > 0 ? 3 : 1;
    const lowerIndex = upperIndex + 1;
    const inside = side > 0 ? inseam : [...inseam].reverse();
    const first = side > 0 ? branch.slice(quarter * 3).concat(branch.slice(0, quarter)) : branch.slice(quarter, quarter * 3);
    let previous = first.concat(inside.slice(0, -1));
    for (const [ringIndex, [y, width, depth, z]] of heights.entries()) {
      const lowerShare = 1 - THREE.MathUtils.smoothstep(y, kneeY - 0.065, kneeY + 0.071);
      const upperShare = THREE.MathUtils.smoothstep(hipHeight - y, 0.082, 0.224);
      const skin = [[0, 1 - upperShare], [upperIndex, upperShare * (1 - lowerShare)], [lowerIndex, upperShare * lowerShare]];
      const center = side * (hipSpacing + (hipHeight - y) * 0.017);
      const ids = Array.from({ length: SEGMENTS * 2 }, (_, index) => {
        const angle = start + index * Math.PI / SEGMENTS;
        return vertex(profile([y, center, width, depth, z, FOLD_PHASE[ringIndex]], angle), skin, tint(angle, y, side));
      });
      bridge(previous, ids);
      previous = ids;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(triangles);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.computeVertexNormals();
  // This bound includes standing, slides and the ends of the foot trajectories.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, hipHeight * 0.5, 0), 1.12);
  return geometry;
}

export function createSkinnedTrousers(parent, geometry, material, pelvis, left, right, torso) {
  const trousers = new THREE.SkinnedMesh(geometry, material);
  trousers.name = 'continuous-trouser-fabric';
  trousers.castShadow = true;
  trousers.receiveShadow = true;
  trousers.boundingSphere = geometry.boundingSphere;
  parent.add(trousers);
  parent.updateWorldMatrix(true, true);
  trousers.bind(new THREE.Skeleton([pelvis, left.upperPivot, left.knee, right.upperPivot, right.knee, torso]));
  return trousers;
}

export function trouserContactY(trousers) {
  const positions = trousers.geometry.getAttribute('position');
  let lowest = Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    trousers.getVertexPosition(index, point).applyMatrix4(trousers.matrixWorld);
    lowest = Math.min(lowest, point.y);
  }
  return lowest;
}
