import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const MIN_CLEARANCE = 0.92;

/** Calculates a presentation camera while the eye camera still drives aiming. */
export class ShoulderCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.eye = new THREE.Vector3();
    this.eyeRotation = new THREE.Quaternion();
    this.aim = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.active = false;
  }

  prepare(player) {
    const { camera } = this;
    this.eye.copy(camera.position);
    this.eyeRotation.copy(camera.quaternion);
    camera.getWorldDirection(this.aim);
    const aimHit = this.physics.raycast(this.eye, this.aim, 100);
    this.target.copy(this.eye).addScaledVector(this.aim, Math.max(0.65, aimHit?.distance ?? 100));

    this.offset.set(1.25, 0.22, 2.85).applyAxisAngle(UP, player.yaw);
    const idealDistance = this.offset.length();
    this.offset.multiplyScalar(1 / idealDistance);
    let clearance = idealDistance;
    for (const height of [0, 0.13, -0.13]) {
      this.rayOrigin.copy(this.eye).addScaledVector(UP, height);
      const hit = this.physics.raycast(this.rayOrigin, this.offset, idealDistance + 0.15);
      if (hit) clearance = Math.min(clearance, hit.distance - 0.18);
    }
    this.active = clearance >= MIN_CLEARANCE;
    if (!this.active) return false;
    camera.position.addScaledVector(this.offset, clearance);
    camera.lookAt(this.target);
    camera.updateMatrixWorld();
    return true;
  }

  restore() {
    this.camera.position.copy(this.eye);
    this.camera.quaternion.copy(this.eyeRotation);
    this.camera.updateMatrixWorld();
  }
}
