import * as THREE from "three";

const _candidatePosition = new THREE.Vector3();
const _rayPoint = new THREE.Vector3();
const _rayNormal = new THREE.Vector3();
const _invDirection = new THREE.Vector3();
const _capsuleBox = new THREE.Box3();
const _clearanceBox = new THREE.Box3();
const _expanded = new THREE.Box3();
const _pointA = new THREE.Vector3();
const _pointB = new THREE.Vector3();
const _stepPosition = new THREE.Vector3();

const COLLISION_EPSILON = 1e-6;
const DEFAULT_COLLISION_SKIN = 0.0025;

function rampHeightAt(collider, point) {
  const axis = collider.rampAxis === "x" ? "x" : "z";
  const low = collider.min[axis];
  const high = collider.max[axis];
  const span = Math.max(0.001, high - low);
  const raw = THREE.MathUtils.clamp((point[axis] - low) / span, 0, 1);
  const t = collider.rampDirection < 0 ? 1 - raw : raw;
  return collider.rampBaseY + (collider.rampTopY - collider.rampBaseY) * t;
}

function rayRamp(origin, direction, collider, maxDistance) {
  const axis = collider.rampAxis === "x" ? "x" : "z";
  const low = collider.min[axis];
  const high = collider.max[axis];
  const span = Math.max(0.001, high - low);
  const signedSlope =
    ((collider.rampTopY - collider.rampBaseY) / span)
    * (collider.rampDirection < 0 ? -1 : 1);
  const reference = collider.rampDirection < 0 ? high : low;
  const denominator = direction.y - signedSlope * direction[axis];
  if (Math.abs(denominator) < 1e-6) return null;
  const distance =
    (collider.rampBaseY + signedSlope * (origin[axis] - reference) - origin.y)
    / denominator;
  if (distance < 0 || distance > maxDistance) return null;
  _rayPoint.copy(direction).multiplyScalar(distance).add(origin);
  const otherAxis = axis === "x" ? "z" : "x";
  if (
    _rayPoint[axis] < low - 0.001
    || _rayPoint[axis] > high + 0.001
    || _rayPoint[otherAxis] < collider.min[otherAxis] - 0.001
    || _rayPoint[otherAxis] > collider.max[otherAxis] + 0.001
  ) {
    return null;
  }
  _rayNormal.set(0, 1, 0);
  _rayNormal[axis] = -signedSlope;
  _rayNormal.normalize();
  return { distance, point: _rayPoint.clone(), normal: _rayNormal.clone() };
}

