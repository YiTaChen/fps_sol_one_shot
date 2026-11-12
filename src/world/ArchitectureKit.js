import * as THREE from 'three';
import { createBeveledMesh } from './geometry/GeometryKit.js';
import {
  addCoverPoint,
  createBoxCollider,
  localToWorld,
  localYawToQuaternion,
} from './WorldMath.js';

export const ARCHITECTURAL_MODULE_TYPES = Object.freeze([
  'foundation',
  'wall-segment',
  'corner-pier',
  'floor-slab',
  'roof-slab',
  'parapet',
  'coping',
  'recessed-window',
  'barred-window',
  'shuttered-window',
  'door-frame',
  'door-leaf',
  'rolling-shutter',
  'storefront',
  'awning',
  'balcony',
  'railing',
  'exterior-stair',
  'air-conditioner',
  'wall-vent',
  'drainpipe',
  'blade-sign',
  'fascia-sign',
  'roof-water-tank',
  'antenna',
  'skylight',
  'curb',
  'gutter',
  'electrical-box',
  'conduit',
  'wall-lamp',
  'loading-canopy',
  'roof-screen',
  'arcade-column',
]);

export const FACADE_FAMILIES = Object.freeze({
  marketArcade: Object.freeze({
    id: 'marketArcade',
    wall: 'plasterOchre',
    accent: 'wood',
    trim: 'paintedMetal',
    base: 'ceramic',
    roof: 'concreteAggregate',
    window: 'glass',
  }),
  corrugatedWorkshop: Object.freeze({
    id: 'corrugatedWorkshop',
    wall: 'concreteAggregate',
    accent: 'rustedMetal',
    trim: 'bareMetal',
    base: 'concreteClean',
    roof: 'paintedMetal',
    window: 'glass',
  }),
  stuccoBalcony: Object.freeze({
    id: 'stuccoBalcony',
    wall: 'plasterBlue',
    accent: 'paintedMetal',
    trim: 'concreteClean',
    base: 'concreteAggregate',
    roof: 'concreteClean',
    window: 'glass',
  }),
  brickWarehouse: Object.freeze({
    id: 'brickWarehouse',
    wall: 'brick',
    accent: 'rustedMetal',
    trim: 'concreteClean',
    base: 'concreteAggregate',
    roof: 'paintedMetal',
    window: 'glass',
  }),
  concreteShopfront: Object.freeze({
    id: 'concreteShopfront',
    wall: 'concreteClean',
    accent: 'paintedMetal',
    trim: 'concreteAggregate',
    base: 'ceramic',
    roof: 'concreteAggregate',
    window: 'glass',
  }),
  tiledCafe: Object.freeze({
    id: 'tiledCafe',
    wall: 'plasterOchre',
    accent: 'fabric',
    trim: 'wood',
    base: 'ceramic',
    roof: 'concreteClean',
    window: 'glass',
  }),
  shutteredDepot: Object.freeze({
    id: 'shutteredDepot',
    wall: 'plasterBlue',
    accent: 'paintedMetal',
    trim: 'rustedMetal',
    base: 'concreteAggregate',
    roof: 'concreteClean',
    window: 'glass',
  }),
  glassOffice: Object.freeze({
    id: 'glassOffice',
    wall: 'concreteAggregate',
    accent: 'glass',
    trim: 'bareMetal',
    base: 'concreteClean',
    roof: 'paintedMetal',
    window: 'glass',
  }),
});

const WALL_THICKNESS = 0.28;
const FLOOR_HEIGHT = 3.15;
const _worldPosition = new THREE.Vector3();
const _worldQuaternion = new THREE.Quaternion();
const _localQuaternion = new THREE.Quaternion();
const _parentQuaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _local = new THREE.Vector3();
const _normal = new THREE.Vector3();

function materialSurface(materials, materialId) {
  return materials.get(materialId)?.userData?.surface ?? materialId;
}

function facadeOpenings(spec, floor, height) {
  const halfWidth = spec.width * 0.5;
  const openings = [];
  if (floor === 0) {
    const doorX = spec.doorX ?? -spec.width * 0.26;
    openings.push({
      type: 'door',
      x: doorX,
      width: 1.55,
      bottom: 0,
      height: 2.48,
      open: Boolean(spec.enterable),
    });

    if (spec.family === 'corrugatedWorkshop' || spec.family === 'shutteredDepot' || spec.freightEntry) {
      openings.push({
        type: 'shutter',
        x: Math.min(halfWidth - 2.6, spec.width * 0.12),
        width: Math.min(4.6, spec.width * 0.42),
        bottom: 0.03,
        height: 2.62,
        open: Boolean(spec.enterable && (spec.family === 'corrugatedWorkshop' || spec.freightEntry)),
      });
    } else {
      openings.push({
        type: 'storefront',
        x: Math.min(halfWidth - 2.2, spec.width * 0.12),
        width: Math.min(3.8, spec.width * 0.36),
        bottom: 0.42,
        height: 2.05,
        open: false,
      });
    }
  } else {
    const margin = 1.35;
    const spacing = spec.family === 'brickWarehouse' ? 3.8 : 3.2;
    const count = Math.max(2, Math.floor((spec.width - margin * 2) / spacing));
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      openings.push({
        type:
          spec.family === 'shutteredDepot' || (spec.variant + i + floor) % 4 === 0
            ? 'shutteredWindow'
            : spec.family === 'brickWarehouse'
              ? 'barredWindow'
              : 'window',
        x: -halfWidth + margin + t * (spec.width - margin * 2),
        width: spec.family === 'brickWarehouse' ? 1.35 : 1.15,
        bottom: 0.72,
        height: Math.min(1.55, height - 1.1),
        open: false,
      });
    }
  }
  return openings
    .filter((opening) => opening.x - opening.width * 0.5 > -halfWidth + 0.3)
    .filter((opening) => opening.x + opening.width * 0.5 < halfWidth - 0.3)
    .sort((a, b) => a.x - b.x);
}

