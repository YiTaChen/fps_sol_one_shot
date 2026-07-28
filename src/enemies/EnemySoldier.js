import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);

function makeNoiseTexture(seed = 0x6d2b79f5, size = 64) {
  const data = new Uint8Array(size * size * 4);
  let state = seed >>> 0;
  const values = new Uint8Array(size * size);
  for (let i = 0; i < values.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const grain = 188 + ((state >>> 26) & 31);
    const warp = Math.round(
      15 * Math.sin((i % size) * 0.63) +
      11 * Math.sin(Math.floor(i / size) * 0.47),
    );
    values[i] = Math.max(126, Math.min(235, grain + warp));
  }
  for (let i = 0; i < values.length; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    const edgeWear = (x % 17 === 0 || y % 23 === 0) ? 16 : 0;
    const v = Math.min(255, values[i] + edgeWear);
    const j = i * 4;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function material(color, roughness, metalness, map, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    map,
    ...extra,
  });
}

function mesh(geometry, materialValue, name, castShadow = true) {
  const value = new THREE.Mesh(geometry, materialValue);
  value.name = name;
  value.castShadow = castShadow;
  value.receiveShadow = true;
  return value;
}

function markHitZone(object, enemyId, zone) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.enemyId = enemyId;
    child.userData.hitZone = zone;
    child.userData.enemyHitbox = true;
  });
}

function createStrapCurve(x, y, z, side) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(x + side * 0.035, y - 0.2, z - 0.045),
    new THREE.Vector3(x + side * 0.015, y - 0.43, z),
  ]);
}

export function createEnemySharedAssets() {
  const fabricMap = makeNoiseTexture(0x0f4aa83b);
  const polymerMap = makeNoiseTexture(0x79d14f2d, 32);
  polymerMap.repeat.set(5, 5);

  const palettes = [
    { cloth: 0x56604d, clothDark: 0x252c27, armour: 0x343b32, accent: 0x846f46 },
    { cloth: 0x5b5144, clothDark: 0x292725, armour: 0x3e4238, accent: 0x756248 },
    { cloth: 0x4d5659, clothDark: 0x252a2d, armour: 0x353a3b, accent: 0x6c7257 },
    { cloth: 0x625d4e, clothDark: 0x2e302b, armour: 0x3c4036, accent: 0x7b6546 },
  ].map((colors) => ({
    cloth: material(colors.cloth, 0.92, 0.01, fabricMap),
    clothDark: material(colors.clothDark, 0.94, 0, fabricMap),
    armour: material(colors.armour, 0.72, 0.08, polymerMap),
    accent: material(colors.accent, 0.84, 0.02, fabricMap),
  }));

  const sharedMaterials = {
    skin: material(0x7a5745, 0.88, 0, fabricMap),
    glove: material(0x202522, 0.86, 0.01, polymerMap),
    boot: material(0x171b19, 0.78, 0.02, polymerMap),
    weapon: material(0x171b1b, 0.43, 0.68, polymerMap),
    weaponEdge: material(0x4d5350, 0.3, 0.82, polymerMap),
    optic: material(0x183536, 0.12, 0.1, null, {
      emissive: 0x0a2728,
      emissiveIntensity: 0.45,
    }),
    lens: material(0x1c4c4a, 0.06, 0.1, null, {
      transparent: true,
      opacity: 0.72,
    }),
    buckle: material(0x6a6d64, 0.4, 0.72, polymerMap),
  };

  const geometries = {
    torso: new RoundedBoxGeometry(0.47, 0.64, 0.25, 3, 0.075),
    vest: new RoundedBoxGeometry(0.53, 0.47, 0.32, 3, 0.055),
    pelvis: new RoundedBoxGeometry(0.39, 0.25, 0.25, 3, 0.06),
    pouch: new RoundedBoxGeometry(0.14, 0.17, 0.09, 2, 0.025),
    pack: new RoundedBoxGeometry(0.38, 0.43, 0.16, 3, 0.045),
    limbUpper: new THREE.CapsuleGeometry(0.085, 0.29, 4, 8),
    limbLower: new THREE.CapsuleGeometry(0.075, 0.29, 4, 8),
    hand: new RoundedBoxGeometry(0.105, 0.14, 0.075, 2, 0.025),
    head: new THREE.SphereGeometry(0.145, 14, 10),
    neck: new THREE.CylinderGeometry(0.07, 0.08, 0.13, 10),
    helmet: new THREE.SphereGeometry(0.168, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    helmetRim: new THREE.CylinderGeometry(0.175, 0.175, 0.035, 16),
    boot: new RoundedBoxGeometry(0.14, 0.16, 0.29, 3, 0.035),
    kneepad: new RoundedBoxGeometry(0.13, 0.15, 0.055, 2, 0.025),
    rifleReceiver: new RoundedBoxGeometry(0.12, 0.16, 0.43, 3, 0.024),
    rifleHandguard: new RoundedBoxGeometry(0.105, 0.12, 0.38, 2, 0.02),
    rifleStock: new RoundedBoxGeometry(0.13, 0.18, 0.3, 3, 0.035),
    rifleGrip: new RoundedBoxGeometry(0.09, 0.2, 0.105, 2, 0.02),
    rifleMag: new RoundedBoxGeometry(0.105, 0.28, 0.14, 2, 0.025),
    barrel: new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10),
    muzzle: new THREE.CylinderGeometry(0.043, 0.035, 0.12, 10),
    optic: new RoundedBoxGeometry(0.09, 0.1, 0.17, 2, 0.02),
    opticLens: new THREE.CylinderGeometry(0.037, 0.037, 0.006, 12),
    rail: new RoundedBoxGeometry(0.095, 0.025, 0.5, 2, 0.008),
    earpiece: new THREE.CylinderGeometry(0.04, 0.04, 0.025, 10),
    antenna: new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6),
  };

  const ownedMaterials = [
    ...palettes.flatMap((entry) => Object.values(entry)),
    ...Object.values(sharedMaterials),
  ];

  return {
    fabricMap,
    polymerMap,
    palettes,
    materials: sharedMaterials,
    geometries,
    dispose() {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((value) => value.dispose());
      fabricMap.dispose();
      polymerMap.dispose();
    },
  };
}

