import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Four uniforms share the same collision envelope. Helmet and kit profiles
// distinguish them at combat distance as well as in a close-up.
export const UNIFORMS = Object.freeze([
  {
    id: 'patrol', cloth: 0x687e83, clothDark: 0x394e53, armour: 0x425658, textile: 0x827d65,
    shell: 0x697b7e, stripe: 0xffb86a, lens: 0x253e43, lensLight: 0x8ed3ce,
    helmet: [1, 0.94, 1], visor: 'wide', filters: [-0.076, 0.076],
    plate: [1, 1, 1], shoulder: 0.97, gear: 3,
  },
  {
    id: 'rigger', cloth: 0x8a8261, clothDark: 0x515749, armour: 0x596352, textile: 0xa49673,
    shell: 0x8e8361, stripe: 0xe3ba65, lens: 0x3f3832, lensLight: 0xf2bb68,
    helmet: [1.04, 0.90, 1.04], visor: 'split', filters: [-0.097],
    plate: [1.05, 0.92, 1], shoulder: 1.08, gear: 3,
  },
  {
    id: 'surveyor', cloth: 0x7d8d98, clothDark: 0x475b66, armour: 0x4a616c, textile: 0x8b9591,
    shell: 0xaca899, stripe: 0x81e5d4, lens: 0x213d55, lensLight: 0x90dfff,
    helmet: [0.96, 0.88, 0.97], visor: 'survey', filters: [0.097],
    plate: [0.86, 0.90, 1], shoulder: 0.89, gear: 2,
  },
  {
    id: 'foreman', cloth: 0x7d6c61, clothDark: 0x4b4140, armour: 0x65534e, textile: 0xa68b73,
    shell: 0x8f6956, stripe: 0xff895b, lens: 0x3b2b2a, lensLight: 0xffc481,
    helmet: [1.075, 0.97, 1.10], visor: 'brow', filters: [-0.103, 0.103],
    plate: [1.095, 1.045, 1], shoulder: 1.15, gear: 3,
  },
]);