function composeWorldTransform(spec, localPosition, localEuler = null) {
  localToWorld(localPosition, spec.position, spec.yaw, _worldPosition);
  _parentQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, spec.yaw);
  if (localEuler) {
    _localQuaternion.setFromEuler(localEuler);
    _worldQuaternion.copy(_parentQuaternion).multiply(_localQuaternion);
  } else {
    _worldQuaternion.copy(_parentQuaternion);
  }
  return {
    position: _worldPosition,
    quaternion: _worldQuaternion,
  };
}

export class ArchitectureKit {
  constructor({
    root,
    materials,
    geometryKit,
    batcher,
    colliders,
    coverPoints,
  }) {
    this.root = root;
    this.materials = materials;
    this.geometryKit = geometryKit;
    this.batcher = batcher;
    this.colliders = colliders;
    this.coverPoints = coverPoints;
    this.usedModules = new Set();
    this.buildings = [];
    this.colliderIndex = 0;
  }

  use(moduleName) {
    this.usedModules.add(moduleName);
  }

  addBox(group, spec, materialId, size, localPosition, options = {}) {
    const mesh = createBeveledMesh(
      this.geometryKit,
      this.materials,
      materialId,
      size,
      localPosition,
      {
        radius:
          options.radius ??
          Math.min(0.055, Math.min(size.x, size.y, size.z) * 0.12),
        castShadow: options.castShadow ?? false,
        receiveShadow: options.receiveShadow ?? true,
        name: options.name,
      },
    );
    if (options.localEuler) {
      mesh.rotation.copy(options.localEuler);
    }
    group.add(mesh);
    if (options.module) {
      this.use(options.module);
      mesh.userData.module = options.module;
    }
    if (options.collider) {
      const transform = composeWorldTransform(spec, localPosition, options.localEuler);
      const collider = createBoxCollider({
        id: `architecture:${this.colliderIndex++}`,
        center: transform.position,
        size,
        yaw: spec.yaw + (options.localEuler?.y ?? 0),
        material: materialSurface(this.materials, materialId),
        object: mesh,
        tags: ['architecture', options.module ?? 'part'],
      });
      this.colliders.push(collider);
    }
    return mesh;
  }

  addInstance(
    spec,
    materialId,
    size,
    localPosition,
    options = {},
  ) {
    const transform = composeWorldTransform(spec, localPosition, options.localEuler);
    _scale.copy(size);
    this.batcher.box(
      materialId,
      transform.position,
      transform.quaternion,
      _scale,
      {
        name: options.module ?? 'architecture-detail',
        castShadow: options.castShadow ?? false,
        receiveShadow: options.receiveShadow ?? true,
        radius: options.radius ?? 0.035,
      },
    );
    if (options.module) {
      this.use(options.module);
    }
  }

  addCylinder(
    spec,
    materialId,
    scale,
    localPosition,
    options = {},
  ) {
    const transform = composeWorldTransform(spec, localPosition, options.localEuler);
    this.batcher.cylinder(
      materialId,
      transform.position,
      transform.quaternion,
      scale,
      {
        name: options.module ?? 'architecture-cylinder',
        castShadow: options.castShadow ?? false,
        radialSegments: options.radialSegments ?? 10,
      },
    );
    if (options.module) {
      this.use(options.module);
    }
  }

  addProfile(
    spec,
    materialId,
    points,
    depth,
    localPosition,
    options = {},
  ) {
    const transform = composeWorldTransform(spec, localPosition, options.localEuler);
    const geometry = this.geometryKit.profile(
      points,
      depth,
      options.bevel ?? 0.018,
      options.bevelSegments ?? 2,
    );
    this.batcher.add(
      geometry,
      materialId,
      transform.position,
      transform.quaternion,
      options.scale ?? _scale.set(1, 1, 1),
      {
        name: options.module ?? 'architecture-profile',
        castShadow: options.castShadow ?? false,
        receiveShadow: options.receiveShadow ?? true,
      },
    );
    if (options.module) {
      this.use(options.module);
    }
  }

  addFacadeSegment(group, spec, family, size, localPosition) {
    this.addInstance(spec, family.wall, size, localPosition, {
      radius: 0.012,
      module: 'wall-segment',
    });
    const transform = composeWorldTransform(spec, localPosition);
    this.colliders.push(
      createBoxCollider({
        id: `architecture:${this.colliderIndex++}`,
        center: transform.position,
        size,
        yaw: spec.yaw,
        material: materialSurface(this.materials, family.wall),
        tags: ['architecture', 'wall-segment', 'facade'],
      }),
    );
    return null;
  }

