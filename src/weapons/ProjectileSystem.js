import * as THREE from 'three';

const NEXT = new THREE.Vector3();
const SEGMENT = new THREE.Vector3();
const DIRECTION = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const POINT = new THREE.Vector3();
const REFLECTED = new THREE.Vector3();
const MELEE_RIGHT = new THREE.Vector3();
const MELEE_DIRECTION = new THREE.Vector3();
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const MELEE_SWEEP = [0, -0.11, 0.11, -0.22, 0.22];

const PENETRATION = Object.freeze({
  glass: { loss: 0.28, damage: 0.82, advance: 0.24 },
  fabric: { loss: 0.18, damage: 0.9, advance: 0.2 },
  plaster: { loss: 0.56, damage: 0.66, advance: 0.16 },
  wood: { loss: 0.62, damage: 0.62, advance: 0.14 },
});

function emit(events, name, payload) {
  if (!events) return;
  if (typeof events.emit === 'function') events.emit(name, payload);
  else if (typeof events.dispatch === 'function') events.dispatch(name, payload);
  else if (typeof events.publish === 'function') events.publish(name, payload);
}

function vectorLike(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function firstHit(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  if (Array.isArray(result.hits)) return result.hits[0] ?? null;
  return result;
}

function materialName(hit) {
  const raw = hit?.materialType
    ?? hit?.surface
    ?? (typeof hit?.material === 'string' ? hit.material : hit?.material?.name)
    ?? hit?.object?.userData?.materialType
    ?? hit?.object?.userData?.surface
    ?? hit?.collider?.material
    ?? hit?.userData?.materialType
    ?? 'concrete';
  const name = String(raw).toLowerCase();
  if (/flesh|enemy|body|blood/.test(name)) return 'flesh';
  if (/glass|window/.test(name)) return 'glass';
  if (/fabric|cloth|canvas/.test(name)) return 'fabric';
  if (/wood|timber|ply/.test(name)) return 'wood';
  if (/metal|steel|iron|alum/.test(name)) return 'metal';
  if (/dirt|sand|soil/.test(name)) return 'dirt';
  if (/plaster|stucco|drywall/.test(name)) return 'plaster';
  if (/rubber/.test(name)) return 'rubber';
  return 'concrete';
}

function isActorHit(hit) {
  const data = hit?.object?.userData ?? hit?.collider?.userData ?? hit?.userData ?? {};
  return Boolean(
    hit?.target
    || hit?.entity
    || hit?.enemy
    || data.enemy
    || data.entity
    || data.damageable
    || data.type === 'enemy'
    || data.type === 'actor'
  );
}

/**
 * Fixed-size deterministic ballistic pool. Visuals and damage routing are
 * delivered through events so this feature never imports enemy/effects code.
 */
export class ProjectileSystem {
  constructor(context = null, options = {}) {
    this.options = {
      capacity: 72,
      gravity: 9.81,
      maxAge: 1.8,
      maxRange: 220,
      ...options,
    };
    this.context = null;
    this.events = null;
    this.physics = null;
    this.gravity = new THREE.Vector3(0, -this.options.gravity, 0);
    this.sequence = 0;
    this.activeCount = 0;
    this.pool = Array.from({ length: this.options.capacity }, (_, index) => ({
      index,
      active: false,
      id: 0,
      position: new THREE.Vector3(),
      previous: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: 0,
      distance: 0,
      maxAge: this.options.maxAge,
      damage: 0,
      energy: 1,
      owner: null,
      kind: 'rifle',
      penetrations: 0,
      ricochets: 0,
      headshotMultiplier: 2,
    }));
    this.snapshot = {
      activeCount: 0,
      capacity: this.options.capacity,
      sequence: 0,
    };
    if (context) this.init(context);
  }

  init(context) {
    this.context = context;
    this.events = context.events;
    this.physics = context.physics;
    return this;
  }

  spawn(data) {
    const direction = data?.direction;
    const origin = data?.origin ?? data?.position;
    if (!vectorLike(direction) || !vectorLike(origin)) return null;

    let projectile = null;
    let oldest = this.pool[0];
    for (let i = 0; i < this.pool.length; i += 1) {
      const candidate = this.pool[i];
      if (!candidate.active) {
        projectile = candidate;
        break;
      }
      if (candidate.age > oldest.age) oldest = candidate;
    }
    if (!projectile) {
      projectile = oldest;
      this._deactivate(projectile);
    }

    projectile.active = true;
    projectile.id = ++this.sequence;
    projectile.position.copy(origin);
    projectile.previous.copy(origin);
    projectile.velocity.copy(direction).normalize().multiplyScalar(data.speed ?? 165);
    projectile.age = 0;
    projectile.distance = 0;
    projectile.maxAge = data.maxAge ?? this.options.maxAge;
    projectile.damage = data.damage ?? 27;
    projectile.energy = data.energy ?? 1;
    projectile.owner = data.owner ?? 'player';
    projectile.kind = data.kind ?? 'rifle';
    projectile.penetrations = 0;
    projectile.ricochets = 0;
    projectile.headshotMultiplier = data.headshotMultiplier ?? 2;
    this.activeCount += 1;
    this._syncSnapshot();

    DIRECTION.copy(projectile.velocity).normalize();
    emit(this.events, 'projectile:spawn', {
      id: projectile.id,
      origin: projectile.position.clone(),
      direction: DIRECTION.clone(),
      speed: projectile.velocity.length(),
      damage: projectile.damage,
      owner: projectile.owner,
      kind: projectile.kind,
    });
    return projectile.id;
  }

  strike({ origin, direction, range, damage }) {
    if (!vectorLike(origin) || !vectorLike(direction) || !this.physics?.raycast) return false;
    MELEE_RIGHT.crossVectors(direction, UP_AXIS).normalize();
    let actor = null;
    let surface = null;
    for (const offset of MELEE_SWEEP) {
      MELEE_DIRECTION.copy(direction).addScaledVector(MELEE_RIGHT, offset).normalize();
      const hit = firstHit(this.physics.raycast(origin, MELEE_DIRECTION, range, 0xffffffff));
      if (!hit) continue;
      if (isActorHit(hit)) {
        if (!actor || hit.distance < actor.hit.distance) actor = { hit, direction: MELEE_DIRECTION.clone() };
      } else if (!surface || hit.distance < surface.hit.distance) {
        surface = { hit, direction: MELEE_DIRECTION.clone() };
      }
    }
    const contact = actor ?? surface;
    if (!contact) return false;
    this._resolveImpact({
      id: ++this.sequence, position: origin, velocity: contact.direction,
      damage, distance: 0, energy: 1, owner: 'player', kind: 'melee',
    }, contact.hit, contact.direction);
    this._syncSnapshot();
    return true;
  }

  fixedUpdate(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.activeCount === 0) return;
    for (let i = 0; i < this.pool.length; i += 1) {
      const projectile = this.pool[i];
      if (!projectile.active) continue;

      projectile.age += dt;
      projectile.previous.copy(projectile.position);
      NEXT.copy(projectile.position)
        .addScaledVector(projectile.velocity, dt)
        .addScaledVector(this.gravity, 0.5 * dt * dt);
      SEGMENT.subVectors(NEXT, projectile.position);
      const length = SEGMENT.length();
      if (length <= 1e-6) continue;
      DIRECTION.copy(SEGMENT).multiplyScalar(1 / length);

      const rawHit = this.physics?.raycast?.(
        projectile.position,
        DIRECTION,
        length,
        0xffffffff,
      );
      const hit = firstHit(rawHit);
      if (hit) {
        this._resolveImpact(projectile, hit, DIRECTION);
      } else {
        projectile.position.copy(NEXT);
        projectile.velocity.addScaledVector(this.gravity, dt);
        projectile.distance += length;
      }

      if (
        projectile.active
        && (
          projectile.age >= projectile.maxAge
          || projectile.distance >= this.options.maxRange
          || projectile.position.y < -14
          || projectile.energy < 0.08
        )
      ) {
        this._deactivate(projectile);
      }
    }
    this._syncSnapshot();
  }

  _resolveImpact(projectile, hit, incoming) {
    const surface = materialName(hit);
    if (vectorLike(hit.point ?? hit.position)) POINT.copy(hit.point ?? hit.position);
    else {
      const distance = Number.isFinite(hit.distance) ? hit.distance : 0;
      POINT.copy(projectile.position).addScaledVector(incoming, distance);
    }
    if (vectorLike(hit.normal)) NORMAL.copy(hit.normal).normalize();
    else if (vectorLike(hit.face?.normal)) NORMAL.copy(hit.face.normal).normalize();
    else NORMAL.copy(incoming).multiplyScalar(-1);

    const data = hit?.object?.userData ?? hit?.collider?.userData ?? hit?.userData ?? {};
    const actor = isActorHit(hit);
    const melee = projectile.kind === 'melee';
    const bodyPart = melee && actor ? 'torso'
      : hit?.hitZone ?? hit?.bodyPart ?? data.bodyPart ?? data.hitZone ?? 'body';
    const headshot = actor && /head|helmet/.test(String(bodyPart).toLowerCase());
    const dealtDamage = projectile.damage * projectile.energy;

    const payload = {
      projectileId: projectile.id,
      point: POINT.clone(),
      position: POINT.clone(),
      normal: NORMAL.clone(),
      direction: incoming.clone(),
      velocity: projectile.velocity.clone(),
      surface,
      material: surface,
      object: hit?.object ?? null,
      collider: hit?.collider ?? null,
      entity: hit?.target ?? hit?.entity ?? hit?.enemy ?? data.entity ?? data.enemy ?? null,
      target: hit?.target ?? null,
      targetId: hit?.id ?? null,
      enemyId: hit?.target?.enemyId ?? data.enemyId ?? hit?.id ?? null,
      bodyPart,
      hitZone: bodyPart,
      headshot,
      damage: dealtDamage,
      owner: projectile.owner,
      kind: projectile.kind,
      distance: projectile.distance + projectile.position.distanceTo(POINT),
      penetrated: false,
      ricocheted: false,
    };

    if (actor || surface === 'flesh' || melee) {
      emit(this.events, 'projectile:impact', payload);
      this._deactivate(projectile);
      return;
    }

    const penetration = PENETRATION[surface];
    if (penetration && projectile.penetrations < 2 && projectile.energy > penetration.loss + 0.06) {
      payload.penetrated = true;
      emit(this.events, 'projectile:impact', payload);
      projectile.penetrations += 1;
      projectile.energy *= 1 - penetration.loss;
      projectile.damage *= penetration.damage;
      projectile.velocity.multiplyScalar(0.72 + (1 - penetration.loss) * 0.18);
      projectile.position.copy(POINT).addScaledVector(incoming, penetration.advance);
      projectile.distance += projectile.previous.distanceTo(POINT) + penetration.advance;
      return;
    }

    const incidence = Math.abs(incoming.dot(NORMAL));
    if (
      surface === 'metal'
      && incidence < 0.28
      && projectile.ricochets < 1
      && projectile.energy > 0.35
    ) {
      REFLECTED.copy(incoming).reflect(NORMAL).normalize();
      payload.ricocheted = true;
      payload.ricochetDirection = REFLECTED.clone();
      emit(this.events, 'projectile:impact', payload);
      projectile.ricochets += 1;
      projectile.energy *= 0.42;
      projectile.damage *= 0.55;
      projectile.position.copy(POINT).addScaledVector(REFLECTED, 0.055);
      projectile.velocity.copy(REFLECTED).multiplyScalar(projectile.velocity.length() * 0.58);
      projectile.distance += projectile.previous.distanceTo(POINT);
      return;
    }

    emit(this.events, 'projectile:impact', payload);
    this._deactivate(projectile);
  }

  _deactivate(projectile) {
    if (!projectile.active) return;
    projectile.active = false;
    projectile.owner = null;
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  _syncSnapshot() {
    this.snapshot.activeCount = this.activeCount;
    this.snapshot.sequence = this.sequence;
  }

  reset() {
    for (let i = 0; i < this.pool.length; i += 1) {
      this.pool[i].active = false;
      this.pool[i].owner = null;
    }
    this.sequence = 0;
    this.activeCount = 0;
    this._syncSnapshot();
  }

  dispose() {
    this.reset();
    this.context = null;
    this.events = null;
    this.physics = null;
  }
}

export default ProjectileSystem;