function panel(points, depth, bevel, crown = 0) {
  const outline = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  });
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 2,
  });
  const positions = geometry.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const x = positions.getX(vertex);
    positions.setZ(vertex, positions.getZ(vertex) - depth / 2 + crown * x * x);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createEnemyWardrobeGeometries(base, mergeParts) {
  const temporary = [];
  const make = (geometry) => {
    temporary.push(geometry);
    return geometry;
  };
  const slimBlock = make(new RoundedBoxGeometry(1, 1, 1, 2, 0.115));
  const cylinder = make(new THREE.CylinderGeometry(0.5, 0.5, 1, 13, 1));
  const brow = make(panel([
    [-0.128, 0.033], [-0.113, 0.082], [-0.077, 0.095], [0.077, 0.095],
    [0.117, 0.075], [0.129, 0.033], [0.112, -0.011], [0.070, -0.032],
    [-0.070, -0.032], [-0.113, -0.012],
  ], 0.025, 0.008, 2.5));
  const lensShapes = {
    wide: make(panel([
      [-0.108, 0.038], [-0.091, 0.067], [0.094, 0.067], [0.111, 0.039],
      [0.095, 0.005], [0.050, -0.010], [-0.048, -0.010], [-0.092, 0.005],
    ], 0.013, 0.005, 2.38)),
    split: make(panel([
      [-0.049, 0.031], [-0.040, 0.057], [0.039, 0.057], [0.050, 0.040],
      [0.037, 0.010], [-0.034, 0.010],
    ], 0.013, 0.005, 1.8)),
    survey: make(panel([
      [-0.106, 0.046], [-0.083, 0.063], [0.085, 0.063], [0.108, 0.046],
      [0.088, 0.015], [-0.088, 0.015],
    ], 0.012, 0.005, 2.32)),
    brow: make(panel([
      [-0.113, 0.045], [-0.092, 0.064], [0.092, 0.064], [0.113, 0.045],
      [0.087, 0.025], [-0.087, 0.025],
    ], 0.014, 0.005, 2.32)),
  };
  const respirator = make(panel([
    [-0.113, 0.008], [-0.060, -0.002], [-0.041, 0.016], [0.042, 0.016],
    [0.063, -0.002], [0.111, 0.008], [0.098, -0.063], [0.066, -0.107],
    [0, -0.124], [-0.066, -0.107], [-0.098, -0.063],
  ], 0.036, 0.010, 2.68));
  const chestPlate = make(panel([
    [-0.215, 0.150], [-0.135, 0.219], [0.128, 0.219], [0.214, 0.148],
    [0.194, -0.112], [0.133, -0.173], [-0.143, -0.173], [-0.201, -0.101],
  ], 0.026, 0.011, 0.91));
  const shoulderPlate = make(panel([
    [-0.064, 0.037], [-0.04, 0.077], [0.046, 0.075], [0.069, 0.025],
    [0.055, -0.069], [-0.053, -0.064],
  ], 0.017, 0.010, 2.25));
  const kneePlate = make(panel([
    [-0.071, 0.028], [-0.047, 0.072], [0.048, 0.071], [0.069, 0.027],
    [0.052, -0.061], [-0.051, -0.059],
  ], 0.023, 0.010, 1.25));
  const padMark = mergeParts([{
    geometry: slimBlock, position: [0, 0.042, -0.023], scale: [0.071, 0.015, 0.008],
  }]);
  const block = (position, scale, rotation) => ({ geometry: slimBlock, position, scale, rotation });
  const tube = (position, scale, rotation) => ({ geometry: cylinder, position, scale, rotation });
  const roles = UNIFORMS.map((uniform, index) => {
    const shell = [{ geometry: base.helmet, position: [0, 0.032, 0.005], scale: uniform.helmet }];
    const mask = [
      { geometry: base.helmetRim, position: [0, -0.007, -0.002], scale: uniform.helmet },
      { geometry: respirator, position: [0, -0.014, -0.139], scale: [uniform.helmet[0], 1, 1] },
      { geometry: brow, position: [0, 0, -0.154] },
      { geometry: base.earpiece, position: [-0.145, -0.014, 0.015], rotation: [0, 0, Math.PI / 2] },
      { geometry: base.helmetRail, position: [0.134, 0.053, 0.007] },
      { geometry: base.helmetRail, position: [-0.134, 0.053, 0.007] },
    ];
    const visor = uniform.visor === 'split' ? [-0.052, 0.052].map((x) => ({
      geometry: lensShapes.split, position: [x, 0, -0.170], rotation: [0, -Math.sign(x) * 0.18, 0],
    })) : [{ geometry: lensShapes[uniform.visor], position: [0, 0, -0.173] }];
    const hardware = [];
    const signal = [
      block([0.105, 0.078, -0.130], [0.043, 0.018, 0.016], [0, -0.34, 0.06]),
      block([-0.114, 0.077, -0.120], [0.022, 0.022, 0.018], [0, 0.34, -0.1]),
    ];
    const plate = [{ geometry: chestPlate, position: [0, 0, -0.167], scale: uniform.plate }];
    const textile = [];
    const vestSignal = [];
    const filterAxis = [Math.PI / 2, 0, 0];
    for (const x of uniform.filters) {
      const size = uniform.visor === 'brow' ? 0.069 : 0.059;
      hardware.push(tube([x, -0.057, -0.172], [size, 0.050, size], filterAxis));
      mask.push(tube([x, -0.057, -0.201], [size * 0.80, 0.013, size * 0.80], filterAxis));
      for (let vent = -1; vent <= 1; vent += 1) {
        hardware.push(block([x, -0.057 + vent * 0.010, -0.209], [size * 0.62, 0.004, 0.004]));
      }
    }
    for (let slot = -1; slot <= 1; slot += 1) {
      hardware.push(block([slot * 0.019, -0.074, -0.165], [0.008, 0.043, 0.01], [0, 0, slot * 0.20]));
    }
    if (uniform.visor === 'survey') {
      shell.push(block([-0.146, 0.058, -0.025], [0.055, 0.073, 0.104]));
      hardware.push(tube([-0.146, 0.062, -0.086], [0.050, 0.034, 0.050], filterAxis));
      signal.push(tube([-0.146, 0.062, -0.106], [0.026, 0.010, 0.026], filterAxis));
    } else {
      const ridge = uniform.visor === 'brow' ? 0.135 : 0.075;
      shell.push(block([0, 0.114, -0.097], [ridge, 0.039, 0.090], [-0.45, 0, 0]));
    }
    if (uniform.visor === 'brow' || uniform.visor === 'wide') {
      hardware.push({ geometry: base.antenna, position: [-0.137, 0.111, 0.044], rotation: [0, 0, -0.10] });
    }

    const pouchWidth = uniform.gear === 2 ? 0.137 : 0.126;
    for (let pouch = 0; pouch < uniform.gear; pouch += 1) {
      const x = (pouch - (uniform.gear - 1) * 0.5) * pouchWidth - 0.012;
      textile.push({
        geometry: base.pouch, position: [x, -0.128, -0.202],
        scale: [uniform.gear === 2 ? 0.91 : 0.87, 0.91, 0.87],
      });
      plate.push(block([x, -0.064, -0.230], [0.098, 0.032, 0.034]));
    }
    textile.push({ geometry: base.pouch, position: [index % 2 ? -0.23 : 0.23, -0.21, 0.006], rotation: [0, 0.2, index % 2 ? 0.08 : -0.08] });
    vestSignal.push(block([0.100, 0.075, -0.184], [0.091, 0.028, 0.013]));
    vestSignal.push(block([-0.133, 0.10, -0.174], [0.022, 0.074, 0.014], [0, 0.17, 0.14]));
    vestSignal.push(block([0.10, 0.115, 0.289], [0.129, 0.028, 0.023]));
    if (uniform.visor === 'brow') {
      plate.push(block([0, 0.208, -0.128], [0.272, 0.077, 0.109]));
    }
    if (uniform.visor === 'survey') {
      plate.push(block([0.167, 0.115, 0.194], [0.121, 0.24, 0.153]));
      vestSignal.push(block([0.175, 0.162, 0.275], [0.052, 0.049, 0.015]));
    }
    return {
      shell: mergeParts(shell), mask: mergeParts(mask), visor: mergeParts(visor),
      hardware: mergeParts(hardware), headSignal: mergeParts(signal), plate: mergeParts(plate),
      textile: mergeParts(textile), vestSignal: mergeParts(vestSignal),
    };
  });
  // Pads are shared by the four animated rigs. The rest of the input
  // geometry only served as source for the merged batches.
  for (const geometry of temporary) {
    if (geometry !== shoulderPlate && geometry !== kneePlate) geometry.dispose();
  }
  return { roles, shoulderPlate, kneePlate, padMark };
}
