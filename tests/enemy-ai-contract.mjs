import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { EventBus, RngService } from "../src/core/index.js";
import {
  ENEMY_REACTION_MAX,
  ENEMY_REACTION_MIN,
  ENEMY_VISION_HALF_ANGLE_DEGREES,
  EnemyDirector,
  EnemyState,
} from "../src/enemies/EnemyDirector.js";
import { PhysicsWorld } from "../src/physics/PhysicsWorld.js";

const STEP = 1 / 60;
const UP = new THREE.Vector3(0, 1, 0);

function createHarness(seed = 0x51a17e) {
  const scene = new THREE.Scene();
  const events = new EventBus();
  const physics = new PhysicsWorld();
  physics.addStatic({
    id: "contract-ground",
    min: new THREE.Vector3(-50, -1, -50),
    max: new THREE.Vector3(50, 0, 50),
    material: "concrete",
  });
  const player = {
    position: new THREE.Vector3(-44, 0.02, 1.2),
    eyePosition: new THREE.Vector3(-44, 1.68, 1.2),
    velocity: new THREE.Vector3(),
    damageEvents: 0,
    damageTotal: 0,
    applyDamage(amount) {
      this.damageEvents += 1;
      this.damageTotal += Number(amount) || 0;
      return true;
    },
  };
  player.snapshot = {
    position: player.position,
    eyePosition: player.eyePosition,
    velocity: player.velocity,
    health: 100,
    alive: true,
    crouched: false,
    eyeHeight: 1.66,
  };
  const state = {
    phase: "playing",
    seed,
    player: player.snapshot,
    playerSnapshot: player.snapshot,
  };
  const director = new EnemyDirector({
    player,
    count: 1,
    activeLimit: 1,
  });
  director.init({
    scene,
    events,
    physics,
    rng: new RngService(seed),
    state,
  });
  return { director, events, physics, player, scene, state };
}

function placePlayer(player, angleDegrees, distance = 14) {
  const angle = THREE.MathUtils.degToRad(angleDegrees);
  player.position.set(
    Math.sin(angle) * distance,
    0.02,
    -Math.cos(angle) * distance,
  );
  player.eyePosition.copy(player.position).addScaledVector(UP, 1.66);
}

function resetEnemy(enemy) {
  enemy.rig.root.position.set(0, 0.015, 0);
  enemy.rig.root.rotation.set(0, 0, 0);
  enemy.rig.setGround(0.015);
  enemy.groundY = 0.015;
  enemy.alive = true;
  enemy.despawned = false;
  enemy.rig.root.visible = true;
  enemy.health = 100;
  enemy.state = EnemyState.IDLE;
  enemy.previousState = EnemyState.IDLE;
  enemy.stateTime = 0;
  enemy.alerted = false;
  enemy.canSeePlayer = false;
  enemy.detection = 0;
  enemy.lastSeenTime = -100;
  enemy.lastHeardTime = -100;
  enemy.reactionTimer = 0;
  enemy.reactionDuration = 0;
  enemy.aimSettleTimer = 0.2;
  enemy.aimPoint.set(0, 1.55, -14);
  enemy.aimVelocity.set(0, 0, 0);
  enemy.aimAlignment = 1;
  enemy.shotsFired = 0;
  enemy.burstShotIndex = 0;
  enemy.burstRemaining = 0;
  enemy.shotTimer = 0;
  enemy.magazine = 30;
  enemy.deathTime = 0;
}

function stepDirector(director, frames, present = false) {
  for (let frame = 0; frame < frames; frame += 1) {
    director.fixedUpdate(STEP);
    if (present) director.update(STEP);
  }
}

