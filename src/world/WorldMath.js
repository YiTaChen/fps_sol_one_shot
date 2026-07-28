import * as THREE from 'three';

function hashLabel(label) {
  let value = 0x811c9dc5;
  for (let i = 0; i < label.length; i += 1) {
    value ^= label.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function resolveNamedStream(service, name) {
  if (!service) {
    return null;
  }
  if (typeof service.stream === 'function') {
    return service.stream(name);
  }
  if (typeof service.getStream === 'function') {
    return service.getStream(name);
  }
  if (typeof service.named === 'function') {
    return service.named(name);
  }
  if (typeof service.fork === 'function') {
    return service.fork(name);
  }
  return service;
}

class StaticXorShift {
  constructor(seed) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  float() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
}

/**
 * Normalizes the small variations of the Rng API while preserving named stream
 * ownership. The local fallback is deterministic and exists only for isolated
 * static previews where a GameContext is not yet available.
 */
export function namedRng(service, name, fallbackSeed = 0x23a4d18f) {
  const source =
    resolveNamedStream(service, name) ??
    new StaticXorShift((fallbackSeed ^ hashLabel(name)) >>> 0);

  const float = () => {
    if (typeof source.float === 'function') {
      return source.float();
    }
    if (typeof source.nextFloat === 'function') {
      return source.nextFloat();
    }
    if (typeof source.next === 'function') {
      const result = source.next();
      const value = typeof result === 'number' ? result : result?.value;
      if (Number.isFinite(value)) {
        return value >= 0 && value <= 1 ? value : (value >>> 0) / 0x100000000;
      }
    }
    if (typeof source.uint32 === 'function') {
      return source.uint32() / 0x100000000;
    }
    if (typeof source.nextUint32 === 'function') {
      return source.nextUint32() / 0x100000000;
    }
    throw new TypeError(`RNG stream "${name}" does not expose a numeric draw method`);
  };

  return Object.freeze({
    float,
    range(min, max) {
      return min + (max - min) * float();
    },
    int(minInclusive, maxExclusive) {
      return minInclusive + Math.floor(float() * (maxExclusive - minInclusive));
    },
    chance(probability) {
      return float() < probability;
    },
    pick(values) {
      return values[Math.min(values.length - 1, Math.floor(float() * values.length))];
    },
    sign() {
      return float() < 0.5 ? -1 : 1;
    },
    source,
  });
}

export function localToWorld(local, origin, yaw, target = new THREE.Vector3()) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  target.set(
    origin.x + local.x * cosine + local.z * sine,
    origin.y + local.y,
    origin.z - local.x * sine + local.z * cosine,
  );
  return target;
}

export function localYawToQuaternion(yaw, target = new THREE.Quaternion()) {
  return target.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
}

export function createBoxCollider({
  id,
  center,
  size,
  yaw = 0,
  material = 'concrete',
  kind = 'static',
  mask = 1,
  object = null,
  tags = [],
  penetrable = undefined,
}) {
  const halfX = size.x * 0.5;
  const halfY = size.y * 0.5;
  const halfZ = size.z * 0.5;
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  const worldHalfX = cosine * halfX + sine * halfZ;
  const worldHalfZ = sine * halfX + cosine * halfZ;
  const halfExtents = new THREE.Vector3(worldHalfX, halfY, worldHalfZ);
  const min = center.clone().sub(halfExtents);
  const max = center.clone().add(halfExtents);
  return {
    id,
    type: 'box',
    shape: 'aabb',
    center: center.clone(),
    size: size.clone(),
    halfExtents,
    min,
    max,
    yaw,
    material,
    surface: material,
    penetrable:
      penetrable ??
      ['glass', 'wood', 'fabric', 'plaster', 'polymer'].includes(material),
    kind,
    mask,
    object,
    tags: Object.freeze([...tags]),
  };
}

export function addCoverPoint(
  target,
  position,
  normal,
  options = {},
) {
  target.push({
    id: options.id ?? `cover:${target.length}`,
    position: position.clone(),
    normal: normal.clone().normalize(),
    height: options.height ?? 1.05,
    width: options.width ?? 1.4,
    stance: options.stance ?? ((options.height ?? 1.05) > 1.25 ? 'stand' : 'crouch'),
    exposure: options.exposure ?? 0.38,
    score: options.score ?? 1,
    kind: options.kind ?? 'hard',
  });
}

export function pointNearCollider(point, collider, epsilon = 0.3) {
  return (
    point.x >= collider.min.x - epsilon &&
    point.x <= collider.max.x + epsilon &&
    point.y >= collider.min.y - epsilon &&
    point.y <= collider.max.y + epsilon &&
    point.z >= collider.min.z - epsilon &&
    point.z <= collider.max.z + epsilon
  );
}
