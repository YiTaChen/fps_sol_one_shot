import * as THREE from 'three';

export const LEG_DIMENSIONS = Object.freeze({
  hipHeight: 0.934,
  hipSpacing: 0.112,
  thigh: 0.447,
  shin: 0.424,
});

// Heel to toe. These same cross-sections set the contact height of the
// rotating outsole, so neither end sinks when the ankle rolls.
export const BOOT_SOLE_PROFILE = [
  [0.087, -0.061, 0.048, 0.013],
  [0.059, -0.063, 0.055, 0.016],
  [-0.049, -0.062, 0.049, 0.016],
  [-0.131, -0.064, 0.063, 0.015],
  [-0.197, -0.062, 0.061, 0.015],
  [-0.218, -0.053, 0.049, 0.011],
];

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const hipToFoot = new THREE.Vector3();
const kneeBend = new THREE.Vector3();
const thighDirection = new THREE.Vector3();
const shinDirection = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const hipsRotation = new THREE.Quaternion();
const bootRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const maxReach = LEG_DIMENSIONS.thigh + LEG_DIMENSIONS.shin - 0.001;

export function gaitRate(speed) {
  return 0.24 + Math.min(speed / 2.7, 1) * 1.99 + Math.max(0, speed - 2.7) * 0.095;
}

function plantedAnkleHeight(pitch) {
  const cosine = Math.cos(pitch);
  const sine = Math.sin(pitch);
  let height = 0;
  for (const [z, centerY, , halfHeight] of BOOT_SOLE_PROFILE) {
    height = Math.max(height, (halfHeight - centerY) * cosine + z * sine);
  }
  return height + 0.002;
}

export function poseSoldierLeg(leg, side, stride, motion, aim, hipHeight, hipSway, pose) {
  const { crouch, sliding, airborne, strafe, forward, speed, cadence, runWeight, heading } = pose;
  const phase = THREE.MathUtils.euclideanModulo(stride / (Math.PI * 2) + (side > 0 ? 0.5 : 0), 1);
  const stance = 0.61 - motion * 0.075 - runWeight * 0.25;
  const swing = Math.max(0, (phase - stance) / (1 - stance));
  // The stance foot's nominal backward speed matches the patrol's forward
  // motion. The eased swing returns the other foot without a snap.
  const reach = speed / cadence * stance * 0.5;
  const travel = phase < stance
    ? THREE.MathUtils.lerp(-reach, reach, phase / stance)
    : THREE.MathUtils.lerp(reach, -reach, THREE.MathUtils.smoothstep(swing, 0, 1));
  const lift = Math.sin(Math.PI * swing) ** 1.2 * motion * (0.116 - crouch * 0.053);
  const heelStrike = 1 - THREE.MathUtils.smoothstep(phase, 0, 0.115);
  const pushOff = THREE.MathUtils.smoothstep(phase, stance * 0.74, stance);
  const pitch = motion * forward * (phase < stance
    ? heelStrike * 0.13 - pushOff * 0.17
    : THREE.MathUtils.lerp(-0.17, 0.13, THREE.MathUtils.smoothstep(swing, 0, 1)));
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  const footLane = side * (0.134 + aim * 0.029 + motion * 0.012 + crouch * 0.025);
  const stagger = side * ((0.048 + aim * 0.061) * (1 - motion * 0.82) + airborne * 0.11)
    + sliding * (side < 0 ? -0.31 : -0.08);
  const footX = footLane * cosine + stagger * sine - strafe * travel;
  const footZ = -footLane * sine + stagger * cosine + forward * travel;
  const footY = plantedAnkleHeight(pitch) + lift + airborne * (side < 0 ? 0.18 : 0.08);
  const hipLane = side * LEG_DIMENSIONS.hipSpacing;
  const hip = leg.upperPivot.position.set(
    hipLane * cosine + hipSway, hipHeight, -hipLane * sine + side * aim * 0.018,
  );

  hipToFoot.set(footX - hip.x, footY - hip.y, footZ - hip.z);
  const horizontal = Math.hypot(hipToFoot.x, hipToFoot.z);
  const horizontalLimit = Math.sqrt(Math.max(0, maxReach ** 2 - hipToFoot.y ** 2));
  if (horizontal > horizontalLimit) {
    const compression = horizontalLimit / horizontal;
    hipToFoot.x *= compression;
    hipToFoot.z *= compression;
  }
  const length = hipToFoot.length();
  hipToFoot.divideScalar(length);

  const { thigh, shin } = LEG_DIMENSIONS;
  const along = (thigh ** 2 + length ** 2 - shin ** 2) / (2 * length);
  const bend = Math.sqrt(Math.max(0, thigh ** 2 - along ** 2));
  kneeBend.set(side * 0.16 * cosine - sine, 0, -side * 0.16 * sine - cosine);
  kneeBend.addScaledVector(hipToFoot, -kneeBend.dot(hipToFoot)).normalize();
  thighDirection.copy(hipToFoot).multiplyScalar(along).addScaledVector(kneeBend, bend);
  shinDirection.copy(hipToFoot).multiplyScalar(length).sub(thighDirection).normalize();

  hipsRotation.setFromAxisAngle(UP, heading);
  inverse.copy(hipsRotation).invert();
  leg.upperPivot.quaternion.setFromUnitVectors(DOWN, thighDirection.normalize().applyQuaternion(inverse));
  leg.upperPivot.quaternion.premultiply(hipsRotation);
  inverse.copy(leg.upperPivot.quaternion).invert();
  leg.knee.quaternion.setFromUnitVectors(DOWN, shinDirection.applyQuaternion(inverse));
  inverse.copy(leg.upperPivot.quaternion).multiply(leg.knee.quaternion).invert();
  bootRotation.set(pitch, heading - side * (0.12 + aim * 0.14), 0);
  leg.ankle.quaternion.setFromEuler(bootRotation).premultiply(inverse);
}
