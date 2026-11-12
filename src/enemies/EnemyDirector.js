import * as THREE from 'three';
import { createEnemySharedAssets, createEnemySoldier } from './EnemySoldier.js';

export const EnemyState = Object.freeze({
  IDLE: 'idle',
  PATROL: 'patrol',
  INVESTIGATE: 'investigate',
  PURSUIT: 'pursuit',
  COVER: 'cover',
  REPOSITION: 'reposition',
  AIM: 'aim',
  FIRE: 'fire',
  REACT: 'react',
  DEAD: 'dead',
});

export const ENEMY_VISION_HALF_ANGLE_DEGREES = 35;
export const ENEMY_VISION_RANGE = 38;
export const ENEMY_ATTACK_RANGE = 36;
export const ENEMY_REACTION_MIN = 2;
export const ENEMY_REACTION_MAX = 4;
export const ENEMY_INITIAL_SAFE_RADIUS = ENEMY_VISION_RANGE + 4;

const ENEMY_VISION_DOT = Math.cos(
  THREE.MathUtils.degToRad(ENEMY_VISION_HALF_ANGLE_DEGREES),
);
const DETECTION_CONFIRM_SECONDS = 0.32;
const CORPSE_DESPAWN_SECONDS = 8;
const ACTIVE_ENEMY_LIMIT = 12;

const DEFAULT_SPAWNS = Object.freeze([
  [-21, 0, -18, 0.5],
  [-9, 0, -34, -0.2],
  [17, 0, -29, -0.9],
  [29, 0, -4, -1.5],
  [13, 0, 20, -2.7],
  [-25, 0, 24, 2.5],
  [2, 0, 34, 3.0],
  [34, 0, 24, -2.0],
]);

const BODY_DAMAGE = Object.freeze({
  head: 2.7,
  torso: 1,
  arm: 0.68,
  leg: 0.62,
  weapon: 0.25,
});

const ENEMY_CAPSULE = Object.freeze({
  radius: 0.31,
  height: 1.78,
  halfHeight: 0.58,
});

const tmpOrigin = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();
const tmpSide = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpDown = new THREE.Vector3(0, -1, 0);
const tmpMuzzle = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpLineOrigin = new THREE.Vector3();
const tmpAimRight = new THREE.Vector3();
const tmpAimUp = new THREE.Vector3();
const tmpDesiredVelocity = new THREE.Vector3();
const tmpPlayerFoot = new THREE.Vector3();
const tmpCapsuleStart = new THREE.Vector3();
const tmpCapsuleEnd = new THREE.Vector3();
const tmpRayPoint = new THREE.Vector3();
const tmpCapsulePoint = new THREE.Vector3();
const tmpSpawnOrigin = new THREE.Vector3();
const tmpSpawnCandidate = new THREE.Vector3();
const tmpSpawnPosition = new THREE.Vector3();
const tmpRay = new THREE.Ray();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function hashString(value) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

class LocalRng {
  constructor(seed) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 4294967296;
  }
}

function getRawStream(service, name, seed) {
  if (service) {
    let stream = null;
    if (typeof service.stream === 'function') stream = service.stream(name);
    else if (typeof service.getStream === 'function') stream = service.getStream(name);
    else if (typeof service.createStream === 'function') stream = service.createStream(name);
    else if (typeof service.fork === 'function') stream = service.fork(name);
    if (stream) {
      stream.reset?.();
      return stream;
    }
  }
  return new LocalRng(hashString(`${seed}:${name}`));
}

function random01(stream) {
  if (!stream) return 0.5;
  if (typeof stream.next === 'function') {
    const value = stream.next();
    return typeof value === 'number' ? value : 0.5;
  }
  if (typeof stream.float === 'function') {
    const value = stream.float();
    return typeof value === 'number' ? value : 0.5;
  }
  if (typeof stream.random === 'function') {
    const value = stream.random();
    return typeof value === 'number' ? value : 0.5;
  }
  return 0.5;
}

function randomRange(stream, min, max) {
  if (stream && typeof stream.range === 'function') return stream.range(min, max);
  if (stream && typeof stream.float === 'function' && stream.float.length >= 2) {
    return stream.float(min, max);
  }
  return min + (max - min) * random01(stream);
}

function randomInt(stream, min, maxExclusive) {
  if (stream && typeof stream.int === 'function') {
    const value = stream.int(min, maxExclusive);
    if (Number.isFinite(value)) return value;
  }
  return min + Math.floor(random01(stream) * Math.max(1, maxExclusive - min));
}

function emit(events, name, payload = Object.freeze({})) {
  if (!events) return;
  if (typeof events.emit === 'function') events.emit(name, payload);
  else if (typeof events.dispatch === 'function') events.dispatch(name, payload);
  else if (typeof events.dispatchEvent === 'function') {
    events.dispatchEvent(new CustomEvent(name, { detail: payload }));
  }
}

function subscribe(events, name, handler) {
  if (!events) return () => {};
  if (typeof events.on === 'function') {
    const result = events.on(name, handler);
    if (typeof result === 'function') return result;
    return () => events.off?.(name, handler);
  }
  if (typeof events.addEventListener === 'function') {
    const wrapped = (event) => handler(event.detail ?? event);
    events.addEventListener(name, wrapped);
    return () => events.removeEventListener(name, wrapped);
  }
  return () => {};
}

function toVector3(value, target) {
  if (!value) return null;
  if (value.isVector3) return target.copy(value);
  if (Array.isArray(value) && value.length >= 3) {
    return target.set(Number(value[0]), Number(value[1]), Number(value[2]));
  }
  if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    return target.set(value.x, value.y, value.z);
  }
  return null;
}

function hitPoint(hit, target) {
  return toVector3(hit?.point ?? hit?.position, target);
}

function hitDistance(hit, origin) {
  if (!hit) return Infinity;
  if (Number.isFinite(hit.distance)) return hit.distance;
  const point = hitPoint(hit, tmpPoint);
  return point ? point.distanceTo(origin) : Infinity;
}

function extractWorldPosition(entry, target) {
  return toVector3(entry?.position ?? entry?.point ?? entry, target);
}

function normalizePhase(phase) {
  return String(phase ?? '').toLowerCase();
}

function playerCapsuleHitDistance(origin, direction, foot, height, radius) {
  tmpCapsuleStart.copy(foot);
  tmpCapsuleStart.y += radius;
  tmpCapsuleEnd.copy(foot);
  tmpCapsuleEnd.y += Math.max(radius, height - radius);
  tmpRay.set(origin, direction);
  const distanceSq = tmpRay.distanceSqToSegment(
    tmpCapsuleStart,
    tmpCapsuleEnd,
    tmpRayPoint,
    tmpCapsulePoint,
  );
  if (distanceSq > radius * radius) return Infinity;
  const distance = origin.distanceTo(tmpRayPoint);
  return tmpForward.subVectors(tmpRayPoint, origin).dot(direction) >= -0.001
    ? distance
    : Infinity;
}

