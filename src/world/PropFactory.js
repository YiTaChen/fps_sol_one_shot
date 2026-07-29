import * as THREE from 'three';
import { addCoverPoint, createBoxCollider } from './WorldMath.js';

export const PROP_ARCHETYPES = Object.freeze([
  'market-stall',
  'display-shelf',
  'shipping-crate',
  'produce-crate',
  'pallet',
  'oil-barrel',
  'sandbag-pile',
  'hand-cart',
  'market-table',
  'chair',
  'stool',
  'street-lamp',
  'road-barrier',
  'bollard',
  'traffic-cone',
  'direction-sign',
  'electrical-cabinet',
  'pipe-rack',
  'air-conditioner',
  'dumpster',
  'trash-bin',
  'tire-stack',
  'gas-cylinder',
  'planter',
  'bench',
  'tool-cabinet',
  'workbench',
  'fabric-bale',
  'produce-basket',
  'shade-canopy',
  'wheelbarrow',
  'ladder',
  'fire-extinguisher',
  'cable-spool',
  'generator',
  'water-tank',
  'vending-kiosk',
  'sack-stack',
  'drum-cart',
  'compressor',
]);

const COLLIDER_SPECS = Object.freeze({
  'market-stall': [2.5, 2.25, 1.6, 1.25],
  'display-shelf': [1.7, 2.05, 0.58, 1.2],
  'shipping-crate': [1.2, 1.05, 1.05, 1.0],
  'produce-crate': [0.82, 0.52, 0.6, 0.45],
  pallet: [1.2, 0.17, 0.85, 0.14],
  'oil-barrel': [0.72, 1.04, 0.72, 1.0],
  'sandbag-pile': [1.9, 0.92, 0.72, 0.86],
  'hand-cart': [1.55, 1.2, 0.82, 0.72],
  'market-table': [1.75, 0.92, 0.82, 0.84],
  chair: [0.58, 1.02, 0.62, 0.62],
  stool: [0.46, 0.58, 0.46, 0.46],
  'street-lamp': [0.3, 3.85, 0.3, 1.7],
  'road-barrier': [2.25, 1.05, 0.62, 0.94],
  bollard: [0.32, 0.92, 0.32, 0.84],
  'traffic-cone': [0.45, 0.72, 0.45, 0.6],
  'direction-sign': [0.72, 2.25, 0.35, 1.45],
  'electrical-cabinet': [0.92, 1.52, 0.5, 1.35],
  'pipe-rack': [2.25, 1.6, 0.75, 1.28],
  'air-conditioner': [0.92, 0.64, 0.5, 0.55],
  dumpster: [1.85, 1.18, 1.12, 1.05],
  'trash-bin': [0.68, 0.92, 0.62, 0.82],
  'tire-stack': [0.74, 1.0, 0.74, 0.92],
  'gas-cylinder': [0.42, 1.18, 0.42, 1.0],
  planter: [0.88, 1.22, 0.88, 0.72],
  bench: [1.85, 0.92, 0.64, 0.75],
  'tool-cabinet': [1.02, 1.65, 0.56, 1.45],
  workbench: [2.05, 1.02, 0.82, 0.9],
  'fabric-bale': [1.05, 0.68, 0.72, 0.6],
  'produce-basket': [0.64, 0.48, 0.64, 0.42],
  'shade-canopy': [3.2, 2.58, 2.7, 1.45],
  wheelbarrow: [1.65, 0.92, 0.78, 0.58],
  ladder: [0.62, 2.35, 0.22, 1.55],
  'fire-extinguisher': [0.32, 0.74, 0.28, 0.62],
  'cable-spool': [0.88, 0.9, 0.66, 0.78],
  generator: [1.25, 0.92, 0.72, 0.82],
  'water-tank': [1.45, 1.62, 1.45, 1.42],
  'vending-kiosk': [1.22, 2.0, 0.75, 1.72],
  'sack-stack': [1.45, 1.02, 0.82, 0.92],
  'drum-cart': [0.9, 1.38, 0.72, 0.95],
  compressor: [1.35, 1.05, 0.7, 0.9],
});

const NO_COLLISION = new Set([
  'traffic-cone',
  'direction-sign',
  'air-conditioner',
  'fire-extinguisher',
  'ladder',
]);
const WOOD_COLLIDERS = new Set([
  'market-stall',
  'display-shelf',
  'shipping-crate',
  'produce-crate',
  'pallet',
  'hand-cart',
  'market-table',
  'chair',
  'stool',
  'bench',
  'workbench',
  'produce-basket',
  'cable-spool',
]);
const FABRIC_COLLIDERS = new Set([
  'sandbag-pile',
  'fabric-bale',
  'sack-stack',
]);
const CONCRETE_COLLIDERS = new Set([
  'road-barrier',
  'planter',
]);
const POLYMER_COLLIDERS = new Set([
  'trash-bin',
  'water-tank',
]);