  addOpeningDetails(group, spec, family, opening, floorBase, frontZ) {
    const centerY = floorBase + opening.bottom + opening.height * 0.5;
    const edgeZ = frontZ + WALL_THICKNESS * 0.58;
    const insetZ = frontZ - WALL_THICKNESS * 0.62;
    const frameThickness = opening.type === 'shutter' ? 0.14 : 0.095;
    const frameDepth = 0.14;
    const topY = floorBase + opening.bottom + opening.height;
    const bottomY = floorBase + opening.bottom;

    this.addInstance(
      spec,
      family.trim,
      _scale.set(frameThickness, opening.height + 0.18, frameDepth),
      _local.set(opening.x - opening.width * 0.5 - frameThickness * 0.5, centerY, edgeZ),
      { module: opening.type.includes('window') ? 'recessed-window' : 'door-frame' },
    );
    this.addInstance(
      spec,
      family.trim,
      _scale.set(frameThickness, opening.height + 0.18, frameDepth),
      _local.set(opening.x + opening.width * 0.5 + frameThickness * 0.5, centerY, edgeZ),
      { module: opening.type.includes('window') ? 'recessed-window' : 'door-frame' },
    );
    this.addInstance(
      spec,
      family.trim,
      _scale.set(opening.width + frameThickness * 2, frameThickness, frameDepth),
      _local.set(opening.x, topY + frameThickness * 0.5, edgeZ),
      { module: opening.type.includes('window') ? 'recessed-window' : 'door-frame' },
    );
    if (opening.type !== 'door') {
      this.addInstance(
        spec,
        family.trim,
        _scale.set(opening.width + frameThickness * 2, frameThickness, frameDepth + 0.12),
        _local.set(opening.x, bottomY - frameThickness * 0.5, edgeZ + 0.035),
        { module: 'recessed-window' },
      );
      if (spec.family === 'marketArcade' && opening.type.includes('window')) {
        this.addInstance(
          spec,
          family.accent,
          _scale.set(opening.width + 0.34, 0.115, frameDepth + 0.18),
          _local.set(opening.x, topY + 0.16, edgeZ + 0.065),
          { module: 'recessed-window', radius: 0.026 },
        );
        this.addProfile(
          spec,
          family.trim,
          [
            [-0.095, -0.12],
            [0.095, -0.12],
            [0.13, 0.03],
            [0, 0.16],
            [-0.13, 0.03],
          ],
          0.18,
          _local.set(opening.x, topY + 0.19, edgeZ + 0.13),
          { module: 'recessed-window', bevel: 0.012 },
        );
      }
    } else {
      this.addInstance(
        spec,
        family.base,
        _scale.set(opening.width + 0.18, 0.075, 0.42),
        _local.set(opening.x, floorBase + 0.035, frontZ + 0.06),
        { module: 'door-frame' },
      );
    }

    if (opening.type === 'door') {
      if (opening.open) {
        const doorSize = new THREE.Vector3(opening.width * 0.92, opening.height * 0.94, 0.08);
        const doorPosition = new THREE.Vector3(
          opening.x - opening.width * 0.48,
          centerY,
          insetZ - opening.width * 0.42,
        );
        this.addBox(group, spec, family.accent, doorSize, doorPosition, {
          localEuler: new THREE.Euler(0, Math.PI * 0.48, 0),
          radius: 0.018,
          module: 'door-leaf',
        });
        this.addCylinder(
          spec,
          'bareMetal',
          _scale.set(0.055, 0.13, 0.055),
          _local.set(opening.x - opening.width * 0.04, centerY, insetZ - opening.width * 0.82),
          {
            localEuler: new THREE.Euler(Math.PI * 0.5, 0, 0),
            module: 'door-leaf',
            radialSegments: 8,
          },
        );
      } else {
        this.addBox(
          group,
          spec,
          family.accent,
          new THREE.Vector3(opening.width * 0.92, opening.height * 0.94, 0.085),
          new THREE.Vector3(opening.x, centerY, insetZ),
          {
            radius: 0.018,
            collider: true,
            module: 'door-leaf',
          },
        );
        this.addCylinder(
          spec,
          'bareMetal',
          _scale.set(0.055, 0.13, 0.055),
          _local.set(opening.x + opening.width * 0.32, centerY, insetZ + 0.08),
          {
            localEuler: new THREE.Euler(Math.PI * 0.5, 0, 0),
            module: 'door-leaf',
            radialSegments: 8,
          },
        );
      }
      return;
    }

    if (opening.type === 'shutter') {
      if (!opening.open) {
        const geometry = this.geometryKit.corrugatedPanel(
          opening.width * 0.94,
          opening.height * 0.94,
          0.075,
          Math.max(10, Math.floor(opening.width * 5)),
        );
        const mesh = new THREE.Mesh(geometry, this.materials.get(family.accent));
        mesh.position.set(opening.x, centerY, insetZ);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.name = 'module:rolling-shutter';
        mesh.userData.module = 'rolling-shutter';
        group.add(mesh);
        this.use('rolling-shutter');
        const transform = composeWorldTransform(spec, mesh.position);
        this.colliders.push(
          createBoxCollider({
            id: `architecture:${this.colliderIndex++}`,
            center: transform.position,
            size: new THREE.Vector3(opening.width, opening.height, 0.12),
            yaw: spec.yaw,
            material: 'metal',
            object: mesh,
            tags: ['architecture', 'rolling-shutter'],
          }),
        );
      } else {
        this.addInstance(
          spec,
          family.accent,
          _scale.set(opening.width, 0.34, 0.32),
          _local.set(opening.x, topY - 0.17, insetZ),
          { module: 'rolling-shutter' },
        );
      }
      return;
    }

    this.addBox(
      group,
      spec,
      family.window,
      new THREE.Vector3(opening.width * 0.94, opening.height * 0.94, 0.035),
      new THREE.Vector3(opening.x, centerY, insetZ),
      {
        radius: 0.008,
        collider: true,
        module: opening.type === 'storefront' ? 'storefront' : 'recessed-window',
      },
    );

    if (opening.type === 'storefront') {
      this.addInstance(
        spec,
        family.trim,
        _scale.set(0.075, opening.height, 0.09),
        _local.set(opening.x, centerY, edgeZ),
        { module: 'storefront' },
      );
    } else if (opening.type === 'barredWindow') {
      for (let bar = -2; bar <= 2; bar += 1) {
        this.addCylinder(
          spec,
          'bareMetal',
          _scale.set(0.032, opening.height * 1.04, 0.032),
          _local.set(opening.x + bar * opening.width * 0.19, centerY, edgeZ + 0.06),
          { module: 'barred-window', radialSegments: 6 },
        );
      }
      for (let bar = -1; bar <= 1; bar += 2) {
        this.addCylinder(
          spec,
          'bareMetal',
          _scale.set(0.032, opening.width * 1.06, 0.032),
          _local.set(opening.x, centerY + bar * opening.height * 0.28, edgeZ + 0.06),
          {
            localEuler: new THREE.Euler(0, 0, Math.PI * 0.5),
            module: 'barred-window',
            radialSegments: 6,
          },
        );
      }
    } else if (opening.type === 'shutteredWindow') {
      for (const side of [-1, 1]) {
        this.addInstance(
          spec,
          family.accent,
          _scale.set(opening.width * 0.42, opening.height, 0.065),
          _local.set(
            opening.x + side * opening.width * 0.74,
            centerY,
            edgeZ + 0.01,
          ),
          {
            localEuler: new THREE.Euler(0, side * -0.18, 0),
            module: 'shuttered-window',
          },
        );
      }
    }
  }

