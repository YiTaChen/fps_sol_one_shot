import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPON_DEFINITIONS } from './Arsenal.js';
import { ProjectileSystem } from './ProjectileSystem.js';
import { buildVariantModel } from './VariantModel.js';
import { acquireWeaponSurfaces, makeWeaponMark } from './WeaponSurfaces.js';

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UP = new THREE.Vector3();
const MUZZLE = new THREE.Vector3();
const TRACER_END = new THREE.Vector3();
const LOCAL_TARGET = new THREE.Vector3();
const POSE_POSITION = new THREE.Vector3();
const HIP_POSITION = new THREE.Vector3(0.242, -0.24, -0.79);
const ADS_POSITION = new THREE.Vector3(0, -0.18, -0.6);
const SPRINT_POSITION = new THREE.Vector3(0.38, -0.39, -0.24);
const INSPECT_POSITION = new THREE.Vector3(0.16, -0.15, -1.08);
const INSPECT_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 1.14, 0.11, 'YXZ'));
const INSPECT_LEFT_ELBOW = new THREE.Vector3(-0.40, -0.83, -0.55);
const INSPECT_RIGHT_ELBOW = new THREE.Vector3(0.62, -0.77, -0.55);
const SLEEVE_AXIS = new THREE.Vector3(0, 0, 1);
const SLEEVE_END = new THREE.Vector3();
const SLEEVE_DIR = new THREE.Vector3();
const INSPECT_DURATION = 1.85;
const LEFT_HAND_HOME = new THREE.Vector3(-0.025, -0.006, -0.34);
const POSE_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const POSE_QUATERNION = new THREE.Quaternion();
const HIP_QUATERNION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.038, -0.142, -0.032, 'YXZ'),
);
const ADS_QUATERNION = new THREE.Quaternion();
const SPRINT_QUATERNION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.17, -0.42, 0.38, 'YXZ'),
);
const TEMP_QUATERNION = new THREE.Quaternion();
const TEMP_COLOR = new THREE.Color();
const PAINT = {
  vesper: [0x6c8392, 0x626e70],
  smg: [0x78837f, 0x67726e],
  precision: [0x7b8278, 0x687368],
  sidearm: [0x6e879b, 0x586c76],
  'heavy-sidearm': [0x79858d, 0x5e696d],
  melee: [0x748993, 0x5c6c68],
};

