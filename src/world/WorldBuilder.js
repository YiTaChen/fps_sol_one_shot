import * as THREE from 'three';
import { MaterialLibrary } from '../materials/MaterialLibrary.js';
import {
  ArchitectureKit,
  ARCHITECTURAL_MODULE_TYPES,
  FACADE_FAMILIES,
} from './ArchitectureKit.js';
import { GeometryKit, InstanceBatcher, createBeveledMesh } from './geometry/GeometryKit.js';
import { PROP_ARCHETYPES, PropFactory } from './PropFactory.js';
import { DistrictRoute } from './DistrictRoute.js';
import { buildSaffronExchange } from './SaffronExchange.js';
import {
  addCoverPoint,
  createBoxCollider,
  localToWorld,
  namedRng,
  pointNearCollider,
} from './WorldMath.js';

const BUILDING_SPECS = Object.freeze([
  {
    id: 'saffron-arcade',
    position: [-39, 0, -14],
    yaw: 0,
    width: 16,
    depth: 16,
    stories: 2,
    family: 'marketArcade',
    enterable: true,
    rearPassage: { x: -2.25, width: 2.45 },
    atrium: true,
    poweredShutter: { stage: 1, side: 1, z: -4.4, width: 2.75, height: 2.75, label: 'Saffron maintenance shutter' },
    variant: 0,
  },
  {
    id: 'kestrel-workshop',
    position: [-7.5, 0, -14.5],
    yaw: 0,
    width: 14,
    depth: 17,
    stories: 1,
    family: 'corrugatedWorkshop',
    enterable: true,
    variant: 1,
  },
  {
    id: 'azure-court',
    position: [8.5, 0, -14],
    yaw: 0,
    width: 13,
    depth: 16,
    stories: 3,
    family: 'stuccoBalcony',
    enterable: false,
    variant: 2,
  },
  {
    id: 'kiln-house',
    position: [35, 0, -14.5],
    yaw: 0,
    width: 21,
    depth: 17,
    stories: 2,
    family: 'brickWarehouse',
    enterable: true,
    rearPassage: { x: 3.8, width: 3.2 },
    poweredShutter: { stage: 2, side: -1, z: 3.25, width: 2.65, height: 2.65, label: 'Kiln west loading shutter' },
    freightEntry: true,
    variant: 3,
  },
  {
    id: 'cinder-exchange',
    position: [-39, 0, 15],
    yaw: Math.PI,
    width: 17,
    depth: 16,
    stories: 2,
    family: 'concreteShopfront',
    enterable: false,
    variant: 4,
  },
  {
    id: 'lantern-cafe',
    position: [-7, 0, 15],
    yaw: Math.PI,
    width: 15,
    depth: 16,
    stories: 2,
    family: 'tiledCafe',
    enterable: true,
    variant: 5,
  },
  {
    id: 'blue-gate-depot',
    position: [9.5, 0, 15],
    yaw: Math.PI,
    width: 13,
    depth: 16,
    stories: 1,
    family: 'shutteredDepot',
    enterable: false,
    variant: 6,
  },
  {
    id: 'meridian-office',
    position: [35, 0, 15],
    yaw: Math.PI,
    width: 21,
    depth: 16,
    stories: 3,
    family: 'glassOffice',
    enterable: false,
    variant: 7,
  },
  {
    id: 'north-foundry',
    position: [-36, 0.42, -41],
    yaw: 0,
    width: 20,
    depth: 12,
    stories: 2,
    family: 'brickWarehouse',
    enterable: false,
    variant: 8,
  },
  {
    id: 'north-caravansary',
    position: [27, 0, -41],
    yaw: 0,
    width: 32,
    depth: 12,
    stories: 2,
    family: 'marketArcade',
    enterable: false,
    variant: 9,
  },
  {
    id: 'south-machine-hall',
    position: [-34, 0, 41],
    yaw: Math.PI,
    width: 24,
    depth: 12,
    stories: 1,
    family: 'corrugatedWorkshop',
    enterable: false,
    variant: 10,
  },
  {
    id: 'south-tenements',
    position: [27, 0, 41],
    yaw: Math.PI,
    width: 32,
    depth: 12,
    stories: 2,
    family: 'stuccoBalcony',
    enterable: false,
    variant: 11,
  },
]);

