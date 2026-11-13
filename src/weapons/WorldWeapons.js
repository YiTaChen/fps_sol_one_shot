import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWeaponInspectionModel } from './Rifle.js';
import { createThrowableInspectionModel } from './Throwables.js';

// Attachment points are in the same model space as the armory meshes.
const fits = {
  vesper: {
    pose: 'long', scale: 0.75,
    rightGrip: [0.052, -0.13, 0.11], supportGrip: [-0.035, -0.055, -0.34],
    muzzle: [0, 0.018, -0.904],
  },
  smg: {
    pose: 'compact', scale: 0.84,
    rightGrip: [0.043, -0.114, 0.11], supportGrip: [-0.039, -0.052, -0.245],
    muzzle: [0, 0.005, -0.438],
  },
  precision: {
    pose: 'long', scale: 0.76,
    rightGrip: [0.044, -0.115, 0.11], supportGrip: [-0.038, -0.055, -0.34],
    muzzle: [0, 0.02, -0.85],
  },
  sidearm: {
    pose: 'sidearm', scale: 0.69,
    rightGrip: [0.041, -0.116, 0.09], supportGrip: [-0.043, -0.13, 0.03],
    muzzle: [0, 0.037, -0.267],
  },
  'heavy-sidearm': {
    pose: 'sidearm', scale: 0.71,
    rightGrip: [0.051, -0.127, 0.09], supportGrip: [-0.052, -0.148, 0.03],
    muzzle: [0, 0.037, -0.318],
  },
  melee: {
    pose: 'melee', scale: 0.79,
    rightGrip: [0.037, -0.055, 0.078], supportGrip: null, muzzle: null,
  },
};
const orbFit = {
  pose: 'throwable', scale: 0.86,
  rightGrip: [0.055, -0.04, 0.065], supportGrip: null, muzzle: null,
};

const DETAIL_TOLERANCE = 0.02;

function paintColor(material, mapMeans) {
  const color = material.color.clone();
  const map = material.map;
  const data = map?.image?.data;
  if (!data || map.format !== THREE.RGBAFormat || map.type !== THREE.UnsignedByteType) return color;
  if (!mapMeans.has(map)) {
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      red += data[i];
      green += data[i + 1];
      blue += data[i + 2];
    }
    const normalization = 4 / (255 * data.length);
    mapMeans.set(map, new THREE.Color().setRGB(
      red * normalization, green * normalization, blue * normalization,
      map.colorSpace || THREE.LinearSRGBColorSpace,
    ));
  }
  return color.multiply(mapMeans.get(map));
}

function bakeDistanceGeometry(parts, scale) {
  const tolerance = DETAIL_TOLERANCE / scale;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const detail = [];
  const silhouettes = [];
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    part.geometry.boundingBox.getSize(size);
    const structural = !part.material.transparent && Math.max(size.x, size.y, size.z) >= tolerance;
    if (structural || part.name === 'Cyan tool edge') {
      silhouettes.push(part);
      box.union(part.geometry.boundingBox);
    } else {
      detail.push(part);
    }
  }
  // Keep any small detail that would move the outer bounds by more than 2 cm.
  box.expandByScalar(tolerance);
  silhouettes.push(...detail.filter((part) => !box.containsBox(part.geometry.boundingBox)));

  const mapMeans = new Map();
  const colors = new Map();
  const colored = silhouettes.map(({ geometry, material }) => {
    const meshPart = geometry.clone();
    meshPart.deleteAttribute('uv');
    if (!colors.has(material)) colors.set(material, paintColor(material, mapMeans));
    const color = colors.get(material);
    const attribute = new THREE.Float32BufferAttribute(meshPart.attributes.position.count * 3, 3);
    for (let i = 0; i < attribute.count; i += 1) attribute.setXYZ(i, color.r, color.g, color.b);
    meshPart.setAttribute('color', attribute);
    return meshPart;
  });
  const merged = mergeGeometries(colored);
  for (const part of colored) part.dispose();
  if (!merged) return null;
  merged.deleteAttribute('normal');
  const indexed = mergeVertices(merged, 0.005 / scale);
  merged.dispose();
  const sourceIndex = indexed.index.array;
  const faces = [];
  for (let i = 0; i < sourceIndex.length; i += 3) {
    const a = sourceIndex[i];
    const b = sourceIndex[i + 1];
    const c = sourceIndex[i + 2];
    if (a !== b && b !== c && a !== c) faces.push(a, b, c);
  }
  indexed.setIndex(faces);
  indexed.computeVertexNormals();
  indexed.computeBoundingSphere();
  return indexed;
}