const RECOIL_PATTERN = Object.freeze([
  [0.0125, -0.0012],
  [0.0142, 0.0017],
  [0.0154, -0.0021],
  [0.0168, 0.0028],
  [0.0181, -0.0032],
  [0.0188, -0.0011],
  [0.0192, 0.0036],
  [0.0195, 0.0018],
  [0.0198, -0.0039],
  [0.0202, -0.0017],
  [0.0204, 0.0031],
  [0.0206, 0.0011],
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function emit(events, name, payload) {
  if (!events) return;
  if (typeof events.emit === 'function') events.emit(name, payload);
  else if (typeof events.dispatch === 'function') events.dispatch(name, payload);
  else if (typeof events.publish === 'function') events.publish(name, payload);
}

function listen(events, name, callback, disposers) {
  if (!events) return;
  if (typeof events.on === 'function') {
    const result = events.on(name, callback);
    if (typeof result === 'function') disposers.push(result);
    else if (typeof events.off === 'function') disposers.push(() => events.off(name, callback));
  } else if (typeof events.addEventListener === 'function') {
    events.addEventListener(name, callback);
    disposers.push(() => events.removeEventListener(name, callback));
  }
}

function inputDown(input, ...names) {
  if (!input) return false;
  for (const name of names) {
    if (typeof input.isDown === 'function' && input.isDown(name)) return true;
    if (typeof input.down === 'function' && input.down(name)) return true;
    if (input.down instanceof Set && input.down.has(name)) return true;
    if (input.buttons instanceof Set && input.buttons.has(name)) return true;
    if (input.keys instanceof Set && input.keys.has(name)) return true;
    if (input.actions && input.actions[name] === true) return true;
    if (input.state && input.state[name] === true) return true;
    if (input[name] === true) return true;
  }
  return false;
}

function inputPressed(input, latch, key, ...names) {
  if (input) {
    for (const name of names) {
      let pressed = false;
      if (typeof input.consumePressed === 'function') pressed = input.consumePressed(name);
      else if (typeof input.wasPressed === 'function') pressed = input.wasPressed(name);
      else if (typeof input.justPressed === 'function') pressed = input.justPressed(name);
      else if (input.pressed instanceof Set) pressed = input.pressed.has(name);
      else if (input.justPressed && typeof input.justPressed === 'object') {
        pressed = Boolean(input.justPressed[name]);
      }
      if (pressed) {
        latch[key] = true;
        return true;
      }
    }
  }
  const down = inputDown(input, ...names);
  const pressed = down && !latch[key];
  latch[key] = down;
  return pressed;
}

function hashSeed(value) {
  const string = String(value ?? 'cinderline');
  let hash = 2166136261;
  for (let i = 0; i < string.length; i += 1) {
    hash ^= string.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

class LocalRng {
  constructor(seed) {
    this.state = hashSeed(seed);
  }

  reset(seed) {
    this.state = hashSeed(seed);
  }

  float() {
    let value = this.state | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 4294967296;
  }
}

function acquireStream(service, name, seed) {
  if (service) {
    if (typeof service.stream === 'function') return service.stream(name);
    if (typeof service.getStream === 'function') return service.getStream(name);
    if (typeof service.fork === 'function') return service.fork(name);
  }
  return new LocalRng(`${seed}:${name}`);
}

function rngFloat(stream) {
  if (!stream) return 0.5;
  if (typeof stream.float === 'function') return stream.float();
  if (typeof stream.nextFloat === 'function') return stream.nextFloat();
  if (typeof stream.next === 'function') {
    const value = stream.next();
    return typeof value === 'number' ? value : Number(value?.value) || 0.5;
  }
  if (typeof stream.range === 'function') return stream.range(0, 1);
  return 0.5;
}

function profileGeometry(points, depth, bevel = 0.006) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

// Extrudes a Z/Y silhouette across X. Unlike a conventional box, this keeps
// each major weapon mass readable in profile while the bevel creates a
// continuous manufactured highlight around its full perimeter.
function sideProfileGeometry(points, width, bevel = 0.006, openings = []) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  for (const ring of openings) {
    const opening = new THREE.Path();
    opening.moveTo(...ring[0]);
    for (const point of ring.slice(1)) opening.lineTo(...point);
    opening.closePath();
    shape.holes.push(opening);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 3,
    steps: 1,
  });
  geometry.translate(0, 0, -width * 0.5);
  geometry.rotateY(-Math.PI * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

// Revolves a stepped axial profile into an optic or barrel component. Profile
// entries are [z, radius], so the result is already aligned with the rifle.
function axialProfileGeometry(profile, segments = 32) {
  const points = profile.map(([z, radius]) => new THREE.Vector2(radius, z));
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.rotateX(Math.PI * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedPart(parent, size, position, material, radius = 0.006, segments = 2, name = '') {
  const maxRadius = Math.max(0.001, Math.min(size.x, size.y, size.z) * 0.45);
  const geometry = new RoundedBoxGeometry(
    size.x,
    size.y,
    size.z,
    segments,
    Math.min(radius, maxRadius),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cylinderPart(
  parent,
  radiusTop,
  radiusBottom,
  length,
  position,
  material,
  radialSegments = 12,
  name = '',
) {
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    length,
    radialSegments,
    1,
    false,
  );
  geometry.rotateX(Math.PI * 0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function setShadow(mesh) {
  if (mesh.isMesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
}

/**
 * First-person weapon with deterministic fire, reload and presentation state.
 */
export class Rifle {
  constructor(context = null, options = {}) {
    if (context && !context.scene && !context.viewScene && !context.camera) {
      options = context;
      context = null;
    }
    this.options = { ...WEAPON_DEFINITIONS.vesper, ...WEAPON_DEFINITIONS[options.id], ...options };

    this.context = null;
    this.events = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;
    this.root = new THREE.Group();
    this.root.name = this.options.id === 'vesper' ? 'VesperRifleViewmodel' : `${this.options.id}-viewmodel`;
    this.weapon = new THREE.Group();
    this.weapon.name = this.options.id === 'vesper' ? 'VesperCR27' : this.options.name;
    this.root.add(this.weapon);
    this.object3d = this.root;

    this.magazine = this.options.magazineCapacity;
    this.reserve = this.options.reserveAmmo;
    this.enabled = true;
    this.triggerHeld = false;
    this.triggerWasDown = false;
    this.drawRemaining = 0;
    this.inspectRemaining = 0;
    this.swingElapsed = null;
    this.adsWanted = false;
    this.ads = 0;
    this.sprint = 0;
    this.reloading = false;
    this.reloadTime = 0;
    this.reloadDuration = this.options.reloadDuration;
    this.reloadPhase = 'idle';
    this.reloadTransferred = false;
    this.fireCooldown = 0;
    this.dryCooldown = 0;
    this.shotIndex = 0;
    this.recoilBloom = 0;
    this.triggerBuffer = 0;
    this.visualRecoil = 0;
    this._firePose = 0;
    this._time = 0;
    this._moveState = 'idle';
    this._playerSnapshot = null;
    this._inputLatch = Object.create(null);
    this._disposers = [];
    this._materials = [];
    this._surfaceLease = null;
    this._modelBuilt = false;
    this.variant = null;
    this.rightSleeve = null;
    this.leftSleeveMesh = null;
    this.forearms = [];
    this.inspectionArms = false;
    this._rng = new LocalRng('cinderline:weapon-spread');
    this._reloadFromEmpty = false;

    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3(0, 0, -1);
    this.projectiles = new ProjectileSystem(null, options.projectiles);

    this.snapshot = {
      id: this.options.id,
      name: this.options.name,
      slot: this.options.slot,
      adsFov: this.options.adsFov,
      scope: this.options.scope,
      scoped: false,
      mobility: this.options.mobility ?? 1,
      melee: this.options.melee,
      action: 'idle',
      magazine: this.magazine,
      ammoInMag: this.magazine,
      magazineCapacity: this.options.magazineCapacity,
      reserve: this.reserve,
      reserveAmmo: this.reserve,
      reloading: this.reloading,
      reloadPhase: this.reloadPhase,
      reloadProgress: 0,
      ads: this.ads,
      isADS: false,
      spread: this.options.hipSpread,
      fireCooldown: 0,
      enabled: this.enabled,
      weaponName: this.options.name,
      projectiles: this.projectiles.snapshot,
    };

    if (context) this.init(context);
  }

  init(context) {
    this.context = context;
    this.events = context.events;
    this.input = context.input;
    this.camera = context.camera;
    this.viewCamera = context.viewCamera;
    this._rng = acquireStream(context.rng, this.spreadStream, context.state?.seed);
    this.projectiles.init(context);
    if (!this._modelBuilt) this._buildModel();
    if (this.root.parent !== context.viewScene) context.viewScene?.add(this.root);

    listen(this.events, 'player:move-state', (event) => {
      this._moveState = event?.state ?? 'idle';
    }, this._disposers);
    listen(this.events, 'player:death', () => {
      this.triggerHeld = false;
      this.triggerBuffer = 0;
      this.adsWanted = false;
      this.enabled = false;
      this.swingElapsed = null;
    }, this._disposers);
    listen(this.events, 'game:pause', () => this.triggerUp(), this._disposers);

    this.root.position.copy(this.hipPosition);
    this.root.quaternion.copy(HIP_QUATERNION);
    this._updateAimRay();
    this._syncSnapshot();
    return this;
  }

  get hipPosition() {
    return this.variant?.hip ?? HIP_POSITION;
  }

  get adsPosition() {
    return this.variant?.ads ?? ADS_POSITION;
  }

  get spreadStream() {
    return this.options.id === 'vesper' ? 'weapon-spread' : `weapon-spread:${this.options.id}`;
  }

  triggerDown() {
    this.triggerHeld = true;
    this.triggerBuffer = 0.12;
  }

  triggerUp() {
    this.triggerHeld = false;
  }

  setADS(enabled) {
    const next = Boolean(enabled) && !this.options.melee;
    if (next === this.adsWanted) return;
    this.adsWanted = next;
    if (this.context?.state?.phase === 'capture') {
      this.ads = next ? 1 : 0;
      this.root.position.copy(next ? this.adsPosition : this.hipPosition);
      this.root.quaternion.copy(next ? ADS_QUATERNION : HIP_QUATERNION);
    }
    emit(this.events, 'weapon:ads', { enabled: next });
  }

  restockReserve() {
    this.reserve = this.options.reserveAmmo;
    this._syncSnapshot();
  }

  requestReload() {
    if (
      !this.enabled || this.options.melee || this.drawRemaining > 0
      || this.reloading
      || this.magazine >= this.options.magazineCapacity
      || this.reserve <= 0
    ) {
      return false;
    }
    this.reloading = true;
    this._reloadFromEmpty = this.magazine === 0;
    this.reloadDuration = this._reloadFromEmpty
      ? this.options.emptyReloadDuration
      : this.options.reloadDuration;
    this.reloadTime = 0;
    this.reloadPhase = 'release';
    this.reloadTransferred = false;
    this.triggerHeld = false;
    this.adsWanted = false;
    emit(this.events, 'weapon:reload-start', {
      empty: this._reloadFromEmpty,
      magazine: this.magazine,
      reserve: this.reserve,
      duration: this.reloadDuration,
    });
    emit(this.events, 'weapon:reload-phase', { phase: 'release', progress: 0 });
    this._syncSnapshot();
    return true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.triggerHeld = false;
      this.triggerBuffer = 0;
      this.adsWanted = false;
      this.inspectRemaining = 0;
      if (this.inspectionArms) {
        this.poseInspectionArms(0);
        for (const { sleeve } of this.forearms) sleeve.scale.setScalar(1);
      }
    }
    this.root.visible = this.enabled && !this.snapshot.scoped;
    this._syncSnapshot();
  }

  equip() {
    this.drawRemaining = this.options.drawDuration;
    this.triggerWasDown = Boolean(this.input?.buttonDown?.(0));
    this.root.position.copy(this.hipPosition);
    this.root.position.y -= 0.18;
    this.root.quaternion.copy(HIP_QUATERNION);
    this.setEnabled(true);
  }

  holster() {
    this.setEnabled(false);
    this.ads = 0;
    this.reloading = false;
    this.reloadTime = 0;
    this.reloadPhase = 'idle';
    this.reloadTransferred = false;
    this.drawRemaining = 0;
    this.swingElapsed = null;
    this._animateReload();
    this._syncSnapshot();
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.projectiles.fixedUpdate(dt);
    this._time += dt;
    const previousCooldown = this.fireCooldown;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.enabled && this.options.boltCycle && previousCooldown > 0.46 && this.fireCooldown <= 0.46) {
      emit(this.events, 'weapon:cycle', { weaponId: this.options.id, volume: 0.52 });
    }
    this.dryCooldown = Math.max(0, this.dryCooldown - dt);
    this.drawRemaining = Math.max(0, this.drawRemaining - dt);
    this.inspectRemaining = Math.max(0, this.inspectRemaining - dt);
    this.recoilBloom = Math.max(0, this.recoilBloom - dt * 0.026);

    if (!this.enabled) {
      this._syncSnapshot();
      return;
    }

    const inputFire = inputDown(
      this.input,
      'fire',
      'Mouse0',
      'mouse0',
      'primary',
      'PointerPrimary',
    ) || Boolean(this.input?.buttonDown?.(0));
    const inputADS = inputDown(
      this.input,
      'ads',
      'aim',
      'Mouse2',
      'mouse2',
      'secondary',
      'PointerSecondary',
    ) || Boolean(this.input?.buttonDown?.(2));
    this.triggerBuffer = Math.max(0, this.triggerBuffer - dt);
    const wantsFire = this.triggerHeld || inputFire;
    const pressed = this.input?.consumeButtonPressed?.(0) || (wantsFire && !this.triggerWasDown);
    this.triggerWasDown = wantsFire;
    if (pressed && !this.reloading && this.drawRemaining <= 0) this.triggerBuffer = 0.12;
    if (inputADS !== this.adsWanted && this.input) this.setADS(inputADS);
    if (inputPressed(this.input, this._inputLatch, 'reload', 'reload', 'KeyR', 'r')) {
      if (this.requestReload()) this.triggerBuffer = 0;
    }

    this._playerSnapshot = this.context?.state?.player
      ?? this.context?.state?.playerSnapshot
      ?? this._playerSnapshot;
    const inspectPressed = inputPressed(this.input, this._inputLatch, 'inspect', 'KeyI');
    const busy = wantsFire || pressed || inputADS || this.reloading || this.swingElapsed !== null
      || this.drawRemaining > 0 || this._playerSnapshot?.sprinting
      || (this.options.boltCycle && this.fireCooldown > 0);
    if (busy) this.inspectRemaining = 0;
    else if (inspectPressed) this.inspectRemaining = INSPECT_DURATION;

    if (this.options.melee) this._advanceSwing(dt);
    if (this.reloading) {
      this._fixedReload(dt);
    } else if (this.drawRemaining <= 0 && this.fireCooldown <= 0
      && (this.triggerBuffer > 0 || (this.options.automatic && wantsFire))) {
      this.triggerBuffer = 0;
      this._fire();
    }
    this._updateAimRay();
    this._syncSnapshot();
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0 || !this._modelBuilt) return;
    this.visualRecoil = damp(this.visualRecoil, 0, 22, dt);
    this._firePose = damp(this._firePose, 0, 16, dt);

    const player = this.context?.state?.player
      ?? this.context?.state?.playerSnapshot
      ?? this._playerSnapshot;
    const sprinting = this._moveState === 'sprint' || Boolean(player?.sprinting);
    const canSprintPose = sprinting && !this.adsWanted && !this.reloading
      && !this.triggerHeld && !this.input?.buttonDown?.(0) && this._firePose < 0.1;
    this.sprint = damp(this.sprint, canSprintPose ? 1 : 0, 11, dt);
    const cycling = this.options.boltCycle && this.fireCooldown > 0.2;
    const canAim = this.adsWanted && !this.reloading && !cycling && this.drawRemaining <= 0;
    this.ads = damp(this.ads, canAim ? 1 : 0, this.options.aimSpeed, dt);

    const speed = Number(player?.speed) || 0;
    const moving = clamp01(speed / 4.25);
    const bobRate = sprinting ? 12 : 8.3;
    const motionScale = this.context?.state?.controls?.reducedMotion ? 0.2 : 1;
    const bobX = Math.sin(this._time * bobRate) * 0.0085 * moving * (1 - this.ads * 0.86);
    const bobY = Math.sin(this._time * bobRate * 2) * 0.006 * moving * (1 - this.ads * 0.9);
    const idleX = Math.sin(this._time * 1.37) * 0.0032 * (1 - this.ads * 0.72);
    const idleY = Math.sin(this._time * 1.91 + 0.8) * 0.0026 * (1 - this.ads * 0.72);

    POSE_POSITION.copy(this.hipPosition).lerp(this.adsPosition, this.ads);
    POSE_QUATERNION.copy(HIP_QUATERNION).slerp(ADS_QUATERNION, this.ads);
    if (this.sprint > 0.001) {
      POSE_POSITION.lerp(SPRINT_POSITION, this.sprint);
      POSE_QUATERNION.slerp(SPRINT_QUATERNION, this.sprint);
    }

    POSE_POSITION.x += (bobX + idleX) * motionScale;
    POSE_POSITION.y += (bobY + idleY) * motionScale - this.visualRecoil * 0.016;
    POSE_POSITION.z += this.visualRecoil * 0.062;
    if (this.drawRemaining > 0) {
      const lower = smoothstep(this.drawRemaining / this.options.drawDuration);
      POSE_POSITION.y -= lower * 0.22;
      POSE_EULER.set(-lower * 0.37 * motionScale, 0, 0, 'YXZ');
      POSE_QUATERNION.multiply(TEMP_QUATERNION.setFromEuler(POSE_EULER));
    }
    if (this.swingElapsed !== null) {
      const progress = clamp01(this.swingElapsed / this.options.fireInterval);
      const arc = Math.sin(progress * Math.PI) * motionScale;
      POSE_POSITION.x -= arc * 0.46;
      POSE_POSITION.y += arc * 0.15;
      POSE_EULER.set(-arc * 0.23, arc * 1.2, -arc * 0.75, 'YXZ');
      POSE_QUATERNION.multiply(TEMP_QUATERNION.setFromEuler(POSE_EULER));
    }
    const presentation = this.inspectRemaining > 0
      ? smoothstep((INSPECT_DURATION - this.inspectRemaining) / 0.27) * smoothstep(this.inspectRemaining / 0.33)
      : 0;
    if (presentation > 0) {
      POSE_POSITION.lerp(INSPECT_POSITION, presentation);
      POSE_QUATERNION.slerp(INSPECT_ROTATION, presentation);
    }
    const exactCaptureADS = this.ads === 1
      && this.context?.state?.phase === 'capture';
    if (exactCaptureADS) {
      POSE_POSITION.copy(this.adsPosition);
      POSE_QUATERNION.copy(ADS_QUATERNION);
    }
    // Capture mode intentionally forces `ads` to exactly 1 before a single
    // presentation update. Normal gameplay approaches 1 asymptotically, so
    // snapping only the exact forced state preserves the authored ADS timing.
    const poseBlend = this.ads === 1 ? 1 : 1 - Math.exp(-20 * dt);
    this.root.position.lerp(POSE_POSITION, poseBlend);
    this.root.quaternion.slerp(POSE_QUATERNION, poseBlend);
    if (this.rightSleeve && this.leftSleeveMesh) {
      const sleeveFade = smoothstep((this.ads - 0.3) / 0.62);
      const sleeveRadius = THREE.MathUtils.lerp(1, 0.16, sleeveFade);
      const sleeveLength = THREE.MathUtils.lerp(1, 0.42, sleeveFade);
      this.rightSleeve.scale.set(sleeveRadius, sleeveRadius, sleeveLength);
      this.leftSleeveMesh.scale.set(sleeveRadius, sleeveRadius, sleeveLength);
      // The short cuffs remain visible and connected to both hands; only the
      // near-camera forearm tubes disappear at full ADS, eliminating the broad
      // lower-centre wedge without changing the authored sight alignment.
      const sleevesVisible = sleeveFade < 0.985;
      this.rightSleeve.visible = sleevesVisible;
      this.leftSleeveMesh.visible = sleevesVisible;
    }

    if (this.visualRecoil > 0.001) {
      POSE_EULER.set(-this.visualRecoil * 0.085, this.visualRecoil * 0.018, 0, 'YXZ');
      TEMP_QUATERNION.setFromEuler(POSE_EULER);
      this.root.quaternion.multiply(TEMP_QUATERNION);
    }
    this._animateReload();
    this.poseInspectionArms(presentation);
    this._updateAimRay();
    this._syncSnapshot();
    this.root.visible = this.enabled && !this.snapshot.scoped;
  }

  poseInspectionArms(weight) {
    if (!weight && !this.inspectionArms) return;
    this.inspectionArms = Boolean(weight);
    if (weight && this.options.slot === 'primary') {
      this.leftHand.position.y -= weight * 0.043;
      this.leftHand.position.x += weight * 0.018;
    }
    for (const { sleeve, cuff, position, orientation, elbow, length } of this.forearms) {
      sleeve.position.copy(position);
      sleeve.quaternion.copy(orientation);
      if (!weight || !sleeve.parent.visible) continue;
      sleeve.parent.worldToLocal(SLEEVE_END.copy(elbow));
      SLEEVE_DIR.subVectors(cuff.position, SLEEVE_END);
      const reach = SLEEVE_DIR.length();
      if (reach <= 0.001) continue;
      sleeve.position.lerp(SLEEVE_END.lerp(cuff.position, 0.5), weight);
      sleeve.quaternion.slerp(TEMP_QUATERNION.setFromUnitVectors(SLEEVE_AXIS, SLEEVE_DIR.divideScalar(reach)), weight);
      sleeve.scale.z = THREE.MathUtils.lerp(sleeve.scale.z, reach / length, weight);
    }
  }

  _fire() {
    if (this.reloading) return;
    if (this.options.melee) {
      this._beginSwing();
      return;
    }
    if (this.magazine <= 0) {
      if (this.dryCooldown <= 0) {
        this.dryCooldown = 0.28;
        this.fireCooldown = 0.18;
        emit(this.events, 'weapon:dry', { reserve: this.reserve });
      }
      return;
    }

    this.magazine -= 1;
    this.fireCooldown += this.options.fireInterval;
    this.shotIndex += 1;
    this.recoilBloom = Math.min(0.018, this.recoilBloom + this.options.bloomPerShot);
    this.visualRecoil = Math.min(Math.max(1, this.options.visualKick), this.visualRecoil + this.options.visualKick);
    this._firePose = 1;
    this._updateAimRay(true);

    const pattern = RECOIL_PATTERN[(this.shotIndex - 1) % RECOIL_PATTERN.length];
    const jitterPitch = (rngFloat(this._rng) - 0.5) * 0.002;
    const jitterYaw = (rngFloat(this._rng) - 0.5) * 0.0026;
    const recoil = {
      pitch: (pattern[0] + jitterPitch) * this.options.recoilScale,
      yaw: (pattern[1] + jitterYaw) * this.options.recoilScale,
    };

    this.projectiles.spawn({
      origin: this.rayOrigin,
      direction: this.rayDirection,
      speed: this.options.projectileSpeed,
      damage: this.options.damage,
      owner: 'player',
      kind: this.options.id === 'vesper' ? 'rifle' : this.options.id,
      headshotMultiplier: this.options.headshotMultiplier,
    });

    this._worldMuzzle(MUZZLE);
    TRACER_END.copy(MUZZLE).addScaledVector(this.rayDirection, this.options.tracerLength);
    emit(this.events, 'weapon:fire', {
      source: 'player',
      kind: 'player',
      weaponId: this.options.id,
      flashScale: this.options.flashScale,
      audibleRadius: this.options.audibleRadius,
      shot: this.shotIndex,
      magazine: this.magazine,
      reserve: this.reserve,
      origin: this.rayOrigin.clone(),
      muzzle: MUZZLE.clone(),
      position: MUZZLE.clone(),
      direction: this.rayDirection.clone(),
      tracerEnd: TRACER_END.clone(),
      recoil,
      ads: this.ads,
    });
    this._syncSnapshot();
  }

  _beginSwing() {
    this.fireCooldown = this.options.fireInterval;
    this.swingElapsed = 0;
    this.shotIndex += 1;
    this._updateAimRay();
    emit(this.events, 'weapon:melee', {
      source: 'player', weaponId: this.options.id, position: this.rayOrigin.clone(),
    });
  }

  _advanceSwing(dt) {
    if (this.swingElapsed === null) return;
    const previous = this.swingElapsed;
    this.swingElapsed += dt;
    if (previous < this.options.windup && this.swingElapsed >= this.options.windup) {
      this._updateAimRay();
      this.projectiles.strike({
        origin: this.rayOrigin, direction: this.rayDirection,
        range: this.options.meleeReach, damage: this.options.damage,
      });
    }
    if (this.swingElapsed >= this.options.fireInterval) this.swingElapsed = null;
  }

  _fixedReload(dt) {
    this.reloadTime += dt;
    const progress = clamp01(this.reloadTime / this.reloadDuration);
    let phase = 'release';
    if (progress >= 0.72) phase = this._reloadFromEmpty ? 'charge' : 'settle';
    else if (progress >= 0.44) phase = 'insert';
    else if (progress >= 0.18) phase = 'eject';

    if (phase !== this.reloadPhase) {
      this.reloadPhase = phase;
      emit(this.events, 'weapon:reload-phase', { phase, progress });
    }

    if (!this.reloadTransferred && progress >= 0.59) {
      const needed = this.options.magazineCapacity - this.magazine;
      const loaded = Math.min(needed, this.reserve);
      this.magazine += loaded;
      this.reserve -= loaded;
      this.reloadTransferred = true;
    }

    if (progress >= 1) {
      this.reloading = false;
      this.reloadTime = 0;
      this.reloadPhase = 'idle';
      this.reloadTransferred = false;
      this.shotIndex = 0;
      emit(this.events, 'weapon:reload-complete', {
        magazine: this.magazine,
        reserve: this.reserve,
      });
    }
  }

  _updateAimRay(applySpread = false) {
    if (!this.camera) return;
    this.camera.getWorldPosition(this.rayOrigin);
    this.camera.getWorldDirection(FORWARD).normalize();
    this.rayDirection.copy(FORWARD);
    if (applySpread) {
      const player = this.context?.state?.player
        ?? this.context?.state?.playerSnapshot
        ?? this._playerSnapshot;
      const moveSpread = clamp01((Number(player?.speed) || 0) / 7)
        * this.options.movingSpread;
      const stance = player?.crouched ? this.options.crouchMultiplier : 1;
      const base = THREE.MathUtils.lerp(this.options.hipSpread, this.options.adsSpread, this.ads);
      const spread = (base + moveSpread + this.recoilBloom) * stance;
      const angle = rngFloat(this._rng) * Math.PI * 2;
      const radius = Math.sqrt(rngFloat(this._rng)) * spread;
      RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.rayDirection
        .addScaledVector(RIGHT, Math.cos(angle) * radius)
        .addScaledVector(UP, Math.sin(angle) * radius)
        .normalize();
    }
    this.rayOrigin.addScaledVector(FORWARD, 0.08);
  }

  _worldMuzzle(out) {
    if (!this.camera) return out.set(0, 0, 0);
    if (this.context?.visualMuzzle?.(out)) return out;
    this.camera.getWorldPosition(out);
    this.camera.getWorldDirection(FORWARD).normalize();
    RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return out
      .addScaledVector(RIGHT, THREE.MathUtils.lerp(0.23, 0.008, this.ads))
      .addScaledVector(UP, THREE.MathUtils.lerp(-0.2, -0.015, this.ads))
      .addScaledVector(FORWARD, this.options.muzzleReach);
  }

  _animateReload() {
    if (this.variant) {
      this._animateVariant();
      return;
    }
    if (!this.magazineMesh || !this.leftHand) return;
    if (!this.reloading) {
      if (this.chargingHandle) this.chargingHandle.position.z = 0.11;
      this.magazineMesh.visible = true;
      this.magazineMesh.position.set(0, -0.136, 0.015);
      this.magazineMesh.rotation.set(-0.15, 0, 0.035);
      this.leftHand.position.copy(LEFT_HAND_HOME);
      this.leftHand.rotation.set(0.035, 0.01, -0.045);
      return;
    }

    const p = clamp01(this.reloadTime / this.reloadDuration);
    const tilt = Math.sin(Math.min(1, p / 0.2) * Math.PI * 0.5)
      * (1 - smoothstep((p - 0.78) / 0.22));
    this.root.rotation.z += tilt * 0.34;
    this.root.rotation.y += tilt * -0.16;
    this.root.position.y -= tilt * 0.055;

    if (p < 0.42) {
      const handT = smoothstep((p - 0.05) / 0.22);
      this.leftHand.position.lerpVectors(
        LOCAL_TARGET.copy(LEFT_HAND_HOME),
        POSE_POSITION.set(-0.02, -0.18, 0.015),
        handT,
      );
      this.leftHand.rotation.set(
        0.035 + 0.245 * handT,
        0.01 - 0.16 * handT,
        -0.045 - 0.315 * handT,
      );
      const magT = smoothstep((p - 0.2) / 0.2);
      this.magazineMesh.position.set(0.02 * magT, -0.136 - magT * 0.27, 0.015 + magT * 0.08);
      this.magazineMesh.rotation.set(-0.15 - magT * 0.38, 0, 0.035 + magT * 0.14);
      this.magazineMesh.visible = true;
    } else if (p < 0.57) {
      this.magazineMesh.visible = false;
      this.leftHand.position.set(-0.11, -0.31, 0.06);
      this.leftHand.rotation.set(0.42, -0.1, -0.34);
    } else if (p < 0.76) {
      const insertT = smoothstep((p - 0.57) / 0.19);
      this.magazineMesh.visible = true;
      this.magazineMesh.position.lerpVectors(
        LOCAL_TARGET.set(-0.09, -0.38, 0.11),
        POSE_POSITION.set(0, -0.136, 0.015),
        insertT,
      );
      this.magazineMesh.rotation.set(-0.42 + insertT * 0.27, 0, 0.17 - insertT * 0.135);
      this.leftHand.position.lerpVectors(
        LOCAL_TARGET.set(-0.11, -0.31, 0.06),
        POSE_POSITION.set(-0.02, -0.18, 0.015),
        insertT,
      );
      this.leftHand.rotation.set(0.42 - insertT * 0.2, -0.1, -0.34 + insertT * 0.18);
    } else {
      const returnT = smoothstep((p - 0.76) / 0.24);
      this.magazineMesh.visible = true;
      this.magazineMesh.position.set(0, -0.136, 0.015);
      this.magazineMesh.rotation.set(-0.15, 0, 0.035);
      this.leftHand.position.lerpVectors(
        LOCAL_TARGET.set(-0.02, -0.18, 0.015),
        POSE_POSITION.copy(LEFT_HAND_HOME),
        returnT,
      );
      this.leftHand.rotation.set(
        THREE.MathUtils.lerp(0.22, 0.035, returnT),
        THREE.MathUtils.lerp(-0.1, 0.01, returnT),
        THREE.MathUtils.lerp(-0.16, -0.045, returnT),
      );
      if (this._reloadFromEmpty && p > 0.77 && p < 0.9 && this.chargingHandle) {
        this.chargingHandle.position.z = 0.08 + Math.sin((p - 0.77) / 0.13 * Math.PI) * 0.075;
      }
    }
  }

  _animateVariant() {
    const { magazine, magazineHome, movingPart, movingHome, support } = this.variant;
    if (movingPart) {
      movingPart.position.copy(movingHome);
      if (this.options.boltCycle) {
        const cycle = clamp01((this.options.fireInterval - this.fireCooldown - 0.09) / 0.61);
        const travel = Math.sin(cycle * Math.PI);
        movingPart.position.z += travel * 0.115;
        movingPart.rotation.z = travel * 0.42;
      } else {
        movingPart.position.z += this._firePose * 0.05;
      }
    }
    if (!magazine) return;
    const progress = this.reloading ? clamp01(this.reloadTime / this.reloadDuration) : 0;
    const tilt = Math.sin(progress * Math.PI);
    const travel = smoothstep(Math.min((progress - 0.12) / 0.3, (0.82 - progress) / 0.26));
    magazine.visible = progress < 0.43 || progress >= 0.59;
    magazine.position.copy(magazineHome);
    magazine.position.y -= travel * 0.2;
    magazine.rotation.z = travel * 0.21;
    this.leftHand.position.copy(support);
    this.leftHand.position.lerp(LOCAL_TARGET.copy(magazine.position).add(POSE_POSITION.set(-0.052, -0.068, 0.043)), tilt);
    this.root.rotation.z += tilt * 0.26;
    this.root.position.y -= tilt * 0.04;
  }

  _buildModel() {
    this._modelBuilt = true;
    const surfaces = this._surfaceLease = acquireWeaponSurfaces();
    const [metalPaint, polymerPaint] = PAINT[this.options.id] ?? PAINT.vesper;
    const mark = makeWeaponMark(this.options.id, surfaces.marks, this.weapon, this._materials);

    const gunmetal = new THREE.MeshPhysicalMaterial({
      ...surfaces.metal,
      name: 'Ceramic-coated alloy',
      color: metalPaint,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.69,
      metalness: 0.46,
      clearcoat: 0.12,
      clearcoatRoughness: 0.45,
    });
    const darkMetal = new THREE.MeshPhysicalMaterial({
      color: 0x39474e,
      roughness: 0.50,
      metalness: 0.52,
      clearcoat: 0.13,
      clearcoatRoughness: 0.4,
    });
    const exposedMetal = new THREE.MeshStandardMaterial({
      color: 0x9a9d9c,
      roughness: 0.3,
      metalness: 0.82,
    });
    const railMetal = new THREE.MeshStandardMaterial({
      color: 0x687980,
      roughness: 0.39,
      metalness: 0.68,
    });
    const accentMetal = new THREE.MeshStandardMaterial({
      color: 0x9a7443,
      roughness: 0.38,
      metalness: 0.64,
    });
    const polymer = new THREE.MeshStandardMaterial({
      ...surfaces.polymer,
      name: 'Glass-filled polymer',
      color: polymerPaint,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.86,
      metalness: 0.03,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x232823,
      roughness: 0.94,
      metalness: 0,
    });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xb68c3f,
      roughness: 0.28,
      metalness: 0.82,
    });
    const opticGlass = new THREE.MeshPhysicalMaterial({
      color: 0x78aaa7,
      emissive: 0x0b2426,
      emissiveIntensity: 0.28,
      metalness: 0,
      roughness: 0.16,
      transmission: 0,
      transparent: true,
      opacity: 0.2,
      thickness: 0.008,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const reticle = new THREE.MeshBasicMaterial({
      color: 0x79e5d2,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const glove = new THREE.MeshStandardMaterial({
      ...surfaces.fabric,
      color: 0x88968d,
      normalScale: new THREE.Vector2(0.48, 0.48),
      roughness: 0.92,
      metalness: 0,
    });
    const sleeve = new THREE.MeshStandardMaterial({
      ...surfaces.fabric,
      color: 0x6a7c88,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.92,
      metalness: 0,
    });
    this._materials.push(
      gunmetal,
      darkMetal,
      exposedMetal,
      railMetal,
      accentMetal,
      polymer,
      rubber,
      brass,
      opticGlass,
      reticle,
      glove,
      sleeve,
    );

    if (this.options.id !== 'vesper' && WEAPON_DEFINITIONS[this.options.id]) {
      this.variant = buildVariantModel(this.weapon, this.options.id, {
        gunmetal, darkMetal, exposedMetal, railMetal, accentMetal, polymer, rubber, opticGlass, reticle,
      }, { roundedPart, cylinderPart, sideProfileGeometry, mark });
      if (!this.options.inspection) {
        this._buildHands(glove, sleeve, rubber);
        if (!this.variant.support) this.leftHand.visible = false;
        else this.leftHand.position.copy(this.variant.support);
      }
      this.weapon.traverse(setShadow);
      return;
    }

    // Continuous side-profiled receiver shells establish the rifle's primary
    // silhouette. Their tapered noses, shoulder breaks and flared lower remove
    // the previous "stacked rounded boxes" read.
    const upperGeometry = sideProfileGeometry([
      [-0.168, -0.026],
      [-0.158, 0.036],
      [-0.112, 0.074],
      [0.102, 0.074],
      [0.143, 0.049],
      [0.148, -0.012],
      [0.104, -0.052],
      [-0.118, -0.052],
    ], 0.104, 0.006);
    const upper = new THREE.Mesh(upperGeometry, gunmetal);
    upper.name = 'profiled-upper-receiver';
    this.weapon.add(upper);

    const lowerGeometry = sideProfileGeometry([
      [-0.154, 0.022],
      [0.112, 0.022],
      [0.132, -0.018],
      [0.111, -0.073],
      [0.068, -0.089],
      [0.041, -0.139],
      [-0.026, -0.139],
      [-0.053, -0.081],
      [-0.139, -0.064],
    ], 0.094, 0.006);
    const lower = new THREE.Mesh(lowerGeometry, gunmetal);
    lower.name = 'profiled-lower-receiver-magwell';
    this.weapon.add(lower);

    const railSpine = new THREE.Mesh(sideProfileGeometry([
      [-0.164, 0.076],
      [0.139, 0.076],
      [0.128, 0.094],
      [-0.148, 0.094],
    ], 0.083, 0.0025), darkMetal);
    railSpine.name = 'continuous-receiver-rail';
    this.weapon.add(railSpine);
    for (let i = 0; i < 9; i += 1) {
      roundedPart(
        this.weapon,
        new THREE.Vector3(0.082, 0.009, 0.014),
        new THREE.Vector3(0, 0.101, 0.113 - i * 0.033),
        railMetal,
        0.002,
        1,
        'rail-tooth',
      );
    }

    // Ejection port, forward assist, selector, bolt catch, and visible fasteners.
    roundedPart(this.weapon, new THREE.Vector3(0.052, 0.043, 0.09), new THREE.Vector3(0.045, 0.033, -0.015), darkMetal, 0.004, 2, 'ejection-port');
    roundedPart(this.weapon, new THREE.Vector3(0.004, 0.027, 0.072), new THREE.Vector3(0.073, 0.034, -0.015), exposedMetal, 0.0015, 1, 'bolt-face');
    cylinderPart(this.weapon, 0.012, 0.012, 0.014, new THREE.Vector3(0.055, -0.005, 0.092), darkMetal, 12, 'forward-assist').rotation.y = Math.PI * 0.5;
    cylinderPart(this.weapon, 0.009, 0.009, 0.012, new THREE.Vector3(-0.055, -0.027, 0.06), accentMetal, 12, 'selector').rotation.y = Math.PI * 0.5;
    for (const z of [-0.085, 0.065]) {
      const pin = cylinderPart(this.weapon, 0.006, 0.006, 0.012, new THREE.Vector3(-0.054, -0.04, z), exposedMetal, 10, 'receiver-pin');
      pin.rotation.y = Math.PI * 0.5;
    }

    this.chargingHandle = roundedPart(
      this.weapon,
      new THREE.Vector3(0.095, 0.018, 0.035),
      new THREE.Vector3(0, 0.075, 0.11),
      darkMetal,
      0.004,
      2,
      'charging-handle',
    );
    for (const side of [-1, 1]) {
      const highlight = new THREE.Mesh(sideProfileGeometry([
        [-0.137, 0.038],
        [0.104, 0.038],
        [0.114, 0.046],
        [-0.126, 0.046],
      ], 0.003, 0), railMetal);
      highlight.position.x = side * 0.055;
      highlight.name = 'receiver-machined-break-line';
      this.weapon.add(highlight);
    }
    roundedPart(
      this.weapon,
      new THREE.Vector3(0.0045, 0.029, 0.068),
      new THREE.Vector3(-0.053, -0.012, -0.018),
      accentMetal,
      0.0015,
      1,
      'kestrel-identity-plate',
    );
    mark?.({ x: -0.059, y: 0.025, z: 0.037, width: 0.114, height: 0.024, side: -1 });
    for (const side of [-1, 1]) {
      const join = new THREE.Mesh(sideProfileGeometry([
        [-0.135, -0.033], [-0.101, -0.048], [0.079, -0.048],
        [0.119, -0.036], [0.106, -0.03], [-0.089, -0.031],
      ], 0.004, 0.0015), darkMetal);
      join.position.x = side * 0.054;
      join.name = 'receiver-lower-panel-joint';
      this.weapon.add(join);
    }

    const coolingOpenings = Array.from({ length: 5 }, (_, index) => {
      const z = -0.231 - index * 0.069;
      return [
        [z - 0.021, -0.013], [z - 0.015, 0.027], [z + 0.016, 0.032],
        [z + 0.023, 0.021], [z + 0.017, -0.016], [z - 0.015, -0.022],
      ];
    });
    const handguard = new THREE.Mesh(sideProfileGeometry([
      [-0.596, 0.032],
      [-0.578, 0.068],
      [-0.535, 0.079],
      [-0.185, 0.079],
      [-0.149, 0.048],
      [-0.154, -0.043],
      [-0.188, -0.071],
      [-0.531, -0.066],
      [-0.579, -0.034],
    ], 0.128, 0.005, coolingOpenings), gunmetal);
    handguard.name = 'profiled-free-float-handguard';
    this.weapon.add(handguard);
    const coolingLiner = new THREE.Mesh(axialProfileGeometry([
      [-0.576, 0.02], [-0.555, 0.028], [-0.185, 0.028], [-0.17, 0.023],
    ], 20), darkMetal);
    coolingLiner.position.y = 0.014;
    coolingLiner.name = 'recessed-cooling-liner';
    this.weapon.add(coolingLiner);

    const guardRail = new THREE.Mesh(sideProfileGeometry([
      [-0.579, 0.077],
      [-0.16, 0.077],
      [-0.151, 0.095],
      [-0.562, 0.095],
    ], 0.082, 0.0025), darkMetal);
    guardRail.name = 'continuous-handguard-rail';
    this.weapon.add(guardRail);
    for (let i = 0; i < 7; i += 1) {
      roundedPart(
        this.weapon,
        new THREE.Vector3(0.081, 0.008, 0.021),
        new THREE.Vector3(0, 0.101, -0.183 - i * 0.059),
        railMetal,
        0.002,
        1,
        'handguard-rail-tooth',
      );
    }
    const lowerInlay = new THREE.Mesh(sideProfileGeometry([
      [-0.52, -0.067],
      [-0.22, -0.071],
      [-0.205, -0.054],
      [-0.505, -0.049],
    ], 0.038, 0.003), polymer);
    lowerInlay.name = 'contoured-handguard-inlay';
    this.weapon.add(lowerInlay);
    const handStop = new THREE.Mesh(sideProfileGeometry([
      [-0.474, -0.056],
      [-0.425, -0.057],
      [-0.413, -0.116],
      [-0.444, -0.129],
      [-0.462, -0.095],
    ], 0.044, 0.005), polymer);
    handStop.name = 'profiled-angled-hand-stop';
    this.weapon.add(handStop);

    // A stepped turned barrel and brake form one continuous axial assembly.
    const barrelAssembly = new THREE.Mesh(axialProfileGeometry([
      [-0.902, 0.011],
      [-0.895, 0.019],
      [-0.875, 0.023],
      [-0.817, 0.023],
      [-0.803, 0.015],
      [-0.592, 0.014],
      [-0.575, 0.024],
      [-0.535, 0.024],
      [-0.52, 0.014],
    ], 24), darkMetal);
    barrelAssembly.position.y = 0.018;
    barrelAssembly.name = 'turned-barrel-gas-block-assembly';
    this.weapon.add(barrelAssembly);
    const muzzleCollar = new THREE.Mesh(
      axialProfileGeometry([
        [-0.9, 0.019],
        [-0.892, 0.024],
        [-0.814, 0.024],
        [-0.806, 0.019],
      ], 20),
      railMetal,
    );
    muzzleCollar.position.y = 0.018;
    muzzleCollar.name = 'machined-muzzle-brake-collar';
    this.weapon.add(muzzleCollar);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i += 1) {
        roundedPart(
          this.weapon,
          new THREE.Vector3(0.008, 0.012, 0.018),
          new THREE.Vector3(side * 0.021, 0.018, -0.833 - i * 0.03),
          darkMetal,
          0.002,
          1,
          'muzzle-port',
        );
      }
    }

    // Open, shouldered stock assembled from profiled cheek and lower struts.
    // The void between them remains genuine negative space in hip-fire.
    const bufferTube = new THREE.Mesh(axialProfileGeometry([
      [0.115, 0.016],
      [0.13, 0.02],
      [0.335, 0.02],
      [0.35, 0.017],
    ], 18), darkMetal);
    bufferTube.position.y = 0.01;
    bufferTube.name = 'turned-buffer-tube';
    this.weapon.add(bufferTube);
    const cheekStock = new THREE.Mesh(sideProfileGeometry([
      [0.115, 0.048],
      [0.188, 0.071],
      [0.352, 0.079],
      [0.43, 0.047],
      [0.416, 0.009],
      [0.235, 0.014],
      [0.139, 0.026],
    ], 0.072, 0.008), polymer);
    cheekStock.name = 'profiled-cheek-stock';
    this.weapon.add(cheekStock);
    const cheekGrip = roundedPart(
      this.weapon,
      new THREE.Vector3(0.067, 0.012, 0.145),
      new THREE.Vector3(0, 0.077, 0.268),
      rubber, 0.004, 2, 'textured-cheek-insert',
    );
    cheekGrip.rotation.x = 0.047;
    for (let row = 0; row < 7; row += 1) {
      roundedPart(this.weapon, new THREE.Vector3(0.057, 0.0035, 0.006),
        new THREE.Vector3(0, 0.083 + row * 0.0007, 0.205 + row * 0.017),
        darkMetal, 0.0015, 1, 'cheek-insert-rib');
    }
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(sideProfileGeometry([
        [0.165, -0.017],
        [0.241, -0.025],
        [0.414, -0.091],
        [0.434, -0.064],
        [0.292, -0.006],
        [0.188, 0.007],
      ], 0.016, 0.004), polymer);
      strut.position.x = side * 0.032;
      strut.name = 'profiled-stock-strut';
      this.weapon.add(strut);
    }
    const butt = new THREE.Mesh(sideProfileGeometry([
      [0.405, 0.049],
      [0.452, 0.046],
      [0.468, 0.019],
      [0.461, -0.095],
      [0.427, -0.112],
      [0.405, -0.087],
    ], 0.084, 0.008), rubber);
    butt.name = 'profiled-rubber-buttpad';
    this.weapon.add(butt);
    for (let i = -2; i <= 2; i += 1) {
      roundedPart(this.weapon, new THREE.Vector3(0.074, 0.004, 0.008), new THREE.Vector3(0, i * 0.02 - 0.018, 0.465), darkMetal, 0.002, 1, 'buttpad-rib');
    }

    // Swept grip and magwell continue the lower receiver's profile rather than
    // hanging below it as rectangular appendages.
    const gripGeometry = sideProfileGeometry([
      [0.053, -0.061],
      [0.126, -0.059],
      [0.166, -0.193],
      [0.143, -0.232],
      [0.091, -0.222],
      [0.068, -0.151],
    ], 0.076, 0.008);
    const grip = new THREE.Mesh(gripGeometry, polymer);
    grip.name = 'swept-profiled-pistol-grip';
    this.weapon.add(grip);
    for (const side of [-1, 1]) {
      const gripPanel = new THREE.Mesh(sideProfileGeometry([
        [0.087, -0.105],
        [0.121, -0.099],
        [0.148, -0.191],
        [0.127, -0.207],
        [0.099, -0.196],
      ], 0.004, 0.0015), rubber);
      gripPanel.position.x = side * 0.041;
      gripPanel.name = 'inset-grip-panel';
      this.weapon.add(gripPanel);
    }
    for (const side of [-1, 1]) {
      const guardPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.039, -0.067, -0.035),
        new THREE.Vector3(side * 0.039, -0.112, -0.006),
        new THREE.Vector3(side * 0.039, -0.124, 0.062),
        new THREE.Vector3(side * 0.039, -0.081, 0.087),
      ]);
      const guard = new THREE.Mesh(
        new THREE.TubeGeometry(guardPath, 18, 0.0038, 6, false),
        darkMetal,
      );
      guard.name = 'swept-trigger-guard';
      this.weapon.add(guard);
    }
    const triggerPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.069, 0.014),
      new THREE.Vector3(0, -0.087, 0.031),
      new THREE.Vector3(0, -0.108, 0.035),
    ]);
    const trigger = new THREE.Mesh(
      new THREE.TubeGeometry(triggerPath, 10, 0.0035, 6, false),
      exposedMetal,
    );
    trigger.name = 'curved-trigger';
    this.weapon.add(trigger);

    // Curved magazine with base plate, witness detail and stamped ribs.
    this.magazineMesh = new THREE.Group();
    this.magazineMesh.name = 'magazine-assembly';
    this.magazineMesh.position.set(0, -0.136, 0.015);
    this.magazineMesh.rotation.set(-0.15, 0, 0.035);
    this.weapon.add(this.magazineMesh);
    const magBody = new THREE.Mesh(sideProfileGeometry([
      [-0.052, 0.017],
      [0.052, 0.017],
      [0.071, -0.055],
      [0.078, -0.151],
      [0.054, -0.218],
      [0.006, -0.228],
      [-0.031, -0.195],
      [-0.046, -0.087],
    ], 0.068, 0.008), polymer);
    magBody.name = 'curved-profiled-magazine-body';
    this.magazineMesh.add(magBody);
    const magBase = new THREE.Mesh(sideProfileGeometry([
      [-0.002, -0.22],
      [0.061, -0.211],
      [0.071, -0.234],
      [0.006, -0.247],
      [-0.015, -0.236],
    ], 0.078, 0.004), accentMetal);
    magBase.name = 'profiled-magazine-baseplate';
    this.magazineMesh.add(magBase);
    for (const x of [-0.026, 0.026]) {
      const stamp = new THREE.Mesh(sideProfileGeometry([
        [-0.043, -0.02],
        [-0.031, -0.18],
        [-0.024, -0.191],
        [-0.033, -0.018],
      ], 0.004, 0.001), gunmetal);
      stamp.position.x = x;
      stamp.name = 'magazine-stamp-rib';
      this.magazineMesh.add(stamp);
    }
    for (let i = 0; i < 3; i += 1) {
      cylinderPart(this.magazineMesh, 0.004, 0.004, 0.004, new THREE.Vector3(0.038, -0.05 - i * 0.045, 0.03), brass, 8, 'witness-round').rotation.y = Math.PI * 0.5;
    }

    // Rounded Aster reflex optic. A turned, tapered housing provides a circular
    // silhouette; a profiled saddle and precise concentric bezel keep it
    // mechanically grounded without the former square hood.
    const optic = new THREE.Group();
    optic.name = 'Aster-Holo-Optic';
    optic.position.set(0, 0.135, -0.045);
    this.weapon.add(optic);
    const opticSaddle = new THREE.Mesh(sideProfileGeometry([
      [-0.071, -0.027],
      [0.071, -0.027],
      [0.056, 0.003],
      [0.032, 0.012],
      [-0.034, 0.012],
      [-0.058, 0.002],
    ], 0.076, 0.005), darkMetal);
    opticSaddle.name = 'profiled-optic-saddle';
    optic.add(opticSaddle);
    const opticHousing = new THREE.Mesh(axialProfileGeometry([
      [-0.064, 0.039],
      [-0.059, 0.047],
      [-0.047, 0.052],
      [0.033, 0.052],
      [0.047, 0.047],
      [0.055, 0.039],
    ], 36), gunmetal);
    opticHousing.position.y = 0.045;
    opticHousing.name = 'turned-rounded-optic-housing';
    optic.add(opticHousing);
    for (const side of [-1, 1]) {
      const saddleShoulder = new THREE.Mesh(sideProfileGeometry([
        [-0.052, 0.001],
        [0.043, 0.001],
        [0.034, 0.024],
        [-0.036, 0.024],
      ], 0.01, 0.002), gunmetal);
      saddleShoulder.position.x = side * 0.036;
      saddleShoulder.name = 'optic-saddle-shoulder';
      optic.add(saddleShoulder);
    }
    const frontBezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.043, 0.0035, 10, 48),
      darkMetal,
    );
    frontBezel.position.set(0, 0.045, -0.061);
    frontBezel.name = 'optic-front-machined-bezel';
    optic.add(frontBezel);
    const rearBezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.043, 0.0035, 10, 48),
      railMetal,
    );
    rearBezel.position.set(0, 0.045, 0.055);
    rearBezel.name = 'optic-rear-machined-bezel';
    optic.add(rearBezel);
    const sightGlass = new THREE.Mesh(new THREE.CircleGeometry(0.0395, 64), opticGlass);
    sightGlass.position.set(0, 0.045, 0.053);
    sightGlass.name = 'optic-sight-glass';
    optic.add(sightGlass);
    const lensGasket = new THREE.Mesh(
      new THREE.RingGeometry(0.0382, 0.0402, 64),
      rubber,
    );
    lensGasket.position.set(0, 0.045, 0.0555);
    lensGasket.name = 'optic-lens-gasket';
    optic.add(lensGasket);
    const dot = new THREE.Mesh(new THREE.RingGeometry(0.0036, 0.0044, 48), reticle);
    dot.position.set(0, 0.045, 0.056);
    dot.name = 'projected-reticle';
    optic.add(dot);
    const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 24), reticle);
    centerDot.position.set(0, 0.045, 0.0562);
    centerDot.name = 'projected-reticle-center';
    optic.add(centerDot);
    const brightnessDial = cylinderPart(
      optic,
      0.014,
      0.014,
      0.013,
      new THREE.Vector3(0.056, 0.041, 0.008),
      darkMetal,
      20,
      'brightness-dial',
    );
    brightnessDial.rotation.y = Math.PI * 0.5;
    for (let i = 0; i < 4; i += 1) {
      roundedPart(optic, new THREE.Vector3(0.006, 0.018, 0.003), new THREE.Vector3(0.064, 0.041, -0.001 + i * 0.006), exposedMetal, 0.001, 1, 'dial-knurl');
    }

    // Sling points and a tiny identity plate add readable meso/micro structure.
    for (const z of [-0.18, 0.31]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 6, 14), darkMetal);
      loop.position.set(-0.065, -0.012, z);
      loop.rotation.y = Math.PI * 0.5;
      loop.name = 'sling-loop';
      this.weapon.add(loop);
    }
    roundedPart(this.weapon, new THREE.Vector3(0.004, 0.025, 0.082), new THREE.Vector3(-0.054, 0.018, 0), exposedMetal, 0.0015, 1, 'receiver-wear-plate');

    if (!this.options.inspection) this._buildHands(glove, sleeve, rubber);
    this.weapon.traverse(setShadow);
  }

  _buildHands(glove, sleeve, rubber) {
    // Shared, slender articulated phalanges. The previous large capsules read
    // as block lobes; these two-stage fingers taper toward smaller distal
    // segments and follow the surfaces they grip.
    const fingerProximalGeometry = new THREE.CapsuleGeometry(0.0074, 0.027, 5, 10);
    const fingerDistalGeometry = new THREE.CapsuleGeometry(0.0065, 0.021, 5, 10);
    const thumbProximalGeometry = new THREE.CapsuleGeometry(0.0085, 0.03, 5, 10);
    const thumbDistalGeometry = new THREE.CapsuleGeometry(0.0074, 0.023, 5, 10);

    // Right hand stays locked to the swept pistol grip. Its palm is a tapered,
    // bevelled volume instead of a rounded rectangular mitten.
    const rightArm = new THREE.Group();
    rightArm.name = 'right-arm';
    rightArm.position.set(0.052, -0.13, 0.11);
    if (this.variant?.rightHand) rightArm.position.copy(this.variant.rightHand);
    rightArm.rotation.set(-0.12, -0.08, -0.08);
    this.weapon.add(rightArm);
    const rightPalm = new THREE.Mesh(profileGeometry([
      [-0.047, 0.019],
      [-0.029, 0.035],
      [0.026, 0.031],
      [0.046, 0.006],
      [0.035, -0.058],
      [0.009, -0.073],
      [-0.035, -0.064],
      [-0.052, -0.026],
    ], 0.07, 0.009), glove);
    rightPalm.position.z = 0.012;
    rightPalm.rotation.x = -0.08;
    rightPalm.name = 'anatomical-right-palm';
    rightArm.add(rightPalm);
    const rightCuff = cylinderPart(
      rightArm,
      0.036,
      0.041,
      0.052,
      new THREE.Vector3(0.018, -0.096, 0.039),
      rubber,
      20,
      'right-shaped-cuff',
    );
    rightCuff.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-0.52, 0.79, 0.33).normalize(),
    );
    const rightSleeve = cylinderPart(
      rightArm,
      0.042,
      0.052,
      0.31,
      new THREE.Vector3(0.096, -0.194, 0.124),
      sleeve,
      20,
      'right-tapered-forearm',
    );
    this.rightSleeve = rightSleeve;
    rightSleeve.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-0.078, 0.098, -0.085).normalize(),
    );

    // Middle, ring and little fingers curl around the grip in two joints.
    for (let i = 0; i < 3; i += 1) {
      const y = -0.004 - i * 0.026;
      const proximal = new THREE.Mesh(fingerProximalGeometry, glove);
      proximal.position.set(-0.018, y, -0.029);
      proximal.rotation.set(0.06, 0.05, 1.28);
      proximal.name = `right-grip-finger-${i + 1}-proximal`;
      rightArm.add(proximal);
      const distal = new THREE.Mesh(fingerDistalGeometry, glove);
      distal.position.set(-0.043, y - 0.003, -0.011);
      distal.rotation.set(1.32, 0.08, 0.08);
      distal.name = `right-grip-finger-${i + 1}-distal`;
      rightArm.add(distal);
    }
    const triggerProximal = new THREE.Mesh(fingerProximalGeometry, glove);
    triggerProximal.position.set(-0.015, 0.026, -0.031);
    triggerProximal.rotation.set(0.08, 0.03, 1.18);
    triggerProximal.name = 'right-trigger-finger-proximal';
    rightArm.add(triggerProximal);
    const triggerDistal = new THREE.Mesh(fingerDistalGeometry, glove);
    triggerDistal.position.set(-0.039, 0.032, -0.047);
    triggerDistal.rotation.set(1.38, 0.08, 0.19);
    triggerDistal.name = 'right-trigger-finger-distal';
    rightArm.add(triggerDistal);
    const rightThumbProximal = new THREE.Mesh(thumbProximalGeometry, glove);
    rightThumbProximal.position.set(0.027, 0.002, -0.018);
    rightThumbProximal.rotation.set(1.11, -0.08, -0.52);
    rightThumbProximal.name = 'right-thumb-proximal';
    rightArm.add(rightThumbProximal);
    const rightThumbDistal = new THREE.Mesh(thumbDistalGeometry, glove);
    rightThumbDistal.position.set(0.041, -0.006, -0.042);
    rightThumbDistal.rotation.set(1.34, -0.06, -0.38);
    rightThumbDistal.name = 'right-thumb-distal';
    rightArm.add(rightThumbDistal);

    // Left support hand wraps the underside and sides of the handguard.
    this.leftHand = new THREE.Group();
    this.leftHand.name = 'left-support-hand';
    this.leftHand.position.copy(LEFT_HAND_HOME);
    this.leftHand.rotation.set(0.035, 0.01, -0.045);
    this.weapon.add(this.leftHand);
    const leftPalm = new THREE.Mesh(profileGeometry([
      [-0.052, 0.012],
      [-0.034, 0.03],
      [0.031, 0.028],
      [0.05, 0.003],
      [0.037, -0.061],
      [0.008, -0.078],
      [-0.038, -0.067],
      [-0.056, -0.029],
    ], 0.102, 0.009), glove);
    leftPalm.position.set(-0.014, -0.006, 0);
    leftPalm.rotation.set(0.03, 0, -0.05);
    leftPalm.name = 'anatomical-left-support-palm';
    this.leftHand.add(leftPalm);
    const leftCuff = cylinderPart(
      this.leftHand,
      0.036,
      0.042,
      0.054,
      new THREE.Vector3(-0.034, -0.106, 0.034),
      rubber,
      20,
      'left-shaped-cuff',
    );
    leftCuff.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0.5, 0.8, 0.31).normalize(),
    );
    const leftSleeve = cylinderPart(
      this.leftHand,
      0.04,
      0.049,
      0.34,
      new THREE.Vector3(-0.088, -0.198, 0.131),
      sleeve,
      20,
      'left-tapered-forearm',
    );
    this.leftSleeveMesh = leftSleeve;
    leftSleeve.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0.054, 0.092, -0.097).normalize(),
    );
    leftSleeve.position.addScaledVector(SLEEVE_DIR.copy(SLEEVE_AXIS).applyQuaternion(leftSleeve.quaternion), -0.025);
    this.forearms = [
      { sleeve: rightSleeve, cuff: rightCuff, elbow: INSPECT_RIGHT_ELBOW, length: 0.31 },
      { sleeve: leftSleeve, cuff: leftCuff, elbow: INSPECT_LEFT_ELBOW, length: 0.34 },
    ].map((arm) => ({
      ...arm, position: arm.sleeve.position.clone(), orientation: arm.sleeve.quaternion.clone(),
    }));

    // Four separated support fingers form a C-clamp around the rail. Their
    // distal joints terminate against the far face instead of passing through.
    for (let i = 0; i < 4; i += 1) {
      const z = -0.041 + i * 0.027;
      const proximal = new THREE.Mesh(fingerProximalGeometry, glove);
      proximal.position.set(0.018, -0.054, z);
      proximal.rotation.set(0.04, 0.03, -1.27);
      proximal.name = `left-support-finger-${i + 1}-proximal`;
      this.leftHand.add(proximal);
      const distal = new THREE.Mesh(fingerDistalGeometry, glove);
      distal.position.set(0.059, -0.026, z);
      distal.rotation.set(0.05, 0.02, -0.2);
      distal.name = `left-support-finger-${i + 1}-distal`;
      this.leftHand.add(distal);
    }
    const leftThumbProximal = new THREE.Mesh(thumbProximalGeometry, glove);
    leftThumbProximal.position.set(-0.038, -0.002, -0.024);
    leftThumbProximal.rotation.set(1.12, 0.08, -0.3);
    leftThumbProximal.name = 'left-thumb-proximal';
    this.leftHand.add(leftThumbProximal);
    const leftThumbDistal = new THREE.Mesh(thumbDistalGeometry, glove);
    leftThumbDistal.position.set(-0.032, 0.003, -0.052);
    leftThumbDistal.rotation.set(1.37, 0.1, -0.2);
    leftThumbDistal.name = 'left-thumb-distal';
    this.leftHand.add(leftThumbDistal);
  }

  _syncSnapshot() {
    this.snapshot.magazine = this.magazine;
    this.snapshot.ammoInMag = this.magazine;
    this.snapshot.reserve = this.reserve;
    this.snapshot.reserveAmmo = this.reserve;
    this.snapshot.reloading = this.reloading;
    this.snapshot.reloadPhase = this.reloadPhase;
    this.snapshot.reloadProgress = this.reloading
      ? clamp01(this.reloadTime / this.reloadDuration)
      : 0;
    this.snapshot.ads = this.ads;
    this.snapshot.isADS = this.ads > 0.85;
    this.snapshot.scoped = this.options.scope && this.ads > 0.84;
    this.snapshot.action = this.drawRemaining > 0 ? 'draw'
      : this.swingElapsed !== null ? 'swing'
        : this.reloading ? 'reload'
          : this.options.boltCycle && this.fireCooldown > 0 ? 'bolt'
            : this.inspectRemaining > 0 ? 'inspect' : 'idle';
    const player = this.context?.state?.player
      ?? this.context?.state?.playerSnapshot
      ?? this._playerSnapshot;
    const moveSpread = clamp01((Number(player?.speed) || 0) / 7) * this.options.movingSpread;
    this.snapshot.spread = (
      THREE.MathUtils.lerp(this.options.hipSpread, this.options.adsSpread, this.ads)
      + moveSpread
      + this.recoilBloom
    ) * (player?.crouched ? this.options.crouchMultiplier : 1);
    this.snapshot.fireCooldown = this.fireCooldown;
    this.snapshot.enabled = this.enabled;
  }

  reset(seed = this.context?.state?.seed) {
    this.projectiles.reset();
    this.magazine = this.options.magazineCapacity;
    this.reserve = this.options.reserveAmmo;
    this.enabled = true;
    this.triggerHeld = false;
    this.triggerWasDown = false;
    this.drawRemaining = 0;
    this.inspectRemaining = 0;
    this.swingElapsed = null;
    this.adsWanted = false;
    this.ads = 0;
    this.sprint = 0;
    this.reloading = false;
    this.reloadTime = 0;
    this.reloadPhase = 'idle';
    this.reloadTransferred = false;
    this.fireCooldown = 0;
    this.dryCooldown = 0;
    this.shotIndex = 0;
    this.recoilBloom = 0;
    this.triggerBuffer = 0;
    this.visualRecoil = 0;
    this._firePose = 0;
    this._time = 0;
    this._moveState = 'idle';
    this._inputLatch = Object.create(null);
    this._rng = acquireStream(this.context?.rng, this.spreadStream, seed);
    if (this._rng instanceof LocalRng) this._rng.reset(`${seed}:${this.spreadStream}`);
    else this._rng?.reset?.();
    this.root.visible = true;
    this.root.position.copy(this.hipPosition);
    this.root.quaternion.copy(HIP_QUATERNION);
    if (this.magazineMesh) {
      this.magazineMesh.visible = true;
      this.magazineMesh.position.set(0, -0.136, 0.015);
      this.magazineMesh.rotation.set(-0.15, 0, 0.035);
    }
    this._animateReload();
    this._syncSnapshot();
  }

  dispose() {
    for (let i = this._disposers.length - 1; i >= 0; i -= 1) {
      try {
        this._disposers[i]();
      } catch {
        // Host disposal may have already removed the event bus.
      }
    }
    this._disposers.length = 0;
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    for (const material of this._materials) material.dispose();
    this._surfaceLease?.release();
    this._surfaceLease = null;
    this._materials.length = 0;
    this.projectiles.dispose();
    this.context = null;
    this.events = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;
  }
}

export function createWeaponInspectionModel(id) {
  if (!Object.hasOwn(WEAPON_DEFINITIONS, id)) return null;
  const rifle = new Rifle({ id, inspection: true, projectiles: { capacity: 0 } });
  rifle._buildModel();
  return { root: rifle.root, dispose: () => rifle.dispose() };
}

export default Rifle;
