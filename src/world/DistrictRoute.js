import * as THREE from 'three';
import { createBoxCollider } from './WorldMath.js';

const ROUTE = [
  {
    id: 'arcade',
    code: '01',
    label: 'Saffron Arcade',
    description: 'Enter the exchange under the amber sign and pass the switchgear.',
    accent: '#ffc36a',
    position: [-41.25, 0, -17.2],
    console: [-39.5, 0, -17.2],
    yaw: -Math.PI * 0.5,
  },
  {
    id: 'service',
    code: '02',
    label: 'North Service',
    description: 'Follow the cyan marks east. The rear exit and powered side shutter both reach the road.',
    accent: '#77e4ec',
    position: [18, 0, -29.1],
    console: [19.65, 0, -29.1],
    yaw: -Math.PI * 0.5,
  },
  {
    id: 'kiln',
    code: '03',
    label: 'Kiln House',
    description: 'Follow the coral marks into the powered loading shutter, or take the outer freight road.',
    accent: '#ff9a80',
    position: [34.5, 0, -10.2],
    console: [34.5, 0, -11.8],
    yaw: 0,
  },
  {
    id: 'extraction',
    code: 'EX',
    label: 'Cross Street',
    description: 'Leave through the freight bay and follow the green marks west to Cross Street.',
    accent: '#a4efb1',
    position: [-21.7, 0, 12],
    console: [-23.25, 0, 12],
    yaw: Math.PI * 0.5,
  },
];

const SIGNS = [
  ['arcade', 'SAFFRON ARCADE', 'DISTRICT POWER EXCHANGE', -43.15, 3.82, -5.55, 0, 3.28],
  ['arcade', 'SWITCHGEAR', '01 • POWER DISTRIBUTION', -36.57, 2.91, -12.55, 0, 2.94],
  ['arcade', 'NORTH EXIT', 'SERVICE ROAD', -41.25, 2.73, -21.76, 0, 2.06],
  ['service', 'NORTH SERVICE', 'RELAY • LOADING ROAD', 19.65, 2.27, -29.1, -Math.PI * 0.5, 2.48],
  ['kiln', 'KILN HOUSE', 'NORTH FREIGHT GATE', 38.8, 3.05, -23.19, Math.PI, 3.15],
  ['kiln', 'KILN HOUSE', 'AVENUE FREIGHT BAY', 37.52, 3.03, -5.69, 0, 2.65],
  ['extraction', 'EXTRACTION', 'CROSS STREET', -23.25, 2.27, 12, Math.PI * 0.5, 2.42],
];

// These panels face each approach so the next turn is visible at eye level.
const DIRECTION_SIGNS = [
  ['service', 'NORTH SERVICE', 'SERVICE ROAD • TURN LEFT', -28.82, 2.06, -19.82, -Math.PI * 0.5, 2.12],
  ['service', 'NORTH SERVICE', 'SERVICE ROAD • TURN RIGHT', -41.26, 2.72, -33.3, 0, 2.22],
  ['kiln', 'KILN LOADING', 'TURN RIGHT • POWERED SHUTTER', 23.25, 2.06, -28.9, -Math.PI * 0.5, 2.4],
  ['kiln', 'FREIGHT ROAD', 'STRAIGHT • OUTER APPROACH', 24.4, 2.54, -32.45, -Math.PI * 0.5, 2.18],
  ['kiln', 'KILN LOADING', 'ENTER AT THE LIT SHUTTER', 24.28, 2.98, -11.25, -Math.PI * 0.5, 2.2],
  ['extraction', 'CROSS STREET', 'WEST • FOLLOW GREEN MARKS', 33.25, 2.8, -3.63, 0, 2.75],
  ['extraction', 'EXTRACTION', 'TURN LEFT • CROSS STREET', -18.68, 2.32, 2.62, Math.PI * 0.5, 2.32],
];