export class EnemyDirector {
  constructor(options = {}) {
    this.options = options ?? {};
    this.context = null;
    this.scene = null;
    this.events = null;
    this.physics = null;
    this.rngService = null;
    this.state = null;
    this.player = options.player ?? null;
    this.getPlayerSnapshot = options.getPlayerSnapshot ?? null;
    this.enemyCount = Math.max(1, Math.floor(options.count ?? 7));
    this.activeLimit = Math.max(1, Math.floor(options.activeLimit ?? ACTIVE_ENEMY_LIMIT));
    this.totalCount = this.enemyCount;
    this.spawnedCount = 0;
    this.reinforcementTimer = 0;
    this.safeRadius = Number(options.safeRadius ?? ENEMY_INITIAL_SAFE_RADIUS);
    this.safeCenter = new THREE.Vector3();
    this.enemySpawns = [];
    this.coverPoints = [];
    this.enemies = [];
    this.sharedAssets = null;
    this.root = new THREE.Group();
    this.root.name = 'enemy-director-root';
    this.unsubscribers = [];
    this.seed = 0;
    this.time = 0;
    this.paused = false;
    this.disposed = false;
    this._playerSnapshot = null;
    this._playerPosition = new THREE.Vector3();
    this._playerFootPosition = new THREE.Vector3();
    this._playerVelocity = new THREE.Vector3();
    this._playerHeight = 1.78;
    this._shotSerial = 0;
    this._lastListenerCount = 0;
    this.dynamicUnsubscribers = [];
    this.configureWorld(options.world ?? options);
  }

