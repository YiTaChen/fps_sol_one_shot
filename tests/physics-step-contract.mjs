import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { PlayerController } from '../src/player/PlayerController.js';

const CAPSULE = Object.freeze({
  radius: 0.34,
  height: 1.78,
  maxStepHeight: 0.44,
  canStep: true,
});

function addBox(world, id, min, max) {
  world.addStatic({
    id,
    min: new THREE.Vector3(...min),
    max: new THREE.Vector3(...max),
  });
}

function createWorld() {
  const world = new PhysicsWorld();
  addBox(world, 'ground', [-10, -1, -10], [10, 0, 10]);
  return world;
}

function move(world, start, delta, capsule = CAPSULE) {
  const position = new THREE.Vector3(...start);
  const result = world.moveCapsule(position, new THREE.Vector3(...delta), capsule);
  return { position, result };
}

function near(actual, expected, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function controllerMove(world, start, delta, canStep = true) {
  const controller = new PlayerController({
    physics: world,
    input: null,
    events: null,
    camera: null,
  });
  controller.teleport(new THREE.Vector3(...start), 0);
  controller.capsule.canStep = canStep;
  const movement = new THREE.Vector3(...delta);
  const result = controller._moveCapsule(movement);
  return { controller, movement, result };
}

export function runPhysicsStepContract() {
{
  const world = createWorld();
  addBox(world, 'tall-wall', [1, 0, -2], [2, 5, 2]);
  const { position, result } = move(world, [0.6, 0.0025, 0], [0.1, -0.01, 0]);

  near(position.y, 0);
  near(position.z, 0);
  assert.ok(position.x < 0.66, `tall wall did not block x movement (${position.x})`);
  assert.equal(result.grounded, true);
}

{
  const world = createWorld();
  addBox(world, 'tall-corner', [1, 0, 1], [2, 5, 2]);
  const { position, result } = move(
    world,
    [0.6, 0.0025, 0.6],
    [0.1, -0.01, 0.1],
  );

  near(position.y, 0);
  assert.ok(position.z < 0.66, `diagonal corner did not block z movement (${position.z})`);
  assert.ok(position.y < 0.01, `diagonal corner lifted player to ${position.y}`);
  assert.equal(result.grounded, true);
}

{
  const world = createWorld();
  addBox(world, 'low-step', [1, 0, -1], [2, 0.42, 1]);
  const { position, result } = move(world, [0.6, 0.0025, 0], [0.1, -0.01, 0]);

  near(position.y, 0.42);
  near(position.x, 0.7);
  assert.equal(result.grounded, true);
  assert.ok(
    result.collisions.some((collision) => collision.axis === 'step'),
    '0.42m obstacle did not use the safe step-up path',
  );
}

{
  const world = createWorld();
  addBox(world, 'high-step', [1, 0, -1], [2, 0.46, 1]);
  const { position, result } = move(world, [0.6, 0.0025, 0], [0.1, -0.01, 0]);

  near(position.y, 0);
  assert.ok(position.x < 0.66, `0.46m obstacle did not block movement (${position.x})`);
  assert.equal(
    result.collisions.some((collision) => collision.axis === 'step'),
    false,
  );
}

{
  const world = createWorld();
  addBox(world, 'low-step', [1, 0, -1], [2, 0.42, 1]);
  addBox(world, 'low-ceiling', [0.5, 1.6, -1.5], [2.5, 1.8, 1.5]);
  const { position } = move(world, [0.6, 0.0025, 0], [0.1, -0.01, 0]);

  near(position.y, 0);
  assert.ok(position.x < 0.66, 'step-up ignored blocked capsule clearance');
}

{
  const world = createWorld();
  addBox(world, 'controller-low-step', [1, 0, -1], [2, 0.42, 1]);
  const { controller, result } = controllerMove(
    world,
    [0.6, 0.0025, 0],
    [0.1, -0.01, 0],
  );

  near(controller.position.y, 0.4225);
  near(controller.position.x, 0.7);
  assert.equal(result.grounded, true);
}

{
  const world = createWorld();
  addBox(world, 'controller-high-step', [1, 0, -1], [2, 0.46, 1]);
  const { controller, result } = controllerMove(
    world,
    [0.6, 0.0025, 0],
    [0.1, -0.01, 0],
  );

  near(controller.position.y, 0.0025);
  assert.ok(controller.position.x < 0.66);
  assert.equal(
    result.collisions.some((collision) => collision.axis === 'step'),
    false,
  );
}

{
  const world = createWorld();
  addBox(world, 'airborne-low-step', [1, 0, -1], [2, 0.42, 1]);
  const airborneCapsule = { ...CAPSULE, canStep: false };
  const { position, result } = move(
    world,
    [0.6, 0.0025, 0],
    [0.1, 0.1, 0],
    airborneCapsule,
  );

  near(position.y, 0.1025);
  assert.ok(position.x < 0.66, 'airborne capsule incorrectly used step-up');
  assert.equal(
    result.collisions.some((collision) => collision.axis === 'step'),
    false,
  );
}

{
  const world = createWorld();
  addBox(world, 'landing-platform', [1, 0, -1], [2, 0.42, 1]);
  const { position, result } = move(world, [1.5, 0.5, 0], [0, -0.1, 0]);

  near(position.y, 0.42);
  assert.equal(result.grounded, true);
}

{
  const world = createWorld();
  addBox(world, 'ceiling', [-1, 2, -1], [1, 2.2, 1]);
  const { position, result } = move(world, [0, 0.1, 0], [0, 0.2, 0]);

  near(position.y, 0.22);
  assert.ok(
    result.collisions.some((collision) =>
      collision.axis === 'y' && collision.normal.y === -1),
    'upward movement did not resolve against the crossed ceiling plane',
  );
}

  return { checks: 10, maxStepHeight: CAPSULE.maxStepHeight };
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const result = runPhysicsStepContract();
  console.log(`physics step contract passed: ${JSON.stringify(result)}`);
}