const _parentQuaternion = new THREE.Quaternion();
const _localQuaternion = new THREE.Quaternion();
const _worldQuaternion = new THREE.Quaternion();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _colliderSize = new THREE.Vector3();

function localTransform(origin, yaw, scale, localPosition, euler = null) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  _position.set(
    origin.x + (localPosition[0] * cosine + localPosition[2] * sine) * scale,
    origin.y + localPosition[1] * scale,
    origin.z + (-localPosition[0] * sine + localPosition[2] * cosine) * scale,
  );
  _parentQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  if (euler) {
    _localQuaternion.setFromEuler(
      new THREE.Euler(euler[0] ?? 0, euler[1] ?? 0, euler[2] ?? 0),
    );
    _worldQuaternion.copy(_parentQuaternion).multiply(_localQuaternion);
  } else {
    _worldQuaternion.copy(_parentQuaternion);
  }
  return { position: _position, quaternion: _worldQuaternion };
}

export class PropFactory {
  constructor({
    batcher,
    colliders,
    coverPoints,
  }) {
    this.batcher = batcher;
    this.colliders = colliders;
    this.coverPoints = coverPoints;
    this.placedArchetypes = new Set();
    this.propCount = 0;
    this.colliderIndex = 0;
  }

  box(origin, yaw, propScale, material, position, scale, rotation = null, options = {}) {
    const transform = localTransform(origin, yaw, propScale, position, rotation);
    this.batcher.box(
      material,
      transform.position,
      transform.quaternion,
      _scale.set(scale[0] * propScale, scale[1] * propScale, scale[2] * propScale),
      {
        name: options.name ?? 'prop-box',
        radius: options.radius ?? 0.055,
        castShadow: options.castShadow ?? false,
      },
    );
  }

  cylinder(origin, yaw, propScale, material, position, scale, rotation = null, options = {}) {
    const transform = localTransform(origin, yaw, propScale, position, rotation);
    this.batcher.cylinder(
      material,
      transform.position,
      transform.quaternion,
      _scale.set(scale[0] * propScale, scale[1] * propScale, scale[2] * propScale),
      {
        name: options.name ?? 'prop-cylinder',
        radialSegments: options.radialSegments ?? 12,
        castShadow: options.castShadow ?? false,
      },
    );
  }

  cone(origin, yaw, propScale, material, position, scale, rotation = null) {
    const transform = localTransform(origin, yaw, propScale, position, rotation);
    this.batcher.cone(
      material,
      transform.position,
      transform.quaternion,
      _scale.set(scale[0] * propScale, scale[1] * propScale, scale[2] * propScale),
      { name: 'prop-cone', radialSegments: 12 },
    );
  }

  torus(origin, yaw, propScale, material, position, scale, rotation = null) {
    const transform = localTransform(origin, yaw, propScale, position, rotation);
    this.batcher.torus(
      material,
      transform.position,
      transform.quaternion,
      _scale.set(scale[0] * propScale, scale[1] * propScale, scale[2] * propScale),
      { name: 'prop-torus', radialSegments: 8, tubularSegments: 14 },
    );
  }

  addCollider(type, origin, yaw, scale, options) {
    if (NO_COLLISION.has(type) || options.collider === false) {
      return;
    }
    const spec = COLLIDER_SPECS[type];
    if (!spec) {
      return;
    }
    _colliderSize.set(spec[0] * scale, spec[1] * scale, spec[2] * scale);
    _position.copy(origin);
    _position.y += _colliderSize.y * 0.5;
    const material =
      options.surface ??
      (WOOD_COLLIDERS.has(type)
        ? 'wood'
        : FABRIC_COLLIDERS.has(type)
          ? 'fabric'
          : CONCRETE_COLLIDERS.has(type)
            ? 'concrete'
            : POLYMER_COLLIDERS.has(type)
              ? 'polymer'
              : 'metal');
    const collider = createBoxCollider({
      id: `prop:${this.colliderIndex++}`,
      center: _position,
      size: _colliderSize,
      yaw,
      material,
      tags: ['prop', type],
    });
    collider.penetrable = ['wood', 'fabric', 'polymer'].includes(material);
    this.colliders.push(collider);

    if (options.cover !== false && spec[3] >= 0.72) {
      _normal.set(Math.sin(yaw), 0, Math.cos(yaw));
      _position.copy(origin).addScaledVector(_normal, spec[2] * scale * 0.72);
      _position.y += 0.04;
      addCoverPoint(this.coverPoints, _position, _normal, {
        id: `prop-cover:${this.propCount}`,
        height: spec[3] * scale,
        width: spec[0] * scale,
        kind: material === 'fabric' ? 'soft' : 'hard',
        score: material === 'concrete' || material === 'metal' ? 1.1 : 0.78,
      });
    }
  }