function createRifle(assets, enemyId) {
  const { geometries: geometry, materials: materials } = assets;
  const rifle = new THREE.Group();
  rifle.name = `enemy-${enemyId}-carbine`;

  const receiver = mesh(geometry.rifleReceiver, materials.weapon, 'receiver');
  const handguard = mesh(geometry.rifleHandguard, materials.weapon, 'vented-handguard');
  handguard.position.z = -0.38;
  const stock = mesh(geometry.rifleStock, materials.weapon, 'stock');
  stock.position.set(0, -0.005, 0.35);
  const grip = mesh(geometry.rifleGrip, materials.weapon, 'pistol-grip');
  grip.position.set(0, -0.145, 0.1);
  grip.rotation.x = -0.18;
  const mag = mesh(geometry.rifleMag, materials.weaponEdge, 'magazine');
  mag.position.set(0, -0.21, -0.04);
  mag.rotation.x = -0.14;
  const barrel = mesh(geometry.barrel, materials.weaponEdge, 'barrel');
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.74;
  const muzzle = mesh(geometry.muzzle, materials.weaponEdge, 'muzzle-device');
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = -1.03;
  const rail = mesh(geometry.rail, materials.weaponEdge, 'upper-rail');
  rail.position.set(0, 0.095, -0.2);
  const optic = mesh(geometry.optic, materials.weapon, 'optic-housing');
  optic.position.set(0, 0.16, -0.08);
  const opticLens = mesh(geometry.opticLens, materials.lens, 'optic-lens', false);
  opticLens.rotation.x = Math.PI / 2;
  opticLens.position.set(0, 0.16, -0.17);

  rifle.add(receiver, handguard, stock, grip, mag, barrel, muzzle, rail, optic, opticLens);

  for (let i = 0; i < 5; i += 1) {
    const vent = mesh(
      new THREE.BoxGeometry(0.125, 0.012, 0.035),
      materials.weaponEdge,
      `handguard-vent-${i}`,
    );
    vent.position.set(0, 0.066, -0.25 - i * 0.072);
    rifle.add(vent);
  }

  rifle.userData.muzzle = new THREE.Object3D();
  rifle.userData.muzzle.position.set(0, 0, -1.1);
  rifle.add(rifle.userData.muzzle);
  markHitZone(rifle, enemyId, 'weapon');
  return rifle;
}

