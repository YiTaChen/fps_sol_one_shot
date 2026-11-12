import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const ZERO = new THREE.Vector3();
const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const WISH = new THREE.Vector3();
const DELTA = new THREE.Vector3();
const MOVE_START = new THREE.Vector3();
const MOVE_WORK = new THREE.Vector3();
const RAY_ORIGIN = new THREE.Vector3();
const RAY_DIRECTION = new THREE.Vector3();
const LEAN_OFFSET = new THREE.Vector3();
const CAMERA_POSITION = new THREE.Vector3();
const INTERPOLATED_POSITION = new THREE.Vector3();
const MANTLE_SAMPLE = new THREE.Vector3();
const MANTLE_BEFORE = new THREE.Vector3();
const DAMAGE_DIRECTION = new THREE.Vector3();
const EULER = new THREE.Euler(0, 0, 0, 'YXZ');

const DEFAULTS = Object.freeze({
  maxHealth: 100,
  spawn: [0, 0.04, 7],
  yaw: 0,
  standingHeight: 1.78,
  crouchingHeight: 1.16,
  standingEye: 1.66,
  crouchingEye: 1.04,
  radius: 0.34,
  walkSpeed: 4.25,
  sprintSpeed: 7.15,
  crouchSpeed: 2.35,
  groundAcceleration: 39,
  airAcceleration: 8.5,
  groundDeceleration: 31,
  jumpSpeed: 5.45,
  gravity: 18.5,
  maxFallSpeed: 32,
  maxSlope: Math.PI * 0.29,
  maxStepHeight: 0.44,
  slideDuration: 0.78,
  slideMinSpeed: 5.1,
  slideFriction: 5.5,
  mantleMinHeight: 0.38,
  mantleMaxHeight: 0.44,
  mantleReach: 0.82,
  mantleDuration: 0.43,
  leanDistance: 0.29,
  leanRoll: 0.09,
  lookSensitivity: 0.00185,
  killPlane: -12,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
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
    else if (typeof events.off === 'function') {
      disposers.push(() => events.off(name, callback));
    }
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

function readAxis(input, axis) {
  if (!input) return 0;
  if (typeof input.getAxis === 'function') {
    const value = input.getAxis(axis);
    if (Number.isFinite(value)) return THREE.MathUtils.clamp(value, -1, 1);
  }
  if (typeof input.axis === 'function') {
    const value = input.axis(axis);
    if (Number.isFinite(value)) return THREE.MathUtils.clamp(value, -1, 1);
  }
  const value = input.axes?.[axis] ?? input[axis];
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
}

function readLook(input, out) {
  out.set(0, 0);
  if (!input) return out;

  let value = null;
  if (typeof input.consumeLook === 'function') value = input.consumeLook(out);
  else if (typeof input.consumeLookDelta === 'function') value = input.consumeLookDelta();
  else if (typeof input.consumeMouseDelta === 'function') value = input.consumeMouseDelta();
  else if (typeof input.getLookDelta === 'function') value = input.getLookDelta();

  if (value) {
    out.x = Number(value.x ?? value[0]) || 0;
    out.y = Number(value.y ?? value[1]) || 0;
    return out;
  }

  const source = input.lookDelta ?? input.mouseDelta ?? input.pointerDelta;
  if (source) {
    out.x = Number(source.x ?? source[0]) || 0;
    out.y = Number(source.y ?? source[1]) || 0;
  } else {
    out.x = Number(input.lookX ?? input.mouseDX) || 0;
    out.y = Number(input.lookY ?? input.mouseDY) || 0;
  }
  return out;
}

function hitDistance(hit, fallback = Infinity) {
  if (!hit) return fallback;
  if (Array.isArray(hit)) return hit.length ? hitDistance(hit[0], fallback) : fallback;
  if (Number.isFinite(hit.distance)) return hit.distance;
  if (Number.isFinite(hit.t)) return hit.t;
  return fallback;
}

function hitPoint(hit, out) {
  const point = Array.isArray(hit) ? hit[0]?.point : hit?.point ?? hit?.position;
  if (!point) return null;
  out.copy(point);
  return out;
}

function isVectorLike(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/**
 * Deterministic fixed-step first-person controller.
 *
 * Position is the capsule's foot point. PhysicsWorld.moveCapsule may either
 * mutate its position argument, return a Vector3, or return a result containing
 * `position`/`delta` and `grounded`; all three forms are accepted.
 */
export class PlayerController {
  constructor(context = null, options = {}) {
    if (context && !context.scene && !context.camera && !context.physics) {
      options = context;
      context = null;
    }
    this.options = { ...DEFAULTS, ...options };
    this.sensitivity = 1;
    this.adsSensitivity = 0.65;
    this.motionScale = 1;
    this.context = null;
    this.events = null;
    this.physics = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;

    this.position = new THREE.Vector3().fromArray(this.options.spawn);
    this.previousPosition = this.position.clone();
    this.eyePosition = this.position.clone().addScaledVector(UP, this.options.standingEye);
    this.velocity = new THREE.Vector3();
    this.spawnPosition = this.position.clone();
    this.yaw = this.options.yaw;
    this.pitch = 0;

    this.health = this.options.maxHealth;
    this.maxHealth = this.options.maxHealth;
    this.damageFloor = null;
    this.enabled = true;
    this.alive = true;
    this.grounded = false;
    this.wasGrounded = false;
    this.crouched = false;
    this.sliding = false;
    this.mantling = false;
    this.sprinting = false;
    this.moveState = 'idle';

    this.lean = 0;
    this.targetLean = 0;
    this.eyeHeight = this.options.standingEye;
    this.stanceHeight = this.options.standingHeight;
    this.verticalSpeedBeforeLand = 0;
    this.distanceWalked = 0;
    this.stepDistance = 0;
    this.airTime = 0;
    this.slideTime = 0;
    this.mantleTime = 0;
    this.mantleStart = new THREE.Vector3();
    this.mantleEnd = new THREE.Vector3();
    this._mantleLast = new THREE.Vector3();
    this._mantleStall = 0;

    this._bobPhase = 0;
    this._bobWeight = 0;
    this._landImpulse = 0;
    this._cameraRoll = 0;
    this._lookInertiaX = 0;
    this._recoilPitch = 0;
    this._recoilYaw = 0;
    this._damageKick = 0;
    this._lastMoveState = '';
    this._inputLatch = Object.create(null);
    this._lookDelta = new THREE.Vector2();
    this._disposers = [];
    this._time = 0;

    this.capsule = {
      radius: this.options.radius,
      height: this.options.standingHeight,
      halfHeight: this.options.standingHeight * 0.5,
      maxSlope: this.options.maxSlope,
      maxStepHeight: this.options.maxStepHeight,
      canStep: false,
    };

    this.snapshot = {
      position: this.position,
      eyePosition: this.eyePosition,
      cameraPosition: this.eyePosition,
      velocity: this.velocity,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      maxHealth: this.maxHealth,
      alive: this.alive,
      enabled: this.enabled,
      grounded: this.grounded,
      crouched: this.crouched,
      sliding: this.sliding,
      sprinting: this.sprinting,
      mantling: this.mantling,
      lean: this.lean,
      eyeHeight: this.eyeHeight,
      speed: 0,
      moveState: this.moveState,
    };

    if (context) this.init(context);
  }

  init(context) {
    this.context = context;
    this.events = context.events;
    this.physics = context.physics;
    this.input = context.input;
    this.camera = context.camera;
    this.viewCamera = context.viewCamera;

    listen(this.events, 'weapon:fire', (event) => {
      if (!this.alive) return;
      if (event?.kind === 'enemy' || String(event?.source ?? '').startsWith('enemy:')) return;
      const recoil = event?.recoil ?? event?.cameraRecoil ?? 0.012;
      this._recoilPitch += Number(recoil.pitch ?? recoil) || 0;
      this._recoilYaw += Number(recoil.yaw) || 0;
    }, this._disposers);

    listen(this.events, 'game:pause', () => this._clearTransientInput(), this._disposers);
    listen(this.events, 'game:restart', () => this._clearTransientInput(), this._disposers);

    this.previousPosition.copy(this.position);
    this._applyCameraPose(0, 1);
    this._syncSnapshot();
    return this;
  }

  reset() {
    this.position.copy(this.spawnPosition);
    this.previousPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.damageFloor = null;
    this.yaw = this.options.yaw;
    this.pitch = 0;
    this.alive = true;
    this.enabled = true;
    this.grounded = false;
    this.wasGrounded = false;
    this.crouched = false;
    this.sliding = false;
    this.mantling = false;
    this.sprinting = false;
    this.moveState = 'idle';
    this.eyeHeight = this.options.standingEye;
    this.stanceHeight = this.options.standingHeight;
    this.capsule.height = this.options.standingHeight;
    this.capsule.halfHeight = this.capsule.height * 0.5;
    this.capsule.canStep = false;
    this.lean = 0;
    this.targetLean = 0;
    this._bobPhase = 0;
    this._bobWeight = 0;
    this._landImpulse = 0;
    this._cameraRoll = 0;
    this._lookInertiaX = 0;
    this._recoilPitch = 0;
    this._recoilYaw = 0;
    this._damageKick = 0;
    this.slideTime = 0;
    this.mantleTime = 0;
    this.airTime = 0;
    this.stepDistance = 0;
    this.distanceWalked = 0;
    this._time = 0;
    this._clearTransientInput();
    this._applyCameraPose(0, 1);
    this._setMoveState('idle', true);
    this._syncSnapshot();
  }

  teleport(position, yaw = this.yaw) {
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.mantling = false;
    this.sliding = false;
    this.grounded = false;
    this._applyCameraPose(0, 1);
    this._syncSnapshot();
  }

  setSpawn(position, yaw = this.yaw) {
    this.spawnPosition.copy(position);
    this.options.yaw = yaw;
    this.teleport(position, yaw);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.sprinting = false;
      this._clearTransientInput();
    }
    this._syncSnapshot();
  }

  applyDamage(amount, direction = null, source = null) {
    if (!this.alive || !this.enabled) return false;
    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0) return false;

    const configuredFloor = this.damageFloor == null
      ? Number.NaN
      : Number(this.damageFloor);
    const damageFloor = Number.isFinite(configuredFloor)
      ? THREE.MathUtils.clamp(configuredFloor, 1, this.maxHealth)
      : 0;
    this.health = Math.max(damageFloor, this.health - damage);
    let angle = 0;
    if (direction && isVectorLike(direction)) {
      DAMAGE_DIRECTION.copy(direction).setY(0);
      if (DAMAGE_DIRECTION.lengthSq() > 1e-5) {
        DAMAGE_DIRECTION.normalize();
        FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        angle = Math.atan2(DAMAGE_DIRECTION.dot(RIGHT), DAMAGE_DIRECTION.dot(FORWARD));
      }
    }
    this._damageKick = Math.min(1, this._damageKick + damage / 65);
    emit(this.events, 'player:damage', {
      amount: damage,
      health: this.health,
      maxHealth: this.maxHealth,
      direction: angle,
      source,
    });

    if (this.health <= 0) {
      this.alive = false;
      this.enabled = false;
      this.velocity.set(0, 0, 0);
      this._setMoveState('dead', true);
      emit(this.events, 'player:death', { source, position: this.position.clone() });
    }
    this._syncSnapshot();
    return true;
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this._time += dt;
    this.previousPosition.copy(this.position);
    this.wasGrounded = this.grounded;

    if (!this.enabled || !this.alive) {
      this._syncSnapshot();
      return;
    }

    this.sampleLook();
    if (this.mantling) this._fixedMantle(dt);
    else this._fixedMovement(dt);

    if (this.position.y < this.options.killPlane) {
      this.applyDamage(this.maxHealth, UP, 'fall');
    }

    this._syncSnapshot();
  }

  update(dt, alpha = 1) {
    if (!Number.isFinite(dt) || dt < 0) return;
    this._recoilPitch = damp(this._recoilPitch, 0, 17, dt);
    this._recoilYaw = damp(this._recoilYaw, 0, 20, dt);
    this._landImpulse = damp(this._landImpulse, 0, 13, dt);
    this._damageKick = damp(this._damageKick, 0, 5.2, dt);
    this.lean = damp(this.lean, this.targetLean, 15, dt);
    this._applyCameraPose(dt, alpha);
    this._syncSnapshot();
  }

  applyControls(settings) {
    this.sensitivity = settings.sensitivity / 100;
    this.adsSensitivity = settings.adsSensitivity / 100;
    this.motionScale = settings.reducedMotion ? 0 : 1;
  }

  syncAimCamera() {
    this._applyCameraPose(0, 1);
  }

  sampleLook() {
    if (!this.enabled || !this.alive) return;
    readLook(this.input, this._lookDelta);
    if (!this._lookDelta.x && !this._lookDelta.y) return;
    const weapon = this.context?.state?.weapon;
    const aiming = this.input?.buttonDown?.(2) && !weapon?.reloading && !weapon?.melee;
    const scopeScale = aiming && weapon?.scope
      ? THREE.MathUtils.lerp(1, 0.43, weapon.ads ?? 0)
      : 1;
    const sensitivity = this.options.lookSensitivity * this.sensitivity
      * (aiming ? this.adsSensitivity * scopeScale : 1);
    this.yaw -= this._lookDelta.x * sensitivity;
    this.pitch -= this._lookDelta.y * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.475, Math.PI * 0.475);
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this._lookInertiaX = THREE.MathUtils.clamp(
      this._lookInertiaX - this._lookDelta.x * 0.00022,
      -0.018,
      0.018,
    );
  }

  _fixedMovement(dt) {
    const jumpPressed = inputPressed(this.input, this._inputLatch, 'jump', 'jump', 'Space', ' ');
    const crouchDown = inputDown(this.input, 'crouch', 'ControlLeft', 'ControlRight', 'KeyC', 'c');
    const sprintDown = inputDown(this.input, 'sprint', 'ShiftLeft', 'ShiftRight');

    let moveX = readAxis(this.input, 'moveX');
    let moveY = readAxis(this.input, 'moveY');
    if (moveX === 0) {
      moveX = (inputDown(this.input, 'right', 'moveRight', 'KeyD', 'd') ? 1 : 0)
        - (inputDown(this.input, 'left', 'moveLeft', 'KeyA', 'a') ? 1 : 0);
    }
    if (moveY === 0) {
      moveY = (inputDown(this.input, 'forward', 'moveForward', 'KeyW', 'w') ? 1 : 0)
        - (inputDown(this.input, 'backward', 'moveBackward', 'KeyS', 's') ? 1 : 0);
    }
    const moveLength = Math.hypot(moveX, moveY);
    if (moveLength > 1) {
      moveX /= moveLength;
      moveY /= moveLength;
    }

    FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    WISH.copy(RIGHT).multiplyScalar(moveX).addScaledVector(FORWARD, moveY);
    if (WISH.lengthSq() > 1) WISH.normalize();

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (
      crouchDown
      && !this.sliding
      && this.grounded
      && sprintDown
      && moveY > 0.15
      && horizontalSpeed >= this.options.slideMinSpeed
    ) {
      this.sliding = true;
      this.slideTime = 0;
      this.velocity.x += FORWARD.x * 0.9;
      this.velocity.z += FORWARD.z * 0.9;
    }

    if (this.sliding) {
      this.slideTime += dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const nextSpeed = Math.max(0, speed - this.options.slideFriction * dt);
      if (speed > 1e-4) {
        this.velocity.x *= nextSpeed / speed;
        this.velocity.z *= nextSpeed / speed;
      }
      const steering = 2.2 * dt;
      this.velocity.x = moveToward(this.velocity.x, WISH.x * nextSpeed, steering);
      this.velocity.z = moveToward(this.velocity.z, WISH.z * nextSpeed, steering);
      if (
        this.slideTime >= this.options.slideDuration
        || nextSpeed < this.options.crouchSpeed
        || !crouchDown
        || !this.grounded
      ) {
        this.sliding = false;
      }
    } else {
      const weapon = this.context?.state?.weapon;
      const aimWeight = weapon?.scope ? (weapon.ads ?? 0) : 0;
      const mobility = (weapon?.mobility ?? 1) * (1 - 0.28 * aimWeight);
      const wantsSprint = sprintDown && moveY > 0.35 && !crouchDown && this.grounded && aimWeight < 0.5;
      this.sprinting = wantsSprint;
      const targetSpeed = crouchDown
        ? this.options.crouchSpeed
        : wantsSprint
          ? this.options.sprintSpeed
          : this.options.walkSpeed;
      const hasWish = WISH.lengthSq() > 1e-5;
      const acceleration = this.grounded
        ? hasWish
          ? this.options.groundAcceleration
          : this.options.groundDeceleration
        : this.options.airAcceleration;
      const targetX = WISH.x * targetSpeed * mobility;
      const targetZ = WISH.z * targetSpeed * mobility;
      this.velocity.x = moveToward(this.velocity.x, targetX, acceleration * dt);
      this.velocity.z = moveToward(this.velocity.z, targetZ, acceleration * dt);
    }

    let wantsCrouch = crouchDown || this.sliding;
    if (!wantsCrouch && !this._canStand()) wantsCrouch = true;
    this.crouched = wantsCrouch;
    const targetHeight = wantsCrouch ? this.options.crouchingHeight : this.options.standingHeight;
    const targetEye = wantsCrouch ? this.options.crouchingEye : this.options.standingEye;
    this.stanceHeight = damp(this.stanceHeight, targetHeight, wantsCrouch ? 18 : 12, dt);
    this.eyeHeight = damp(this.eyeHeight, targetEye, wantsCrouch ? 18 : 12, dt);
    this.capsule.height = this.stanceHeight;
    this.capsule.halfHeight = this.stanceHeight * 0.5;
    this.capsule.canStep = false;

    if (jumpPressed) {
      if (this._tryMantle()) {
        return;
      }
      if (this.grounded && !this.sliding) {
        this.velocity.y = this.options.jumpSpeed;
        this.grounded = false;
        this.airTime = 0;
        emit(this.events, 'player:jump', { position: this.position.clone() });
      } else if (this.grounded && this.sliding) {
        this.sliding = false;
        this.velocity.y = this.options.jumpSpeed * 0.92;
        this.grounded = false;
        emit(this.events, 'player:jump', { position: this.position.clone() });
      }
    }

    if (!this.grounded) {
      this.airTime += dt;
      this.velocity.y = Math.max(
        -this.options.maxFallSpeed,
        this.velocity.y - this.options.gravity * dt,
      );
    } else if (this.velocity.y < 0) {
      this.velocity.y = -0.45;
    }
    this.verticalSpeedBeforeLand = this.velocity.y;

    this.capsule.canStep = this.grounded && !jumpPressed && this.velocity.y <= 0.05;
    DELTA.copy(this.velocity).multiplyScalar(dt);
    const result = this._moveCapsule(DELTA);
    this.grounded = Boolean(
      result?.grounded
      || result?.onGround
      || result?.floor
      || (this.velocity.y <= 0.05 && this._probeGround()),
    );

    const actualX = (this.position.x - MOVE_START.x) / dt;
    const actualZ = (this.position.z - MOVE_START.z) / dt;
    if (Math.abs(actualX) < Math.abs(this.velocity.x) * 0.15) this.velocity.x = actualX;
    if (Math.abs(actualZ) < Math.abs(this.velocity.z) * 0.15) this.velocity.z = actualZ;

    if (this.grounded && !this.wasGrounded) {
      const impact = clamp01((-this.verticalSpeedBeforeLand - 2.2) / 10);
      this.velocity.y = 0;
      this._landImpulse = Math.max(this._landImpulse, impact);
      emit(this.events, 'player:land', {
        position: this.position.clone(),
        impact,
        fallSpeed: -this.verticalSpeedBeforeLand,
      });
      this.airTime = 0;
    } else if (this.grounded) {
      this.velocity.y = 0;
      this.airTime = 0;
    }

    const travelled = Math.hypot(
      this.position.x - this.previousPosition.x,
      this.position.z - this.previousPosition.z,
    );
    if (this.grounded) {
      this.distanceWalked += travelled;
      this.stepDistance += travelled;
      const stride = this.sprinting ? 1.42 : this.crouched ? 0.92 : 1.12;
      if (this.stepDistance >= stride) {
        this.stepDistance %= stride;
        emit(this.events, 'audio:play', {
          name: 'player-footstep',
          position: this.position.clone(),
          sprinting: this.sprinting,
          crouched: this.crouched,
          surface: this.physics?.materialAt?.(this.position) ?? 'concrete',
          volume: this.crouched ? 0.24 : this.sprinting ? 0.62 : 0.43,
        });
      }
    }

    const left = inputDown(this.input, 'leanLeft', 'KeyQ', 'q');
    const right = inputDown(this.input, 'leanRight', 'KeyE', 'e');
    this.targetLean = this._safeLean((right ? 1 : 0) - (left ? 1 : 0));

    const currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    let state = 'idle';
    if (!this.grounded) state = this.velocity.y > 0.1 ? 'jump' : 'fall';
    else if (this.sliding) state = 'slide';
    else if (this.crouched && currentSpeed > 0.25) state = 'crouch-walk';
    else if (this.crouched) state = 'crouch';
    else if (this.sprinting && currentSpeed > 1) state = 'sprint';
    else if (currentSpeed > 0.3) state = 'walk';
    this._setMoveState(state);
  }

  _fixedMantle(dt) {
    this.mantleTime += dt;
    const rawT = clamp01(this.mantleTime / this.options.mantleDuration);
    // PhysicsWorld sweeps horizontal axes before Y, so a diagonal lift can be
    // rejected by the ledge face. Lift clear first, then translate onto the top.
    // This two-stage trajectory is deterministic and cannot tunnel through a
    // ceiling because the mantle target was clearance-tested before starting.
    if (rawT < 0.54) {
      const lift = smoothstep01(rawT / 0.54);
      MANTLE_SAMPLE.copy(this.mantleStart);
      MANTLE_SAMPLE.y = THREE.MathUtils.lerp(this.mantleStart.y, this.mantleEnd.y, lift);
    } else {
      const traverse = smoothstep01((rawT - 0.54) / 0.46);
      MANTLE_SAMPLE.lerpVectors(this.mantleStart, this.mantleEnd, traverse);
      MANTLE_SAMPLE.y = this.mantleEnd.y + Math.sin(traverse * Math.PI) * 0.035;
    }
    DELTA.subVectors(MANTLE_SAMPLE, this.position);
    MANTLE_BEFORE.copy(this.position);
    this._moveCapsule(DELTA);
    const advanced = this.position.distanceTo(MANTLE_BEFORE);
    this._mantleStall = advanced < DELTA.length() * 0.12 && DELTA.length() > 0.02
      ? this._mantleStall + dt
      : 0;
    this._mantleLast.copy(this.position);

    if (rawT >= 1 || this._mantleStall > 0.12) {
      this.mantling = false;
      this.velocity.set(0, rawT >= 1 ? 0 : -0.5, 0);
      this.grounded = this._probeGround();
      this._setMoveState(this.grounded ? 'idle' : 'fall', true);
    }
  }

  _tryMantle() {
    if (
      !this.grounded
      || !this.physics
      || typeof this.physics.raycast !== 'function'
    ) {
      return false;
    }
    FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    RAY_ORIGIN.copy(this.position).addScaledVector(UP, 0.62);
    const lowHit = this._raycast(RAY_ORIGIN, FORWARD, this.options.mantleReach);
    if (!lowHit) return false;
    const wallDistance = hitDistance(lowHit, this.options.mantleReach);

    RAY_ORIGIN.copy(this.position).addScaledVector(UP, this.options.mantleMaxHeight + 0.28);
    const highHit = this._raycast(RAY_ORIGIN, FORWARD, wallDistance + this.options.radius + 0.18);
    if (highHit && hitDistance(highHit) < wallDistance + this.options.radius) return false;

    RAY_ORIGIN.copy(this.position)
      .addScaledVector(FORWARD, wallDistance + this.options.radius + 0.12)
      .addScaledVector(UP, this.options.mantleMaxHeight + 0.42);
    const topHit = this._raycast(RAY_ORIGIN, DOWN, this.options.mantleMaxHeight + 0.55);
    if (!topHit || !hitPoint(topHit, MANTLE_SAMPLE)) return false;
    const ledgeHeight = MANTLE_SAMPLE.y - this.position.y;
    if (ledgeHeight < this.options.mantleMinHeight || ledgeHeight > this.options.mantleMaxHeight) {
      return false;
    }

    this.mantleStart.copy(this.position);
    this.mantleEnd.copy(MANTLE_SAMPLE)
      .addScaledVector(FORWARD, 0.025)
      .addScaledVector(UP, 0.055);

    // Reject ledges with a blocked standing head volume.
    RAY_ORIGIN.copy(this.mantleEnd).addScaledVector(UP, this.options.radius);
    if (this._raycast(RAY_ORIGIN, UP, this.options.standingHeight - this.options.radius)) {
      return false;
    }

    this.mantling = true;
    this.mantleTime = 0;
    this._mantleStall = 0;
    this.sliding = false;
    this.sprinting = false;
    this.velocity.set(0, 0, 0);
    this._setMoveState('mantle', true);
    emit(this.events, 'player:mantle', {
      from: this.mantleStart.clone(),
      to: this.mantleEnd.clone(),
      height: ledgeHeight,
    });
    return true;
  }

  _canStand() {
    if (!this.crouched && this.stanceHeight > this.options.standingHeight - 0.04) return true;
    if (!this.physics || typeof this.physics.raycast !== 'function') return true;
    RAY_ORIGIN.copy(this.position).addScaledVector(UP, this.stanceHeight - 0.08);
    const clearance = this.options.standingHeight - this.stanceHeight + 0.1;
    const hit = this._raycast(RAY_ORIGIN, UP, clearance);
    return !hit || hitDistance(hit) >= clearance - 0.025;
  }

  _safeLean(direction) {
    if (!direction) return 0;
    const desired = direction * this.options.leanDistance;
    if (!this.physics || typeof this.physics.raycast !== 'function') return desired;
    const eye = this.eyeHeight - 0.08;
    RAY_ORIGIN.copy(this.position).addScaledVector(UP, eye);
    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(direction);
    const hit = this._raycast(RAY_ORIGIN, RIGHT, this.options.leanDistance + 0.08);
    if (!hit) return desired;
    const safe = Math.max(0, hitDistance(hit) - 0.1);
    return direction * Math.min(this.options.leanDistance, safe);
  }

  _probeGround() {
    if (!this.physics || typeof this.physics.raycast !== 'function') return false;
    RAY_ORIGIN.copy(this.position).addScaledVector(UP, 0.08);
    const hit = this._raycast(RAY_ORIGIN, DOWN, 0.2);
    if (!hit) return false;
    const normal = Array.isArray(hit) ? hit[0]?.normal : hit.normal;
    if (normal && isVectorLike(normal)) {
      // PhysicsWorld's slab ray normal is orientation-agnostic for reversed
      // ray intervals, so a downward floor query accepts either vertical sign.
      if (Math.abs(normal.y) < Math.cos(this.options.maxSlope)) return false;
    }
    if (hitDistance(hit) > 0.2) return false;
    const point = Array.isArray(hit) ? hit[0]?.point : hit.point;
    if (
      point
      && Number.isFinite(point.y)
      && point.y <= this.position.y + 0.01
      && this.position.y - point.y <= 0.12
      && this.velocity.y <= 0.05
    ) {
      this.position.y = point.y + 0.0025;
    }
    return true;
  }

  _raycast(origin, direction, distance) {
    const hit = this.physics?.raycast?.(origin, direction, distance, 0xffffffff);
    if (Array.isArray(hit)) return hit[0] ?? null;
    return hit ?? null;
  }

  _moveCapsule(delta) {
    MOVE_START.copy(this.position);
    if (!this.physics || typeof this.physics.moveCapsule !== 'function') {
      this.position.add(delta);
      return null;
    }

    this._clipHorizontalDelta(delta);
    MOVE_WORK.copy(this.position);
    const result = this.physics.moveCapsule(MOVE_WORK, delta, this.capsule);
    if (isVectorLike(result?.position)) this.position.copy(result.position);
    else if (isVectorLike(result?.end)) this.position.copy(result.end);
    else if (isVectorLike(result?.delta)) this.position.copy(MOVE_START).add(result.delta);
    else if (isVectorLike(result)) this.position.copy(result);
    else this.position.copy(MOVE_WORK);
    // PhysicsWorld uses inclusive AABB contacts. Keep a tiny skin above a floor
    // contact so a zero horizontal axis is not misclassified as side overlap on
    // the next axis sweep.
    if (result?.grounded || result?.onGround || result?.floor) this.position.y += 0.0025;
    return result;
  }

  _clipHorizontalDelta(delta) {
    const horizontalLength = Math.hypot(delta.x, delta.z);
    if (horizontalLength <= 1e-7 || typeof this.physics?.raycast !== 'function') return;
    RAY_DIRECTION.set(delta.x / horizontalLength, 0, delta.z / horizontalLength);
    let allowed = horizontalLength;
    const skin = 0.008;
    for (let sample = 0; sample < 3; sample += 1) {
      const height = sample === 0
        ? Math.min(0.2, this.stanceHeight * 0.24)
        : sample === 1
          ? this.stanceHeight * 0.52
          : this.stanceHeight - 0.12;
      RAY_ORIGIN.copy(this.position).addScaledVector(UP, height);
      const hit = this._raycast(
        RAY_ORIGIN,
        RAY_DIRECTION,
        horizontalLength + this.options.radius + skin,
      );
      if (!hit) continue;
      const normalY = Number(hit.normal?.y ?? 0);
      if (Math.abs(normalY) > 0.55) continue;
      const obstacleTop = Number(hit.collider?.max?.y);
      const stepRise = obstacleTop - this.position.y;
      if (
        this.capsule.canStep
        && Number.isFinite(stepRise)
        && stepRise > 0
        && stepRise <= this.options.maxStepHeight + 1e-6
      ) {
        // PhysicsWorld owns the raised-capsule clearance test. Clipping this
        // low hit here would prevent an otherwise valid step attempt.
        continue;
      }
      allowed = Math.min(
        allowed,
        Math.max(0, hitDistance(hit) - this.options.radius - skin),
      );
    }
    if (allowed < horizontalLength) {
      const ratio = allowed / horizontalLength;
      delta.x *= ratio;
      delta.z *= ratio;
    }
  }

  _setMoveState(next, force = false) {
    if (!force && next === this.moveState) return;
    const previous = this.moveState;
    this.moveState = next;
    emit(this.events, 'player:move-state', {
      state: next,
      previous,
      speed: Math.hypot(this.velocity.x, this.velocity.z),
      grounded: this.grounded,
      crouched: this.crouched,
    });
  }

  _applyCameraPose(dt, alpha) {
    if (!this.camera) return;
    INTERPOLATED_POSITION.lerpVectors(this.previousPosition, this.position, clamp01(alpha));
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const movementWeight = this.grounded ? clamp01(speed / this.options.walkSpeed) : 0;
    this._bobWeight = damp(this._bobWeight, movementWeight, 9, dt);
    const bobRate = this.sprinting ? 12.2 : this.crouched ? 6.4 : 8.7;
    this._bobPhase += dt * bobRate * Math.max(0.2, movementWeight);

    const adsWeight = this.context?.state?.weapon?.ads ?? 0;
    const sway = this.motionScale * (1 - 0.72 * adsWeight);
    const bobY = Math.sin(this._bobPhase * 2) * 0.018 * this._bobWeight * sway;
    const bobX = Math.sin(this._bobPhase) * 0.012 * this._bobWeight * sway;
    const landingY = -this._landImpulse * 0.065 * this.motionScale;
    const damageRoll = Math.sin(this._time * 35) * this._damageKick * 0.014 * this.motionScale;

    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    LEAN_OFFSET.copy(RIGHT).multiplyScalar(this.lean);
    CAMERA_POSITION.copy(INTERPOLATED_POSITION)
      .addScaledVector(UP, this.eyeHeight + bobY + landingY)
      .add(LEAN_OFFSET)
      .addScaledVector(RIGHT, bobX);
    this.camera.position.copy(CAMERA_POSITION);

    this._lookInertiaX = damp(this._lookInertiaX, 0, 15, dt);
    const leanRatio = this.options.leanDistance > 0 ? this.lean / this.options.leanDistance : 0;
    this._cameraRoll = damp(
      this._cameraRoll,
      -leanRatio * this.options.leanRoll + damageRoll,
      16,
      dt,
    );
    EULER.set(
      this.pitch - this._recoilPitch,
      this.yaw - this._recoilYaw,
      this._cameraRoll + this._lookInertiaX * sway,
    );
    this.camera.quaternion.setFromEuler(EULER);
    this.camera.updateMatrixWorld();
  }

  _syncSnapshot() {
    this.eyePosition.copy(this.position).addScaledVector(UP, this.eyeHeight);
    this.snapshot.yaw = this.yaw;
    this.snapshot.pitch = this.pitch;
    this.snapshot.health = this.health;
    this.snapshot.maxHealth = this.maxHealth;
    this.snapshot.alive = this.alive;
    this.snapshot.enabled = this.enabled;
    this.snapshot.grounded = this.grounded;
    this.snapshot.crouched = this.crouched;
    this.snapshot.sliding = this.sliding;
    this.snapshot.sprinting = this.sprinting;
    this.snapshot.mantling = this.mantling;
    this.snapshot.lean = this.lean;
    this.snapshot.eyeHeight = this.eyeHeight;
    this.snapshot.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.snapshot.moveState = this.moveState;
  }

  _clearTransientInput() {
    this._inputLatch = Object.create(null);
    this._lookDelta.set(0, 0);
    this.targetLean = 0;
  }

  dispose() {
    for (let i = this._disposers.length - 1; i >= 0; i -= 1) {
      try {
        this._disposers[i]();
      } catch {
        // Disposal must remain best-effort when a host event bus is already gone.
      }
    }
    this._disposers.length = 0;
    this.context = null;
    this.events = null;
    this.physics = null;
    this.input = null;
    this.camera = null;
    this.viewCamera = null;
  }
}

export default PlayerController;