const HERO_PROP_PLACEMENTS = Object.freeze([
  ['market-stall', -27, 0.02, -3.9, 0, 1],
  ['tool-cabinet', -40.5, 0.02, -10.5, Math.PI, 0.84],
  ['tool-cabinet', -45.55, 0.02, -5.12, 0.08, 0.75],
  ['cable-spool', -40.7, 0.02, -5.06, -0.1, 0.79],
  ['electrical-cabinet', -35.25, 0.02, -5.39, Math.PI * 0.5, 0.85],
  ['hand-cart', -32.45, 0.02, -4.95, 0.12, 0.82],
  ['planter', -43.6, 0.02, 4.85, 0, 0.9],
  ['bench', -40.8, 0.02, 4.75, Math.PI, 0.86],
  ['sandbag-pile', -36.9, 0.02, 2.45, 0.12, 0.9],
  ['road-barrier', -31.4, 0.02, -1.9, 0.08, 0.92],
  ['traffic-cone', -34.0, 0.02, 3.75, -0.18, 0.9],
  ['cable-spool', -28.7, 0.02, 4.35, 0.14, 0.86],
  ['shade-canopy', -20.5, 0.02, 4.15, 0.04, 0.86],
  ['market-table', -20.4, 0.02, 4.2, 0.04, 0.82],
  ['produce-basket', -21.1, 0.88, 4.15, 0.08, 0.78],
  ['produce-crate', -19.55, 0.02, 4.1, -0.1, 0.82],
  ['sack-stack', -18.45, 0.02, 4.35, Math.PI * 0.5, 0.72],
  ['wheelbarrow', -8.4, 0.02, 4.45, -0.16, 0.78],
  ['produce-basket', -6.8, 0.02, 4.65, 0.1, 0.8],
  ['shipping-crate', 25.5, 0.02, -4.1, 0.2, 1],
  ['produce-crate', -24.5, 0.02, -4.3, -0.2, 1],
  ['pallet', 30, 0.02, -28.5, 0.1, 1],
  ['oil-barrel', 29.2, 0.02, -27.9, -0.1, 1],
  ['sandbag-pile', -14.8, 0.02, 5.1, Math.PI * 0.5, 1],
  ['hand-cart', -25.5, 0.02, 4.6, -0.15, 1],
  ['market-table', -29, 0.02, 4.7, 0, 1],
  ['chair', -31.2, 0.02, 4.7, 0.5, 1],
  ['stool', -28.1, 0.02, 5.4, -0.3, 1],
  ['street-lamp', -48, 0.02, 4.9, 0, 1],
  ['road-barrier', -17.5, 0.02, -24.5, 0, 1],
  ['bollard', -13.6, 0.02, 5.1, 0, 1],
  ['traffic-cone', -15.3, 0.02, -25.2, 0.2, 1],
  ['direction-sign', -23.7, 0.02, 7, -Math.PI * 0.5, 1],
  ['electrical-cabinet', 45, 0.02, -5.2, Math.PI, 1],
  ['pipe-rack', -45, 0.02, 27.5, Math.PI * 0.5, 1],
  ['air-conditioner', 43.5, 0.48, -34.8, Math.PI, 1],
  ['dumpster', 42.7, 0.02, 27.5, Math.PI * 0.5, 1],
  ['trash-bin', 13, 0.02, 5.1, 0.3, 1],
  ['tire-stack', -43, 0.02, 28.4, -0.2, 1],
  ['gas-cylinder', -40.8, 0.02, 27.8, 0.1, 1],
  ['planter', 22.7, 0.02, 5.15, 0, 1],
  ['bench', 26, 0.02, 5.2, 0, 1],
  ['tool-cabinet', -29.5, 0.02, 34, Math.PI, 1],
  ['workbench', -36, 0.02, 34.2, Math.PI, 1],
  ['fabric-bale', 14.1, 0.02, -28.6, 0.4, 1],
  ['produce-basket', -30.5, 0.9, 4.7, 0, 0.85],
  ['shade-canopy', 17.6, 0.02, -27.2, 0, 1],
  ['wheelbarrow', 20.5, 0.02, 27.8, 0.2, 1],
  ['ladder', -47.2, 0.02, -27, 0.1, 1],
  ['fire-extinguisher', 45.8, 0.02, 5.1, Math.PI, 1],
  ['cable-spool', -13, 0.02, 28.4, 0.2, 1],
  ['generator', -9.8, 0.02, 28.1, -0.1, 1],
  ['water-tank', 46, 0.02, 27.7, 0, 1],
  ['vending-kiosk', 28.5, 0.02, 34, Math.PI, 1],
  ['sack-stack', 12.5, 0.02, -27.7, 0.1, 1],
  ['drum-cart', 36, 0.02, -27.8, -0.2, 1],
  ['compressor', -5.5, 0.02, 28, 0.2, 1],
]);

const INTERIOR_RECIPES = Object.freeze({
  'kestrel-workshop': [
    ['workbench', 3.6, -4.7, Math.PI, 0.9],
    ['tool-cabinet', 5.2, -2.1, -Math.PI * 0.5, 0.85],
    ['generator', -3.8, -4.2, 0, 0.82],
    ['gas-cylinder', -5.1, -2.6, 0, 0.82],
    ['display-shelf', -5.2, 1.0, Math.PI * 0.5, 0.8],
    ['fire-extinguisher', 5.9, 1.7, -Math.PI * 0.5, 0.9],
    ['tire-stack', 3.9, 2.9, 0, 0.85],
  ],
  'kiln-house': [
    ['pallet', -5.8, -5.1, 0, 0.9],
    ['shipping-crate', -5.7, -4.8, 0.1, 0.9],
    ['shipping-crate', -4.3, -4.7, -0.1, 0.82],
    ['oil-barrel', 5.8, -5.3, 0, 0.88],
    ['fabric-bale', 1.55, -5.2, 0.2, 0.92],
    ['pipe-rack', 6.9, 0.7, Math.PI * 0.5, 0.82],
    ['cable-spool', -6.5, 1.5, 0.1, 0.9],
    ['tool-cabinet', -8.65, -5.9, Math.PI * 0.5, 0.92],
    ['workbench', -8.4, 3.55, Math.PI * 0.5, 0.93],
    ['electrical-cabinet', 7.85, 4.45, -Math.PI * 0.5, 0.95],
    ['drum-cart', 7.95, -5.6, Math.PI * 0.25, 0.85],
  ],
  'lantern-cafe': [
    ['market-table', -3.5, -3.8, 0, 0.72],
    ['chair', -4.3, -3.8, Math.PI * 0.5, 0.75],
    ['chair', -2.7, -3.8, -Math.PI * 0.5, 0.75],
    ['market-table', 2.4, -3.4, 0.2, 0.72],
    ['chair', 1.5, -3.2, Math.PI * 0.5, 0.75],
    ['chair', 3.2, -3.6, -Math.PI * 0.5, 0.75],
    ['vending-kiosk', 5.8, 1.3, -Math.PI * 0.5, 0.78],
    ['display-shelf', -5.7, 1.2, Math.PI * 0.5, 0.72],
  ],
});

const ROAD_SURFACES = Object.freeze([
  { id: 'main-avenue', minX: -50, maxX: 50, minZ: -6.4, maxZ: 6.4, surface: 'asphalt' },
  { id: 'cross-street', minX: -24, maxX: -14, minZ: -50, maxZ: 50, surface: 'asphalt' },
  { id: 'east-market-lane', minX: 15, maxX: 21, minZ: -35, maxZ: 35, surface: 'dirt' },
  { id: 'north-service-road', minX: -50, maxX: 50, minZ: -33, maxZ: -25, surface: 'asphalt' },
  { id: 'south-service-road', minX: -50, maxX: 50, minZ: 25, maxZ: 33, surface: 'asphalt' },
]);

const _position = new THREE.Vector3();
const _size = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _local = new THREE.Vector3();
const _normal = new THREE.Vector3();