function rayBox(origin, direction, box, maxDistance) {
  _invDirection.set(
    direction.x === 0 ? Number.POSITIVE_INFINITY : 1 / direction.x,
    direction.y === 0 ? Number.POSITIVE_INFINITY : 1 / direction.y,
    direction.z === 0 ? Number.POSITIVE_INFINITY : 1 / direction.z,
  );
  let tMin = -Infinity;
  let tMax = Infinity;
  let hitAxis = "x";
  let hitSign = 0;
  for (const axis of ["x", "y", "z"]) {
    let t1 = (box.min[axis] - origin[axis]) * _invDirection[axis];
    let t2 = (box.max[axis] - origin[axis]) * _invDirection[axis];
    let sign = -Math.sign(direction[axis]) || -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign *= -1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitAxis = axis;
      hitSign = sign;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  const distance = tMin >= 0 ? tMin : tMax;
  if (distance < 0 || distance > maxDistance) return null;
  return { distance, axis: hitAxis, sign: hitSign };
}

function buildCapsuleBox(position, capsule, target = _capsuleBox) {
  const radius = capsule.radius ?? 0.34;
  const height = capsule.height ?? capsule.standingHeight ?? 1.72;
  return target.set(
    _pointA.set(position.x - radius, position.y, position.z - radius),
    _pointB.set(position.x + radius, position.y + height, position.z + radius),
  );
}

function overlapsStrict(a, b, epsilon = COLLISION_EPSILON) {
  return (
    a.max.x > b.min.x + epsilon
    && a.min.x < b.max.x - epsilon
    && a.max.y > b.min.y + epsilon
    && a.min.y < b.max.y - epsilon
    && a.max.z > b.min.z + epsilon
    && a.min.z < b.max.z - epsilon
  );
}

function overlapsHorizontal(a, b, epsilon = COLLISION_EPSILON) {
  return (
    a.max.x > b.min.x + epsilon
    && a.min.x < b.max.x - epsilon
    && a.max.z > b.min.z + epsilon
    && a.min.z < b.max.z - epsilon
  );
}

function capsuleClearOfBoxes(position, capsule, colliders) {
  const box = buildCapsuleBox(position, capsule, _clearanceBox);
  return !colliders.some((collider) =>
    collider.kind !== "ramp" && overlapsStrict(box, collider.box));
}

export class PhysicsWorld {
  constructor() {
    this.staticColliders = [];
    this.coverPoints = [];
    this.dynamicTargets = new Map();
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-50, -12, -50),
      new THREE.Vector3(50, 28, 50),
    );
  }

  addStatic(collider) {
    const min = collider.min?.isVector3
      ? collider.min.clone()
      : new THREE.Vector3().fromArray(collider.min || [0, 0, 0]);
    const max = collider.max?.isVector3
      ? collider.max.clone()
      : new THREE.Vector3().fromArray(collider.max || [0, 0, 0]);
    const record = {
      ...collider,
      min,
      max,
      box: new THREE.Box3(min, max),
      mask: collider.mask ?? 0xffffffff,
      material: collider.material || "concrete",
      penetrable: Boolean(collider.penetrable),
      kind: collider.kind ?? collider.type ?? "box",
      rampAxis: collider.rampAxis ?? collider.axis ?? "z",
      rampDirection: Number(collider.rampDirection ?? collider.direction ?? 1) < 0 ? -1 : 1,
      rampBaseY: Number(collider.rampBaseY ?? collider.baseY ?? min.y),
      rampTopY: Number(collider.rampTopY ?? collider.topY ?? max.y),
    };
    this.staticColliders.push(record);
    return record;
  }

  addBox(center, size, options = {}) {
    const half = _pointA.copy(size).multiplyScalar(0.5);
    return this.addStatic({
      ...options,
      min: _pointB.copy(center).sub(half).clone(),
      max: _pointB.copy(center).add(half).clone(),
    });
  }

  addCoverPoint(point) {
    const record = point.position ? point : { position: point.clone() };
    this.coverPoints.push(record);
    return record;
  }

  registerDynamic(id, target) {
    this.dynamicTargets.set(id, target);
    return () => this.dynamicTargets.delete(id);
  }

  moveCapsule(position, delta, capsule = {}) {
    const resultPosition = _candidatePosition.copy(position);
    const collisions = [];
    let grounded = false;
    const radius = capsule.radius ?? 0.34;
    const height = capsule.height ?? capsule.standingHeight ?? 1.72;
    const skin = Math.max(
      COLLISION_EPSILON * 2,
      Number(capsule.skin ?? DEFAULT_COLLISION_SKIN),
    );
    const maxStepHeight = Math.max(
      0,
      Number(capsule.maxStepHeight ?? capsule.stepHeight ?? 0),
    );
    const canStep = Boolean(capsule.canStep)
      && delta.y <= COLLISION_EPSILON
      && maxStepHeight > 0;
    const movementStartY = resultPosition.y;

    for (const axis of ["x", "z"]) {
      const axisMovement = Number(delta[axis]) || 0;
      if (Math.abs(axisMovement) <= COLLISION_EPSILON) continue;

      resultPosition[axis] += axisMovement;
      let capsuleBox = buildCapsuleBox(resultPosition, capsule);
      for (const collider of this.staticColliders) {
        if (collider.kind === "ramp") continue;
        if (!overlapsStrict(capsuleBox, collider.box)) continue;

        const stepRise = collider.max.y - movementStartY;
        if (
          canStep
          && stepRise > skin
          && stepRise <= maxStepHeight + COLLISION_EPSILON
        ) {
          _stepPosition.copy(resultPosition);
          _stepPosition.y = collider.max.y + skin;
          if (capsuleClearOfBoxes(_stepPosition, capsule, this.staticColliders)) {
            resultPosition.copy(_stepPosition);
            capsuleBox = buildCapsuleBox(resultPosition, capsule);
            grounded = true;
            collisions.push({
              collider,
              axis: "step",
              normal: new THREE.Vector3(0, 1, 0),
            });
            continue;
          }
        }

        resultPosition[axis] = axisMovement > 0
          ? collider.min[axis] - radius - skin
          : collider.max[axis] + radius + skin;
        capsuleBox = buildCapsuleBox(resultPosition, capsule);
        collisions.push({
          collider,
          axis,
          normal: new THREE.Vector3(
            axis === "x" ? -Math.sign(axisMovement) : 0,
            0,
            axis === "z" ? -Math.sign(axisMovement) : 0,
          ),
        });
      }
    }

    const verticalMovement = Number(delta.y) || 0;
    if (Math.abs(verticalMovement) > COLLISION_EPSILON) {
      const beforeY = resultPosition.y;
      const afterY = beforeY + verticalMovement;
      const horizontalBox = buildCapsuleBox(resultPosition, capsule);
      let verticalCollider = null;

      if (verticalMovement < 0) {
        let landingY = Number.NEGATIVE_INFINITY;
        for (const collider of this.staticColliders) {
          if (collider.kind === "ramp") continue;
          if (!overlapsHorizontal(horizontalBox, collider.box)) continue;
          const surfaceY = collider.max.y;
          if (
            beforeY >= surfaceY - skin
            && afterY <= surfaceY + skin
            && surfaceY > landingY
          ) {
            landingY = surfaceY;
            verticalCollider = collider;
          }
        }
        if (verticalCollider) {
          resultPosition.y = landingY;
          grounded = true;
        } else {
          resultPosition.y = afterY;
        }
      } else {
        const beforeTop = beforeY + height;
        const afterTop = afterY + height;
        let ceilingY = Number.POSITIVE_INFINITY;
        for (const collider of this.staticColliders) {
          if (collider.kind === "ramp") continue;
          if (!overlapsHorizontal(horizontalBox, collider.box)) continue;
          const surfaceY = collider.min.y;
          if (
            beforeTop <= surfaceY + skin
            && afterTop >= surfaceY - skin
            && surfaceY < ceilingY
          ) {
            ceilingY = surfaceY;
            verticalCollider = collider;
          }
        }
        resultPosition.y = verticalCollider ? ceilingY - height : afterY;
      }

      if (verticalCollider) {
        collisions.push({
          collider: verticalCollider,
          axis: "y",
          normal: new THREE.Vector3(0, -Math.sign(verticalMovement), 0),
        });
      }
    }

    // Ramps use a continuous procedural height plane rather than stacked box
    // steps. A conservative foot probe snaps only grounded/downward movement,
    // leaving jumps and mantle arcs unaffected.
    for (const collider of this.staticColliders) {
      if (collider.kind !== "ramp") continue;
      const axis = collider.rampAxis === "x" ? "x" : "z";
      const otherAxis = axis === "x" ? "z" : "x";
      if (
        resultPosition[axis] < collider.min[axis] - radius * 0.25
        || resultPosition[axis] > collider.max[axis] + radius * 0.25
        || resultPosition[otherAxis] < collider.min[otherAxis] - radius * 0.55
        || resultPosition[otherAxis] > collider.max[otherAxis] + radius * 0.55
      ) {
        continue;
      }
      const surfaceY = rampHeightAt(collider, resultPosition);
      const stepDelta = surfaceY - resultPosition.y;
      if (delta.y <= 0 && stepDelta >= -0.34 && stepDelta <= 0.34) {
        resultPosition.y = surfaceY;
        grounded = true;
        collisions.push({
          collider,
          axis: "ramp",
          normal: _rayNormal
            .set(0, 1, 0)
            .setComponent(axis === "x" ? 0 : 2, -(
              (collider.rampTopY - collider.rampBaseY)
              / Math.max(0.001, collider.max[axis] - collider.min[axis])
            ) * collider.rampDirection)
            .normalize()
            .clone(),
        });
      }
    }
    resultPosition.x = THREE.MathUtils.clamp(
      resultPosition.x,
      this.bounds.min.x + 0.4,
      this.bounds.max.x - 0.4,
    );
    resultPosition.z = THREE.MathUtils.clamp(
      resultPosition.z,
      this.bounds.min.z + 0.4,
      this.bounds.max.z - 0.4,
    );
    position.copy(resultPosition);
    return {
      position,
      grounded,
      collided: collisions.length > 0,
      collisions,
    };
  }

  capsuleClear(position, capsule = {}) {
    const capsuleBox = buildCapsuleBox(position, capsule);
    return !this.staticColliders.some((collider) =>
      collider.kind !== "ramp" && overlapsStrict(capsuleBox, collider.box));
  }

  raycast(origin, direction, maxDistance = 100, mask = 0xffffffff) {
    let closest = null;
    for (const collider of this.staticColliders) {
      if ((collider.mask & mask) === 0) continue;
      const hit = collider.kind === "ramp"
        ? rayRamp(origin, direction, collider, maxDistance)
        : rayBox(origin, direction, collider.box, maxDistance);
      if (!hit || (closest && hit.distance >= closest.distance)) continue;
      if (collider.kind !== "ramp") {
        _rayPoint.copy(direction).multiplyScalar(hit.distance).add(origin);
        _rayNormal.set(0, 0, 0);
        _rayNormal[hit.axis] = hit.sign;
      } else {
        _rayPoint.copy(hit.point);
        _rayNormal.copy(hit.normal);
      }
      closest = {
        distance: hit.distance,
        point: _rayPoint.clone(),
        normal: _rayNormal.clone(),
        collider,
        object: collider.object || null,
        material: collider.material,
        penetrable: collider.penetrable,
      };
    }
    for (const [id, target] of this.dynamicTargets) {
      if (target.active === false) continue;
      const box = typeof target.getBounds === "function"
        ? target.getBounds(_expanded)
        : target.box;
      if (!box) continue;
      const hit = rayBox(origin, direction, box, maxDistance);
      if (!hit || (closest && hit.distance >= closest.distance)) continue;
      _rayPoint.copy(direction).multiplyScalar(hit.distance).add(origin);
      _rayNormal.set(0, 0, 0);
      _rayNormal[hit.axis] = hit.sign;
      closest = {
        distance: hit.distance,
        point: _rayPoint.clone(),
        normal: _rayNormal.clone(),
        target,
        id,
        object: target.object || null,
        material: target.material || "flesh",
        hitZone: typeof target.hitZoneAt === "function"
          ? target.hitZoneAt(_rayPoint)
          : "body",
      };
    }
    return closest;
  }

  lineOfSight(a, b) {
    const distance = _pointA.copy(b).sub(a).length();
    if (distance < 0.001) return true;
    const direction = _pointA.normalize();
    const hit = this.raycast(a, direction, Math.max(0, distance - 0.08));
    return !hit;
  }

  queryCover(origin, radius = 18) {
    const radiusSq = radius * radius;
    return this.coverPoints
      .filter((point) => point.position.distanceToSquared(origin) <= radiusSq)
      .sort((a, b) =>
        a.position.distanceToSquared(origin) - b.position.distanceToSquared(origin));
  }

  materialAt(point) {
    const origin = _pointA.copy(point);
    origin.y += 0.25;
    const hit = this.raycast(origin, _pointB.set(0, -1, 0), 1);
    return hit?.material || "asphalt";
  }

  clear() {
    this.staticColliders.length = 0;
    this.coverPoints.length = 0;
    this.dynamicTargets.clear();
  }

  dispose() {
    this.clear();
  }
}

export default PhysicsWorld;