const PAINTED_ROUTES = {
  arcade: [
    [[-43.15, -0.5], [-43.15, -11.2], [-41.25, -13.4], [-41.25, -21.2]],
  ],
  service: [
    [[-41.25, -21.3], [-41.25, -29.1], [-26, -29.1]],
    [[-38.5, -18.4], [-29.45, -18.4], [-29.45, -29.1]],
    [[-20, -29.1], [-4, -29.1]],
    [[4.5, -29.1], [9.4, -29.1], [9.4, -30.75], [18, -30.75], [18, -29.1]],
  ],
  kiln: [
    [[18, -29.1], [18, -30.55], [21.8, -30.55], [22.15, -27], [22.15, -23.5], [22.4, -12],
      [22.85, -11.25], [25.55, -11.25], [25.55, -9.35], [27.65, -9.35], [31, -10.2], [34.5, -10.2]],
  ],
  extraction: [
    [[34.5, -10.2], [36, -8.7], [37.52, -8], [37.52, 0.8], [24, 0.8], [13, 0.8], [-17.55, 0.8],
      [-17.55, 7.4], [-19.5, 8.8], [-21.7, 12]],
  ],
};

const OUTER_KILN_ROUTE = [
  [21.8, -30.55], [39.4, -30.55], [39.4, -26.3], [38.8, -25.8],
  [38.8, -14.7], [36, -10.2], [34.5, -10.2],
];

function routeLocation(definition) {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    accent: definition.accent,
    position: new THREE.Vector3(...definition.position),
    radius: 2.35,
  });
}

export class DistrictRoute {
  constructor(world) {
    this.geometry = world.geometryKit;
    this.materials = new Set();
    this.textures = new Set();
    this.markings = [];
    this.stageGuide = new Map();
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.paintPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.indicators = new Map();
    this.routeRoot = new THREE.Group();
    this.routeRoot.name = 'District route landmarks';
    world.root.add(this.routeRoot);

    this.casing = this.own(new THREE.MeshStandardMaterial({
      color: 0x303e43,
      metalness: 0.52,
      roughness: 0.69,
    }));
    this.hardware = this.own(new THREE.MeshStandardMaterial({
      color: 0x83958d,
      metalness: 0.42,
      roughness: 0.67,
    }));

    const points = ROUTE.map(routeLocation);
    this.relays = Object.freeze(points.slice(0, 3));
    this.extraction = points[3];

    for (const location of ROUTE) {
      this.buildConsole(location, world.colliders);
      this.paintRoute(location);
    }
    for (const [id, title, subtext, x, y, z, yaw, width] of SIGNS) {
      const location = ROUTE.find((entry) => entry.id === id);
      this.buildSign(location, title, subtext, [x, y, z], yaw, width);
    }
    for (const [id, title, subtext, x, y, z, yaw, width] of DIRECTION_SIGNS) {
      const location = ROUTE.find((entry) => entry.id === id);
      const sign = this.buildSign(location, title, subtext, [x, y, z], yaw, width);
      for (const side of [-1, 1]) {
        this.box(sign, this.casing, [0.064, y, 0.067], [side * width * 0.39, -y * 0.5, -0.075]);
      }
      this.addGuide(id, sign);
    }
    this.setStatus(null);
  }

  own(material) {
    this.materials.add(material);
    return material;
  }

  addGuide(id, guide) {
    if (!this.stageGuide.has(id)) this.stageGuide.set(id, []);
    this.stageGuide.get(id).push(guide);
  }

  box(parent, material, size, position) {
    const mesh = new THREE.Mesh(this.geometry.beveledBox(...size, 0.032), material);
    mesh.position.set(...position);
    mesh.receiveShadow = material === this.casing || material === this.hardware;
    parent.add(mesh);
  }

