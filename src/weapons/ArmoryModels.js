import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createWeaponInspectionModel } from './Rifle.js';
import { createThrowableInspectionModel } from './Throwables.js';

function createReserveCase() {
  const root = new THREE.Group();
  root.name = 'Reserve Case';
  const shell = new THREE.MeshStandardMaterial({ color: 0x354649, roughness: 0.48, metalness: 0.44 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x121c21, roughness: 0.72, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x839898, roughness: 0.38, metalness: 0.68 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xd3a35d, roughness: 0.37, metalness: 0.56 });
  const geometries = [];
  const addBox = (name, parent, size, position, material, radius = 0.012) => {
    const geometry = new RoundedBoxGeometry(...size, 2, radius);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    parent.add(mesh);
    geometries.push(geometry);
    return mesh;
  };

  addBox('Molded base', root, [0.63, 0.15, 0.36], [0, 0, 0], shell, 0.029);
  addBox('Recessed insert', root, [0.56, 0.04, 0.292], [0, 0.078, 0], trim);
  for (const x of [-0.28, 0.28]) {
    addBox('Impact corner', root, [0.073, 0.105, 0.368], [x, -0.027, 0], trim, 0.018);
    addBox('Amber closure', root, [0.049, 0.05, 0.034], [x * 0.76, 0.054, 0.177], amber);
  }
  addBox('Carry handle rail', root, [0.18, 0.023, 0.026], [0, 0.005, 0.221], steel);
  for (const x of [-0.08, 0.08]) {
    addBox('Carry handle bracket', root, [0.024, 0.027, 0.051], [x, 0.005, 0.198], steel);
  }

  const lid = new THREE.Group();
  lid.name = 'Hinged cover';
  lid.position.set(0, 0.086, -0.169);
  lid.rotation.x = -1.18;
  root.add(lid);
  addBox('Cover shell', lid, [0.623, 0.064, 0.349], [0, 0, 0.172], shell, 0.023);
  addBox('Padded liner', lid, [0.552, 0.023, 0.29], [0, -0.041, 0.173], trim);
  for (let index = 0; index < 7; index += 1) {
    const x = -0.226 + index * 0.0755;
    addBox('Liner rib', lid, [0.018, 0.017, 0.248], [x, -0.051, 0.173], shell);
  }

  for (let index = 0; index < 4; index += 1) {
    const x = -0.201 + index * 0.135;
    addBox('Sealed reserve pack', root, [0.103, 0.045, 0.224], [x, 0.103, 0.008], steel, 0.011);
    addBox('Reserve pack band', root, [0.107, 0.049, 0.022], [x, 0.103, 0.068], amber, 0.009);
    addBox('Reserve pack inset', root, [0.068, 0.012, 0.104], [x, 0.13, -0.012], shell, 0.004);
  }

  return {
    root,
    dispose() {
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of [shell, trim, steel, amber]) material.dispose();
    },
  };
}

export function createArmoryModel(id) {
  if (id === 'reserve-case') return createReserveCase();
  return createWeaponInspectionModel(id) ?? createThrowableInspectionModel(id);
}
