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
const HIP_POSITION = new THREE.Vector3(0.245, -0.245, -0.47);
const ADS_POSITION = new THREE.Vector3(0, -0.126, -0.415);
const SPRINT_POSITION = new THREE.Vector3(0.38, -0.39, -0.24);
const POSE_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const POSE_QUATERNION = new THREE.Quaternion();
const HIP_QUATERNION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.018, -0.045, 0.018, 'YXZ'),
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
  const size = 64;
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
  texture.repeat.set(2.5, 4);
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
 * Procedural Cinderline AR-7 "Kestrel" first-person rifle.
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
    this.root.name = 'KestrelRifleViewmodel';
    this.weapon = new THREE.Group();
    this.weapon.name = 'KestrelAR7';
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
      weaponName: 'Kestrel AR-7',
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
    this.root.position.lerp(POSE_POSITION, 1 - Math.exp(-20 * dt));
    this.root.quaternion.slerp(POSE_QUATERNION, 1 - Math.exp(-20 * dt));

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
      this.leftHand.position.set(-0.075, -0.012, -0.31);
      this.leftHand.rotation.set(0.05, 0.02, -0.08);
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
        LOCAL_TARGET.set(-0.075, -0.012, -0.31),
        POSE_POSITION.set(-0.02, -0.18, 0.015),
        handT,
      );
      this.leftHand.rotation.set(0.28 * handT, -0.15 * handT, -0.08 - 0.28 * handT);
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
        POSE_POSITION.set(-0.075, -0.012, -0.31),
        returnT,
      );
      this.leftHand.rotation.set(0.22 * (1 - returnT) + 0.05, -0.1 * (1 - returnT), -0.16 + 0.08 * returnT);
      if (this._reloadFromEmpty && p > 0.77 && p < 0.9 && this.chargingHandle) {
        this.chargingHandle.position.z = 0.08 + Math.sin((p - 0.77) / 0.13 * Math.PI) * 0.075;
      }
    }
  }

  _buildModel() {
    this._modelBuilt = true;
    const metalMap = makeTexture([49, 54, 56], 18, 'weapon-metal');
    const metalRough = makeTexture([106, 106, 106], 50, 'weapon-metal-r', true);
    const polymerMap = makeTexture([41, 47, 43], 15, 'weapon-polymer');
    const polymerRough = makeTexture([180, 180, 180], 38, 'weapon-polymer-r', true);
    const gloveMap = makeTexture([63, 70, 61], 22, 'weapon-glove');
    const gloveRough = makeTexture([205, 205, 205], 26, 'weapon-glove-r', true);
    this._textures.push(metalMap, metalRough, polymerMap, polymerRough, gloveMap, gloveRough);

    const gunmetal = new THREE.MeshStandardMaterial({
      map: metalMap,
      roughnessMap: metalRough,
      roughness: 0.46,
      metalness: 0.82,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x171b1c,
      roughness: 0.34,
      metalness: 0.9,
    });
    const exposedMetal = new THREE.MeshStandardMaterial({
      color: 0xa5a49a,
      roughness: 0.25,
      metalness: 0.96,
    });
    const polymer = new THREE.MeshStandardMaterial({
      map: polymerMap,
      roughnessMap: polymerRough,
      roughness: 0.78,
      metalness: 0.06,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x151713,
      roughness: 0.94,
      metalness: 0,
    });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xb68c3f,
      roughness: 0.28,
      metalness: 0.82,
    });
    const opticGlass = new THREE.MeshPhysicalMaterial({
      color: 0x4f8190,
      emissive: 0x102d34,
      emissiveIntensity: 0.45,
      metalness: 0.05,
      roughness: 0.08,
      transmission: 0.32,
      transparent: true,
      opacity: 0.78,
      thickness: 0.008,
    });
    const reticle = new THREE.MeshBasicMaterial({
      color: 0x79e5d2,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      toneMapped: false,
    });
    const glove = new THREE.MeshStandardMaterial({
      map: gloveMap,
      roughnessMap: gloveRough,
      roughness: 0.92,
      metalness: 0,
    });
    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x536052,
      roughness: 0.96,
      metalness: 0,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0x9d7156,
      roughness: 0.86,
      metalness: 0,
    });
    this._materials.push(
      gunmetal,
      darkMetal,
      exposedMetal,
      polymer,
      rubber,
      brass,
      opticGlass,
      reticle,
      glove,
      sleeve,
      skin,
    );

    // Receiver silhouette: two profiled, bevelled shells and contrasting controls.
    const upperGeometry = profileGeometry([
      [-0.047, -0.045],
      [-0.054, 0.023],
      [-0.038, 0.061],
      [0.036, 0.061],
      [0.052, 0.026],
      [0.048, -0.045],
    ], 0.29, 0.006);
    const upper = new THREE.Mesh(upperGeometry, gunmetal);
    upper.position.set(0, 0.028, -0.025);
    upper.name = 'bevelled-upper-receiver';
    this.weapon.add(upper);

    const lowerGeometry = profileGeometry([
      [-0.045, 0.036],
      [-0.05, -0.048],
      [-0.03, -0.075],
      [-0.018, -0.122],
      [0.025, -0.118],
      [0.041, -0.047],
      [0.048, 0.036],
    ], 0.225, 0.006);
    const lower = new THREE.Mesh(lowerGeometry, gunmetal);
    lower.position.set(0, -0.022, 0.015);
    lower.name = 'bevelled-lower-receiver';
    this.weapon.add(lower);

    roundedPart(this.weapon, new THREE.Vector3(0.087, 0.012, 0.29), new THREE.Vector3(0, 0.094, -0.025), darkMetal, 0.003, 1, 'top-rail');
    for (let i = 0; i < 14; i += 1) {
      roundedPart(
        this.weapon,
        new THREE.Vector3(0.082, 0.012, 0.009),
        new THREE.Vector3(0, 0.105, 0.103 - i * 0.02),
        exposedMetal,
        0.002,
        1,
        'rail-tooth',
      );
    }

    // Ejection port, forward assist, selector, bolt catch, and visible fasteners.
    roundedPart(this.weapon, new THREE.Vector3(0.052, 0.043, 0.09), new THREE.Vector3(0.045, 0.033, -0.015), darkMetal, 0.004, 2, 'ejection-port');
    roundedPart(this.weapon, new THREE.Vector3(0.004, 0.027, 0.072), new THREE.Vector3(0.073, 0.034, -0.015), exposedMetal, 0.0015, 1, 'bolt-face');
    cylinderPart(this.weapon, 0.012, 0.012, 0.014, new THREE.Vector3(0.055, -0.005, 0.092), darkMetal, 12, 'forward-assist').rotation.y = Math.PI * 0.5;
    cylinderPart(this.weapon, 0.009, 0.009, 0.012, new THREE.Vector3(-0.055, -0.027, 0.06), exposedMetal, 12, 'selector').rotation.y = Math.PI * 0.5;
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

    // Octagonal free-float handguard, ribs, vents, heat-shield and rail hardware.
    const handguard = cylinderPart(
      this.weapon,
      0.064,
      0.071,
      0.355,
      new THREE.Vector3(0, 0.018, -0.34),
      gunmetal,
      8,
      'octagonal-handguard',
    );
    handguard.rotation.z = Math.PI * 0.125;
    for (let i = 0; i < 8; i += 1) {
      const z = -0.19 - i * 0.042;
      roundedPart(this.weapon, new THREE.Vector3(0.076, 0.011, 0.014), new THREE.Vector3(0, 0.087, z), darkMetal, 0.002, 1, 'handguard-rail');
      roundedPart(this.weapon, new THREE.Vector3(0.01, 0.036, 0.025), new THREE.Vector3(0.066, 0.016, z), darkMetal, 0.003, 2, 'vent-recess-right');
      roundedPart(this.weapon, new THREE.Vector3(0.01, 0.036, 0.025), new THREE.Vector3(-0.066, 0.016, z), darkMetal, 0.003, 2, 'vent-recess-left');
    }
    roundedPart(this.weapon, new THREE.Vector3(0.018, 0.038, 0.31), new THREE.Vector3(0, -0.052, -0.34), polymer, 0.006, 2, 'hand-stop-inlay');
    roundedPart(this.weapon, new THREE.Vector3(0.025, 0.07, 0.035), new THREE.Vector3(0, -0.072, -0.45), polymer, 0.005, 2, 'angled-hand-stop');

    // Barrel, gas block, muzzle brake and machined ports.
    cylinderPart(this.weapon, 0.012, 0.013, 0.31, new THREE.Vector3(0, 0.018, -0.665), darkMetal, 16, 'barrel');
    roundedPart(this.weapon, new THREE.Vector3(0.046, 0.056, 0.052), new THREE.Vector3(0, 0.02, -0.535), darkMetal, 0.005, 2, 'gas-block');
    cylinderPart(this.weapon, 0.021, 0.019, 0.078, new THREE.Vector3(0, 0.018, -0.832), exposedMetal, 12, 'muzzle-brake');
    cylinderPart(this.weapon, 0.012, 0.012, 0.084, new THREE.Vector3(0, 0.018, -0.837), darkMetal, 12, 'muzzle-bore');
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i += 1) {
        roundedPart(
          this.weapon,
          new THREE.Vector3(0.008, 0.012, 0.018),
          new THREE.Vector3(side * 0.02, 0.02, -0.82 - i * 0.026),
          darkMetal,
          0.002,
          1,
          'muzzle-port',
        );
      }
    }

    // Stock with open struts, cheek riser and textured recoil pad.
    roundedPart(this.weapon, new THREE.Vector3(0.046, 0.045, 0.19), new THREE.Vector3(0, 0.008, 0.242), polymer, 0.007, 2, 'buffer-stock-spine');
    const stockTop = roundedPart(this.weapon, new THREE.Vector3(0.082, 0.052, 0.22), new THREE.Vector3(0, 0.058, 0.295), polymer, 0.009, 2, 'cheek-rest');
    stockTop.rotation.x = -0.025;
    for (const side of [-1, 1]) {
      const strut = roundedPart(this.weapon, new THREE.Vector3(0.018, 0.026, 0.2), new THREE.Vector3(side * 0.036, -0.005, 0.31), polymer, 0.006, 2, 'stock-strut');
      strut.rotation.x = side * 0.035;
    }
    const butt = roundedPart(this.weapon, new THREE.Vector3(0.095, 0.135, 0.036), new THREE.Vector3(0, -0.005, 0.425), rubber, 0.012, 3, 'rubber-buttpad');
    butt.rotation.x = -0.08;
    for (let i = -2; i <= 2; i += 1) {
      roundedPart(this.weapon, new THREE.Vector3(0.073, 0.006, 0.008), new THREE.Vector3(0, i * 0.02 - 0.005, 0.447), darkMetal, 0.002, 1, 'buttpad-rib');
    }

    // Pistol grip with inset panels, trigger guard and trigger.
    const gripGeometry = profileGeometry([
      [-0.033, 0.035],
      [-0.028, -0.105],
      [-0.007, -0.142],
      [0.032, -0.132],
      [0.038, 0.03],
    ], 0.083, 0.007);
    const grip = new THREE.Mesh(gripGeometry, polymer);
    grip.position.set(0, -0.09, 0.104);
    grip.rotation.x = -0.19;
    grip.name = 'profiled-pistol-grip';
    this.weapon.add(grip);
    for (let i = 0; i < 5; i += 1) {
      roundedPart(this.weapon, new THREE.Vector3(0.07, 0.008, 0.006), new THREE.Vector3(0, -0.12 - i * 0.021, 0.142 + i * 0.003), rubber, 0.002, 1, 'grip-rib');
    }
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.0045, 6, 18, Math.PI),
      darkMetal,
    );
    guard.position.set(0, -0.083, 0.035);
    guard.rotation.set(Math.PI * 0.5, 0, 0);
    guard.scale.set(1.35, 1, 1);
    guard.name = 'trigger-guard';
    this.weapon.add(guard);
    const trigger = roundedPart(this.weapon, new THREE.Vector3(0.009, 0.045, 0.009), new THREE.Vector3(0, -0.094, 0.046), exposedMetal, 0.003, 2, 'trigger');
    trigger.rotation.x = -0.25;

    // Curved magazine with base plate, witness detail and stamped ribs.
    this.magazineMesh = new THREE.Group();
    this.magazineMesh.name = 'magazine-assembly';
    this.magazineMesh.position.set(0, -0.136, 0.015);
    this.magazineMesh.rotation.set(-0.15, 0, 0.035);
    this.weapon.add(this.magazineMesh);
    const magBody = roundedPart(this.magazineMesh, new THREE.Vector3(0.072, 0.205, 0.104), new THREE.Vector3(0, -0.08, 0), polymer, 0.009, 3, 'curved-magazine-body');
    magBody.rotation.x = -0.08;
    roundedPart(this.magazineMesh, new THREE.Vector3(0.081, 0.018, 0.116), new THREE.Vector3(0, -0.188, 0.012), darkMetal, 0.004, 2, 'magazine-baseplate');
    for (const x of [-0.026, 0.026]) {
      roundedPart(this.magazineMesh, new THREE.Vector3(0.006, 0.15, 0.006), new THREE.Vector3(x, -0.08, -0.054), gunmetal, 0.002, 1, 'magazine-stamp-rib');
    }
    for (let i = 0; i < 3; i += 1) {
      cylinderPart(this.magazineMesh, 0.004, 0.004, 0.004, new THREE.Vector3(0.038, -0.05 - i * 0.045, 0.03), brass, 8, 'witness-round').rotation.y = Math.PI * 0.5;
    }

    // Low-profile holographic optic with hood, elevation controls and layered glass.
    const optic = new THREE.Group();
    optic.name = 'Aster-Holo-Optic';
    optic.position.set(0, 0.135, -0.045);
    this.weapon.add(optic);
    roundedPart(optic, new THREE.Vector3(0.092, 0.032, 0.145), new THREE.Vector3(0, -0.015, 0), darkMetal, 0.006, 2, 'optic-base');
    for (const side of [-1, 1]) {
      roundedPart(optic, new THREE.Vector3(0.016, 0.095, 0.105), new THREE.Vector3(side * 0.044, 0.04, -0.005), gunmetal, 0.006, 2, 'optic-hood-side');
    }
    roundedPart(optic, new THREE.Vector3(0.092, 0.016, 0.105), new THREE.Vector3(0, 0.085, -0.005), gunmetal, 0.005, 2, 'optic-hood-top');
    const frontGlass = new THREE.Mesh(new THREE.CircleGeometry(0.037, 24), opticGlass);
    frontGlass.position.set(0, 0.045, -0.059);
    frontGlass.rotation.x = 0;
    frontGlass.name = 'optic-front-glass';
    optic.add(frontGlass);
    const rearGlass = frontGlass.clone();
    rearGlass.position.z = 0.052;
    rearGlass.rotation.y = Math.PI;
    rearGlass.name = 'optic-rear-glass';
    optic.add(rearGlass);
    const dot = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.005, 18), reticle);
    dot.position.set(0, 0.045, 0.054);
    dot.name = 'projected-reticle';
    optic.add(dot);
    cylinderPart(optic, 0.013, 0.013, 0.012, new THREE.Vector3(0.055, 0.035, 0.012), darkMetal, 12, 'brightness-dial').rotation.y = Math.PI * 0.5;
    for (let i = 0; i < 5; i += 1) {
      roundedPart(optic, new THREE.Vector3(0.008, 0.025, 0.004), new THREE.Vector3(0.063, 0.035, -0.003 + i * 0.007), exposedMetal, 0.001, 1, 'dial-knurl');
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

    this._buildHands(glove, sleeve, skin, rubber);
    this.weapon.traverse(setShadow);
  }

  _buildHands(glove, sleeve, skin, rubber) {
    // Right sleeve and hand remain locked to the grip.
    const rightArm = new THREE.Group();
    rightArm.name = 'right-arm';
    rightArm.position.set(0.105, -0.255, 0.28);
    rightArm.rotation.set(-0.22, -0.16, -0.14);
    this.weapon.add(rightArm);
    const rightSleeve = cylinderPart(rightArm, 0.075, 0.09, 0.34, new THREE.Vector3(0.045, -0.18, 0.12), sleeve, 12, 'right-sleeve');
    rightSleeve.rotation.set(-0.86, 0.18, 0.05);
    roundedPart(rightArm, new THREE.Vector3(0.115, 0.065, 0.09), new THREE.Vector3(0, -0.025, 0.015), glove, 0.018, 3, 'right-palm');
    roundedPart(rightArm, new THREE.Vector3(0.12, 0.035, 0.102), new THREE.Vector3(0.005, -0.075, 0.025), rubber, 0.009, 2, 'right-cuff');

    const fingerGeometry = new THREE.CapsuleGeometry(0.013, 0.052, 4, 8);
    for (let i = 0; i < 4; i += 1) {
      const finger = new THREE.Mesh(fingerGeometry, glove);
      finger.position.set(-0.039 + i * 0.026, -0.08 - i * 0.003, -0.005);
      finger.rotation.set(0.12, 0.04, -0.22);
      finger.name = `right-finger-${i + 1}`;
      rightArm.add(finger);
    }
    const triggerFinger = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.012, 0.064, 4, 8),
      glove,
    );
    triggerFinger.position.set(-0.046, 0.006, -0.035);
    triggerFinger.rotation.set(Math.PI * 0.48, 0.1, 0.2);
    triggerFinger.name = 'right-trigger-finger';
    rightArm.add(triggerFinger);
    const rightThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.058, 4, 8), glove);
    rightThumb.position.set(0.046, -0.018, -0.036);
    rightThumb.rotation.set(Math.PI * 0.43, 0, -0.5);
    rightThumb.name = 'right-thumb';
    rightArm.add(rightThumb);

    // Left support hand wraps the underside and sides of the handguard.
    this.leftHand = new THREE.Group();
    this.leftHand.name = 'left-support-hand';
    this.leftHand.position.set(-0.075, -0.012, -0.31);
    this.leftHand.rotation.set(0.05, 0.02, -0.08);
    this.weapon.add(this.leftHand);
    roundedPart(this.leftHand, new THREE.Vector3(0.108, 0.058, 0.12), new THREE.Vector3(0.01, -0.065, 0), glove, 0.018, 3, 'left-palm');
    roundedPart(this.leftHand, new THREE.Vector3(0.13, 0.036, 0.112), new THREE.Vector3(0.01, -0.112, 0.03), rubber, 0.01, 2, 'left-cuff');
    const leftSleeve = cylinderPart(this.leftHand, 0.075, 0.095, 0.38, new THREE.Vector3(-0.13, -0.23, 0.16), sleeve, 12, 'left-sleeve');
    leftSleeve.rotation.set(-0.62, -0.32, -0.72);

    const wrapGeometry = new THREE.CapsuleGeometry(0.014, 0.065, 4, 8);
    for (let i = 0; i < 4; i += 1) {
      const finger = new THREE.Mesh(wrapGeometry, glove);
      finger.position.set(-0.032 + i * 0.027, -0.045, -0.048 + i * 0.011);
      finger.rotation.set(Math.PI * 0.48, 0.08, -0.1 + i * 0.035);
      finger.name = `left-finger-${i + 1}`;
      this.leftHand.add(finger);
    }
    const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.073, 4, 8), glove);
    leftThumb.position.set(0.058, 0.006, -0.02);
    leftThumb.rotation.set(Math.PI * 0.39, 0.15, -0.58);
    leftThumb.name = 'left-thumb';
    this.leftHand.add(leftThumb);

    // Small exposed wrist transitions prevent the hands reading as floating gloves.
    roundedPart(rightArm, new THREE.Vector3(0.09, 0.025, 0.075), new THREE.Vector3(0.005, -0.101, 0.035), skin, 0.008, 2, 'right-wrist');
    roundedPart(this.leftHand, new THREE.Vector3(0.098, 0.022, 0.08), new THREE.Vector3(0.008, -0.127, 0.045), skin, 0.008, 2, 'left-wrist');
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