  addRecipe(type, origin, yaw, s) {
    switch (type) {
      case 'market-stall': {
        for (const x of [-1.08, 1.08]) {
          for (const z of [-0.58, 0.58]) {
            this.box(origin, yaw, s, 'wood', [x, 1.15, z], [0.095, 2.3, 0.095]);
          }
        }
        this.box(origin, yaw, s, 'wood', [0, 0.9, 0], [2.35, 0.12, 1.25]);
        this.box(origin, yaw, s, 'fabric', [0, 2.28, 0], [2.65, 0.1, 1.68], [-0.08, 0, 0]);
        this.box(origin, yaw, s, 'paintedMetal', [0, 2.36, -0.05], [2.32, 0.16, 0.08]);
        for (let i = -3; i <= 3; i += 1) {
          this.box(origin, yaw, s, i & 1 ? 'plasterOchre' : 'foliage', [i * 0.3, 1.04, 0.05], [0.22, 0.17, 0.3]);
        }
        break;
      }
      case 'display-shelf': {
        for (const x of [-0.78, 0.78]) {
          this.box(origin, yaw, s, 'bareMetal', [x, 1.02, 0], [0.07, 2.04, 0.5]);
        }
        for (let shelf = 0; shelf < 4; shelf += 1) {
          this.box(origin, yaw, s, 'wood', [0, 0.22 + shelf * 0.52, 0], [1.65, 0.09, 0.54]);
          for (let item = -2; item <= 2; item += 1) {
            const palette = ['ceramic', 'fabric', 'plasterOchre', 'foliage', 'plasterBlue'];
            this.box(
              origin,
              yaw,
              s,
              palette[(item + 2 + shelf) % palette.length],
              [item * 0.27, 0.36 + shelf * 0.52, 0],
              [0.16, 0.24 + ((item + shelf) & 1) * 0.05, 0.22],
              [0, item * 0.025, 0],
              { radius: 0.075 },
            );
          }
        }
        break;
      }
      case 'shipping-crate': {
        this.box(origin, yaw, s, 'wood', [0, 0.52, 0], [1.15, 0.96, 1]);
        for (const x of [-0.54, 0.54]) {
          this.box(origin, yaw, s, 'paintedMetal', [x, 0.52, 0], [0.08, 1.02, 1.06]);
        }
        for (const y of [0.08, 0.96]) {
          this.box(origin, yaw, s, 'paintedMetal', [0, y, 0], [1.18, 0.08, 1.06]);
        }
        this.box(origin, yaw, s, 'rustedMetal', [0, 0.54, 0.53], [0.46, 0.25, 0.035]);
        break;
      }
      case 'produce-crate': {
        for (const y of [0.08, 0.44]) {
          this.box(origin, yaw, s, 'wood', [0, y, 0], [0.78, 0.08, 0.58]);
        }
        for (const x of [-0.36, 0.36]) {
          this.box(origin, yaw, s, 'wood', [x, 0.26, 0], [0.07, 0.42, 0.58]);
        }
        for (const z of [-0.26, 0.26]) {
          this.box(origin, yaw, s, 'wood', [0, 0.26, z], [0.78, 0.34, 0.055]);
        }
        for (const x of [-0.22, 0, 0.22]) {
          this.cylinder(origin, yaw, s, 'foliage', [x, 0.52, 0], [0.16, 0.16, 0.16], [0, 0, Math.PI * 0.5], { radialSegments: 8 });
        }
        break;
      }
      case 'pallet': {
        for (const z of [-0.36, 0, 0.36]) {
          this.box(origin, yaw, s, 'wood', [0, 0.12, z], [1.18, 0.07, 0.14]);
        }
        for (const x of [-0.48, 0, 0.48]) {
          this.box(origin, yaw, s, 'wood', [x, 0.055, 0], [0.15, 0.11, 0.82]);
        }
        break;
      }
      case 'oil-barrel': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.52, 0], [0.7, 1.02, 0.7], null, { radialSegments: 16 });
        for (const y of [0.09, 0.5, 0.95]) {
          this.torus(origin, yaw, s, 'bareMetal', [0, y, 0], [0.72, 0.72, 0.72], [Math.PI * 0.5, 0, 0]);
        }
        this.cylinder(origin, yaw, s, 'rustedMetal', [0.16, 1.045, 0], [0.08, 0.035, 0.08], null, { radialSegments: 8 });
        break;
      }
      case 'sandbag-pile': {
        for (let row = 0; row < 3; row += 1) {
          const count = 4 - row;
          for (let i = 0; i < count; i += 1) {
            this.box(
              origin,
              yaw,
              s,
              'fabric',
              [(i - (count - 1) * 0.5) * 0.48, 0.18 + row * 0.27, 0],
              [0.54, 0.22, 0.68],
              [0, (i & 1) * 0.05, 0],
              { radius: 0.16 },
            );
          }
        }
        break;
      }
      case 'hand-cart': {
        this.box(origin, yaw, s, 'wood', [0, 0.58, 0], [1.25, 0.14, 0.72]);
        for (const x of [-0.72, 0.72]) {
          this.box(origin, yaw, s, 'bareMetal', [x, 0.6, 0], [0.3, 0.06, 0.06], [0, 0, -0.2 * Math.sign(x)]);
        }
        for (const z of [-0.43, 0.43]) {
          this.torus(origin, yaw, s, 'rubber', [-0.42, 0.34, z], [0.58, 0.58, 0.58], [Math.PI * 0.5, 0, 0]);
          this.cylinder(origin, yaw, s, 'bareMetal', [-0.42, 0.34, z], [0.09, 0.13, 0.09], [Math.PI * 0.5, 0, 0], { radialSegments: 8 });
        }
        break;
      }
      case 'market-table': {
        this.box(origin, yaw, s, 'wood', [0, 0.88, 0], [1.75, 0.12, 0.82]);
        for (const x of [-0.72, 0.72]) {
          for (const z of [-0.31, 0.31]) {
            this.box(origin, yaw, s, 'bareMetal', [x, 0.44, z], [0.07, 0.84, 0.07]);
          }
        }
        this.box(origin, yaw, s, 'fabric', [0, 0.98, 0], [1.68, 0.035, 0.77]);
        break;
      }
      case 'chair': {
        this.box(origin, yaw, s, 'wood', [0, 0.5, 0], [0.52, 0.1, 0.52]);
        for (const x of [-0.2, 0.2]) {
          for (const z of [-0.2, 0.2]) {
            this.box(origin, yaw, s, 'wood', [x, 0.25, z], [0.055, 0.5, 0.055]);
          }
        }
        for (const x of [-0.2, 0.2]) {
          this.box(origin, yaw, s, 'wood', [x, 0.76, -0.23], [0.055, 0.55, 0.055]);
        }
        this.box(origin, yaw, s, 'wood', [0, 0.92, -0.23], [0.52, 0.38, 0.07]);
        break;
      }
      case 'stool': {
        this.cylinder(origin, yaw, s, 'wood', [0, 0.55, 0], [0.46, 0.1, 0.46], null, { radialSegments: 12 });
        for (let i = 0; i < 3; i += 1) {
          const angle = (i / 3) * Math.PI * 2;
          this.cylinder(origin, yaw, s, 'bareMetal', [Math.cos(angle) * 0.15, 0.28, Math.sin(angle) * 0.15], [0.045, 0.55, 0.045], [0, 0, Math.sin(angle) * 0.08], { radialSegments: 6 });
        }
        break;
      }
      case 'street-lamp': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 1.8, 0], [0.14, 3.6, 0.14], null, { radialSegments: 10 });
        this.cylinder(origin, yaw, s, 'concreteAggregate', [0, 0.12, 0], [0.34, 0.24, 0.34], null, { radialSegments: 12 });
        this.box(origin, yaw, s, 'paintedMetal', [0.35, 3.58, 0], [0.72, 0.07, 0.07]);
        this.box(origin, yaw, s, 'lamp', [0.7, 3.48, 0], [0.4, 0.2, 0.28]);
        this.box(origin, yaw, s, 'paintedMetal', [0.7, 3.59, 0], [0.46, 0.08, 0.32]);
        break;
      }
      case 'road-barrier': {
        this.box(origin, yaw, s, 'concreteAggregate', [0, 0.55, 0], [2.2, 0.76, 0.55], [0, 0, 0], { radius: 0.11 });
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.95, 0], [1.92, 0.16, 0.08]);
        for (const x of [-0.68, 0, 0.68]) {
          this.box(origin, yaw, s, 'lamp', [x, 0.96, 0.05], [0.32, 0.08, 0.035], [0, 0, -0.45]);
        }
        break;
      }
      case 'bollard': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.46, 0], [0.27, 0.9, 0.27], null, { radialSegments: 12 });
        this.cylinder(origin, yaw, s, 'bareMetal', [0, 0.9, 0], [0.3, 0.07, 0.3], null, { radialSegments: 12 });
        this.box(origin, yaw, s, 'lamp', [0, 0.68, 0.14], [0.21, 0.1, 0.025]);
        break;
      }
      case 'traffic-cone': {
        this.cone(origin, yaw, s, 'fabric', [0, 0.37, 0], [0.42, 0.66, 0.42]);
        this.box(origin, yaw, s, 'rubber', [0, 0.045, 0], [0.48, 0.09, 0.48]);
        this.torus(origin, yaw, s, 'lamp', [0, 0.39, 0], [0.42, 0.42, 0.42], [Math.PI * 0.5, 0, 0]);
        break;
      }
      case 'direction-sign': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 1.02, 0], [0.07, 2.04, 0.07], null, { radialSegments: 8 });
        this.box(origin, yaw, s, 'paintedMetal', [0, 1.75, 0], [0.82, 0.42, 0.06]);
        this.box(origin, yaw, s, 'lamp', [0.12, 1.75, 0.04], [0.42, 0.08, 0.025]);
        this.cone(origin, yaw, s, 'lamp', [0.4, 1.75, 0.04], [0.18, 0.24, 0.18], [0, 0, -Math.PI * 0.5]);
        break;
      }
      case 'electrical-cabinet': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.76, 0], [0.9, 1.48, 0.48]);
        this.box(origin, yaw, s, 'bareMetal', [0, 0.82, 0.25], [0.76, 1.18, 0.035]);
        this.box(origin, yaw, s, 'lamp', [-0.25, 1.24, 0.28], [0.12, 0.08, 0.025]);
        this.cylinder(origin, yaw, s, 'bareMetal', [0.28, 0.82, 0.3], [0.04, 0.16, 0.04], null, { radialSegments: 8 });
        for (let slot = -2; slot <= 2; slot += 1) {
          this.box(origin, yaw, s, 'rustedMetal', [slot * 0.11, 0.36, 0.28], [0.07, 0.018, 0.025]);
        }
        break;
      }
      case 'pipe-rack': {
        for (const x of [-1.0, 1.0]) {
          this.box(origin, yaw, s, 'rustedMetal', [x, 0.72, 0], [0.09, 1.42, 0.68]);
        }
        for (const y of [0.36, 0.78, 1.2]) {
          for (const z of [-0.2, 0.2]) {
            this.cylinder(origin, yaw, s, 'bareMetal', [0, y, z], [0.12, 2.15, 0.12], [0, 0, Math.PI * 0.5], { radialSegments: 10 });
          }
        }
        break;
      }
      case 'air-conditioner': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.32, 0], [0.9, 0.6, 0.48]);
        this.cylinder(origin, yaw, s, 'bareMetal', [0, 0.32, 0.25], [0.38, 0.045, 0.38], [Math.PI * 0.5, 0, 0], { radialSegments: 14 });
        for (let blade = 0; blade < 6; blade += 1) {
          const angle = (blade / 6) * Math.PI * 2;
          this.box(origin, yaw, s, 'bareMetal', [Math.cos(angle) * 0.09, 0.32 + Math.sin(angle) * 0.09, 0.29], [0.2, 0.035, 0.02], [0, 0, angle]);
        }
        break;
      }
      case 'dumpster': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.54, 0], [1.8, 1.05, 1.08], [0, 0, 0], { radius: 0.1 });
        for (const side of [-1, 1]) {
          this.box(origin, yaw, s, 'bareMetal', [side * 0.76, 0.57, 0.55], [0.12, 0.82, 0.05]);
        }
        this.box(origin, yaw, s, 'rustedMetal', [0, 1.1, 0], [1.76, 0.1, 1.02], [-0.08, 0, 0]);
        for (const x of [-0.68, 0.68]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.14, 0.48], [0.28, 0.28, 0.28], [Math.PI * 0.5, 0, 0]);
        }
        break;
      }
      case 'trash-bin': {
        this.box(origin, yaw, s, 'polymer', [0, 0.43, 0], [0.64, 0.83, 0.58], [0, 0, 0], { radius: 0.1 });
        this.box(origin, yaw, s, 'polymer', [0, 0.88, -0.04], [0.68, 0.1, 0.62], [-0.12, 0, 0]);
        for (const x of [-0.22, 0.22]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.15, -0.31], [0.22, 0.22, 0.22], [0, Math.PI * 0.5, 0]);
        }
        break;
      }
      case 'tire-stack': {
        for (let y = 0; y < 4; y += 1) {
          this.torus(origin, yaw, s, 'rubber', [0, 0.16 + y * 0.23, 0], [0.72, 0.72, 0.72], [Math.PI * 0.5, y * 0.16, 0]);
        }
        this.cylinder(origin, yaw, s, 'bareMetal', [0, 0.51, 0], [0.28, 0.86, 0.28], null, { radialSegments: 10 });
        break;
      }
      case 'gas-cylinder': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.55, 0], [0.38, 1.02, 0.38], null, { radialSegments: 14 });
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 1.08, 0], [0.23, 0.14, 0.23], null, { radialSegments: 12 });
        this.torus(origin, yaw, s, 'bareMetal', [0, 1.18, 0], [0.26, 0.26, 0.26], [Math.PI * 0.5, 0, 0]);
        this.cylinder(origin, yaw, s, 'bareMetal', [0, 1.18, 0], [0.08, 0.13, 0.08], null, { radialSegments: 8 });
        break;
      }
      case 'planter': {
        this.box(origin, yaw, s, 'concreteAggregate', [0, 0.33, 0], [0.84, 0.64, 0.84], [0, 0, 0], { radius: 0.11 });
        this.box(origin, yaw, s, 'dirt', [0, 0.65, 0], [0.7, 0.08, 0.7]);
        for (let leaf = 0; leaf < 7; leaf += 1) {
          const angle = (leaf / 7) * Math.PI * 2;
          this.box(origin, yaw, s, 'foliage', [Math.cos(angle) * 0.18, 0.86 + (leaf % 3) * 0.13, Math.sin(angle) * 0.18], [0.12, 0.7, 0.05], [0, -angle, Math.sin(angle) * 0.34], { radius: 0.04 });
        }
        break;
      }
      case 'bench': {
        for (const y of [0.48, 0.76]) {
          for (let slat = -1; slat <= 1; slat += 1) {
            this.box(origin, yaw, s, 'wood', [0, y + (y > 0.6 ? slat * 0.16 : 0), y > 0.6 ? -0.25 : slat * 0.17], [1.78, 0.1, 0.13], y > 0.6 ? [0.04, 0, 0] : null);
          }
        }
        for (const x of [-0.7, 0.7]) {
          this.box(origin, yaw, s, 'bareMetal', [x, 0.35, 0], [0.08, 0.7, 0.5]);
        }
        break;
      }
      case 'tool-cabinet': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.82, 0], [1, 1.62, 0.54]);
        for (let drawer = 0; drawer < 6; drawer += 1) {
          const y = 0.27 + drawer * 0.23;
          this.box(origin, yaw, s, 'bareMetal', [0, y, 0.29], [0.88, 0.18, 0.035]);
          this.box(origin, yaw, s, 'rubber', [0, y, 0.33], [0.3, 0.035, 0.025]);
        }
        for (const x of [-0.38, 0.38]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.12, 0.25], [0.2, 0.2, 0.2], [0, Math.PI * 0.5, 0]);
        }
        break;
      }
      case 'workbench': {
        this.box(origin, yaw, s, 'wood', [0, 0.9, 0], [2, 0.16, 0.8]);
        for (const x of [-0.82, 0.82]) {
          for (const z of [-0.3, 0.3]) {
            this.box(origin, yaw, s, 'bareMetal', [x, 0.45, z], [0.09, 0.9, 0.09]);
          }
        }
        this.box(origin, yaw, s, 'paintedMetal', [0, 1.45, -0.37], [1.85, 0.92, 0.08]);
        for (let peg = -4; peg <= 4; peg += 1) {
          this.cylinder(origin, yaw, s, 'bareMetal', [peg * 0.2, 1.45 + (peg & 1) * 0.18, -0.31], [0.025, 0.22, 0.025], [Math.PI * 0.5, 0, 0], { radialSegments: 6 });
        }
        break;
      }
      case 'fabric-bale': {
        this.box(origin, yaw, s, 'fabric', [0, 0.34, 0], [1.02, 0.65, 0.7], [0, 0, 0], { radius: 0.18 });
        for (const x of [-0.34, 0.34]) {
          this.box(origin, yaw, s, 'bareMetal', [x, 0.34, 0], [0.035, 0.7, 0.74]);
        }
        this.box(origin, yaw, s, 'fabric', [0, 0.69, 0], [0.62, 0.08, 0.44], [0, 0.12, 0], { radius: 0.04 });
        break;
      }
      case 'produce-basket': {
        this.cylinder(origin, yaw, s, 'wood', [0, 0.24, 0], [0.62, 0.42, 0.62], null, { radialSegments: 12 });
        this.torus(origin, yaw, s, 'wood', [0, 0.45, 0], [0.64, 0.64, 0.64], [Math.PI * 0.5, 0, 0]);
        for (let fruit = 0; fruit < 7; fruit += 1) {
          const angle = (fruit / 7) * Math.PI * 2;
          this.cylinder(origin, yaw, s, fruit & 1 ? 'plasterOchre' : 'foliage', [Math.cos(angle) * 0.16, 0.48 + (fruit % 2) * 0.05, Math.sin(angle) * 0.16], [0.16, 0.14, 0.16], [0, 0, Math.PI * 0.5], { radialSegments: 8 });
        }
        break;
      }
      case 'shade-canopy': {
        for (const x of [-1.42, 1.42]) {
          for (const z of [-1.1, 1.1]) {
            this.cylinder(origin, yaw, s, 'bareMetal', [x, 1.25, z], [0.07, 2.5, 0.07], null, { radialSegments: 8 });
          }
        }
        this.box(origin, yaw, s, 'fabric', [0, 2.46, 0], [3.08, 0.08, 2.45], [-0.05, 0, 0], { radius: 0.04 });
        for (const z of [-1.14, 1.14]) {
          this.box(origin, yaw, s, 'paintedMetal', [0, 2.42, z], [3.1, 0.08, 0.08]);
        }
        break;
      }
      case 'wheelbarrow': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.58, 0], [1.05, 0.36, 0.72], [0, 0, -0.13], { radius: 0.14 });
        this.torus(origin, yaw, s, 'rubber', [0.62, 0.34, 0], [0.52, 0.52, 0.52], [Math.PI * 0.5, 0, 0]);
        this.cylinder(origin, yaw, s, 'bareMetal', [0.62, 0.34, 0], [0.09, 0.26, 0.09], [Math.PI * 0.5, 0, 0], { radialSegments: 8 });
        for (const z of [-0.26, 0.26]) {
          this.box(origin, yaw, s, 'bareMetal', [-0.66, 0.48, z], [0.9, 0.06, 0.06], [0, 0, 0.12]);
          this.box(origin, yaw, s, 'bareMetal', [-0.32, 0.25, z], [0.06, 0.48, 0.06]);
        }
        break;
      }
      case 'ladder': {
        for (const x of [-0.26, 0.26]) {
          this.box(origin, yaw, s, 'bareMetal', [x, 1.15, 0], [0.055, 2.3, 0.055]);
        }
        for (let rung = 0; rung < 8; rung += 1) {
          this.cylinder(origin, yaw, s, 'bareMetal', [0, 0.19 + rung * 0.28, 0], [0.035, 0.55, 0.035], [0, 0, Math.PI * 0.5], { radialSegments: 6 });
        }
        break;
      }
      case 'fire-extinguisher': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.36, 0], [0.28, 0.65, 0.28], null, { radialSegments: 12 });
        this.cylinder(origin, yaw, s, 'bareMetal', [0, 0.72, 0], [0.08, 0.12, 0.08], null, { radialSegments: 8 });
        this.box(origin, yaw, s, 'bareMetal', [0.09, 0.76, 0], [0.24, 0.045, 0.045], [0, 0, -0.25]);
        this.torus(origin, yaw, s, 'rubber', [0.11, 0.52, -0.04], [0.28, 0.28, 0.28], [0, Math.PI * 0.5, 0]);
        break;
      }
      case 'cable-spool': {
        this.cylinder(origin, yaw, s, 'wood', [0, 0.44, 0], [0.4, 0.62, 0.4], [Math.PI * 0.5, 0, 0], { radialSegments: 12 });
        for (const z of [-0.34, 0.34]) {
          this.cylinder(origin, yaw, s, 'wood', [0, 0.44, z], [0.86, 0.08, 0.86], [Math.PI * 0.5, 0, 0], { radialSegments: 14 });
        }
        for (let loop = 0; loop < 3; loop += 1) {
          this.torus(origin, yaw, s, 'rubber', [0, 0.44, -0.08 + loop * 0.08], [0.54 + loop * 0.05, 0.54 + loop * 0.05, 0.54 + loop * 0.05], [0, Math.PI * 0.5, 0]);
        }
        break;
      }
      case 'generator': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 0.48, 0], [1.08, 0.68, 0.62]);
        this.box(origin, yaw, s, 'bareMetal', [0, 0.48, 0], [1.25, 0.9, 0.74], [0, 0, 0], { radius: 0.03 });
        this.cylinder(origin, yaw, s, 'rustedMetal', [0.22, 0.5, 0.39], [0.32, 0.08, 0.32], [Math.PI * 0.5, 0, 0], { radialSegments: 12 });
        for (const x of [-0.42, 0.42]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.16, 0.26], [0.26, 0.26, 0.26], [0, Math.PI * 0.5, 0]);
        }
        break;
      }
      case 'water-tank': {
        this.cylinder(origin, yaw, s, 'polymer', [0, 0.84, 0], [1.38, 1.5, 1.38], null, { radialSegments: 18 });
        for (const y of [0.25, 0.72, 1.2, 1.55]) {
          this.torus(origin, yaw, s, 'rubber', [0, y, 0], [1.4, 1.4, 1.4], [Math.PI * 0.5, 0, 0]);
        }
        this.cylinder(origin, yaw, s, 'paintedMetal', [0.3, 1.64, 0], [0.18, 0.1, 0.18], null, { radialSegments: 10 });
        break;
      }
      case 'vending-kiosk': {
        this.box(origin, yaw, s, 'paintedMetal', [0, 1, 0], [1.18, 1.96, 0.72]);
        this.box(origin, yaw, s, 'glass', [-0.13, 1.27, 0.38], [0.72, 0.9, 0.035]);
        for (let row = 0; row < 3; row += 1) {
          for (let column = 0; column < 3; column += 1) {
            this.box(origin, yaw, s, row & 1 ? 'polymer' : 'fabric', [-0.36 + column * 0.23, 0.96 + row * 0.25, 0.4], [0.13, 0.18, 0.025]);
          }
        }
        this.box(origin, yaw, s, 'polymer', [0.36, 1.22, 0.4], [0.22, 0.52, 0.035]);
        this.box(origin, yaw, s, 'lamp', [0, 1.83, 0.4], [0.92, 0.12, 0.025]);
        break;
      }
      case 'sack-stack': {
        for (let row = 0; row < 3; row += 1) {
          const count = row === 2 ? 2 : 3;
          for (let i = 0; i < count; i += 1) {
            this.box(origin, yaw, s, row & 1 ? 'fabric' : 'sand', [(i - (count - 1) * 0.5) * 0.46, 0.19 + row * 0.29, 0], [0.52, 0.26, 0.72], [0, (i + row) * 0.08, 0], { radius: 0.15 });
          }
        }
        break;
      }
      case 'drum-cart': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.68, 0], [0.62, 0.98, 0.62], null, { radialSegments: 14 });
        for (const x of [-0.37, 0.37]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.22, -0.22], [0.3, 0.3, 0.3], [0, Math.PI * 0.5, 0]);
        }
        this.box(origin, yaw, s, 'bareMetal', [0, 0.7, -0.38], [0.72, 1.35, 0.06], [-0.15, 0, 0]);
        this.box(origin, yaw, s, 'bareMetal', [0, 1.42, -0.42], [0.78, 0.06, 0.06]);
        break;
      }
      case 'compressor': {
        this.cylinder(origin, yaw, s, 'paintedMetal', [0, 0.48, 0], [0.62, 1.15, 0.62], [0, 0, Math.PI * 0.5], { radialSegments: 16 });
        this.box(origin, yaw, s, 'bareMetal', [-0.32, 0.88, 0], [0.5, 0.38, 0.42]);
        this.cylinder(origin, yaw, s, 'rustedMetal', [0.34, 0.86, 0], [0.32, 0.34, 0.32], null, { radialSegments: 12 });
        for (const x of [-0.48, 0.48]) {
          this.torus(origin, yaw, s, 'rubber', [x, 0.17, 0.24], [0.22, 0.22, 0.22], [0, Math.PI * 0.5, 0]);
        }
        this.cylinder(origin, yaw, s, 'bareMetal', [0.48, 1.08, 0], [0.06, 0.52, 0.06], [0, 0, -0.45], { radialSegments: 8 });
        break;
      }
      default:
        throw new Error(`Unknown prop archetype: ${type}`);
    }
  }

  place(type, position, yaw = 0, scale = 1, options = {}) {
    if (!PROP_ARCHETYPES.includes(type)) {
      throw new Error(`Unknown prop archetype: ${type}`);
    }
    this.addRecipe(type, position, yaw, scale);
    this.propCount += 1;
    this.placedArchetypes.add(type);
    this.addCollider(type, position, yaw, scale, options);
    return {
      id: `prop-instance:${this.propCount - 1}`,
      type,
      position: position.clone(),
      yaw,
      scale,
    };
  }
}