  buildFacadeFloor(group, spec, family, floor) {
    const floorBase = floor * FLOOR_HEIGHT;
    const courseHeight =
      floor === spec.stories - 1
        ? spec.height - floorBase
        : Math.min(FLOOR_HEIGHT, spec.height - floorBase);
    const frontZ = spec.depth * 0.5;
    const openings = facadeOpenings(spec, floor, courseHeight);
    const halfWidth = spec.width * 0.5;
    let cursor = -halfWidth;

    for (const opening of openings) {
      const left = opening.x - opening.width * 0.5;
      if (left > cursor) {
        const width = left - cursor;
        this.addFacadeSegment(
          group,
          spec,
          family,
          new THREE.Vector3(width, courseHeight, WALL_THICKNESS),
          new THREE.Vector3(cursor + width * 0.5, floorBase + courseHeight * 0.5, frontZ),
        );
      }

      const belowHeight = opening.bottom;
      if (belowHeight > 0.02) {
        this.addFacadeSegment(
          group,
          spec,
          family,
          new THREE.Vector3(opening.width, belowHeight, WALL_THICKNESS),
          new THREE.Vector3(
            opening.x,
            floorBase + belowHeight * 0.5,
            frontZ,
          ),
        );
      }
      const openingTop = opening.bottom + opening.height;
      const aboveHeight = courseHeight - openingTop;
      if (aboveHeight > 0.02) {
        this.addFacadeSegment(
          group,
          spec,
          family,
          new THREE.Vector3(opening.width, aboveHeight, WALL_THICKNESS),
          new THREE.Vector3(
            opening.x,
            floorBase + openingTop + aboveHeight * 0.5,
            frontZ,
          ),
        );
      }
      this.addOpeningDetails(group, spec, family, opening, floorBase, frontZ);
      cursor = opening.x + opening.width * 0.5;
    }

    if (cursor < halfWidth) {
      const width = halfWidth - cursor;
      this.addFacadeSegment(
        group,
        spec,
        family,
        new THREE.Vector3(width, courseHeight, WALL_THICKNESS),
        new THREE.Vector3(cursor + width * 0.5, floorBase + courseHeight * 0.5, frontZ),
      );
    }
  }

  addRail(spec, x, y, z, width, module = 'railing') {
    this.addInstance(
      spec,
      'bareMetal',
      _scale.set(width, 0.055, 0.055),
      _local.set(x, y, z),
      { module },
    );
  }