  buildConsole(location, colliders) {
    const station = new THREE.Group();
    station.name = `route-console:${location.id}`;
    station.position.set(...location.console);
    station.rotation.y = location.yaw;
    this.routeRoot.add(station);

    const indicator = this.own(new THREE.MeshBasicMaterial({
      color: location.accent,
      toneMapped: false,
    }));
    this.indicators.set(location.id, { material: indicator, accent: new THREE.Color(location.accent) });
    this.box(station, this.casing, [0.88, 0.18, 0.65], [0, 0.09, 0]);
    this.box(station, this.casing, [0.64, 1.27, 0.48], [0, 0.72, 0]);
    this.box(station, this.hardware, [0.78, 0.59, 0.53], [0, 1.12, 0.06]);
    this.box(station, this.casing, [0.59, 0.31, 0.05], [0, 1.16, 0.35]);
    this.box(station, indicator, [0.49, 0.18, 0.023], [0, 1.17, 0.38]);
    this.box(station, indicator, [0.44, 0.048, 0.027], [0, 0.78, 0.33]);
    this.box(station, this.hardware, [0.04, 0.45, 0.04], [0.27, 1.57, -0.11]);
    this.box(station, indicator, [0.08, 0.14, 0.07], [0.27, 1.82, -0.11]);
    this.box(station, this.casing, [0.09, 0.47, 0.09], [0, 1.65, -0.15]);
    if (location.id === 'service' || location.id === 'extraction') {
      for (const side of [-1, 1]) {
        this.box(station, this.hardware, [0.075, 0.74, 0.075], [side * 0.29, 1.65, -0.045]);
      }
    }
    if (location.id === 'extraction') {
      this.box(station, this.hardware, [0.105, 1.15, 0.105], [0, 2.74, -0.08]);
      const beacon = this.own(new THREE.MeshBasicMaterial({ color: 0x284c3a, toneMapped: false }));
      this.box(station, this.casing, [0.3, 0.28, 0.3], [0, 3.3, -0.08]);
      this.box(station, beacon, [0.32, 0.14, 0.32], [0, 3.32, -0.08]);
      const light = new THREE.PointLight(0x7cfea9, 0, 7, 1.7);
      light.position.set(0, 3.35, -0.08);
      station.add(light);
      this.extractionSignal = { beacon, light };
    }

    colliders.push(createBoxCollider({
      id: station.name,
      center: station.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
      size: new THREE.Vector3(0.84, 1.4, 0.68),
      yaw: location.yaw,
      material: 'metal',
      object: station,
      tags: ['architecture', 'relay-console'],
    }));
  }

  buildSign(location, title, subtext, position, yaw, width) {
    const sign = new THREE.Group();
    sign.name = `route-sign:${location.id}:${title.toLowerCase().replaceAll(' ', '-')}`;
    sign.position.set(...position);
    sign.rotation.y = yaw;
    this.routeRoot.add(sign);
    const height = width * 0.25;

    this.box(sign, this.casing, [width, height, 0.12], [0, 0, 0]);
    this.box(sign, this.hardware, [width * 0.94, 0.032, 0.14], [0, -height * 0.46, 0.007]);
    const canvas = globalThis.document?.createElement('canvas');
    if (!canvas) return sign;
    canvas.width = 768;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) return sign;