function assetGet(assets, key) {
  if (!assets) {
    return null;
  }
  if (typeof assets.get === 'function') {
    return assets.get(key);
  }
  return assets[key] ?? null;
}

function assetSet(assets, key, value) {
  if (!assets) {
    return;
  }
  if (typeof assets.set === 'function') {
    assets.set(key, value);
  } else {
    assets[key] = value;
  }
}

function assetDeleteIfOwned(assets, key, value) {
  if (!assets) {
    return;
  }
  if (typeof assets.get === 'function' && typeof assets.delete === 'function') {
    if (assets.get(key) === value) {
      assets.delete(key);
    }
  } else if (assets[key] === value) {
    delete assets[key];
  }
}

function capturePose(name, position, target, fov = 62) {
  return Object.freeze({
    name,
    position: new THREE.Vector3(...position),
    target: new THREE.Vector3(...target),
    fov,
  });
}

export class WorldBuilder {
  constructor(options = {}) {
    this.options = options;
    this.root = null;
    this.context = null;
    this.materials = null;
    this.ownsMaterials = false;
    this.geometryKit = null;
    this.batcher = null;
    this.architecture = null;
    this.props = null;
    this.colliders = [];
    this.coverPoints = [];
    this.physicsColliderRecords = [];
    this.physicsCoverRecords = [];
    this.surfaceZones = [];
    this.interiorLights = [];
    this.districtRoute = null;
    this.poweredShutters = [];
    this.powerLights = [];
    this.powerStage = 0;
    this.worldData = null;
  }

  init(context) {
    return this.build(context);
  }

  build(context) {
    if (!context?.scene) {
      throw new TypeError('WorldBuilder.build(context) requires context.scene');
    }
    if (this.root) {
      this.dispose();
    }
    this.context = context;
    const seed = Number(context.state?.seed ?? 0xc1de71e) >>> 0;
    const layoutRng = namedRng(context.rng, 'world-layout', seed);
    const dressingRng = namedRng(context.rng, 'world-dressing', seed);

    this.root = new THREE.Group();
    this.root.name = 'CinderlineDistrict';
    this.root.userData.seed = seed;
    this.root.userData.bounds = new THREE.Box3(
      new THREE.Vector3(-50, -12, -50),
      new THREE.Vector3(50, 16, 50),
    );

    this.materials =
      assetGet(context.assets, 'materials') ??
      assetGet(context.assets, 'materialLibrary') ??
      null;
    if (!this.materials?.get || !this.materials?.surfaceFor) {
      this.materials = MaterialLibrary.fromContext(context, {
        textureSize: this.options.textureSize ?? 256,
      });
      this.ownsMaterials = true;
      assetSet(context.assets, 'materials', this.materials);
      assetSet(context.assets, 'materialLibrary', this.materials);
    }

    this.geometryKit = new GeometryKit();
    this.batcher = new InstanceBatcher(this.root, this.geometryKit, this.materials);
    this.architecture = new ArchitectureKit({
      root: this.root,
      materials: this.materials,
      geometryKit: this.geometryKit,
      batcher: this.batcher,
      colliders: this.colliders,
      coverPoints: this.coverPoints,
    });
    this.props = new PropFactory({
      batcher: this.batcher,
      colliders: this.colliders,
      coverPoints: this.coverPoints,
    });

    this.buildGround(layoutRng);
    this.buildArchitecture(layoutRng);
    this.dressInteriors(dressingRng);
    this.placeHeroProps();
    this.placeRepeatedStreetDressing(dressingRng);
    this.scatterInstancedDetails(dressingRng);
    this.districtRoute = new DistrictRoute(this);
    if (context.assets?.exchangeAsset) {
      this.colliders.push(createBoxCollider({
        id: 'north-service-condenser',
        center: new THREE.Vector3(26.55, 0.73, -24.58),
        size: new THREE.Vector3(3.42, 1.46, 1.79),
        material: 'metal',
        tags: ['architecture', 'service-equipment'],
      }));
    }
    this.batcher.flush();
    this.registerPhysics(context.physics);
    context.scene.add(this.root);

    const spawn = Object.freeze({
      position: new THREE.Vector3(-44, 0.02, 1.2),
      yaw: -Math.PI * 0.5,
    });
    const relaySpawn = Object.freeze({
      position: new THREE.Vector3(-44.16, 0.02, 3.6),
      yaw: -0.106,
    });
    const enemySpawns = this.createEnemySpawns();
    const capturePoses = Object.freeze({
      wideStreet: capturePose('wide-street', [-44.2, 2.35, 1.2], [-5, 1.25, 0], 64),
      closeFacade: capturePose('close-facade', [-36.9, 2.08, -1.8], [-39.3, 2.75, -6.15], 67),
      enterableInterior: capturePose('enterable-interior', [-42.9, 1.55, -6.55], [-37.6, 1.2, -12.8], 66),
      hipFire: capturePose('hip-fire', [-42.9, 1.55, -6.55], [-37.6, 1.2, -12.8], 66),
      ads: capturePose('ads', [-42.9, 1.55, -6.55], [-37.6, 1.2, -12.8], 60),
      enemy: capturePose('enemy', [23.5, 1.72, 5], [31, 1.35, -2], 47),
      activeCombat: capturePose('active-combat', [-8, 2.0, 5], [14, 1.55, -2], 60),
    });
    const materialAt = (point) => this.materialAt(point);

    const stats = Object.freeze({
      facadeFamilies: Object.keys(FACADE_FAMILIES).length,
      enterableInteriors: this.architecture.buildings.filter((building) => building.spec.enterable).length,
      architecturalModuleTypes: this.architecture.usedModules.size,
      architecturalModuleCatalog: ARCHITECTURAL_MODULE_TYPES.length,
      propArchetypes: this.props.placedArchetypes.size,
      propArchetypeCatalog: PROP_ARCHETYPES.length,
      propPlacements: this.props.propCount,
      instancedDetails: this.batcher.instanceCount,
      proceduralMaterialFamilies: this.materials.familyCount ?? 0,
      colliders: this.colliders.length,
      coverPoints: this.coverPoints.length,
      buildings: this.architecture.buildings.length,
    });
    this.root.userData.worldStats = stats;

    this.worldData = {
      root: this.root,
      spawn,
      relaySpawn,
      enemySpawns,
      colliders: this.colliders,
      coverPoints: this.coverPoints,
      route: this.districtRoute.relays,
      extraction: this.districtRoute.extraction,
      setPowerStage: (stage) => this.setPowerStage(stage),
      setRouteStatus: (activeId, completedIds) => this.districtRoute.setStatus(activeId, completedIds),
      materialAt,
      capturePoses,
      stats,
      dispose: () => this.dispose(),
    };
    return this.worldData;
  }