export function runEnemyAiContract() {
  const harness = createHarness();
  const { director, events, player } = harness;
  const enemy = director.enemies[0];

  resetEnemy(enemy);
  for (const angle of [-34, 34]) {
    placePlayer(player, angle);
    director._resolvePlayer();
    director._updatePerception(enemy, enemy.perceptionInterval);
    assert.equal(
      enemy.canSeePlayer,
      true,
      `player at ${angle}° should be inside the vision cone`,
    );
    enemy.detection = 0;
  }
  for (const angle of [-36, 36, 180]) {
    placePlayer(player, angle);
    director._resolvePlayer();
    director._updatePerception(enemy, enemy.perceptionInterval);
    assert.equal(
      enemy.canSeePlayer,
      false,
      `player at ${angle}° should be outside the vision cone`,
    );
    enemy.detection = 0;
  }
  assert.equal(ENEMY_VISION_HALF_ANGLE_DEGREES, 35);

  resetEnemy(enemy);
  placePlayer(player, 0, 16);
  let alertGuard = 0;
  while (!enemy.alerted && alertGuard < 90) {
    stepDirector(director, 1);
    alertGuard += 1;
  }
  assert.equal(enemy.alerted, true, "front-facing player was never detected");
  assert.ok(
    enemy.reactionDuration >= ENEMY_REACTION_MIN
      && enemy.reactionDuration <= ENEMY_REACTION_MAX,
    `reaction ${enemy.reactionDuration}s was outside the 2–4s contract`,
  );
  const measuredReaction = enemy.reactionDuration;
  const shotsAtAlert = enemy.shotsFired;
  stepDirector(
    director,
    Math.max(1, Math.floor((enemy.reactionDuration - 0.08) / STEP)),
  );
  assert.equal(
    enemy.shotsFired,
    shotsAtAlert,
    "enemy fired before its reaction window elapsed",
  );
  stepDirector(director, Math.ceil(1.2 / STEP));
  assert.ok(enemy.shotsFired > shotsAtAlert, "enemy never attacked after reacting");

  resetEnemy(enemy);
  placePlayer(player, 0, 14);
  director._resolvePlayer();
  enemy.alerted = true;
  enemy.canSeePlayer = true;
  enemy.aimPoint.copy(player.eyePosition);
  const oldAimX = enemy.aimPoint.x;
  player.position.x += 8;
  player.eyePosition.x += 8;
  director._resolvePlayer();
  director._updateAimTracking(enemy, STEP);
  assert.ok(
    enemy.aimPoint.x > oldAimX && enemy.aimPoint.x < player.eyePosition.x - 1,
    "aim point snapped directly to a strafing player",
  );
  const firstLag = enemy.aimPoint.distanceTo(player.eyePosition);
  for (let frame = 0; frame < 120; frame += 1) {
    director._updateAimTracking(enemy, STEP);
  }
  assert.ok(
    enemy.aimPoint.distanceTo(player.eyePosition) < firstLag * 0.25,
    "aim tracking did not converge gradually",
  );

  resetEnemy(enemy);
  placePlayer(player, 0, 18);
  director._resolvePlayer();
  enemy.alerted = true;
  enemy.canSeePlayer = true;
  enemy.accuracy = 0.58;
  enemy.aimPoint.copy(player.eyePosition);
  enemy.rig.root.updateMatrixWorld(true);
  let hits = 0;
  let shots = 0;
  const stopListening = events.on("projectile:spawn", (event) => {
    if (event?.kind !== "enemy") return;
    shots += 1;
    if (event.clearShot) hits += 1;
  });
  for (let shot = 0; shot < 240; shot += 1) {
    enemy.burstShotIndex = shot % 4;
    director._fire(enemy);
  }
  stopListening();
  assert.equal(shots, 240);
  assert.ok(
    hits > 15 && hits < shots - 15,
    `enemy spread must produce both hits and misses (hits=${hits}/${shots})`,
  );

  director.applyDamage(enemy.id, 1000, "torso", new THREE.Vector3(0, 0, -1));
  stepDirector(director, Math.ceil(1.35 / STEP), true);
  const fallenUp = UP.clone().applyQuaternion(enemy.rig.bodyRoot.quaternion);
  assert.ok(
    Math.abs(fallenUp.y) < 0.15,
    `corpse remained upright after the fall animation (up.y=${fallenUp.y})`,
  );
  assert.equal(enemy.rig.root.visible, true, "corpse disappeared before its linger time");
  stepDirector(director, Math.ceil(7 / STEP), true);
  assert.equal(enemy.despawned, true, "corpse did not despawn after its linger time");
  assert.equal(enemy.rig.root.visible, false, "despawned corpse remained visible");

  director.dispose();
  return {
    coneDegrees: ENEMY_VISION_HALF_ANGLE_DEGREES,
    reactionSeconds: measuredReaction,
    spreadHits: hits,
    spreadShots: shots,
    corpseDespawned: enemy.despawned,
  };
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const result = runEnemyAiContract();
  console.log(`enemy AI contract passed: ${JSON.stringify(result)}`);
}