  addFamilyDetails(group, spec, family) {
    const front = spec.depth * 0.5;
    const top = spec.height;

    const halfFoundation = spec.width * 0.5 + 0.09;
    const foundationRuns = [];
    let edge = -halfFoundation;
    if (spec.rearPassage) {
      for (const opening of facadeOpenings(spec, 0, FLOOR_HEIGHT)) {
        if (!opening.open) continue;
        foundationRuns.push([edge, opening.x - opening.width * 0.5 - 0.055]);
        edge = opening.x + opening.width * 0.5 + 0.055;
      }
    }
    foundationRuns.push([edge, halfFoundation]);
    for (const [from, to] of foundationRuns) {
      this.addInstance(
        spec,
        family.base,
        _scale.set(to - from, 0.42, 0.42),
        _local.set((from + to) * 0.5, 0.23, front + 0.02),
        { module: 'foundation' },
      );
    }
    this.addInstance(
      spec,
      family.trim,
      _scale.set(spec.width + 0.34, 0.14, 0.42),
      _local.set(0, top + 0.58, front),
      { module: 'coping' },
    );
    this.addInstance(
      spec,
      family.wall,
      _scale.set(spec.width + 0.08, 0.78, 0.28),
      _local.set(0, top + 0.23, front),
      { module: 'parapet' },
    );

    // Side-wall bays and string courses stop even secondary elevations from
    // reading as a single decorated cuboid. They are intentionally shallow so
    // they add highlight response without changing collision envelopes.
    for (const side of [-1, 1]) {
      const sideX = side * (spec.width * 0.5 + 0.055);
      for (const z of [-spec.depth * 0.31, 0, spec.depth * 0.31]) {
        this.addInstance(
          spec,
          family.trim,
          _scale.set(0.16, Math.max(2.2, top * 0.78), 0.28),
          _local.set(sideX, Math.max(2.2, top * 0.78) * 0.5 + 0.18, z),
          { module: 'corner-pier', radius: 0.035 },
        );
      }
      for (let floor = 1; floor <= spec.stories; floor += 1) {
        this.addInstance(
          spec,
          family.base,
          _scale.set(0.18, 0.14, spec.depth * 0.86),
          _local.set(sideX, Math.min(top + 0.22, floor * FLOOR_HEIGHT + 0.025), 0),
          { module: 'coping', radius: 0.026 },
        );
      }
    }

    switch (spec.family) {
      case 'marketArcade': {
        const awningY = 2.72;
        this.addBox(
          group,
          spec,
          'fabric',
          new THREE.Vector3(spec.width * 0.62, 0.09, 2.1),
          new THREE.Vector3(spec.width * 0.08, awningY, front + 0.88),
          {
            localEuler: new THREE.Euler(-0.17, 0, 0),
            radius: 0.025,
            module: 'awning',
          },
        );
        for (const x of [-spec.width * 0.22, spec.width * 0.38]) {
          this.addCylinder(
            spec,
            'bareMetal',
            _scale.set(0.09, 2.72, 0.09),
            _local.set(x, 1.36, front + 1.58),
            { module: 'arcade-column', radialSegments: 10 },
          );
        }
        this.addInstance(
          spec,
          'wood',
          _scale.set(spec.width * 0.52, 0.74, 0.09),
          _local.set(spec.width * 0.08, 3.06, front + 0.3),
          { module: 'fascia-sign' },
        );
        this.addInstance(
          spec,
          'ceramic',
          _scale.set(spec.width * 0.96, 0.18, 0.22),
          _local.set(0, FLOOR_HEIGHT + 0.03, front + 0.15),
          { module: 'coping' },
        );
        this.addInstance(
          spec,
          'wood',
          _scale.set(spec.width * 0.94, 0.12, 0.34),
          _local.set(0, FLOOR_HEIGHT + 0.19, front + 0.21),
          { module: 'coping', radius: 0.032 },
        );
        for (const x of [-spec.width * 0.28, 0, spec.width * 0.28]) {
          this.addInstance(
            spec,
            'concreteAggregate',
            _scale.set(0.22, Math.max(1.8, top - FLOOR_HEIGHT - 0.48), 0.32),
            _local.set(
              x,
              FLOOR_HEIGHT + Math.max(1.8, top - FLOOR_HEIGHT - 0.48) * 0.5 + 0.18,
              front + 0.15,
            ),
            { module: 'corner-pier', radius: 0.04 },
          );
        }
        for (const x of [-spec.width * 0.5 + 0.26, spec.width * 0.5 - 0.26]) {
          this.addInstance(
            spec,
            'concreteAggregate',
            _scale.set(0.42, Math.min(top, FLOOR_HEIGHT) + 0.18, 0.42),
            _local.set(x, Math.min(top, FLOOR_HEIGHT) * 0.5, front + 0.08),
            { module: 'corner-pier' },
          );
          this.addInstance(
            spec,
            'ceramic',
            _scale.set(0.5, 0.36, 0.48),
            _local.set(x, 0.38, front + 0.11),
            { module: 'foundation' },
          );
        }
        for (let tab = -5; tab <= 5; tab += 1) {
          this.addProfile(
            spec,
            tab % 2 === 0 ? 'fabric' : 'plasterOchre',
            [
              [-spec.width * 0.026, 0.16],
              [spec.width * 0.026, 0.16],
              [spec.width * 0.024, -0.06],
              [spec.width * 0.013, -0.22],
              [0, -0.3],
              [-spec.width * 0.013, -0.22],
              [-spec.width * 0.024, -0.06],
            ],
            0.09,
            _local.set(
              spec.width * 0.08 + tab * spec.width * 0.056,
              awningY - 0.16,
              front + 1.92,
            ),
            {
              localEuler: new THREE.Euler(0.06, 0, tab * 0.004),
              module: 'awning',
              bevel: 0.016,
            },
          );
        }
        for (const x of [-spec.width * 0.22, spec.width * 0.38]) {
          this.addInstance(
            spec,
            'bareMetal',
            _scale.set(0.065, 0.065, 1.55),
            _local.set(x, 2.62, front + 0.82),
            {
              localEuler: new THREE.Euler(0.18, 0, 0),
              module: 'awning',
            },
          );
          this.addInstance(
            spec,
            'bareMetal',
            _scale.set(0.055, 0.72, 0.055),
            _local.set(x, 2.42, front + 0.34),
            {
              localEuler: new THREE.Euler(0, 0, 0.48),
              module: 'awning',
            },
          );
        }
        this.addInstance(
          spec,
          'paintedMetal',
          _scale.set(0.72, 1.08, 0.09),
          _local.set(-spec.width * 0.39, 2.04, front + 0.52),
          {
            localEuler: new THREE.Euler(0, -0.12, -0.035),
            module: 'blade-sign',
          },
        );
        this.addInstance(
          spec,
          'lamp',
          _scale.set(0.42, 0.1, 0.035),
          _local.set(-spec.width * 0.39, 2.08, front + 0.59),
          { module: 'blade-sign' },
        );
        this.addProfile(
          spec,
          family.trim,
          [
            [-1.7, -0.25],
            [1.7, -0.25],
            [1.2, 0.18],
            [0, 0.82],
            [-1.2, 0.18],
          ],
          0.34,
          _local.set(0, top + 1.02, front + 0.08),
          {
            module: 'parapet',
            bevel: 0.045,
            bevelSegments: 2,
            castShadow: true,
          },
        );
        for (const x of [-spec.width * 0.38, spec.width * 0.38]) {
          this.addInstance(
            spec,
            family.accent,
            _scale.set(1.45, 0.42, 0.38),
            _local.set(x, top + 0.93, front + 0.07),
            { module: 'parapet', radius: 0.07 },
          );
        }
        break;
      }
      case 'corrugatedWorkshop': {
        const geometry = this.geometryKit.corrugatedPanel(spec.width * 0.86, 1.18, 0.075, 34);
        const panel = new THREE.Mesh(geometry, this.materials.get('paintedMetal'));
        panel.position.set(0, top - 0.78, front + 0.18);
        panel.receiveShadow = true;
        panel.name = 'module:roof-screen';
        group.add(panel);
        this.use('roof-screen');
        this.addBox(
          group,
          spec,
          'paintedMetal',
          new THREE.Vector3(spec.width * 0.58, 0.12, 2.25),
          new THREE.Vector3(spec.width * 0.08, 2.91, front + 0.94),
          {
            localEuler: new THREE.Euler(-0.1, 0, 0),
            radius: 0.025,
            module: 'loading-canopy',
          },
        );
        break;
      }
      case 'stuccoBalcony': {
        if (spec.stories > 1) {
          const balconyY = FLOOR_HEIGHT + 0.36;
          this.addBox(
            group,
            spec,
            'concreteAggregate',
            new THREE.Vector3(spec.width * 0.62, 0.18, 1.28),
            new THREE.Vector3(0, balconyY, front + 0.56),
            { radius: 0.035, collider: true, module: 'balcony' },
          );
          this.addRail(spec, 0, balconyY + 0.95, front + 1.17, spec.width * 0.62);
          for (let i = -3; i <= 3; i += 1) {
            this.addCylinder(
              spec,
              'bareMetal',
              _scale.set(0.035, 0.92, 0.035),
              _local.set(i * spec.width * 0.085, balconyY + 0.5, front + 1.17),
              { module: 'railing', radialSegments: 6 },
            );
          }
        }
        break;
      }
      case 'brickWarehouse': {
        for (const x of [-spec.width * 0.5 + 0.42, 0, spec.width * 0.5 - 0.42]) {
          this.addInstance(
            spec,
            'concreteClean',
            _scale.set(0.48, top + 0.84, 0.48),
            _local.set(x, (top + 0.84) * 0.5, front + 0.08),
            { module: 'corner-pier' },
          );
        }
        this.addInstance(
          spec,
          'rustedMetal',
          _scale.set(spec.width * 0.48, 0.64, 0.1),
          _local.set(0.08, 3.0, front + 0.28),
          { module: 'fascia-sign' },
        );
        break;
      }
      case 'concreteShopfront': {
        for (const x of [-spec.width * 0.42, spec.width * 0.42]) {
          this.addInstance(
            spec,
            'concreteAggregate',
            _scale.set(0.68, 3.18, 0.72),
            _local.set(x, 1.59, front + 0.24),
            { module: 'corner-pier' },
          );
        }
        this.addInstance(
          spec,
          'paintedMetal',
          _scale.set(spec.width * 0.62, 0.58, 0.12),
          _local.set(0.05, 2.95, front + 0.38),
          { module: 'fascia-sign' },
        );
        break;
      }
      case 'tiledCafe': {
        this.addBox(
          group,
          spec,
          'fabric',
          new THREE.Vector3(spec.width * 0.68, 0.08, 2.3),
          new THREE.Vector3(spec.width * 0.06, 2.75, front + 0.96),
          {
            localEuler: new THREE.Euler(-0.2, 0, 0),
            radius: 0.024,
            module: 'awning',
          },
        );
        this.addInstance(
          spec,
          'ceramic',
          _scale.set(spec.width * 0.96, 0.82, 0.11),
          _local.set(0, 0.56, front + 0.19),
          { module: 'storefront' },
        );
        break;
      }
      case 'shutteredDepot': {
        const signX = spec.width * 0.36;
        this.addInstance(
          spec,
          'paintedMetal',
          _scale.set(1.35, 0.75, 0.09),
          _local.set(signX, 3.03, front + 0.29),
          {
            localEuler: new THREE.Euler(0, 0.18, -0.035),
            module: 'blade-sign',
          },
        );
        this.addBox(
          group,
          spec,
          'paintedMetal',
          new THREE.Vector3(spec.width * 0.54, 0.09, 1.8),
          new THREE.Vector3(0.08, 2.88, front + 0.82),
          {
            localEuler: new THREE.Euler(-0.09, 0, 0),
            radius: 0.022,
            module: 'loading-canopy',
          },
        );
        break;
      }
      case 'glassOffice': {
        if (spec.stories > 1) {
          for (let x = -spec.width * 0.4; x <= spec.width * 0.4; x += 1.35) {
            this.addInstance(
              spec,
              'bareMetal',
              _scale.set(0.11, top - 1.15, 0.3),
              _local.set(x, top * 0.5 + 0.45, front + 0.24),
              { module: 'roof-screen' },
            );
          }
          this.addBox(
            group,
            spec,
            'glass',
            new THREE.Vector3(spec.width * 0.83, top - 3.5, 0.045),
            new THREE.Vector3(0, (top + 3.2) * 0.5, front + 0.08),
            { radius: 0.008, collider: true, module: 'storefront' },
          );
        }
        break;
      }
      default:
        break;
    }
  }