function bakeModel(source, scale, distanceMaterial) {
  const prototype = new THREE.Group();
  const groups = new Map();
  const distanceParts = [];
  const transform = new THREE.Matrix4();
  source.root.updateMatrixWorld(true);
  const local = source.root.matrixWorld.clone().invert();

  source.root.traverse((node) => {
    if (!node.isMesh) return;
    const part = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    part.applyMatrix4(transform.multiplyMatrices(local, node.matrixWorld));
    if (!groups.has(node.material)) groups.set(node.material, []);
    groups.get(node.material).push(part);
    distanceParts.push({ geometry: part, material: node.material, name: node.name });
  });

  for (const [material, parts] of groups) {
    if (material.isMeshStandardMaterial && !material.transparent) {
      // The scene has less fill than the armory studio. Keep the painted
      // surfaces visible in shadow while retaining the original model colors.
      material.metalness *= 0.66;
      material.envMapIntensity = 1.25;
      if (material.map) {
        material.color.multiplyScalar(1.45);
        material.emissiveMap = material.map;
        material.emissive.setHex(0xa3bfd0);
        material.emissiveIntensity = 0.2;
      } else {
        material.emissive.copy(material.color);
        material.emissiveIntensity = 0.07;
      }
    }
    const merged = parts.length > 1 ? mergeGeometries(parts) : null;
    const geometries = merged ? [merged] : parts;
    for (const geometry of geometries) {
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = material.transparent ? 'weapon-optics' : 'weapon-surface';
      mesh.castShadow = !material.transparent;
      mesh.receiveShadow = true;
      prototype.add(mesh);
    }
  }

  const distance = bakeDistanceGeometry(distanceParts, scale);
  const renderedGeometry = new Set(prototype.children.map((mesh) => mesh.geometry));
  for (const { geometry } of distanceParts) {
    if (!renderedGeometry.has(geometry)) geometry.dispose();
  }
  if (distance) {
    const simplified = new THREE.Mesh(distance, distanceMaterial);
    simplified.name = 'weapon-distance-surface';
    simplified.visible = false;
    prototype.add(simplified);
  }

  return prototype;
}

/** Owns the shared render resources. Each actor owns its cloned transforms. */
export class WorldWeapons {
  constructor() {
    this.models = new Map();
    this.distanceMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.16,
      emissive: 0x161a1f,
      emissiveIntensity: 0.19,
    });
  }

  create(id) {
    let model = this.models.get(id);
    if (!model) {
      const fit = Object.hasOwn(fits, id) ? fits[id] : orbFit;
      const source = createWeaponInspectionModel(id) ?? createThrowableInspectionModel(id);
      if (!source) return null;
      model = { fit, source, prototype: bakeModel(source, fit.scale, this.distanceMaterial) };
      this.models.set(id, model);
    }

    const { fit, prototype } = model;
    const root = prototype.clone(true);
    root.name = `world-weapon-${id}`;
    root.userData.weaponId = id;
    root.scale.setScalar(fit.scale);
    const distance = root.getObjectByName('weapon-distance-surface');
    const detail = root.children.filter((node) => node !== distance);

    const muzzle = fit.muzzle ? new THREE.Object3D() : null;
    if (muzzle) {
      muzzle.name = 'world-muzzle';
      muzzle.position.fromArray(fit.muzzle);
      root.add(muzzle);
    }

    return {
      root, muzzle, pose: fit.pose, scale: fit.scale,
      rightGrip: new THREE.Vector3(...fit.rightGrip),
      supportGrip: fit.supportGrip ? new THREE.Vector3(...fit.supportGrip) : null,
      setDetail(near) {
        if (!distance || distance.visible === !near) return;
        distance.visible = !near;
        for (const mesh of detail) mesh.visible = near;
      },
    };
  }

  dispose() {
    for (const { prototype, source } of this.models.values()) {
      for (const mesh of prototype.children) mesh.geometry.dispose();
      source.dispose();
    }
    this.models.clear();
    this.distanceMaterial.dispose();
  }
}