  addSurface(materialId, size, position, name, options = {}) {
    const mesh = createBeveledMesh(
      this.geometryKit,
      this.materials,
      materialId,
      size,
      position,
      {
        radius: options.radius ?? 0.035,
        castShadow: false,
        receiveShadow: true,
        name,
      },
    );
    mesh.userData.surfaceZone = options.surface ?? materialId;
    this.root.add(mesh);
    return mesh;
  }

  buildGround(layoutRng) {
    const ground = this.addSurface(
      'dirt',
      new THREE.Vector3(100, 0.56, 100),
      new THREE.Vector3(0, -0.28, 0),
      'terrain:compacted-base',
      { radius: 0.08, surface: 'dirt' },
    );
    this.colliders.push(
      createBoxCollider({
        id: 'terrain:base',
        center: new THREE.Vector3(0, -0.28, 0),
        size: new THREE.Vector3(100, 0.56, 100),
        material: 'dirt',
        object: ground,
        tags: ['terrain', 'ground'],
      }),
    );

    const roadMeshes = [
      ['main-avenue', 'asphalt', [100, 0.035, 12.8], [0, 0.012, 0]],
      ['cross-street', 'asphalt', [10, 0.038, 100], [-19, 0.014, 0]],
      ['north-service-road', 'asphalt', [100, 0.035, 8], [0, 0.013, -29]],
      ['south-service-road', 'asphalt', [100, 0.035, 8], [0, 0.013, 29]],
      ['east-market-lane', 'dirt', [6, 0.04, 70], [18, 0.017, 0]],
    ];
    for (const [name, material, size, position] of roadMeshes) {
      this.addSurface(
        material,
        new THREE.Vector3(...size),
        new THREE.Vector3(...position),
        `road:${name}`,
        { radius: 0.025, surface: material },
      );
    }
    this.surfaceZones.push(...ROAD_SURFACES);

    const sidewalkRects = [
      [-37, -6.7, 26, 1.2],
      [-7, -6.7, 16, 1.2],
      [7.5, -6.7, 13, 1.2],
      [35, -6.7, 21, 1.2],
      [-37, 6.7, 26, 1.2],
      [-7, 6.7, 16, 1.2],
      [7.5, 6.7, 13, 1.2],
      [35, 6.7, 21, 1.2],
      [-37, -34.1, 26, 1.3],
      [27, -34.1, 34, 1.3],
      [-34, 34.1, 27, 1.3],
      [27, 34.1, 34, 1.3],
    ];
    for (let i = 0; i < sidewalkRects.length; i += 1) {
      const [x, z, width, depth] = sidewalkRects[i];
      this.addSurface(
        i % 3 === 0 ? 'concreteAggregate' : 'concreteClean',
        new THREE.Vector3(width, 0.12, depth),
        new THREE.Vector3(x, 0.055, z),
        `sidewalk:${i}`,
        { radius: 0.025, surface: 'concrete' },
      );
      this.surfaceZones.push({
        id: `sidewalk:${i}`,
        minX: x - width * 0.5,
        maxX: x + width * 0.5,
        minZ: z - depth * 0.5,
        maxZ: z + depth * 0.5,
        surface: 'concrete',
      });
    }

    const dockCollisionSections = [
      ['left', -38.125, -34.9, 17.75, 5.2],
      ['right', -25.875, -34.9, 1.75, 5.2],
      ['ramp-landing', -28, -36.1, 2.5, 2.8],
    ];
    for (const [id, x, z, width, depth] of dockCollisionSections) {
      const dockSection = this.addSurface(
        'concreteAggregate',
        new THREE.Vector3(width, 0.42, depth),
        new THREE.Vector3(x, 0.21, z),
        `elevation:north-loading-dock:${id}`,
        { radius: 0.05, surface: 'concrete' },
      );
      this.colliders.push(
        createBoxCollider({
          id: `terrain:raised-dock:${id}`,
          center: new THREE.Vector3(x, 0.21, z),
          size: new THREE.Vector3(width, 0.42, depth),
          material: 'concrete',
          object: dockSection,
          tags: ['terrain', 'elevation', 'mantle'],
        }),
      );
    }
    this.surfaceZones.push({
      id: 'raised-dock',
      minX: -47,
      maxX: -25,
      minZ: -37.5,
      maxZ: -32.3,
      surface: 'concrete',
    });

    for (let step = 0; step < 4; step += 1) {
      const top = (step + 1) * 0.105;
      const stair = this.addSurface(
        'concreteAggregate',
        new THREE.Vector3(3.2, top, 0.5),
        new THREE.Vector3(-24.2, top * 0.5, -32.55 - step * 0.48),
        `elevation:dock-step:${step}`,
        { radius: 0.025, surface: 'concrete' },
      );
      this.colliders.push(
        createBoxCollider({
          id: `terrain:dock-step:${step}`,
          center: stair.position,
          size: new THREE.Vector3(3.2, top, 0.5),
          material: 'concrete',
          object: stair,
          tags: ['terrain', 'step'],
        }),
      );
    }
    this.architecture.use('exterior-stair');

    // A true continuous loading ramp exercises the controller's slope path.
    // The authored wedge and its analytic height collider share exact bounds.
    const rampWidth = 2.4;
    const rampRun = 3.6;
    const rampRise = 0.5;
    const rampGeometry = this.geometryKit.profile(
      [
        [-rampRun * 0.5, -rampRise * 0.5],
        [rampRun * 0.5, -rampRise * 0.5],
        [rampRun * 0.5, rampRise * 0.5],
        [-rampRun * 0.5, -rampRise * 0.42],
      ],
      rampWidth,
      0.025,
      2,
    );
    const ramp = new THREE.Mesh(rampGeometry, this.materials.get('concreteAggregate'));
    ramp.name = 'elevation:continuous-loading-ramp';
    ramp.position.set(-28, rampRise * 0.5, -32.9);
    ramp.rotation.y = Math.PI * 0.5;
    ramp.receiveShadow = true;
    ramp.castShadow = false;
    this.root.add(ramp);
    this.colliders.push({
      id: 'terrain:continuous-loading-ramp',
      kind: 'ramp',
      min: new THREE.Vector3(-29.2, 0, -34.7),
      max: new THREE.Vector3(-26.8, rampRise, -31.1),
      rampAxis: 'z',
      rampDirection: -1,
      rampBaseY: 0,
      rampTopY: rampRise,
      material: 'concrete',
      object: ramp,
      tags: ['terrain', 'elevation', 'slope'],
    });
    for (const [side, x] of [['west', -29.28], ['east', -26.72]]) {
      this.colliders.push(
        createBoxCollider({
          id: `terrain:continuous-loading-ramp:${side}-edge`,
          center: new THREE.Vector3(x, rampRise * 0.5, -32.9),
          size: new THREE.Vector3(0.12, rampRise + 0.16, rampRun),
          material: 'metal',
          object: ramp,
          tags: ['terrain', 'elevation', 'slope-edge'],
        }),
      );
    }
    const rampAngle = Math.atan2(rampRise, rampRun);
    for (const x of [-29.25, -26.75]) {
      this.batcher.box(
        'paintedMetal',
        _position.set(x, rampRise * 0.5 + 0.08, -32.9),
        _quaternion.setFromEuler(new THREE.Euler(rampAngle, 0, 0)),
        _scale.set(0.09, 0.14, rampRun),
        { name: 'loading-ramp-edge', radius: 0.028 },
      );
    }
    this.architecture.use('loading-canopy');

    for (const z of [-6.25, 6.25]) {
      for (let x = -48; x <= 48; x += 2) {
        const chipped = layoutRng.chance(0.12);
        this.batcher.box(
          chipped ? 'concreteAggregate' : 'concreteClean',
          _position.set(x, 0.11, z),
          _quaternion.identity(),
          _scale.set(chipped ? 1.72 : 1.86, 0.2, 0.22),
          { name: 'curb', radius: 0.025 },
        );
        this.architecture?.use('curb');
      }
    }
    for (const x of [-24.15, -13.85]) {
      for (let z = -48; z <= 48; z += 2) {
        this.batcher.box(
          'concreteClean',
          _position.set(x, 0.11, z),
          _quaternion.identity(),
          _scale.set(0.22, 0.2, 1.86),
          { name: 'curb', radius: 0.025 },
        );
      }
    }

    for (let marker = -44; marker <= 44; marker += 8) {
      for (const z of [-1.45, 1.45]) {
        this.batcher.box(
          'ceramic',
          _position.set(marker, 0.041, z),
          _quaternion.identity(),
          _scale.set(3.4, 0.018, 0.085),
          { name: 'road-marking', radius: 0.015, receiveShadow: false },
        );
      }
    }
  }