  addUtilities(spec, family) {
    const side = spec.variant % 2 === 0 ? 1 : -1;
    const front = spec.depth * 0.5;
    const utilityX = side * (spec.width * 0.5 - 0.72);
    this.addInstance(
      spec,
      'paintedMetal',
      _scale.set(0.86, 0.54, 0.38),
      _local.set(utilityX, 2.6, front + 0.34),
      { module: 'air-conditioner' },
    );
    for (let rib = -2; rib <= 2; rib += 1) {
      this.addInstance(
        spec,
        'bareMetal',
        _scale.set(0.62, 0.025, 0.025),
        _local.set(utilityX, 2.6 + rib * 0.075, front + 0.545),
        { module: 'wall-vent' },
      );
    }
    this.addCylinder(
      spec,
      spec.variant % 3 === 0 ? 'rustedMetal' : 'paintedMetal',
      _scale.set(0.085, spec.height * 0.9, 0.085),
      _local.set(-side * (spec.width * 0.5 - 0.38), spec.height * 0.46, front + 0.27),
      { module: 'drainpipe', radialSegments: 8 },
    );
    this.addInstance(
      spec,
      'paintedMetal',
      _scale.set(0.48, 0.62, 0.18),
      _local.set(utilityX - side * 1.02, 1.14, front + 0.25),
      { module: 'electrical-box' },
    );
    this.addCylinder(
      spec,
      'bareMetal',
      _scale.set(0.035, 1.05, 0.035),
      _local.set(utilityX - side * 1.02, 1.95, front + 0.28),
      { module: 'conduit', radialSegments: 6 },
    );
    this.addInstance(
      spec,
      'lamp',
      _scale.set(0.28, 0.22, 0.24),
      _local.set(spec.doorX ?? -spec.width * 0.26, 2.88, front + 0.34),
      { module: 'wall-lamp' },
    );

    if (spec.variant % 2 === 0) {
      this.addCylinder(
        spec,
        'paintedMetal',
        _scale.set(0.78, 1.12, 0.78),
        _local.set(spec.width * 0.18, spec.height + 1.06, -spec.depth * 0.08),
        { module: 'roof-water-tank', radialSegments: 16, castShadow: true },
      );
      this.addCylinder(
        spec,
        'bareMetal',
        _scale.set(0.05, 2.1, 0.05),
        _local.set(-spec.width * 0.18, spec.height + 1.35, 0),
        { module: 'antenna', radialSegments: 6 },
      );
      for (let rung = 0; rung < 4; rung += 1) {
        this.addInstance(
          spec,
          'bareMetal',
          _scale.set(0.7 - rung * 0.1, 0.035, 0.035),
          _local.set(-spec.width * 0.18, spec.height + 0.8 + rung * 0.38, 0),
          { module: 'antenna' },
        );
      }
    } else {
      this.addInstance(
        spec,
        'glass',
        _scale.set(1.4, 0.34, 1.05),
        _local.set(spec.width * 0.08, spec.height + 0.34, 0),
        {
          localEuler: new THREE.Euler(0, 0.1, 0),
          module: 'skylight',
        },
      );
    }
  }