    context.fillStyle = '#172426';
    context.fillRect(0, 0, 768, 192);
    context.strokeStyle = '#5c7071';
    context.lineWidth = 3;
    context.strokeRect(4, 4, 760, 184);
    context.fillStyle = location.accent;
    context.fillRect(12, 12, 128, 168);
    context.font = '700 75px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#172426';
    context.fillText(location.code, 76, 100);
    context.textAlign = 'left';
    context.fillStyle = '#eef5e9';
    context.font = '800 62px sans-serif';
    context.fillText(title, 161, 77, 575);
    context.fillStyle = location.accent;
    context.font = '700 31px monospace';
    context.fillText(subtext, 165, 144, 568);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.add(texture);
    const panel = new THREE.Mesh(this.plane, this.own(new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    })));
    panel.position.z = 0.063;
    panel.scale.set(width * 0.98, height * 0.95, 1);
    sign.add(panel);
    return sign;
  }

  paintRoute(location) {
    const markings = [];
    const turns = [];
    for (const points of PAINTED_ROUTES[location.id]) {
      for (let index = 1; index < points.length; index += 1) {
        const [x, z] = points[index - 1];
        const [toX, toZ] = points[index];
        const dx = toX - x;
        const dz = toZ - z;
        const length = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        const step = location.id === 'extraction' ? 2.75 : 1.45;
        for (let distance = 0.5; distance < length - 0.4; distance += step) {
          markings.push([x + (dx * distance) / length, z + (dz * distance) / length, yaw]);
        }
        if (index > 1 && length > 1) turns.push([x, z, yaw]);
      }
    }
    if (location.id === 'extraction') {
      const [x, , z] = location.position;
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          markings.push([x + dx * 1.25, z + dz * 0.81, 0]);
          markings.push([x + dx * 0.96, z + dz * 1.10, Math.PI * 0.5]);
        }
      }
    }

    const material = this.own(new THREE.MeshStandardMaterial({
      color: new THREE.Color(location.accent).multiplyScalar(0.48),
      emissive: location.accent,
      emissiveIntensity: 0.24,
      roughness: 0.84,
    }));
    this.addRouteMarks(location.id, 'dashes', markings, material, 0.12, 0.57);

    const arrow = turns.flatMap(([x, z, yaw]) => [-1, 1].map((side) => [
      x + Math.cos(yaw) * side * 0.115, z - Math.sin(yaw) * side * 0.115,
      yaw - side * 0.64,
    ]));
    this.addRouteMarks(location.id, 'turns', arrow, material, 0.085, 0.43);

    if (location.id === 'kiln') {
      const alternate = [];
      for (let index = 1; index < OUTER_KILN_ROUTE.length; index += 1) {
        const [x, z] = OUTER_KILN_ROUTE[index - 1];
        const [nextX, nextZ] = OUTER_KILN_ROUTE[index];
        const length = Math.hypot(nextX - x, nextZ - z);
        const yaw = Math.atan2(nextX - x, nextZ - z);
        for (let distance = 1; distance < length - 0.45; distance += 2.25) {
          alternate.push([x + (nextX - x) * distance / length, z + (nextZ - z) * distance / length, yaw]);
        }
      }
      this.addRouteMarks(location.id, 'outer-freight', alternate, material, 0.16, 0.17);
    }
  }

  addRouteMarks(id, name, markings, material, width, length) {
    if (!markings.length) return;
    const marks = new THREE.InstancedMesh(this.paintPlane, material, markings.length);
    const transform = new THREE.Object3D();
    transform.scale.set(width, 1, length);
    markings.forEach(([x, z, yaw], index) => {
      const exchangeDeck = x > -47 && x < -31 && z < -6.28 && z > -21.95;
      transform.position.set(x, exchangeDeck ? 0.081 : 0.047, z);
      transform.rotation.y = yaw;
      transform.updateMatrix();
      marks.setMatrixAt(index, transform.matrix);
    });
    marks.name = `route-paint:${id}:${name}`;
    marks.receiveShadow = true;
    this.markings.push(marks);
    this.routeRoot.add(marks);
    this.addGuide(id, marks);
  }

  setStatus(activeId, completedIds = []) {
    const completed = new Set(completedIds);
    for (const [id, { material, accent }] of this.indicators) {
      material.color.copy(accent).multiplyScalar(id === activeId ? 1 : completed.has(id) ? 0.54 : 0.23);
    }
    for (const [id, guides] of this.stageGuide) {
      for (const guide of guides) guide.visible = id === activeId;
    }
  }

  setExtractionPowered(powered) {
    const { beacon, light } = this.extractionSignal;
    beacon.color.setHex(powered ? 0x97ffb5 : 0x284c3a);
    light.intensity = powered ? 22 : 0;
  }

  dispose() {
    this.routeRoot.removeFromParent();
    this.markings.forEach((marks) => marks.dispose());
    this.plane.dispose();
    this.paintPlane.dispose();
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
  }
}