  buildArchitecture(layoutRng) {
    for (const raw of BUILDING_SPECS) {
      const spec = {
        ...raw,
        position: new THREE.Vector3(...raw.position),
        height: raw.stories * 3.15 + layoutRng.range(-0.08, 0.16),
      };
      const building = this.architecture.buildBuilding(spec);
      if (spec.poweredShutter) this.addPoweredShutter(building);
      this.surfaceZones.push({
        id: `floor:${building.spec.id}`,
        minX: building.spec.position.x - building.spec.width * 0.5 + 0.3,
        maxX: building.spec.position.x + building.spec.width * 0.5 - 0.3,
        minZ: building.spec.position.z - building.spec.depth * 0.5 + 0.3,
        maxZ: building.spec.position.z + building.spec.depth * 0.5 - 0.3,
        surface:
          this.materials.get(building.family.base).userData.surface ?? 'concrete',
      });
      if (building.spec.enterable) {
        this.addInteriorPartition(building, layoutRng);
      }
    }

    const boundaryParts = [
      [[-49.65, 1.15, 0], [0.45, 2.3, 100]],
      [[49.65, 1.15, 0], [0.45, 2.3, 100]],
    ];
    for (let i = 0; i < boundaryParts.length; i += 1) {
      const [position, size] = boundaryParts[i];
      const mesh = this.addSurface(
        i === 0 ? 'brick' : 'concreteAggregate',
        new THREE.Vector3(...size),
        new THREE.Vector3(...position),
        `boundary:${i}`,
        { radius: 0.04 },
      );
      this.colliders.push(
        createBoxCollider({
          id: `boundary:${i}`,
          center: mesh.position,
          size: new THREE.Vector3(...size),
          material: i === 0 ? 'masonry' : 'concrete',
          object: mesh,
          tags: ['boundary', 'architecture'],
        }),
      );
    }
  }