  addCornerCover(spec) {
    const frontOffset = spec.depth * 0.5 + 0.68;
    const halfWidth = spec.width * 0.5;
    for (const side of [-1, 1]) {
      localToWorld(
        _local.set(side * (halfWidth + 0.54), 0.05, frontOffset),
        spec.position,
        spec.yaw,
        _worldPosition,
      );
      _normal.set(side, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, spec.yaw);
      addCoverPoint(this.coverPoints, _worldPosition, _normal, {
        id: `building-corner:${spec.id}:${side}`,
        height: 1.7,
        width: 0.9,
        stance: 'stand',
        kind: 'corner',
        score: 1.25,
      });
    }
  }

  buildRearWall(group, spec, family) {
    const rear = -spec.depth * 0.5;
    const passage = spec.rearPassage;
    const addWall = (width, height, x, y) => {
      this.addBox(
        group,
        spec,
        family.wall,
        new THREE.Vector3(width, height, WALL_THICKNESS),
        new THREE.Vector3(x, y, rear),
        { radius: 0.018, collider: true, module: 'wall-segment' },
      );
    };
    if (!passage) {
      addWall(spec.width, spec.height, 0, spec.height * 0.5);
      return;
    }

    const left = passage.x - passage.width * 0.5;
    const right = passage.x + passage.width * 0.5;
    const halfWidth = spec.width * 0.5;
    const openingHeight = 2.62;
    addWall(left + halfWidth, spec.height, (left - halfWidth) * 0.5, spec.height * 0.5);
    addWall(halfWidth - right, spec.height, (right + halfWidth) * 0.5, spec.height * 0.5);
    addWall(passage.width, spec.height - openingHeight, passage.x, (spec.height + openingHeight) * 0.5);

    for (const edge of [left, right]) {
      this.addInstance(
        spec, family.trim,
        _scale.set(0.14, openingHeight, 0.48),
        _local.set(edge, openingHeight * 0.5, rear),
        { module: 'door-frame' },
      );
    }
    this.addInstance(
      spec, family.trim,
      _scale.set(passage.width + 0.14, 0.16, 0.48),
      _local.set(passage.x, openingHeight, rear),
      { module: 'door-frame' },
    );
  }

