import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ProjectileSystem } from './ProjectileSystem.js';

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UP = new THREE.Vector3();
const MUZZLE = new THREE.Vector3();
const TRACER_END = new THREE.Vector3();
const LOCAL_TARGET = new THREE.Vector3();
const POSE_POSITION = new THREE.Vector3();
const HIP_POSITION = new THREE.Vector3(0.19, -0.19, -0.68);
const ADS_POSITION = new THREE.Vector3(0, -0.18, -0.6);
const SPRINT_POSITION = new THREE.Vector3(0.38, -0.39, -0.24);
const LEFT_HAND_HOME = new THREE.Vector3(-0.025, -0.006, -0.34);
const POSE_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const POSE_QUATERNION = new THREE.Quaternion();
const HIP_QUATERNION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.028, -0.075, 0.022, 'YXZ'),
);
const ADS_QUATERNION = new THREE.Quaternion();
const SPRINT_QUATERNION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.17, -0.42, 0.38, 'YXZ'),
);
const TEMP_QUATERNION = new THREE.Quaternion();
const TEMP_COLOR = new THREE.Color();

const MAG_CAPACITY = 30;
const FIRE_INTERVAL = 60 / 720;
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

function makeTexture(base, variation, seed, roughness = false) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const seedValue = hashSeed(seed);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let h = Math.imul(x + 11, 374761393) ^ Math.imul(y + 7, 668265263) ^ seedValue;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      const noise = ((h >>> 0) / 4294967295 - 0.5) * variation;
      const streak = Math.sin((x + (seedValue & 31)) * 0.42) * variation * 0.12;
      const index = (y * size + x) * 4;
      if (roughness) {
        const value = THREE.MathUtils.clamp(base[0] + noise + streak, 0, 255);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      } else {
        data[index] = THREE.MathUtils.clamp(base[0] + noise + streak, 0, 255);
        data[index + 1] = THREE.MathUtils.clamp(base[1] + noise, 0, 255);
        data[index + 2] = THREE.MathUtils.clamp(base[2] + noise - streak, 0, 255);
      }
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.4, 5.5);
  texture.colorSpace = roughness ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
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
function sideProfileGeometry(points, width, bevel = 0.006) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
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
 * Procedural Cinderline CR-27 "Vesper" first-person rifle.
 */
