import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function dimension(value) {
  return Math.max(0.01, Number(value) || 0.01);
}

function cacheNumber(value) {
  return Math.round(value * 1000) / 1000;
}

function geometryKey(kind, values) {
  return `${kind}:${values.map(cacheNumber).join(':')}`;
}

/**
 * Geometry cache and profile helpers used by both architecture and props.
 * Cached geometries are owned here and disposed as one unit.
 */
export class GeometryKit {
  constructor() {
    this.cache = new Map();
    this.disposed = false;
  }

  beveledBox(width = 1, height = 1, depth = 1, radius = 0.045, segments = 1) {
    const w = dimension(width);
    const h = dimension(height);
    const d = dimension(depth);
    const safeRadius = Math.min(Math.max(0.004, radius), Math.min(w, h, d) * 0.22);
    const safeSegments = Math.max(1, Math.min(3, segments | 0));
    const key = geometryKey('bevel-box', [w, h, d, safeRadius, safeSegments]);
    if (!this.cache.has(key)) {
      const geometry = new RoundedBoxGeometry(w, h, d, safeSegments, safeRadius);
      geometry.name = key;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  unitBeveledBox(radius = 0.045, segments = 1) {
    return this.beveledBox(1, 1, 1, radius, segments);
  }

  cylinder(radialSegments = 12, openEnded = false) {
    const segments = Math.max(6, radialSegments | 0);
    const key = `cylinder:${segments}:${openEnded ? 1 : 0}`;
    if (!this.cache.has(key)) {
      const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1, openEnded);
      geometry.name = key;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  cone(radialSegments = 12) {
    const segments = Math.max(6, radialSegments | 0);
    const key = `cone:${segments}`;
    if (!this.cache.has(key)) {
      const geometry = new THREE.CylinderGeometry(0.08, 0.5, 1, segments, 1, false);
      geometry.name = key;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  torus(radialSegments = 8, tubularSegments = 16) {
    const radial = Math.max(4, radialSegments | 0);
    const tubular = Math.max(8, tubularSegments | 0);
    const key = `torus:${radial}:${tubular}`;
    if (!this.cache.has(key)) {
      const geometry = new THREE.TorusGeometry(0.5, 0.11, radial, tubular);
      geometry.name = key;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  plane() {
    const key = 'plane:unit';
    if (!this.cache.has(key)) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.name = key;
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  /**
   * Extrudes an authored XY cross-section along +Z.
   */
  profile(points, depth = 1, bevel = 0.025, bevelSegments = 1) {
    const serialized = points.map(([x, y]) => `${cacheNumber(x)},${cacheNumber(y)}`).join(';');
    const key = `profile:${serialized}:${cacheNumber(depth)}:${cacheNumber(bevel)}:${bevelSegments}`;
    if (!this.cache.has(key)) {
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) {
        shape.lineTo(points[i][0], points[i][1]);
      }
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: Math.max(1, bevelSegments | 0),
        curveSegments: 1,
        steps: 1,
      });
      geometry.center();
      geometry.name = key;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  angleIron(length = 1, leg = 0.14, thickness = 0.025) {
    return this.profile(
      [
        [0, 0],
        [leg, 0],
        [leg, thickness],
        [thickness, thickness],
        [thickness, leg],
        [0, leg],
      ],
      length,
      Math.min(0.008, thickness * 0.2),
      1,
    );
  }

  corrugatedPanel(width = 1, height = 1, depth = 0.055, ribs = 12) {
    const safeRibs = Math.max(3, ribs | 0);
    const key = geometryKey('corrugated', [width, height, depth, safeRibs]);
    if (!this.cache.has(key)) {
      const positions = [];
      const uvs = [];
      const indices = [];
      const columns = safeRibs * 2;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const x = (u - 0.5) * width;
        const z = (column & 1) ? depth * 0.5 : -depth * 0.5;
        positions.push(x, -height * 0.5, z, x, height * 0.5, z);
        uvs.push(u, 0, u, 1);
        if (column < columns) {
          const base = column * 2;
          indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.name = key;
      this.cache.set(key, geometry);
    }
    return this.cache.get(key);
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const geometry of this.cache.values()) {
      geometry.dispose();
    }
    this.cache.clear();
  }
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

/**
 * Collects small repeated details into InstancedMesh batches.
 */
export class InstanceBatcher {
  constructor(root, geometryKit, materials) {
    this.root = root;
    this.geometryKit = geometryKit;
    this.materials = materials;
    this.batches = new Map();
    this.meshes = [];
    this.instanceCount = 0;
    this.flushed = false;
  }

  add(
    geometry,
    materialId,
    position,
    quaternion,
    scale,
    options = {},
  ) {
    if (this.flushed) {
      throw new Error('Cannot add an instance after InstanceBatcher.flush()');
    }
    const geometryId = geometry.name || geometry.uuid;
    const key = `${geometryId}|${materialId}|${options.castShadow ? 1 : 0}|${options.receiveShadow === false ? 0 : 1}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = {
        geometry,
        materialId,
        matrices: [],
        castShadow: options.castShadow ?? false,
        receiveShadow: options.receiveShadow ?? true,
        renderOrder: options.renderOrder ?? 0,
        name: options.name ?? key,
      };
      this.batches.set(key, batch);
    }

    _position.copy(position);
    _quaternion.copy(quaternion);
    _scale.copy(scale);
    _matrix.compose(_position, _quaternion, _scale);
    batch.matrices.push(_matrix.clone());
    this.instanceCount += 1;
  }

  box(materialId, position, quaternion, scale, options = {}) {
    this.add(
      this.geometryKit.unitBeveledBox(options.radius ?? 0.045, options.segments ?? 1),
      materialId,
      position,
      quaternion,
      scale,
      options,
    );
  }

  cylinder(materialId, position, quaternion, scale, options = {}) {
    this.add(
      this.geometryKit.cylinder(options.radialSegments ?? 12, options.openEnded ?? false),
      materialId,
      position,
      quaternion,
      scale,
      options,
    );
  }

  cone(materialId, position, quaternion, scale, options = {}) {
    this.add(
      this.geometryKit.cone(options.radialSegments ?? 12),
      materialId,
      position,
      quaternion,
      scale,
      options,
    );
  }

  torus(materialId, position, quaternion, scale, options = {}) {
    this.add(
      this.geometryKit.torus(options.radialSegments ?? 8, options.tubularSegments ?? 16),
      materialId,
      position,
      quaternion,
      scale,
      options,
    );
  }

  plane(materialId, position, quaternion, scale, options = {}) {
    this.add(this.geometryKit.plane(), materialId, position, quaternion, scale, options);
  }

  flush() {
    if (this.flushed) {
      return this.meshes;
    }
    this.flushed = true;
    for (const batch of this.batches.values()) {
      const material =
        typeof this.materials.get === 'function'
          ? this.materials.get(batch.materialId)
          : this.materials[batch.materialId];
      const mesh = new THREE.InstancedMesh(
        batch.geometry,
        material,
        batch.matrices.length,
      );
      mesh.name = `instances:${batch.name}`;
      mesh.castShadow = batch.castShadow;
      mesh.receiveShadow = batch.receiveShadow;
      mesh.renderOrder = batch.renderOrder;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let i = 0; i < batch.matrices.length; i += 1) {
        mesh.setMatrixAt(i, batch.matrices[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.userData.instanceCount = batch.matrices.length;
      mesh.userData.materialFamily = batch.materialId;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    return this.meshes;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose?.();
    }
    this.meshes.length = 0;
    this.batches.clear();
  }
}

export function createBeveledMesh(
  geometryKit,
  materials,
  materialId,
  size,
  position,
  options = {},
) {
  const geometry = geometryKit.beveledBox(
    size.x,
    size.y,
    size.z,
    options.radius ?? Math.min(size.x, size.y, size.z) * 0.06,
    options.segments ?? 1,
  );
  const material =
    typeof materials.get === 'function' ? materials.get(materialId) : materials[materialId];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (options.quaternion) {
    mesh.quaternion.copy(options.quaternion);
  } else if (Number.isFinite(options.yaw)) {
    mesh.rotation.y = options.yaw;
  }
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.name = options.name ?? `beveled:${materialId}`;
  mesh.userData.materialFamily = materialId;
  mesh.userData.surface = material.userData?.surface ?? materialId;
  return mesh;
}

export function createProfileMesh(
  geometryKit,
  materials,
  materialId,
  points,
  depth,
  options = {},
) {
  const geometry = geometryKit.profile(
    points,
    depth,
    options.bevel ?? 0.02,
    options.bevelSegments ?? 1,
  );
  const material =
    typeof materials.get === 'function' ? materials.get(materialId) : materials[materialId];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = options.name ?? `profile:${materialId}`;
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.userData.materialFamily = materialId;
  mesh.userData.surface = material.userData?.surface ?? materialId;
  return mesh;
}