  get livingCount() {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i += 1) {
      if (this.enemies[i].alive) count += 1;
    }
    return count;
  }

  get snapshot() {
    return {
      living: this.livingCount,
      total: this.totalCount,
      spawned: this.spawnedCount,
      queued: Math.max(0, this.totalCount - this.spawnedCount),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        alive: enemy.alive,
        health: enemy.health,
        state: enemy.state,
        position: enemy.rig.root.position,
        alerted: enemy.alerted,
        canSeePlayer: enemy.canSeePlayer,
        detection: enemy.detection,
        reactionRemaining: enemy.reactionTimer,
        aimPoint: enemy.aimPoint,
        shotsFired: enemy.shotsFired,
        deathTime: enemy.deathTime,
        despawned: enemy.despawned,
      })),
    };
  }

  configureWorld(worldData = {}) {
    const spawns = worldData.enemySpawns ?? worldData.spawns;
    if (Array.isArray(spawns) && spawns.length) this.enemySpawns = spawns;
    const covers = worldData.coverPoints ?? worldData.cover;
    if (Array.isArray(covers)) this.coverPoints = covers;
    return this;
  }

  setWorldData(worldData) {
    return this.configureWorld(worldData);
  }

  bindPlayer(player) {
    this.player = player;
    return this;
  }

  init(context) {
    if (this.context) return this;
    this.context = context;
    this.scene = context.scene;
    this.events = context.events;
    this.physics = context.physics;
    this.rngService = context.rng;
    this.state = context.state;
    this.seed = Number(context.state?.seed ?? 0) >>> 0;
    this.sharedAssets = createEnemySharedAssets();
    this.scene.add(this.root);

    this.unsubscribers.push(
      subscribe(this.events, 'weapon:fire', (event) => this._hearWeapon(event)),
      subscribe(this.events, 'projectile:impact', (event) => {
        if (
          event?.enemyId !== null &&
          event?.enemyId !== undefined &&
          event?.owner !== 'enemy'
        ) {
          this.applyProjectileHit(event);
        }
      }),
      subscribe(this.events, 'enemy:alert', (event) => {
        if (event?.source === this) return;
        this.forceAlert(event?.position ?? event?.point);
      }),
      subscribe(this.events, 'game:pause', () => {
        this.paused = true;
      }),
      subscribe(this.events, 'game:resume', () => {
        this.paused = false;
      }),
      subscribe(this.events, 'player:death', () => {
        this._onPlayerDeath();
      }),
    );

    this.reset(this.seed);
    return this;
  }

  reset(seed = this.seed, round = {}) {
    if (!this.sharedAssets) return;
    const config = seed && typeof seed === 'object' ? seed : round;
    const configuredSeed = seed && typeof seed === 'object' ? seed.seed : seed;
    this.seed = Number(configuredSeed ?? this.seed ?? 0) >>> 0;
    this.time = 0;
    this.paused = false;
    this._shotSerial = 0;
    this.totalCount = Math.max(
      1,
      Math.floor(config.totalCount ?? config.count ?? this.enemyCount),
    );
    this.activeLimit = Math.max(
      1,
      Math.min(
        this.totalCount,
        Math.floor(config.activeLimit ?? this.activeLimit ?? ACTIVE_ENEMY_LIMIT),
      ),
    );
    this.safeRadius = Math.max(
      ENEMY_VISION_RANGE,
      Number(config.safeRadius ?? this.safeRadius ?? ENEMY_INITIAL_SAFE_RADIUS),
    );
    const safeSource = config.playerSpawn
      ?? config.safeCenter
      ?? this.player?.spawnPosition
      ?? this.player?.position;
    if (!toVector3(safeSource, this.safeCenter)) this.safeCenter.set(-44, 0, 1.2);
    this.spawnedCount = 0;
    this.reinforcementTimer = 0;
    this.placements = config.placements ?? null;

    while (this.enemies.length) {
      const enemy = this.enemies.pop();
      if (!enemy.disposed) enemy.rig.dispose();
    }
    for (let i = this.dynamicUnsubscribers.length - 1; i >= 0; i -= 1) {
      this.dynamicUnsubscribers[i]();
    }
    this.dynamicUnsubscribers.length = 0;

    const spawnStream = getRawStream(this.rngService, 'enemy-spawn', this.seed);
    const spawnCount = Math.min(this.totalCount, this.activeLimit);
    for (let id = 0; id < spawnCount; id += 1) {
      this._spawnEnemy(id, spawnStream, false);
    }

    emit(this.events, 'ui:announce', {
      text: `HOSTILES ACTIVE · ${this.totalCount}`,
      tone: 'warning',
      duration: 2.2,
    });
  }

  _spawnEnemy(id, spawnStream, reinforcement) {
    const spawn = this._chooseSpawn(spawnStream, id, reinforcement);
    const visualStream = getRawStream(this.rngService, `enemy-visual:${id}`, this.seed);
    const visualVariant = randomInt(visualStream, 0, 4);
    const rig = createEnemySoldier(id, visualVariant, this.sharedAssets);
    rig.root.position.copy(spawn.position);
    rig.root.position.y += 0.015;
    rig.root.rotation.y = spawn.yaw;
    rig.root.visible = true;
    rig.setGround(spawn.position.y + 0.015);
    this.root.add(rig.root);

    const enemyStream = getRawStream(this.rngService, `enemy-ai:${id}`, this.seed);
    const patrolAngle = randomRange(spawnStream, -Math.PI, Math.PI);
    const patrolRadius = randomRange(spawnStream, 4.5, 9.5);
    const initialAim = new THREE.Vector3(0, 0, -12)
      .applyAxisAngle(Y_AXIS, spawn.yaw)
      .add(spawn.position)
      .addScaledVector(Y_AXIS, 1.45);
    const enemy = {
      id,
      rig,
      rng: enemyStream,
      visualVariant,
      spawnPosition: spawn.position.clone(),
      spawnYaw: spawn.yaw,
      alive: true,
      disposed: false,
      despawned: false,
      health: 100,
      state: id % 3 === 0 ? EnemyState.IDLE : EnemyState.PATROL,
      previousState: EnemyState.IDLE,
      stateTime: randomRange(enemyStream, 0, 0.8),
      detection: 0,
      alerted: false,
      canSeePlayer: false,
      lastSeenTime: -100,
      lastHeardTime: -100,
      lastSeen: spawn.position.clone(),
      lastHeard: spawn.position.clone(),
      aimPoint: initialAim,
      aimVelocity: new THREE.Vector3(),
      aimAlignment: 0,
      trackingSpeed: randomRange(enemyStream, 4.4, 5.9),
      destination: new THREE.Vector3(
        spawn.position.x + Math.sin(patrolAngle) * patrolRadius,
        spawn.position.y,
        spawn.position.z + Math.cos(patrolAngle) * patrolRadius,
      ),
      patrolA: spawn.position.clone(),
      patrolB: new THREE.Vector3(
        spawn.position.x + Math.sin(patrolAngle) * patrolRadius,
        spawn.position.y,
        spawn.position.z + Math.cos(patrolAngle) * patrolRadius,
      ),
      cover: new THREE.Vector3(),
      hasCover: false,
      perceptionTimer: id * 0.009,
      perceptionInterval: 0.12 + (id % 7) * 0.005,
      decisionTimer: randomRange(enemyStream, 0.08, 0.25),
      reactionTimer: 0,
      reactionDuration: 0,
      aimSettleTimer: randomRange(enemyStream, 0.24, 0.48),
      burstRemaining: 0,
      burstShotIndex: 0,
      shotsFired: 0,
      shotTimer: 0,
      reloadTimer: 0,
      magazine: 30,
      nextFootstep: 0,
      moveSpeed: randomRange(enemyStream, 2.15, 2.72),
      accuracy: randomRange(enemyStream, 0.46, 0.68),
      suppression: 0,
      hitReaction: 0,
      damageDirection: new THREE.Vector3(),
      renderMotion: 0,
      renderAim: 0,
      renderFire: false,
      groundTimer: id * 0.006,
      groundY: spawn.position.y + 0.015,
      deathTime: 0,
      deathTilt: randomRange(enemyStream, -1, 1),
      collider: {
        radius: ENEMY_CAPSULE.radius,
        height: ENEMY_CAPSULE.height,
        object: rig.root,
        userData: { enemyId: id, kind: 'enemy' },
      },
    };
    this.enemies.push(enemy);
    this.spawnedCount += 1;
    if (typeof this.physics?.registerDynamic === 'function') {
      const dynamicTarget = {
        enemyId: id,
        object: rig.root,
        material: 'flesh',
        get active() {
          return enemy.alive && !enemy.despawned;
        },
        getBounds(target) {
          const position = rig.root.position;
          target.min.set(position.x - 0.31, position.y, position.z - 0.31);
          target.max.set(position.x + 0.31, position.y + 1.88, position.z + 0.31);
          return target;
        },
        hitZoneAt(point) {
          const localY = point.y - rig.root.position.y;
          if (localY > 1.59) return 'head';
          if (localY > 0.88) return 'torso';
          return 'leg';
        },
      };
      this.dynamicUnsubscribers.push(this.physics.registerDynamic(id, dynamicTarget));
    }
    if (reinforcement) {
      emit(this.events, 'ui:announce', {
        text: 'ENEMY REINFORCEMENTS',
        tone: 'warning',
        duration: 1.6,
      });
    }
    return enemy;
  }

  _chooseSpawn(stream, id, reinforcement) {
    const placement = !reinforcement && this.placements?.[id];
    if (placement) {
      const authored = this._readSpawn(placement, id);
      if (this._groundSpawn(authored.position, tmpSpawnPosition)) {
        return { position: tmpSpawnPosition.clone(), yaw: authored.yaw };
      }
    }
    const sources = this.enemySpawns.length ? this.enemySpawns : DEFAULT_SPAWNS;
    const safeCenter = reinforcement && this._resolvePlayer()
      ? this._playerFootPosition
      : this.safeCenter;
    const safeRadius = reinforcement ? 20 : this.safeRadius;
    const minimumSpacing = reinforcement ? 3.2 : 2.3;
    let best = null;
    let bestDistance = -Infinity;

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const sourceIndex = randomInt(stream, 0, sources.length);
      const base = this._readSpawn(sources[sourceIndex], sourceIndex);
      const jitter = attempt < sources.length ? 2.8 : 7.5;
      tmpSpawnCandidate.copy(base.position);
      tmpSpawnCandidate.x += randomRange(stream, -jitter, jitter);
      tmpSpawnCandidate.z += randomRange(stream, -jitter, jitter);
      tmpSpawnCandidate.x = THREE.MathUtils.clamp(tmpSpawnCandidate.x, -46, 46);
      tmpSpawnCandidate.z = THREE.MathUtils.clamp(tmpSpawnCandidate.z, -46, 46);
      const safeDistance = tmpSpawnCandidate.distanceTo(safeCenter);
      if (safeDistance > bestDistance) {
        bestDistance = safeDistance;
        best = { position: tmpSpawnCandidate.clone(), yaw: base.yaw };
      }
      if (safeDistance < safeRadius) continue;
      if (this.enemies.some((entry) =>
        entry.alive
        && entry.rig.root.position.distanceToSquared(tmpSpawnCandidate)
          < minimumSpacing * minimumSpacing)) {
        continue;
      }
      const grounded = this._groundSpawn(tmpSpawnCandidate, tmpSpawnPosition);
      if (!grounded) continue;
      if (
        reinforcement
        && this._lineOfSight(
          tmpSpawnOrigin.copy(tmpSpawnPosition).addScaledVector(Y_AXIS, 1.55),
          this._playerPosition,
        )
      ) {
        continue;
      }
      return {
        position: tmpSpawnPosition.clone(),
        yaw: randomRange(stream, -Math.PI, Math.PI),
      };
    }

    const fallback = best ?? this._readSpawn(sources[id % sources.length], id);
    const grounded = this._groundSpawn(fallback.position, tmpSpawnPosition);
    return {
      position: grounded ? tmpSpawnPosition.clone() : fallback.position.clone(),
      yaw: randomRange(stream, -Math.PI, Math.PI),
    };
  }

  _groundSpawn(candidate, target) {
    if (typeof this.physics?.raycast !== 'function') {
      target.copy(candidate);
      return true;
    }
    tmpSpawnOrigin.copy(candidate);
    tmpSpawnOrigin.y = 8;
    const hit = this.physics.raycast(tmpSpawnOrigin, tmpDown, 16, 0xffffffff);
    const point = hitPoint(hit, tmpPoint);
    if (!point || point.y < -0.2 || point.y > 0.82) return false;
    const normalY = Math.abs(Number(hit?.normal?.y ?? hit?.face?.normal?.y ?? 1));
    if (normalY < 0.72) return false;
    target.set(candidate.x, point.y + 0.025, candidate.z);
    return typeof this.physics?.capsuleClear !== 'function'
      || this.physics.capsuleClear(target, ENEMY_CAPSULE);
  }

  _readSpawn(source, index) {
    const fallback = DEFAULT_SPAWNS[index % DEFAULT_SPAWNS.length];
    const position = new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
    let yaw = fallback[3];
    if (Array.isArray(source)) {
      position.set(
        Number(source[0] ?? fallback[0]),
        Number(source[1] ?? fallback[1]),
        Number(source[2] ?? fallback[2]),
      );
      yaw = Number(source[3] ?? yaw);
    } else if (source) {
      extractWorldPosition(source, position);
      yaw = Number(source.yaw ?? source.rotationY ?? yaw);
    }
    return { position, yaw };
  }

  _resolvePlayer() {
    const snapshot = this.getPlayerSnapshot?.()
      ?? this.player?.snapshot
      ?? this.state?.player
      ?? this.state?.playerSnapshot
      ?? null;
    this._playerSnapshot = snapshot;
    const source = snapshot?.eyePosition
      ?? snapshot?.cameraPosition
      ?? snapshot?.position
      ?? this.player?.position
      ?? this.context?.camera?.position;
    if (!toVector3(source, this._playerPosition)) return false;
    const footSource = snapshot?.position ?? this.player?.position;
    if (!toVector3(footSource, this._playerFootPosition)) {
      this._playerFootPosition.copy(this._playerPosition);
      this._playerFootPosition.y -= Number(snapshot?.eyeHeight ?? 1.66);
    }
    this._playerHeight = Math.max(
      1.05,
      Number(
        snapshot?.stanceHeight
        ?? snapshot?.height
        ?? (snapshot?.crouched ? 1.16 : 1.78),
      ),
    );
    const velocity = snapshot?.velocity;
    if (!toVector3(velocity, this._playerVelocity)) this._playerVelocity.set(0, 0, 0);
    return snapshot?.alive !== false && Number(snapshot?.health ?? 100) > 0;
  }

  fixedUpdate(dt) {
    if (this.paused || !this.context || dt <= 0) return;
    const phase = normalizePhase(this.state?.phase);
    if (phase === 'paused' || phase === 'pause') return;
    const combatActive = phase !== 'victory' && phase !== 'defeat' && phase !== 'menu';

    this.time += dt;
    const playerAlive = this._resolvePlayer();
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) {
        enemy.deathTime += dt;
        enemy.renderMotion = 0;
        enemy.renderAim = 0;
        enemy.renderFire = false;
        if (!enemy.despawned && enemy.deathTime >= CORPSE_DESPAWN_SECONDS) {
          enemy.despawned = true;
          if (typeof enemy.rig.setCorpseVisibility === 'function') {
            enemy.rig.setCorpseVisibility(false);
          }
          enemy.rig.root.visible = false;
        }
        continue;
      }
      if (!combatActive) continue;

      enemy.stateTime += dt;
      enemy.perceptionTimer -= dt;
      enemy.decisionTimer -= dt;
      enemy.hitReaction = Math.max(0, enemy.hitReaction - dt * 3.6);
      enemy.suppression = Math.max(0, enemy.suppression - dt * 0.13);
      enemy.renderFire = false;

      if (playerAlive && enemy.perceptionTimer <= 0) {
        enemy.perceptionTimer += enemy.perceptionInterval;
        this._updatePerception(enemy, enemy.perceptionInterval);
      }

      this._updateAimTracking(enemy, dt);
      this._updateEnemy(enemy, dt, playerAlive);
      this._keepFeetGrounded(enemy, dt);
    }

    if (combatActive && this.spawnedCount < this.totalCount) {
      this.reinforcementTimer -= dt;
      if (this.livingCount < this.activeLimit && this.reinforcementTimer <= 0) {
        const stream = getRawStream(
          this.rngService,
          `enemy-reinforcement:${this.spawnedCount}`,
          this.seed,
        );
        this._spawnEnemy(this.spawnedCount, stream, true);
        this.reinforcementTimer = 1.15;
      }
    }
  }

  update(dt) {
    if (!this.context || dt <= 0) return;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (enemy.despawned) continue;
      enemy.rig.animate(
        Math.min(dt, 1 / 20),
        enemy.renderMotion,
        enemy.renderAim,
        enemy.renderFire,
        enemy.hitReaction,
        !enemy.alive,
      );
      if (!enemy.alive) {
        enemy.rig.root.position.y = enemy.groundY;
      }
    }
  }

  _updatePerception(enemy, interval) {
    tmpOrigin.copy(enemy.rig.root.position);
    tmpOrigin.y += 1.58;
    tmpTarget.copy(this._playerPosition);
    const distance = tmpOrigin.distanceTo(tmpTarget);
    tmpDirection.subVectors(tmpTarget, tmpOrigin);
    tmpDirection.y = 0;
    if (tmpDirection.lengthSq() < 0.0001) tmpDirection.set(0, 0, -1);
    else tmpDirection.normalize();

    tmpForward.set(0, 0, -1).applyAxisAngle(Y_AXIS, enemy.rig.root.rotation.y);
    const forwardDot = tmpForward.dot(tmpDirection);
    const withinCone = forwardDot >= ENEMY_VISION_DOT;
    const visible = distance <= ENEMY_VISION_RANGE
      && withinCone
      && this._lineOfSight(tmpOrigin, tmpTarget);
    enemy.canSeePlayer = visible;

    if (visible) {
      enemy.detection = Math.min(
        1,
        enemy.detection + interval / DETECTION_CONFIRM_SECONDS,
      );
      enemy.lastSeen.copy(this._playerPosition);
      enemy.lastSeenTime = this.time;
      if (enemy.detection >= 1 && !enemy.alerted) {
        enemy.alerted = true;
        enemy.reactionDuration = randomRange(
          enemy.rng,
          ENEMY_REACTION_MIN,
          ENEMY_REACTION_MAX,
        );
        enemy.reactionTimer = enemy.reactionDuration;
        this._transition(enemy, EnemyState.INVESTIGATE);
        emit(this.events, 'enemy:alert', {
          source: this,
          enemyId: enemy.id,
          position: enemy.rig.root.position.clone(),
          target: this._playerPosition.clone(),
        });
      }
    } else {
      enemy.detection = Math.max(0, enemy.detection - interval * 1.8);
    }
  }

  _updateAimTracking(enemy, dt) {
    if (!enemy.alerted && enemy.state !== EnemyState.REACT) return;
    const source = enemy.canSeePlayer
      ? this._playerPosition
      : enemy.lastSeenTime >= enemy.lastHeardTime
        ? enemy.lastSeen
        : enemy.lastHeard;
    tmpTarget.copy(source);
    if (!enemy.canSeePlayer && Math.abs(tmpTarget.y - enemy.rig.root.position.y) < 0.6) {
      tmpTarget.y = enemy.rig.root.position.y + 1.42;
    }
    tmpDirection.subVectors(tmpTarget, enemy.aimPoint);
    const distance = tmpDirection.length();
    if (distance > 0.0001) {
      const desiredSpeed = Math.min(enemy.trackingSpeed, distance * 2.35);
      tmpDesiredVelocity.copy(tmpDirection).multiplyScalar(desiredSpeed / distance);
    } else {
      tmpDesiredVelocity.set(0, 0, 0);
    }
    enemy.aimVelocity.lerp(
      tmpDesiredVelocity,
      1 - Math.exp(-3.4 * dt),
    );
    if (enemy.aimVelocity.lengthSq() > enemy.trackingSpeed * enemy.trackingSpeed) {
      enemy.aimVelocity.setLength(enemy.trackingSpeed);
    }
    enemy.aimPoint.addScaledVector(enemy.aimVelocity, dt);
  }

  _lineOfSight(origin, target) {
    tmpDirection.subVectors(target, origin);
    const fullDistance = tmpDirection.length();
    if (fullDistance < 0.05) return true;
    tmpDirection.multiplyScalar(1 / fullDistance);
    tmpLineOrigin.copy(origin).addScaledVector(tmpDirection, 0.5);
    if (typeof this.physics?.lineOfSight === 'function') {
      const result = this.physics.lineOfSight(tmpLineOrigin, target);
      if (typeof result === 'boolean') return result;
      if (result && typeof result.visible === 'boolean') return result.visible;
      if (result === null) return true;
    }
    if (typeof this.physics?.raycast === 'function') {
      tmpDirection.subVectors(target, tmpLineOrigin);
      const distance = tmpDirection.length();
      if (distance < 0.05) return true;
      tmpDirection.multiplyScalar(1 / distance);
      const hit = this.physics.raycast(tmpLineOrigin, tmpDirection, distance, 0xffffffff);
      return !hit || hitDistance(hit, tmpLineOrigin) >= distance - 0.42;
    }
    return true;
  }

  _updateEnemy(enemy, dt, playerAlive) {
    if (enemy.state === EnemyState.REACT) {
      enemy.renderAim = 0.4;
      enemy.renderMotion = 0;
      this._faceAimPoint(enemy, dt);
      if (enemy.stateTime > Math.max(0.65, enemy.reactionTimer)) {
        this._transition(
          enemy,
          enemy.canSeePlayer && enemy.rig.root.position.distanceTo(this._playerPosition)
            <= ENEMY_ATTACK_RANGE
            ? EnemyState.AIM
            : EnemyState.INVESTIGATE,
        );
      }
      return;
    }

    if (!playerAlive && enemy.state !== EnemyState.IDLE && enemy.state !== EnemyState.PATROL) {
      this._transition(enemy, EnemyState.IDLE);
    }

    switch (enemy.state) {
      case EnemyState.IDLE:
        enemy.renderMotion = 0;
        enemy.renderAim = enemy.alerted ? 0.28 : 0;
        if (enemy.alerted && this.time - enemy.lastSeenTime < 9) {
          this._transition(enemy, EnemyState.INVESTIGATE);
        } else if (enemy.stateTime > randomRange(enemy.rng, 1.4, 3.1)) {
          enemy.destination.copy(enemy.patrolB);
          this._transition(enemy, EnemyState.PATROL);
        }
        break;

      case EnemyState.PATROL:
        enemy.renderAim = 0;
        if (this._moveToward(enemy, enemy.destination, enemy.moveSpeed * 0.62, dt)) {
          const next = enemy.destination.distanceToSquared(enemy.patrolA) < 0.5
            ? enemy.patrolB
            : enemy.patrolA;
          enemy.destination.copy(next);
          this._transition(enemy, EnemyState.IDLE);
        }
        break;

      case EnemyState.INVESTIGATE:
        enemy.renderAim = 0.56;
        enemy.destination.copy(
          enemy.lastSeenTime >= enemy.lastHeardTime ? enemy.lastSeen : enemy.lastHeard,
        );
        this._faceAimPoint(enemy, dt);
        if (enemy.canSeePlayer) {
          enemy.reactionTimer = Math.max(0, enemy.reactionTimer - dt);
          if (enemy.reactionTimer <= 0) {
            enemy.aimSettleTimer = randomRange(enemy.rng, 0.18, 0.34);
            this._transition(
              enemy,
              enemy.rig.root.position.distanceTo(this._playerPosition) <= ENEMY_ATTACK_RANGE
                ? EnemyState.AIM
                : EnemyState.PURSUIT,
            );
          }
        } else if (
          enemy.stateTime > 0.65
          && this._moveToward(enemy, enemy.destination, enemy.moveSpeed * 0.86, dt)
        ) {
          if (enemy.stateTime > 1.5) this._transition(enemy, EnemyState.REPOSITION);
        } else if (enemy.stateTime > 10) {
          enemy.alerted = false;
          enemy.reactionTimer = 0;
          this._transition(enemy, EnemyState.PATROL);
        }
        break;

      case EnemyState.PURSUIT: {
        enemy.renderAim = 0.62;
        const distance = enemy.rig.root.position.distanceTo(this._playerPosition);
        if (!enemy.canSeePlayer && this.time - enemy.lastSeenTime > 1.8) {
          this._transition(enemy, EnemyState.INVESTIGATE);
          break;
        }
        if (enemy.canSeePlayer && distance <= ENEMY_ATTACK_RANGE) {
          enemy.aimSettleTimer = randomRange(enemy.rng, 0.2, 0.42);
          this._transition(enemy, EnemyState.AIM);
        } else if (distance > ENEMY_ATTACK_RANGE * 0.82) {
          enemy.destination.copy(this._playerPosition);
          this._moveToward(enemy, enemy.destination, enemy.moveSpeed, dt);
        } else if (enemy.decisionTimer <= 0) {
          enemy.decisionTimer = randomRange(enemy.rng, 0.45, 0.9);
          if (this._selectCover(enemy) && random01(enemy.rng) < 0.42) {
            this._transition(enemy, EnemyState.COVER);
          } else {
            enemy.aimSettleTimer = randomRange(enemy.rng, 0.22, 0.46);
            this._transition(enemy, EnemyState.AIM);
          }
        }
        break;
      }

      case EnemyState.COVER:
        enemy.renderAim = 0.48;
        if (!enemy.hasCover) {
          this._transition(enemy, EnemyState.REPOSITION);
        } else if (this._moveToward(enemy, enemy.cover, enemy.moveSpeed * 1.12, dt)) {
          this._transition(enemy, EnemyState.AIM);
        } else if (enemy.stateTime > 5.5) {
          this._transition(enemy, EnemyState.REPOSITION);
        }
        break;

      case EnemyState.REPOSITION:
        enemy.renderAim = 0.68;
        if (enemy.stateTime < dt * 1.5) this._chooseReposition(enemy);
        if (this._moveToward(enemy, enemy.destination, enemy.moveSpeed * 1.06, dt)) {
          this._transition(enemy, enemy.canSeePlayer ? EnemyState.AIM : EnemyState.INVESTIGATE);
        } else if (enemy.stateTime > 3.6) {
          this._transition(enemy, EnemyState.AIM);
        }
        break;

      case EnemyState.AIM:
        enemy.renderMotion = 0;
        enemy.renderAim = 1;
        this._faceAimPoint(enemy, dt);
        if (!enemy.canSeePlayer && this.time - enemy.lastSeenTime > 0.65) {
          this._transition(enemy, EnemyState.INVESTIGATE);
        } else if (
          enemy.canSeePlayer
          && enemy.aimAlignment >= Math.cos(THREE.MathUtils.degToRad(11))
          && enemy.stateTime >= enemy.aimSettleTimer
        ) {
          enemy.burstRemaining = randomInt(enemy.rng, 2, 5);
          enemy.burstShotIndex = 0;
          enemy.shotTimer = randomRange(enemy.rng, 0.08, 0.22);
          this._transition(enemy, EnemyState.FIRE);
        }
        break;

      case EnemyState.FIRE:
        enemy.renderMotion = 0;
        enemy.renderAim = 1;
        this._faceAimPoint(enemy, dt);
        enemy.shotTimer -= dt;
        if (!enemy.canSeePlayer) {
          this._transition(enemy, EnemyState.INVESTIGATE);
          break;
        }
        if (enemy.aimAlignment < Math.cos(THREE.MathUtils.degToRad(14))) {
          enemy.aimSettleTimer = 0.22;
          this._transition(enemy, EnemyState.AIM);
          break;
        }
        if (enemy.shotTimer <= 0 && enemy.burstRemaining > 0) {
          this._fire(enemy);
          enemy.burstRemaining -= 1;
          enemy.burstShotIndex += 1;
          enemy.shotTimer = randomRange(enemy.rng, 0.105, 0.155);
        }
        if (enemy.burstRemaining <= 0 && enemy.shotTimer <= 0) {
          enemy.aimSettleTimer = randomRange(enemy.rng, 0.52, 0.94);
          if (random01(enemy.rng) < 0.35) {
            this._transition(enemy, EnemyState.REPOSITION);
          } else {
            this._transition(enemy, EnemyState.AIM);
          }
        }
        break;

      default:
        this._transition(enemy, EnemyState.IDLE);
        break;
    }
  }

  _transition(enemy, state) {
    if (enemy.state === state) return;
    enemy.previousState = enemy.state;
    enemy.state = state;
    enemy.stateTime = 0;
    if (state !== EnemyState.PATROL &&
        state !== EnemyState.INVESTIGATE &&
        state !== EnemyState.PURSUIT &&
        state !== EnemyState.COVER &&
        state !== EnemyState.REPOSITION) {
      enemy.renderMotion = 0;
    }
  }

  _faceAimPoint(enemy, dt) {
    tmpDirection.subVectors(enemy.aimPoint, enemy.rig.root.position);
    tmpDirection.y = 0;
    if (tmpDirection.lengthSq() > 0.0001) {
      tmpDirection.normalize();
      enemy.rig.faceDirection(tmpDirection, 2.25, dt);
      tmpForward.set(0, 0, -1).applyAxisAngle(Y_AXIS, enemy.rig.root.rotation.y);
      enemy.aimAlignment = tmpForward.dot(tmpDirection);
    }
    return enemy.aimAlignment;
  }

  _moveToward(enemy, destination, speed, dt) {
    tmpDirection.subVectors(destination, enemy.rig.root.position);
    tmpDirection.y = 0;
    const distance = tmpDirection.length();
    if (distance < 0.42) {
      enemy.renderMotion = 0;
      return true;
    }
    tmpDirection.multiplyScalar(1 / distance);
    enemy.rig.faceDirection(tmpDirection, 5.7, dt);

    const step = Math.min(distance, speed * dt);
    tmpDelta.copy(tmpDirection).multiplyScalar(step);
    tmpOrigin.copy(enemy.rig.root.position).addScaledVector(tmpDirection, 0.5);
    tmpOrigin.y += 0.85;

    if (typeof this.physics?.raycast === 'function') {
      const obstacle = this.physics.raycast(tmpOrigin, tmpDirection, step + 0.36, 0xffffffff);
      if (obstacle && hitDistance(obstacle, tmpOrigin) < step + 0.28) {
        tmpSide.set(-tmpDirection.z, 0, tmpDirection.x);
        if (random01(enemy.rng) < 0.5) tmpSide.multiplyScalar(-1);
        tmpPoint.copy(enemy.rig.root.position).addScaledVector(tmpSide, 0.5);
        tmpPoint.y += 0.85;
        const sideHit = this.physics.raycast(tmpPoint, tmpSide, step + 0.46, 0xffffffff);
        if (!sideHit || hitDistance(sideHit, tmpPoint) > step + 0.32) {
          tmpDelta.copy(tmpSide).multiplyScalar(step * 0.82);
        } else {
          enemy.renderMotion = 0;
          return false;
        }
      }
    }

    let moved = false;
    if (
      typeof this.physics?.moveCapsule === 'function' &&
      this.options.usePhysicsMovement !== false
    ) {
      const result = this.physics.moveCapsule(enemy.rig.root.position, tmpDelta, ENEMY_CAPSULE);
      const resultPosition = result?.position ?? result?.end ?? (result?.isVector3 ? result : null);
      if (resultPosition) {
        enemy.rig.root.position.copy(resultPosition);
        moved = true;
      } else if (result?.delta) {
        enemy.rig.root.position.add(result.delta);
        moved = true;
      }
    }
    if (!moved) enemy.rig.root.position.add(tmpDelta);

    enemy.renderMotion = Math.min(1, speed / 2.7);
    enemy.nextFootstep -= dt;
    if (enemy.nextFootstep <= 0) {
      enemy.nextFootstep = 0.44 / Math.max(0.55, enemy.renderMotion);
      emit(this.events, 'audio:play', {
        name: 'enemy-footstep',
        position: enemy.rig.root.position.clone(),
        volume: 0.28 + enemy.renderMotion * 0.22,
        surface: 'concrete',
      });
    }
    return false;
  }

  _selectCover(enemy) {
    let candidates = [];
    if (typeof this.physics?.queryCover === 'function') {
      candidates = this.physics.queryCover(enemy.rig.root.position, 15) ?? [];
    }
    if (!Array.isArray(candidates) || !candidates.length) candidates = this.coverPoints;
    if (!Array.isArray(candidates) || !candidates.length) return false;

    let bestScore = Infinity;
    let found = false;
    const startIndex = randomInt(enemy.rng, 0, candidates.length);
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const candidate = candidates[(startIndex + offset) % candidates.length];
      if (!extractWorldPosition(candidate, tmpPoint)) continue;
      const distance = tmpPoint.distanceTo(enemy.rig.root.position);
      if (distance < 1.2 || distance > 16) continue;
      const targetDistance = tmpPoint.distanceTo(this._playerPosition);
      if (targetDistance < 5) continue;
      tmpOrigin.copy(tmpPoint);
      tmpOrigin.y += 1.25;
      const exposed = this._lineOfSight(tmpOrigin, this._playerPosition);
      const providedScore = Number(candidate.score ?? 0);
      const score = distance + (exposed ? 6.5 : -2.5) - providedScore;
      if (score < bestScore) {
        bestScore = score;
        enemy.cover.copy(tmpPoint);
        found = true;
      }
    }
    enemy.hasCover = found;
    return found;
  }

  _chooseReposition(enemy) {
    tmpDirection.subVectors(this._playerPosition, enemy.rig.root.position);
    tmpDirection.y = 0;
    if (tmpDirection.lengthSq() < 0.001) tmpDirection.set(0, 0, -1);
    else tmpDirection.normalize();
    tmpSide.set(-tmpDirection.z, 0, tmpDirection.x);
    if (random01(enemy.rng) < 0.5) tmpSide.multiplyScalar(-1);
    enemy.destination.copy(enemy.rig.root.position);
    enemy.destination.addScaledVector(tmpSide, randomRange(enemy.rng, 3.4, 7.1));
    enemy.destination.addScaledVector(tmpDirection, randomRange(enemy.rng, -1.4, 2.8));
    enemy.destination.x = THREE.MathUtils.clamp(enemy.destination.x, -47, 47);
    enemy.destination.z = THREE.MathUtils.clamp(enemy.destination.z, -47, 47);
    enemy.hasCover = false;
  }

  _fire(enemy) {
    enemy.renderFire = true;
    enemy.magazine -= 1;
    enemy.shotsFired += 1;
    enemy.rig.muzzleWorld(tmpMuzzle);
    tmpDirection.subVectors(enemy.aimPoint, tmpMuzzle);
    if (tmpDirection.lengthSq() < 0.0001) {
      tmpDirection.set(0, 0, -1).applyAxisAngle(Y_AXIS, enemy.rig.root.rotation.y);
    } else {
      tmpDirection.normalize();
    }
    tmpAimRight.crossVectors(tmpDirection, Y_AXIS);
    if (tmpAimRight.lengthSq() < 0.0001) tmpAimRight.set(1, 0, 0);
    else tmpAimRight.normalize();
    tmpAimUp.crossVectors(tmpAimRight, tmpDirection).normalize();

    const movementSpread = Math.min(0.009, this._playerVelocity.length() * 0.0011);
    const angularSpread = THREE.MathUtils.lerp(0.043, 0.017, enemy.accuracy)
      + movementSpread
      + enemy.suppression * 0.018
      + enemy.burstShotIndex * 0.0035;
    const spreadRadius = Math.sqrt(random01(enemy.rng)) * angularSpread;
    const spreadAngle = randomRange(enemy.rng, 0, Math.PI * 2);
    tmpDirection
      .addScaledVector(tmpAimRight, Math.cos(spreadAngle) * spreadRadius)
      .addScaledVector(tmpAimUp, Math.sin(spreadAngle) * spreadRadius)
      .normalize();

    const worldHit = typeof this.physics?.raycast === 'function'
      ? this.physics.raycast(tmpMuzzle, tmpDirection, 80, 0xffffffff)
      : null;
    const worldDistance = hitDistance(worldHit, tmpMuzzle);
    const playerDistance = tmpMuzzle.distanceTo(this._playerPosition);
    const playerHitDistance = playerCapsuleHitDistance(
      tmpMuzzle,
      tmpDirection,
      this._playerFootPosition,
      this._playerHeight,
      0.38,
    );
    const clearShot = Number.isFinite(playerHitDistance)
      && worldDistance >= playerHitDistance - 0.04;
    const damage = randomRange(enemy.rng, 8.5, 13.5);
    const terminalDistance = clearShot
      ? playerHitDistance
      : Number.isFinite(worldDistance)
        ? Math.min(80, worldDistance)
        : 80;
    const end = tmpMuzzle.clone().addScaledVector(
      tmpDirection,
      terminalDistance,
    );
    if (worldHit && !clearShot) hitPoint(worldHit, end);

    const payload = {
      id: `enemy-${enemy.id}-${this._shotSerial++}`,
      kind: 'enemy',
      source: enemy.id,
      origin: tmpMuzzle.clone(),
      direction: tmpDirection.clone(),
      velocity: tmpDirection.clone().multiplyScalar(120),
      damage,
      maxDistance: 80,
      clearShot,
      targetDistance: playerDistance,
      end: end.clone(),
      tracerEnd: end.clone(),
      spreadRadians: angularSpread,
    };
    emit(this.events, 'projectile:spawn', payload);
    emit(this.events, 'weapon:fire', {
      source: `enemy:${enemy.id}`,
      kind: 'enemy',
      enemyId: enemy.id,
      position: tmpMuzzle.clone(),
      direction: tmpDirection.clone(),
      tracerEnd: end.clone(),
    });
    emit(this.events, 'audio:play', {
      name: 'enemy-fire',
      position: tmpMuzzle.clone(),
      volume: 0.82,
    });
    emit(this.events, 'projectile:impact', {
      kind: clearShot || !worldHit ? 'tracer-end' : 'world',
      source: enemy.id,
      point: end.clone(),
      position: end.clone(),
      material: worldHit?.material ?? worldHit?.userData?.material ?? 'concrete',
      direction: tmpDirection.clone(),
    });

    if (clearShot) {
      if (this.player && typeof this.player.applyDamage === 'function') {
        tmpSide.subVectors(this._playerPosition, enemy.rig.root.position).normalize();
        this.player.applyDamage(damage, tmpSide, enemy.id);
      } else if (typeof this.options.applyPlayerDamage === 'function') {
        tmpSide.subVectors(this._playerPosition, enemy.rig.root.position).normalize();
        this.options.applyPlayerDamage(damage, tmpSide, enemy.id);
      }
    }

    if (enemy.magazine <= 0) {
      enemy.magazine = 30;
      enemy.shotTimer += 2.1;
      emit(this.events, 'audio:play', {
        name: 'enemy-reload',
        position: enemy.rig.root.position.clone(),
        volume: 0.32,
      });
    }
  }

  _hearWeapon(event) {
    if (!event || String(event.source ?? '').startsWith('enemy:') || event.kind === 'enemy') return;
    const source = event.position ?? event.origin ?? this._playerPosition;
    if (!toVector3(source, tmpPoint)) return;
    const audibleRadius = Number(event.audibleRadius ?? 42);
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      if (enemy.rig.root.position.distanceToSquared(tmpPoint) > audibleRadius * audibleRadius) continue;
      enemy.lastHeard.copy(tmpPoint);
      enemy.lastHeardTime = this.time;
      if (!enemy.alerted) {
        enemy.alerted = true;
        enemy.reactionDuration = randomRange(
          enemy.rng,
          ENEMY_REACTION_MIN,
          ENEMY_REACTION_MAX,
        );
        enemy.reactionTimer = enemy.reactionDuration;
      }
      if (enemy.state === EnemyState.IDLE || enemy.state === EnemyState.PATROL) {
        this._transition(enemy, EnemyState.INVESTIGATE);
      }
    }
  }

  forceAlert(position, radius = 38) {
    if (position && !toVector3(position, tmpPoint)) return;
    if (!position) tmpPoint.copy(this._playerPosition);
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const distanceSq = enemy.rig.root.position.distanceToSquared(tmpPoint);
      if (distanceSq > radius * radius) continue;
      enemy.lastHeard.copy(tmpPoint);
      enemy.lastHeardTime = this.time;
      if (!enemy.alerted) {
        enemy.alerted = true;
        enemy.reactionDuration = randomRange(
          enemy.rng,
          ENEMY_REACTION_MIN,
          ENEMY_REACTION_MAX,
        );
        enemy.reactionTimer = enemy.reactionDuration;
      }
      if (enemy.state === EnemyState.IDLE || enemy.state === EnemyState.PATROL) {
        this._transition(enemy, EnemyState.INVESTIGATE);
      }
    }
  }

  applyProjectileHit(hit) {
    if (!hit) return false;
    let enemyId = hit.enemyId ?? hit.target?.enemyId ?? hit.id ?? hit.object?.userData?.enemyId;
    let object = hit.object;
    while (enemyId === undefined && object?.parent) {
      object = object.parent;
      enemyId = object.userData?.enemyId;
    }
    if (typeof enemyId === 'string' && enemyId.includes(':')) {
      enemyId = enemyId.slice(enemyId.lastIndexOf(':') + 1);
    }
    const enemy = this.enemies.find((entry) => entry.id === Number(enemyId));
    if (!enemy || !enemy.alive) return false;

    const zone = hit.headshot
      ? 'head'
      : hit.hitZone ?? hit.object?.userData?.hitZone ?? object?.userData?.hitZone ?? 'torso';
    const baseDamage = Number(hit.damage ?? hit.projectile?.damage ?? 34);
    const multiplier = BODY_DAMAGE[zone] ?? 1;
    const damage = Math.max(1, baseDamage * multiplier);
    const direction = hit.direction ?? hit.projectile?.direction;
    if (toVector3(direction, enemy.damageDirection)) enemy.damageDirection.normalize();
    else enemy.damageDirection.set(0, 0, -1);

    enemy.health = Math.max(0, enemy.health - damage);
    enemy.suppression = Math.min(1, enemy.suppression + 0.36);
    enemy.hitReaction = 1;
    emit(this.events, 'enemy:damage', {
      enemyId: enemy.id,
      damage,
      health: enemy.health,
      zone,
      headshot: zone === 'head',
      point: (hit.point ?? hit.position)?.clone?.() ?? hit.point ?? hit.position,
      direction: enemy.damageDirection.clone(),
    });
    emit(this.events, 'combat:hitmarker', {
      enemyId: enemy.id,
      damage,
      headshot: zone === 'head',
      lethal: enemy.health <= 0,
    });

    if (enemy.health <= 0) {
      this._kill(enemy, zone, hit);
    } else {
      enemy.alerted = true;
      enemy.detection = 1;
      enemy.lastSeen.copy(this._playerPosition);
      enemy.lastSeenTime = this.time;
      enemy.reactionDuration = randomRange(enemy.rng, 0.72, 1.18);
      enemy.reactionTimer = enemy.reactionDuration;
      this._transition(enemy, EnemyState.REACT);
    }
    return true;
  }

  applyDamage(enemyId, damage, zone = 'torso', direction = null) {
    return this.applyProjectileHit({ enemyId, damage, hitZone: zone, direction });
  }

  _kill(enemy, zone, hit) {
    enemy.alive = false;
    enemy.health = 0;
    enemy.deathTime = 0;
    enemy.renderMotion = 0;
    enemy.renderAim = 0;
    enemy.rig.deathSide = enemy.deathTilt;
    this._transition(enemy, EnemyState.DEAD);
    if (this.spawnedCount < this.totalCount) {
      this.reinforcementTimer = Math.max(this.reinforcementTimer, 2.2);
    }
    const point = hit?.point ?? hit?.position ?? enemy.rig.root.position;
    emit(this.events, 'enemy:death', {
      enemyId: enemy.id,
      headshot: zone === 'head',
      position: enemy.rig.root.position.clone(),
      point: point?.clone?.() ?? point,
      remaining: this.livingCount,
    });
    emit(this.events, 'combat:kill', {
      enemyId: enemy.id,
      headshot: zone === 'head',
      remaining: this.livingCount,
    });
    emit(this.events, 'audio:play', {
      name: zone === 'head' ? 'enemy-headshot' : 'enemy-death',
      position: enemy.rig.root.position.clone(),
      volume: 0.82,
    });
  }

  _keepFeetGrounded(enemy, dt) {
    enemy.groundTimer -= dt;
    if (enemy.groundTimer > 0) return;
    enemy.groundTimer = 0.18 + enemy.id * 0.004;
    if (typeof this.physics?.raycast !== 'function') {
      enemy.groundY = enemy.rig.root.position.y;
      enemy.rig.lastGroundY = enemy.groundY;
      return;
    }
    tmpOrigin.copy(enemy.rig.root.position);
    tmpOrigin.y += 1.25;
    const groundHit = this.physics.raycast(tmpOrigin, tmpDown, 3.2, 0xffffffff);
    const point = hitPoint(groundHit, tmpPoint);
    if (!point) return;
    const normalY = Number(groundHit?.normal?.y ?? groundHit?.face?.normal?.y ?? 1);
    if (normalY < 0.45) return;
    enemy.groundY = point.y + 0.015;
    enemy.rig.root.position.y = THREE.MathUtils.lerp(
      enemy.rig.root.position.y,
      enemy.groundY,
      0.72,
    );
    enemy.rig.lastGroundY = enemy.groundY;
  }

  _onPlayerDeath() {
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      enemy.alerted = false;
      enemy.detection = 0;
      this._transition(enemy, EnemyState.IDLE);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.unsubscribers.length - 1; i >= 0; i -= 1) {
      this.unsubscribers[i]();
    }
    this.unsubscribers.length = 0;
    for (let i = this.dynamicUnsubscribers.length - 1; i >= 0; i -= 1) {
      this.dynamicUnsubscribers[i]();
    }
    this.dynamicUnsubscribers.length = 0;
    while (this.enemies.length) this.enemies.pop().rig.dispose();
    this.root.removeFromParent();
    this.sharedAssets?.dispose();
    this.sharedAssets = null;
    this.context = null;
    this.scene = null;
    this.events = null;
    this.physics = null;
  }
}

export default EnemyDirector;