export class Rifle {
  constructor(context = null, options = {}) {
    if (context && !context.scene && !context.viewScene && !context.camera) {
      options = context;
      context = null;
    }
    this.options = {
      magazineCapacity: MAG_CAPACITY,
      reserveAmmo: 120,
      damage: 28,
      projectileSpeed: 172,
      fireInterval: FIRE_INTERVAL,
      hipSpread: 0.012,
      adsSpread: 0.00125,
      movingSpread: 0.0065,
      crouchMultiplier: 0.75,
      reloadDuration: 1.58,
      emptyReloadDuration: 1.82,
      ...options,
    };

    this.context = null;
    this.events = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;
    this.root = new THREE.Group();
    this.root.name = 'VesperRifleViewmodel';
    this.weapon = new THREE.Group();
    this.weapon.name = 'VesperCR27';
    this.root.add(this.weapon);
    this.object3d = this.root;

    this.magazine = this.options.magazineCapacity;
    this.reserve = this.options.reserveAmmo;
    this.enabled = true;
    this.triggerHeld = false;
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
    this.visualRecoil = 0;
    this._firePose = 0;
    this._time = 0;
    this._moveState = 'idle';
    this._playerSnapshot = null;
    this._inputLatch = Object.create(null);
    this._disposers = [];
    this._materials = [];
    this._textures = [];
    this._modelBuilt = false;
    this.rightSleeve = null;
    this.leftSleeveMesh = null;
    this._rng = new LocalRng('cinderline:weapon-spread');
    this._reloadFromEmpty = false;

    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3(0, 0, -1);
    this.projectiles = new ProjectileSystem(null, options.projectiles);

    this.snapshot = {
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
      weaponName: 'CR-27 Vesper',
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
    this._rng = acquireStream(context.rng, 'weapon-spread', context.state?.seed);
    this.projectiles.init(context);
    if (!this._modelBuilt) this._buildModel();
    if (this.root.parent !== context.viewScene) context.viewScene?.add(this.root);

    listen(this.events, 'player:move-state', (event) => {
      this._moveState = event?.state ?? 'idle';
    }, this._disposers);
    listen(this.events, 'player:death', () => {
      this.triggerHeld = false;
      this.adsWanted = false;
      this.enabled = false;
    }, this._disposers);
    listen(this.events, 'game:pause', () => this.triggerUp(), this._disposers);

    this.root.position.copy(HIP_POSITION);
    this.root.quaternion.copy(HIP_QUATERNION);
    this._updateAimRay();
    this._syncSnapshot();
    return this;
  }

  triggerDown() {
    this.triggerHeld = true;
  }

  triggerUp() {
    this.triggerHeld = false;
  }

  setADS(enabled) {
    const next = Boolean(enabled);
    if (next === this.adsWanted) return;
    this.adsWanted = next;
    if (this.context?.state?.phase === 'capture') {
      this.ads = next ? 1 : 0;
      this.root.position.copy(next ? ADS_POSITION : HIP_POSITION);
      this.root.quaternion.copy(next ? ADS_QUATERNION : HIP_QUATERNION);
    }
    emit(this.events, 'weapon:ads', { enabled: next });
  }

  requestReload() {
    if (
      !this.enabled
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
      this.adsWanted = false;
    }
    this.root.visible = this.enabled;
    this._syncSnapshot();
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.projectiles.fixedUpdate(dt);
    this._time += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.dryCooldown = Math.max(0, this.dryCooldown - dt);
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
    if (inputADS !== this.adsWanted && this.input) this.setADS(inputADS);
    if (inputPressed(this.input, this._inputLatch, 'reload', 'reload', 'KeyR', 'r')) {
      this.requestReload();
    }

    this._playerSnapshot = this.context?.state?.player
      ?? this.context?.state?.playerSnapshot
      ?? this._playerSnapshot;

    if (this.reloading) {
      this._fixedReload(dt);
    } else if ((this.triggerHeld || inputFire) && this.fireCooldown <= 0) {
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
    const canSprintPose = sprinting && !this.adsWanted && !this.reloading && !this.triggerHeld;
    this.sprint = damp(this.sprint, canSprintPose ? 1 : 0, 11, dt);
    this.ads = damp(this.ads, this.adsWanted && !this.reloading ? 1 : 0, 16, dt);

    const speed = Number(player?.speed) || 0;
    const moving = clamp01(speed / 4.25);
    const bobRate = sprinting ? 12 : 8.3;
    const bobX = Math.sin(this._time * bobRate) * 0.0085 * moving * (1 - this.ads * 0.86);
    const bobY = Math.sin(this._time * bobRate * 2) * 0.006 * moving * (1 - this.ads * 0.9);
    const idleX = Math.sin(this._time * 1.37) * 0.0032 * (1 - this.ads * 0.72);
    const idleY = Math.sin(this._time * 1.91 + 0.8) * 0.0026 * (1 - this.ads * 0.72);

    POSE_POSITION.copy(HIP_POSITION).lerp(ADS_POSITION, this.ads);
    POSE_QUATERNION.copy(HIP_QUATERNION).slerp(ADS_QUATERNION, this.ads);
    if (this.sprint > 0.001) {
      POSE_POSITION.lerp(SPRINT_POSITION, this.sprint);
      POSE_QUATERNION.slerp(SPRINT_QUATERNION, this.sprint);
    }

    POSE_POSITION.x += bobX + idleX;
    POSE_POSITION.y += bobY + idleY - this.visualRecoil * 0.016;
    POSE_POSITION.z += this.visualRecoil * 0.062;
    const exactCaptureADS = this.ads === 1
      && this.context?.state?.phase === 'capture';
    if (exactCaptureADS) {
      POSE_POSITION.copy(ADS_POSITION);
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
    this._updateAimRay();
    this._syncSnapshot();
  }

  _fire() {
    if (this.reloading) return;
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
    this.recoilBloom = Math.min(0.018, this.recoilBloom + 0.0021);
    this.visualRecoil = Math.min(1, this.visualRecoil + 0.68);
    this._firePose = 1;
    this._updateAimRay(true);

    const pattern = RECOIL_PATTERN[(this.shotIndex - 1) % RECOIL_PATTERN.length];
    const jitterPitch = (rngFloat(this._rng) - 0.5) * 0.002;
    const jitterYaw = (rngFloat(this._rng) - 0.5) * 0.0026;
    const recoil = {
      pitch: pattern[0] + jitterPitch,
      yaw: pattern[1] + jitterYaw,
    };

    this.projectiles.spawn({
      origin: this.rayOrigin,
      direction: this.rayDirection,
      speed: this.options.projectileSpeed,
      damage: this.options.damage,
      owner: 'player',
      kind: 'rifle',
      headshotMultiplier: 2.05,
    });

    this._worldMuzzle(MUZZLE);
    TRACER_END.copy(MUZZLE).addScaledVector(this.rayDirection, 24);
    emit(this.events, 'weapon:fire', {
      source: 'player',
      kind: 'player',
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
    this.camera.getWorldPosition(out);
    this.camera.getWorldDirection(FORWARD).normalize();
    RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return out
      .addScaledVector(RIGHT, THREE.MathUtils.lerp(0.23, 0.008, this.ads))
      .addScaledVector(UP, THREE.MathUtils.lerp(-0.2, -0.015, this.ads))
      .addScaledVector(FORWARD, 0.72);
  }

  _animateReload() {
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

  _buildModel() {
    this._modelBuilt = true;
    const metalMap = makeTexture([78, 85, 87], 22, 'weapon-metal');
    const metalRough = makeTexture([112, 112, 112], 48, 'weapon-metal-r', true);
    const polymerMap = makeTexture([67, 76, 68], 18, 'weapon-polymer');
    const polymerRough = makeTexture([172, 172, 172], 34, 'weapon-polymer-r', true);
    const gloveMap = makeTexture([73, 84, 70], 24, 'weapon-glove');
    const gloveRough = makeTexture([205, 205, 205], 26, 'weapon-glove-r', true);
    this._textures.push(metalMap, metalRough, polymerMap, polymerRough, gloveMap, gloveRough);

    const gunmetal = new THREE.MeshPhysicalMaterial({
      map: metalMap,
      roughnessMap: metalRough,
      roughness: 0.39,
      metalness: 0.42,
      clearcoat: 0.2,
      clearcoatRoughness: 0.38,
    });
    const darkMetal = new THREE.MeshPhysicalMaterial({
      color: 0x343b3d,
      roughness: 0.4,
      metalness: 0.52,
      clearcoat: 0.13,
      clearcoatRoughness: 0.4,
    });
    const exposedMetal = new THREE.MeshStandardMaterial({
      color: 0xb1b3aa,
      roughness: 0.3,
      metalness: 0.82,
    });
    const railMetal = new THREE.MeshStandardMaterial({
      color: 0x737a77,
      roughness: 0.34,
      metalness: 0.72,
    });
    const accentMetal = new THREE.MeshStandardMaterial({
      color: 0x9a7443,
      roughness: 0.38,
      metalness: 0.64,
    });
    const polymer = new THREE.MeshStandardMaterial({
      map: polymerMap,
      roughnessMap: polymerRough,
      roughness: 0.7,
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
      map: gloveMap,
      roughnessMap: gloveRough,
      roughness: 0.92,
      metalness: 0,
    });
    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x3f4c41,
      roughness: 0.96,
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

    // Free-float handguard: one tapered, side-profiled shell with bevelled
    // shoulders. Recessed side slots sit on the shell instead of forming a
    // stack of disconnected rail blocks.
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
    ], 0.128, 0.007), gunmetal);
    handguard.name = 'profiled-free-float-handguard';
    this.weapon.add(handguard);

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
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const z = -0.236 - i * 0.065;
        const vent = new THREE.Mesh(sideProfileGeometry([
          [z - 0.021, -0.018],
          [z - 0.016, 0.025],
          [z + 0.021, 0.025],
          [z + 0.016, -0.018],
        ], 0.004, 0.001), darkMetal);
        vent.position.x = side * 0.066;
        vent.name = 'machined-handguard-vent';
        this.weapon.add(vent);
      }
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

    this._buildHands(glove, sleeve, rubber);
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
      0.03,
      0.038,
      0.13,
      new THREE.Vector3(0.071, -0.164, 0.012),
      sleeve,
      20,
      'right-tapered-forearm',
    );
    this.rightSleeve = rightSleeve;
    rightSleeve.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-0.58, 0.76, 0.29).normalize(),
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
      0.03,
      0.038,
      0.13,
      new THREE.Vector3(-0.083, -0.171, 0.008),
      sleeve,
      20,
      'left-tapered-forearm',
    );
    this.leftSleeveMesh = leftSleeve;
    leftSleeve.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0.55, 0.78, 0.29).normalize(),
    );

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
    this.visualRecoil = 0;
    this._firePose = 0;
    this._time = 0;
    this._moveState = 'idle';
    this._inputLatch = Object.create(null);
    this._rng = acquireStream(this.context?.rng, 'weapon-spread', seed);
    if (this._rng instanceof LocalRng) this._rng.reset(`${seed}:weapon-spread`);
    else this._rng?.reset?.();
    this.root.visible = true;
    this.root.position.copy(HIP_POSITION);
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
    for (const texture of this._textures) texture.dispose();
    this._materials.length = 0;
    this._textures.length = 0;
    this.projectiles.dispose();
    this.context = null;
    this.events = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;
  }
}

export default Rifle;