export function createEnemySoldier(id, visualVariant, assets) {
  const palette = assets.palettes[visualVariant % assets.palettes.length];
  const geometry = assets.geometries;
  const materials = assets.materials;
  const root = new THREE.Group();
  root.name = `enemy-soldier-${id}`;
  root.userData.enemyId = id;
  root.userData.enemyRoot = true;

  const pelvis = mesh(geometry.pelvis, palette.clothDark, 'pelvis');
  pelvis.position.y = 0.94;
  root.add(pelvis);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.29;
  root.add(torsoPivot);
  const torso = mesh(geometry.torso, palette.cloth, 'combat-shirt');
  const vest = mesh(geometry.vest, palette.armour, 'layered-armour-vest');
  vest.position.z = -0.005;
  torsoPivot.add(torso, vest);
  markHitZone(torsoPivot, id, 'torso');

  const neck = mesh(geometry.neck, materials.skin, 'neck');
  neck.position.y = 0.37;
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.5;
  torsoPivot.add(headPivot);
  const head = mesh(geometry.head, materials.skin, 'head');
  head.scale.set(0.92, 1.06, 0.94);
  const helmet = mesh(geometry.helmet, palette.armour, 'helmet-shell');
  helmet.position.y = 0.045;
  helmet.rotation.x = -0.04;
  const helmetRim = mesh(geometry.helmetRim, palette.armour, 'helmet-rim');
  helmetRim.position.set(0, -0.003, -0.015);
  const earpiece = mesh(geometry.earpiece, materials.weapon, 'communications-earpiece');
  earpiece.rotation.z = Math.PI / 2;
  earpiece.position.set(-0.155, -0.01, 0);
  const antenna = mesh(geometry.antenna, materials.weaponEdge, 'radio-antenna');
  antenna.position.set(-0.145, 0.13, 0.04);
  antenna.rotation.z = -0.13;
  headPivot.add(head, helmet, helmetRim, earpiece, antenna);
  markHitZone(headPivot, id, 'head');

  const pack = mesh(geometry.pack, palette.armour, 'equipment-pack');
  pack.position.set(0, 0.01, 0.21);
  torsoPivot.add(pack);
  markHitZone(pack, id, 'torso');

  const pouches = [];
  for (let i = 0; i < 4; i += 1) {
    const pouch = mesh(geometry.pouch, palette.accent, `magazine-pouch-${i}`);
    pouch.position.set((i - 1.5) * 0.12, -0.11, -0.19);
    pouch.rotation.x = -0.05;
    torsoPivot.add(pouch);
    pouches.push(pouch);
  }

  const straps = [-1, 1].map((side) => {
    const curve = createStrapCurve(side * 0.14, 0.25, -0.175, side);
    const strap = mesh(
      new THREE.TubeGeometry(curve, 8, 0.014, 5, false),
      palette.accent,
      side < 0 ? 'left-shoulder-strap' : 'right-shoulder-strap',
    );
    torsoPivot.add(strap);
    return strap;
  });

  function makeLeg(side) {
    const upperPivot = new THREE.Group();
    upperPivot.name = side < 0 ? 'left-leg' : 'right-leg';
    upperPivot.position.set(side * 0.125, 0.87, 0);
    root.add(upperPivot);
    const upper = mesh(geometry.limbUpper, palette.cloth, 'thigh');
    upper.position.y = -0.23;
    upperPivot.add(upper);

    const knee = new THREE.Group();
    knee.position.y = -0.49;
    upperPivot.add(knee);
    const lower = mesh(geometry.limbLower, palette.clothDark, 'shin');
    lower.position.y = -0.22;
    knee.add(lower);
    const kneepad = mesh(geometry.kneepad, palette.armour, 'kneepad');
    kneepad.position.set(0, 0.02, -0.075);
    knee.add(kneepad);

    const boot = mesh(geometry.boot, materials.boot, 'tactical-boot');
    boot.position.set(0, -0.31, -0.07);
    knee.add(boot);
    markHitZone(upperPivot, id, 'leg');
    return { upperPivot, knee, boot };
  }

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'left-arm' : 'right-arm';
    shoulder.position.set(side * 0.31, 0.23, -0.02);
    torsoPivot.add(shoulder);
    const upper = mesh(geometry.limbUpper, palette.cloth, 'upper-arm');
    upper.position.y = -0.2;
    upper.scale.set(0.92, 0.92, 0.92);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.43;
    shoulder.add(elbow);
    const lower = mesh(geometry.limbLower, palette.clothDark, 'forearm');
    lower.position.y = -0.19;
    lower.scale.set(0.88, 0.88, 0.88);
    elbow.add(lower);
    const hand = mesh(geometry.hand, materials.glove, 'gloved-hand');
    hand.position.y = -0.42;
    elbow.add(hand);
    markHitZone(shoulder, id, 'arm');
    return { shoulder, elbow, hand };
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  const rifle = createRifle(assets, id);
  rifle.position.set(0.09, 0.01, -0.35);
  rifle.rotation.set(0.02, -0.03, 0);
  torsoPivot.add(rifle);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x070908,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const contactShadowGeometry = new THREE.CircleGeometry(0.42, 20);
  const contactShadow = mesh(
    contactShadowGeometry,
    contactShadowMaterial,
    'soldier-contact-shadow',
    false,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);

  const ownedGeometries = [
    ...straps.map((strap) => strap.geometry),
    ...rifle.children
      .filter((child) => child.name.startsWith('handguard-vent'))
      .map((child) => child.geometry),
    contactShadowGeometry,
  ];
  const ownedMaterials = [contactShadowMaterial];

  const rig = {
    root,
    torsoPivot,
    headPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    rifle,
    muzzle: rifle.userData.muzzle,
    contactShadow,
    pose: 'idle',
    stride: 0,
    recoil: 0,
    hit: 0,
    death: 0,
    deathSide: 0,
    aimWeight: 0,
    lastGroundY: 0,
    setGround(y) {
      root.position.y = y;
      this.lastGroundY = y;
    },
    setPose(pose) {
      this.pose = pose;
    },
    animate(dt, motion = 0, aim = 0, firing = false, hit = 0, dead = false) {
      this.stride += dt * (2.2 + motion * 7.5);
      this.recoil = THREE.MathUtils.damp(this.recoil, firing ? 1 : 0, 23, dt);
      this.hit = THREE.MathUtils.damp(this.hit, hit, 13, dt);
      this.death = THREE.MathUtils.damp(this.death, dead ? 1 : 0, 5.2, dt);
      this.aimWeight = THREE.MathUtils.damp(this.aimWeight, aim, 8.5, dt);

      if (this.death > 0.02) {
        const fall = this.death;
        torsoPivot.rotation.x = -0.08 - fall * 0.72;
        torsoPivot.rotation.z = fall * (0.28 + this.deathSide * 0.94);
        headPivot.rotation.x = fall * 0.32;
        leftArm.shoulder.rotation.set(-0.25, 0, 0.55 + fall);
        rightArm.shoulder.rotation.set(-0.18, 0, -0.5 - fall * 0.5);
        leftLeg.upperPivot.rotation.x = 0.24 * fall;
        rightLeg.upperPivot.rotation.x = -0.32 * fall;
        rifle.rotation.x = 0.1 + fall * 0.72;
        rifle.rotation.z = -fall * 0.42;
        contactShadow.scale.setScalar(1 + fall * 0.5);
        return;
      }

      const gait = Math.sin(this.stride);
      const gaitOpposite = Math.sin(this.stride + Math.PI);
      const walkSwing = motion * 0.58;
      leftLeg.upperPivot.rotation.x = gait * walkSwing;
      rightLeg.upperPivot.rotation.x = gaitOpposite * walkSwing;
      leftLeg.knee.rotation.x = Math.max(0, -gait) * motion * 0.52;
      rightLeg.knee.rotation.x = Math.max(0, -gaitOpposite) * motion * 0.52;

      const aimRaise = this.aimWeight;
      leftArm.shoulder.rotation.x = -0.2 - aimRaise * 1.18 - gaitOpposite * motion * 0.12;
      rightArm.shoulder.rotation.x = -0.18 - aimRaise * 1.32 - gait * motion * 0.12;
      leftArm.shoulder.rotation.z = 0.14 + aimRaise * 0.74;
      rightArm.shoulder.rotation.z = -0.14 - aimRaise * 0.48;
      leftArm.elbow.rotation.x = -0.45 - aimRaise * 0.65;
      rightArm.elbow.rotation.x = -0.32 - aimRaise * 0.82;
      torsoPivot.rotation.x = -aimRaise * 0.08 + this.hit * 0.11;
      torsoPivot.rotation.z = this.hit * 0.13;
      headPivot.rotation.x = aimRaise * 0.04;
      rifle.position.y = 0.01 + aimRaise * 0.18;
      rifle.position.z = -0.35 - aimRaise * 0.06 + this.recoil * 0.08;
      rifle.rotation.x = 0.02 - aimRaise * 0.08 + this.recoil * 0.06;
      root.position.y = this.lastGroundY + Math.abs(gait) * motion * 0.018;
      contactShadow.position.y = -root.position.y + this.lastGroundY - 0.048;
    },
    faceDirection(direction, rate, dt) {
      const targetYaw = Math.atan2(-direction.x, -direction.z);
      const delta = Math.atan2(
        Math.sin(targetYaw - root.rotation.y),
        Math.cos(targetYaw - root.rotation.y),
      );
      root.rotation.y += THREE.MathUtils.clamp(delta, -rate * dt, rate * dt);
    },
    muzzleWorld(target = new THREE.Vector3()) {
      return this.muzzle.getWorldPosition(target);
    },
    forward(target = new THREE.Vector3()) {
      return this.rifle.getWorldDirection(target).multiplyScalar(-1).normalize();
    },
    dispose() {
      ownedGeometries.forEach((value) => value.dispose());
      ownedMaterials.forEach((value) => value.dispose());
      root.removeFromParent();
    },
  };

  rig.setGround(0);
  root.up.copy(UP);
  return rig;
}
