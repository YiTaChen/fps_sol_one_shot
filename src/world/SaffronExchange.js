import * as THREE from 'three';
import { localToWorld } from './WorldMath.js';

export function buildSaffronExchange(world, building, rng) {
  const { spec, group } = building;
  const kit = world.architecture;
  const point = new THREE.Vector3();
  const dimensions = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const box = (material, size, position, module = 'electrical-box', rz = 0) => {
    kit.addInstance(spec, material, dimensions.set(...size), point.set(...position), {
      module,
      localEuler: rotation.set(0, 0, rz),
      radius: 0.024,
    });
  };
  const cylinder = (material, size, position, rx = 0, module = 'vent', rz = 0) => {
    kit.addCylinder(spec, material, dimensions.set(...size), point.set(...position), {
      module,
      localEuler: rotation.set(rx, 0, rz),
      radialSegments: 20,
    });
  };
  const solid = (material, size, position) => {
    kit.addBox(group, spec, material,
      dimensions.set(...size), point.set(...position), {
        module: 'electrical-box',
        collider: true,
        radius: 0.055,
      });
  };

  // The old tile is visible at the edges. The power equipment sits on a
  // retrofitted concrete service deck with inset steel conduits.
  box('concreteClean', [11.0, 0.045, 15.55], [-0.25, 0.049, 0], 'floor-slab');
  for (const x of [-5.83, 5.28]) {
    box('bareMetal', [0.1, 0.045, 15.5], [x, 0.06, 0], 'drainage');
    for (let z = -6.9; z <= 7; z += 1.4) {
      box('rustedMetal', [0.26, 0.035, 0.13], [x, 0.082, z], 'drainage');
    }
  }

  // Mezzanine rails and the overhead distribution rack establish the height
  // of the converted market. Repeated steel sections are instanced.
  for (const x of [-5.14, 5.14]) {
    box('bareMetal', [0.09, 0.09, 14.8], [x, 4.0, 0], 'railing');
    box('paintedMetal', [0.055, 0.055, 14.8], [x, 3.63, 0], 'railing');
    box('paintedMetal', [0.26, 0.38, 15.55], [x, 3.0, 0], 'roof-screen');
    for (const z of [-7.3, -4.9, -2.45, 0, 2.45, 4.9, 7.3]) {
      box('bareMetal', [0.075, 0.86, 0.075], [x, 3.62, z], 'railing');
    }
  }
  for (const z of [-5.5, -1.75, 2.2, 5.75]) {
    box('paintedMetal', [15.5, 0.31, 0.27], [0, 4.98, z], 'roof-screen');
    box('bareMetal', [15.55, 0.07, 0.42], [0, 4.8, z], 'roof-screen');
    for (const x of [-4.55, 4.55]) {
      box('bareMetal', [0.78, 0.084, 0.085], [x, 4.48, z], 'cable-run');
      box('bareMetal', [0.065, 0.56, 0.065], [x - 0.33, 4.69, z], 'cable-run');
      box('bareMetal', [0.065, 0.56, 0.065], [x + 0.33, 4.69, z], 'cable-run');
    }
  }
  for (const [x, material] of [[-4.75, 'rustedMetal'], [-4.42, 'bareMetal'], [4.35, 'bareMetal'], [4.68, 'rustedMetal']]) {
    cylinder(material, [0.17, 13.95, 0.17], [x, 4.55, -0.55], Math.PI * 0.5, 'cable-run');
    for (const z of [-5.5, -1.75, 2.2, 5.75]) {
      cylinder('paintedMetal', [0.26, 0.2, 0.26], [x, 4.55, z], Math.PI * 0.5, 'cable-run');
    }
  }

  // The front bank faces the vestibule. A second bank backs the relay and
  // leaves a straight service lane beside the original north passage.
  for (const [x, z, front] of [[2.43, 0.95, 1], [2.85, -6.45, 1]]) {
    const face = z + front * 0.72;
    solid('paintedMetal', [4.45, 2.55, 1.38], [x, 1.38, z]);
    box('concreteAggregate', [4.76, 0.24, 1.65], [x, 0.12, z], 'foundation');
    box('bareMetal', [4.51, 0.16, 1.46], [x, 2.66, z], 'coping');
    box('polymer', [4.05, 1.78, 0.084], [x, 1.31, face]);
    for (const bay of [-1.4, 0, 1.4]) {
      const bayX = x + bay;
      box('bareMetal', [1.31, 1.98, 0.055], [bayX, 1.33, face + front * 0.055]);
      box('paintedMetal', [1.19, 1.84, 0.08], [bayX, 1.33, face + front * 0.1]);
      box('polymer', [1.05, 0.3, 0.095], [bayX, 2.02, face + front * 0.16]);
      box('lamp', [0.11, 0.045, 0.026], [bayX - 0.3, 2.03, face + front * 0.22], 'wall-lamp');
      box('bareMetal', [0.24, 0.035, 0.04], [bayX + 0.18, 2.03, face + front * 0.22]);
      const fanZ = face + front * 0.205;
      cylinder('polymer', [0.94, 0.1, 0.94], [bayX, 1.29, fanZ], Math.PI * 0.5);
      cylinder('bareMetal', [0.73, 0.052, 0.73], [bayX, 1.29, fanZ + front * 0.07], Math.PI * 0.5);
      for (let index = 0; index < 6; index += 1) {
        const angle = (index * Math.PI) / 3;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        box('polymer', [0.1, 0.29, 0.055],
          [bayX + sin * 0.225, 1.29 + cos * 0.225, fanZ + front * 0.11], 'vent', -angle + 0.38);
      }
      cylinder('paintedMetal', [0.21, 0.095, 0.21], [bayX, 1.29, fanZ + front * 0.15], Math.PI * 0.5);
      for (let bar = -2; bar <= 2; bar += 1) {
        box('bareMetal', [0.8 - Math.abs(bar) * 0.105, 0.022, 0.032],
          [bayX, 1.29 + bar * 0.137, fanZ + front * 0.2], 'vent');
      }
      cylinder('bareMetal', [0.15, 1.47, 0.15], [bayX, 3.39, z], 0, 'conduit');
      for (const y of [2.82, 2.94, 3.06, 3.18, 3.30]) {
        cylinder('ceramic', [0.32, 0.075, 0.32], [bayX, y, z], 0, 'electrical-box');
      }
    }
  }

  // Low cool practicals reveal the depth of the bank even before power
  // returns. Amber fixtures retain the route's established color language.
  for (const [x, z] of [[-3.9, 5.15], [-2.25, -3.55]]) {
    box('paintedMetal', [1.85, 0.19, 0.45], [x, 2.68, z], 'wall-lamp');
    box('lamp', [1.65, 0.075, 0.31], [x, 2.55, z], 'wall-lamp');
    const amber = new THREE.PointLight(0xffbd75, 20, 8.4, 1.7);
    localToWorld(point.set(x, 2.45, z), spec.position, spec.yaw, amber.position);
    amber.name = 'exchange-vestibule-practical';
    amber.userData.captureStable = true;
    world.root.add(amber);
    world.interiorLights.push(amber);
  }
  for (const [x, z] of [[2.2, 3.5], [1.8, -5.05]]) {
    const bank = new THREE.PointLight(0x76c9eb, 11, 10.8, 1.55);
    localToWorld(point.set(x, 2.65, z), spec.position, spec.yaw, bank.position);
    bank.name = 'exchange-switchgear-power';
    bank.userData.captureStable = true;
    world.root.add(bank);
    world.interiorLights.push(bank);
    world.powerLights.push({ light: bank, stage: 1, idle: 11, active: 34 });
  }

  for (let index = 0; index < 5; index += 1) {
    const rise = rng.range(-0.018, 0.018);
    box('rustedMetal', [0.58, 0.028, 0.05], [-5.8, 1.32 + index * 0.09 + rise, 6.97], 'vent');
  }
}