  buildBuilding(inputSpec) {
    const family = FACADE_FAMILIES[inputSpec.family];
    if (!family) {
      throw new Error(`Unknown façade family: ${inputSpec.family}`);
    }
    const spec = {
      id: inputSpec.id,
      position: inputSpec.position.clone(),
      yaw: inputSpec.yaw ?? 0,
      width: inputSpec.width,
      depth: inputSpec.depth,
      stories: inputSpec.stories,
      height: inputSpec.height ?? inputSpec.stories * FLOOR_HEIGHT,
      family: inputSpec.family,
      enterable: Boolean(inputSpec.enterable),
      doorX: inputSpec.doorX,
      rearPassage: inputSpec.rearPassage,
      freightEntry: Boolean(inputSpec.freightEntry),
      variant: inputSpec.variant ?? 0,
    };
    const group = new THREE.Group();
    group.name = `building:${spec.id}:${spec.family}`;
    group.position.copy(spec.position);
    group.rotation.y = spec.yaw;
    group.userData.family = spec.family;
    group.userData.enterable = spec.enterable;
    group.userData.modules = [];
    this.root.add(group);

    this.addBox(
      group,
      spec,
      family.base,
      new THREE.Vector3(spec.width - WALL_THICKNESS * 1.4, 0.12, spec.depth - WALL_THICKNESS * 1.4),
      new THREE.Vector3(0, spec.enterable ? -0.022 : -0.06, 0),
      { radius: 0.022, collider: false, module: 'floor-slab' },
    );
    this.addBox(
      group,
      spec,
      family.roof,
      new THREE.Vector3(spec.width + 0.12, 0.24, spec.depth + 0.12),
      new THREE.Vector3(0, spec.height + 0.1, 0),
      {
        radius: 0.035,
        collider: true,
        module: 'roof-slab',
        castShadow: true,
      },
    );
    this.buildRearWall(group, spec, family);
    for (const x of [-spec.width * 0.5, spec.width * 0.5]) {
      this.addBox(
        group,
        spec,
        family.wall,
        new THREE.Vector3(WALL_THICKNESS, spec.height, spec.depth),
        new THREE.Vector3(x, spec.height * 0.5, 0),
        { radius: 0.018, collider: true, module: 'wall-segment' },
      );
    }

    for (let floor = 0; floor < spec.stories; floor += 1) {
      this.buildFacadeFloor(group, spec, family, floor);
      if (floor > 0 && spec.enterable) {
        this.addBox(
          group,
          spec,
          'concreteAggregate',
          new THREE.Vector3(spec.width - 0.55, 0.16, spec.depth - 0.55),
          new THREE.Vector3(0, floor * FLOOR_HEIGHT, 0),
          { radius: 0.02, collider: false, module: 'floor-slab' },
        );
      }
    }

    this.addFamilyDetails(group, spec, family);
    this.addUtilities(spec, family);
    this.addCornerCover(spec);

    group.userData.modules = [...this.usedModules];
    const record = {
      group,
      spec,
      family,
      interior: spec.enterable
        ? {
            center: spec.position.clone(),
            width: spec.width - WALL_THICKNESS * 2,
            depth: spec.depth - WALL_THICKNESS * 2,
            height: FLOOR_HEIGHT,
            floorY: spec.position.y + 0.15,
            doorX: spec.doorX ?? -spec.width * 0.26,
          }
        : null,
    };
    this.buildings.push(record);
    return record;
  }
}