  addInteriorPartition(building, layoutRng) {
    const { spec, group, family } = building;
    const partitionZ = -spec.depth * 0.12;
    const randomGap = layoutRng.range(-spec.width * 0.18, spec.width * 0.18);
    const doorWidth = spec.rearPassage?.width ?? 1.4;
    const gapX = spec.rearPassage?.x ?? randomGap;
    building.interior.partitionGapX = gapX;
    const leftWidth = gapX - doorWidth * 0.5 + spec.width * 0.5 - 0.42;
    const rightStart = gapX + doorWidth * 0.5;
    const rightWidth = spec.width * 0.5 - 0.42 - rightStart;
    if (leftWidth > 0.5) {
      this.architecture.addBox(
        group,
        spec,
        family.wall,
        new THREE.Vector3(leftWidth, 2.68, 0.16),
        new THREE.Vector3(-spec.width * 0.5 + 0.42 + leftWidth * 0.5, 1.34, partitionZ),
        { radius: 0.018, collider: true, module: 'wall-segment' },
      );
    }
    if (rightWidth > 0.5) {
      this.architecture.addBox(
        group,
        spec,
        family.wall,
        new THREE.Vector3(rightWidth, 2.68, 0.16),
        new THREE.Vector3(rightStart + rightWidth * 0.5, 1.34, partitionZ),
        { radius: 0.018, collider: true, module: 'wall-segment' },
      );
    }
    this.architecture.addInstance(
      spec,
      family.trim,
      new THREE.Vector3(doorWidth + 0.22, 0.12, 0.28),
      new THREE.Vector3(gapX, 2.58, partitionZ),
      { module: 'door-frame' },
    );
    for (const side of [-1, 1]) {
      this.architecture.addInstance(
        spec,
        family.trim,
        new THREE.Vector3(0.11, 2.56, 0.28),
        new THREE.Vector3(gapX + side * (doorWidth * 0.5 + 0.055), 1.28, partitionZ),
        { module: 'door-frame' },
      );
    }
  }

  addPoweredShutter(building) {
    const { spec, group } = building;
    const { stage, side, z, width, height, label } = spec.poweredShutter;
    const x = (side * spec.width) / 2;
    const slot = this.geometryKit.corrugatedPanel(height - 0.035, width + 0.05, 0.12, 31);
    const shutterMaterial = this.materials.get('paintedMetal').clone();
    shutterMaterial.side = THREE.DoubleSide;
    const shutter = new THREE.Mesh(slot, shutterMaterial);
    shutter.name = `power-shutter:${spec.id}`;
    shutter.position.set(x, height * 0.5, z);
    shutter.rotation.set(0, Math.PI * 0.5, Math.PI * 0.5, 'YXZ');
    shutter.castShadow = true;
    shutter.receiveShadow = true;
    group.add(shutter);

    for (const edge of [-1, 1]) {
      this.architecture.addInstance(spec, 'bareMetal',
        _size.set(0.53, height, 0.13), _local.set(x, height * 0.5, z + edge * (width * 0.5 + 0.063)),
        { module: 'door-frame' });
    }
    this.architecture.addInstance(spec, 'rustedMetal',
      _size.set(0.66, 0.39, width + 0.39), _local.set(x, height + 0.18, z),
      { module: 'rolling-shutter' });

    const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0x873323, toneMapped: false });
    const indicator = new THREE.Mesh(this.geometryKit.beveledBox(0.73, 0.095, 0.88), indicatorMaterial);
    indicator.position.set(x, height + 0.15, z);
    group.add(indicator);

    const center = localToWorld(shutter.position, spec.position, spec.yaw);
    const collider = createBoxCollider({
      id: shutter.name,
      center,
      size: new THREE.Vector3(0.32, height, width),
      yaw: spec.yaw,
      material: 'metal',
      object: shutter,
      tags: ['architecture', 'powered-shutter'],
    });
    this.colliders.push(collider);
    this.poweredShutters.push({
      stage, label, shutter, shutterMaterial, collider, indicatorMaterial, open: false,
      alertPosition: localToWorld(_local.set(x + side * 1.65, 0, z), spec.position, spec.yaw),
    });
  }

  setPowerStage(value) {
    const stage = Math.min(3, Math.max(0, Math.floor(Number(value) || 0)));
    if (this.powerStage !== stage) {
      const staticColliders = this.context?.physics?.staticColliders;
      for (const gate of this.poweredShutters) {
        const open = stage >= gate.stage;
        if (gate.open === open) continue;
        gate.open = open;
        gate.collider.routeOpen = open;
        gate.shutter.visible = !open;
        gate.indicatorMaterial.color.setHex(open ? 0x9bf3c6 : 0x873323);
        if (!gate.record || !staticColliders) continue;
        const index = staticColliders.indexOf(gate.record);
        if (open && index >= 0) staticColliders.splice(index, 1);
        if (!open && index < 0) staticColliders.push(gate.record);
      }
      for (const { light, stage: threshold, idle, active } of this.powerLights) {
        light.intensity = stage >= threshold ? active : idle;
      }
      this.districtRoute?.setExtractionPowered(stage >= 3);
      this.powerStage = stage;
    }
    const changedGate = this.poweredShutters.find((gate) => gate.stage === stage);
    if (changedGate) {
      return { label: changedGate.label, alertPosition: changedGate.alertPosition.clone() };
    }
    if (stage === 3 && this.districtRoute) {
      return {
        label: 'Cross Street extraction beacon',
        alertPosition: this.districtRoute.extraction.position.clone(),
      };
    }
    return null;
  }

  dressInteriors(dressingRng) {
    for (const building of this.architecture.buildings) {
      if (!building.spec.enterable) {
        continue;
      }
      const recipe = INTERIOR_RECIPES[building.spec.id] ?? [];
      for (const [type, localX, localZ, localYaw, scale] of recipe) {
        localToWorld(
          _local.set(localX, 0.02, localZ),
          building.spec.position,
          building.spec.yaw,
          _position,
        );
        this.props.place(type, _position.clone(), building.spec.yaw + localYaw, scale, {
          surface:
            type.includes('crate') || type === 'pallet' || type === 'workbench'
              ? 'wood'
              : undefined,
        });
      }

      if (building.spec.id === 'saffron-arcade') {
        buildSaffronExchange(this, building, dressingRng);
        continue;
      }
      const isKiln = building.spec.id === 'kiln-house';
      if (isKiln) this.dressKilnHouse(building.spec);

      for (let lightIndex = -1; lightIndex <= 1; lightIndex += 2) {
        localToWorld(
          _local.set(lightIndex * building.spec.width * 0.22, 2.68, -building.spec.depth * 0.1),
          building.spec.position,
          building.spec.yaw,
          _position,
        );
        const lamp = new THREE.PointLight(isKiln ? 0xc4e9f1 : 0xffb45d, 25, 8.5, 1.65);
        lamp.position.copy(_position);
        lamp.name = `interior-light:${building.spec.id}:${lightIndex}`;
        lamp.castShadow = false;
        lamp.userData.captureStable = true;
        this.root.add(lamp);
        this.interiorLights.push(lamp);
        this.batcher.box(
          'lamp',
          _position,
          _quaternion.identity(),
          _scale.set(0.38, 0.08, 0.22),
          { name: 'interior-luminaire', receiveShadow: false },
        );
      }
    }
  }

  dressKilnHouse(spec) {
    for (const z of [-6.45, 1.5, 5.9]) {
      this.architecture.addInstance(
        spec, 'rustedMetal',
        _size.set(20.45, 0.22, 0.2), _local.set(0, 2.92, z),
        { module: 'roof-screen' },
      );
      for (const x of [-6.65, 5.8]) {
        this.architecture.addInstance(
          spec, 'paintedMetal',
          _size.set(2.25, 0.13, 0.39), _local.set(x, 2.78, z),
          { module: 'wall-lamp', receiveShadow: false },
        );
        this.architecture.addInstance(
          spec, 'lamp',
          _size.set(1.96, 0.047, 0.19), _local.set(x, 2.71, z),
          { module: 'wall-lamp', receiveShadow: false },
        );
      }
    }
  }

  placeHeroProps() {
    for (const [type, x, y, z, yaw, scale] of HERO_PROP_PLACEMENTS) {
      this.props.place(type, new THREE.Vector3(x, y, z), yaw, scale);
    }
  }

  placeRepeatedStreetDressing(rng) {
    for (let index = 0; index < 12; index += 1) {
      const side = index & 1 ? -1 : 1;
      const z = -23 + Math.floor(index / 2) * 9.1;
      this.props.place(
        'market-stall',
        new THREE.Vector3(18 + side * 2.35, 0.02, z),
        side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
        rng.range(0.82, 0.98),
        { cover: false },
      );
      this.props.place(
        index % 3 === 0 ? 'sack-stack' : 'produce-crate',
        new THREE.Vector3(18 + side * 1.48, 0.02, z + rng.range(-1.2, 1.2)),
        rng.range(-0.25, 0.25),
        rng.range(0.76, 0.94),
      );
    }

    const coverPlacements = [
      ['road-barrier', -6, 2.4, 0],
      ['road-barrier', 7, -2.4, Math.PI],
      ['sandbag-pile', 26, 4.8, 0],
      ['sandbag-pile', 31, -4.7, Math.PI],
      ['shipping-crate', -2, -4.4, 0.2],
      ['shipping-crate', 11.2, 4.3, -0.2],
      ['oil-barrel', 14.2, 3.8, 0],
      ['oil-barrel', -28, -4.2, 0],
      ['dumpster', -2, 27.6, Math.PI],
      ['pallet', 38, -27.8, 0],
      ['shipping-crate', 8.9, -31.9, -0.08],
      ['shipping-crate', 24, -26.55, 0.1],
    ];
    for (const [type, x, z, yaw] of coverPlacements) {
      this.props.place(type, new THREE.Vector3(x, 0.02, z), yaw, rng.range(0.9, 1.04));
    }

    for (let x = -44; x <= 44; x += 8) {
      for (const z of [-5.1, 5.1]) {
        if (Math.abs(x + 19) < 5) {
          continue;
        }
        this.props.place(
          x % 16 === 4 ? 'street-lamp' : 'bollard',
          new THREE.Vector3(x, 0.02, z),
          z < 0 ? 0 : Math.PI,
          x % 16 === 4 ? 0.92 : 0.9,
          { cover: false },
        );
      }
    }

    for (let index = 0; index < 18; index += 1) {
      const north = index < 9;
      const x = -44 + (index % 9) * 10.5;
      const z = north ? -25.1 : 25.1;
      const type = index % 4 === 0 ? 'traffic-cone' : index % 3 === 0 ? 'trash-bin' : 'bollard';
      this.props.place(
        type,
        new THREE.Vector3(x, 0.02, z),
        rng.range(-0.2, 0.2),
        rng.range(0.82, 1),
        { cover: false },
      );
    }
  }

  scatterInstancedDetails(rng) {
    for (let index = 0; index < 150; index += 1) {
      const alongMain = rng.chance(0.58);
      const side = rng.sign();
      let x;
      let z;
      if (alongMain) {
        x = rng.range(-48, 48);
        z = side * rng.range(5.35, 6.05);
      } else {
        x = -19 + side * rng.range(4.2, 4.85);
        z = rng.range(-48, 48);
      }
      const chipScale = rng.range(0.035, 0.16);
      this.batcher.box(
        rng.chance(0.22) ? 'brick' : 'concreteAggregate',
        _position.set(x, 0.045 + chipScale * 0.2, z),
        _quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng.range(-Math.PI, Math.PI)),
        _scale.set(chipScale * rng.range(1.2, 2.8), chipScale * 0.45, chipScale),
        { name: 'street-rubble', radius: 0.08 },
      );
    }

    for (let index = 0; index < 52; index += 1) {
      const north = index & 1;
      const x = rng.range(-48, 48);
      const z = north ? rng.range(-35, -33.7) : rng.range(33.7, 35);
      for (let leaf = 0; leaf < 3; leaf += 1) {
        const angle = (leaf / 3) * Math.PI + rng.range(-0.2, 0.2);
        this.batcher.box(
          'foliage',
          _position.set(x + Math.cos(angle) * 0.08, 0.18, z + Math.sin(angle) * 0.08),
          _quaternion.setFromEuler(new THREE.Euler(0, -angle, rng.range(-0.42, 0.42))),
          _scale.set(0.045, rng.range(0.28, 0.52), 0.02),
          { name: 'weed-cluster', radius: 0.12 },
        );
      }
    }

    for (let index = 0; index < 34; index += 1) {
      const x = -47 + index * 2.8;
      const z = index & 1 ? -29 : 29;
      this.batcher.box(
        'bareMetal',
        _position.set(x, 0.035, z + rng.range(-0.22, 0.22)),
        _quaternion.identity(),
        _scale.set(0.62, 0.025, 0.34),
        { name: 'drainage-grate', radius: 0.02 },
      );
      for (let slot = -2; slot <= 2; slot += 1) {
        this.batcher.box(
          'rustedMetal',
          _position.set(x + slot * 0.11, 0.052, z),
          _quaternion.identity(),
          _scale.set(0.035, 0.02, 0.28),
          { name: 'drainage-slot', radius: 0.015 },
        );
      }
    }
    this.architecture.use('gutter');

    for (let index = 0; index < 42; index += 1) {
      const x = -47 + (index % 21) * 4.6;
      const z = index < 21 ? -33.45 : 33.45;
      this.batcher.box(
        'paintedMetal',
        _position.set(x, rng.range(2.7, 3.5), z),
        _quaternion.setFromEuler(new THREE.Euler(0, 0, rng.range(-0.06, 0.06))),
        _scale.set(4.45, 0.025, 0.025),
        { name: 'overhead-utility-cable', radius: 0.2, receiveShadow: false },
      );
    }
  }

  createEnemySpawns() {
    const definitions = [
      ['sentinel-west', -24, 0.02, -1.7, -Math.PI * 0.5, 'rifleman'],
      ['arcade-guard', -34, 0.02, -4.4, 0, 'rifleman'],
      ['crossroad-watch', -18.8, 0.02, -19, Math.PI, 'marksman'],
      ['market-patrol', 18, 0.02, -20, 0, 'rifleman'],
      ['kiln-corner', 28.5, 0.02, -4.2, 0.4, 'support'],
      ['office-front', 38, 0.02, 4.2, Math.PI, 'rifleman'],
      ['south-lane', 7, 0.02, 28.2, Math.PI * 0.5, 'flanker'],
      ['north-lane', -7, 0.02, -28.2, -Math.PI * 0.5, 'rifleman'],
      ['depot-door', 12, 0.02, 4.1, Math.PI, 'support'],
      ['foundry-dock', -31, 0.46, -35.1, 0, 'marksman'],
      ['service-east', 35, 0.02, 28.7, Math.PI * 0.5, 'flanker'],
      ['market-rear', 18, 0.02, 20, Math.PI, 'rifleman'],
    ];
    return definitions.map(([id, x, y, z, yaw, role], index) => {
      const position = new THREE.Vector3(x, y, z);
      return Object.freeze({
        id,
        position,
        yaw,
        role,
        squad: index % 3,
        patrol: Object.freeze([
          position.clone(),
          new THREE.Vector3(
            THREE.MathUtils.clamp(x + (index & 1 ? -5 : 5), -46, 46),
            y,
            THREE.MathUtils.clamp(z + (index % 3 - 1) * 4, -46, 46),
          ),
        ]),
      });
    });
  }

  registerPhysics(physics) {
    if (!physics) {
      return;
    }
    for (const collider of this.colliders) {
      const record = physics.addStatic(collider);
      this.physicsColliderRecords.push(record);
      if (collider.tags?.includes('powered-shutter')) {
        this.poweredShutters.find((gate) => gate.collider === collider).record = record;
      }
    }
    for (const point of this.coverPoints) {
      this.physicsCoverRecords.push(physics.addCoverPoint(point));
    }
  }

  materialAt(point) {
    if (!point) {
      return this.materials.surfaceFor('dirt');
    }
    for (let i = this.colliders.length - 1; i >= 0; i -= 1) {
      const collider = this.colliders[i];
      if (collider.id === 'terrain:base' || collider.routeOpen) {
        continue;
      }
      if (pointNearCollider(point, collider, 0.18)) {
        return this.materials.surfaceFor(collider.material);
      }
    }
    for (let i = 0; i < this.surfaceZones.length; i += 1) {
      const zone = this.surfaceZones[i];
      if (
        point.x >= zone.minX &&
        point.x <= zone.maxX &&
        point.z >= zone.minZ &&
        point.z <= zone.maxZ
      ) {
        return this.materials.surfaceFor(zone.surface);
      }
    }
    return this.materials.surfaceFor('dirt');
  }

  reset() {
    this.setPowerStage(0);
    return this.worldData;
  }

  fixedUpdate() {}

  update() {}

  dispose() {
    if (!this.root) {
      return;
    }
    const physics = this.context?.physics;
    if (physics?.staticColliders && this.physicsColliderRecords.length) {
      const owned = new Set(this.physicsColliderRecords);
      for (let index = physics.staticColliders.length - 1; index >= 0; index -= 1) {
        if (owned.has(physics.staticColliders[index])) {
          physics.staticColliders.splice(index, 1);
        }
      }
    }
    if (physics?.coverPoints && this.physicsCoverRecords.length) {
      const owned = new Set(this.physicsCoverRecords);
      for (let index = physics.coverPoints.length - 1; index >= 0; index -= 1) {
        if (owned.has(physics.coverPoints[index])) {
          physics.coverPoints.splice(index, 1);
        }
      }
    }
    this.physicsColliderRecords.length = 0;
    this.physicsCoverRecords.length = 0;

    this.root.removeFromParent();
    this.districtRoute?.dispose();
    for (const gate of this.poweredShutters) {
      gate.indicatorMaterial.dispose();
      gate.shutterMaterial.dispose();
    }
    this.batcher?.dispose();
    this.geometryKit?.dispose();
    if (this.ownsMaterials) {
      assetDeleteIfOwned(this.context?.assets, 'materials', this.materials);
      assetDeleteIfOwned(this.context?.assets, 'materialLibrary', this.materials);
      this.materials.dispose();
    }

    this.colliders.length = 0;
    this.coverPoints.length = 0;
    this.surfaceZones.length = 0;
    this.interiorLights.length = 0;
    this.poweredShutters.length = 0;
    this.powerLights.length = 0;
    this.powerStage = 0;
    this.districtRoute = null;
    this.root = null;
    this.context = null;
    this.materials = null;
    this.geometryKit = null;
    this.batcher = null;
    this.architecture = null;
    this.props = null;
    this.worldData = null;
    this.ownsMaterials = false;
  }
}

export default WorldBuilder;
