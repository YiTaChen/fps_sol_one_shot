import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { RngService } from '../src/core/Rng.js';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { WorldBuilder } from '../src/world/WorldBuilder.js';

const STANDING_CAPSULE = {
  radius: 0.34,
  height: 1.78,
  maxStepHeight: 0.44,
  canStep: true,
};

function walkTo(physics, position, x, z) {
  const destination = new THREE.Vector3(x, 0, z);
  const movement = new THREE.Vector3();
  const maxSteps = Math.ceil(position.distanceTo(destination) / 0.085) + 60;
  for (let step = 0; step < maxSteps; step += 1) {
    movement.subVectors(destination, position).setY(0).clampLength(0, 0.085);
    movement.y = -0.09;
    physics.moveCapsule(position, movement, STANDING_CAPSULE);
    if (Math.hypot(position.x - x, position.z - z) < 0.015) {
      assert.ok(position.y >= -0.01 && position.y < 0.5, 'Route left walkable ground');
      return;
    }
  }
  assert.fail(`Route to (${x}, ${z}) was blocked at (${position.x.toFixed(2)}, ${position.z.toFixed(2)})`);
}

function checkRoute(seed) {
  const physics = new PhysicsWorld();
  const world = new WorldBuilder({ textureSize: 64 }).build({
    scene: new THREE.Scene(),
    assets: { exchangeAsset: true },
    physics,
    rng: new RngService(seed),
    state: { seed },
  });

  try {
    assert.deepEqual(world.route.map(({ id }) => id), ['arcade', 'service', 'kiln']);
    assert.equal(world.extraction.id, 'extraction');
    const objectives = [...world.route, world.extraction];
    const position = world.relaySpawn.position.clone();
    const routes = [
      [[-43.15, -0.5], [-43.15, -11.2], [-41.25, -13.4]],
      [[-41.25, -22.5], [-41.25, -29.1], [9.2, -29.1], [11.5, -30.55], [18, -30.55]],
      [[18, -30.55], [39.4, -30.55], [39.4, -26.3], [38.8, -25.8], [38.8, -14.7], [36, -10.2]],
      [[36, -8.7], [37.52, -8], [37.52, 0.8], [-17.55, 0.8], [-17.55, 7.4], [-19.5, 8.8]],
    ];

    for (const [index, objective] of objectives.entries()) {
      for (const [x, z] of routes[index]) walkTo(physics, position, x, z);
      walkTo(physics, position, objective.position.x, objective.position.z);
    }

    const isClosed = (building) => physics.staticColliders.some(({ id }) => id === `power-shutter:${building}`);
    assert.equal(isClosed('saffron-arcade'), true);
    assert.equal(isClosed('kiln-house'), true);
    const arcadePower = world.setPowerStage(1);
    assert.equal(isClosed('saffron-arcade'), false);
    assert.equal(isClosed('kiln-house'), true);
    walkTo(physics, arcadePower.alertPosition, -33.2, -18.4);
    const kilnPower = world.setPowerStage(2);
    assert.equal(isClosed('kiln-house'), false);
    walkTo(physics, kilnPower.alertPosition, 25.65, -11.25);
    assert.equal(world.setPowerStage(3).label, 'Cross Street extraction beacon');
    world.setPowerStage(0);
    assert.equal(isClosed('saffron-arcade'), true);
    assert.equal(isClosed('kiln-house'), true);

    return objectives.length;
  } finally {
    world.dispose();
  }
}

export function runDistrictRouteContract() {
  // The shipped URL and browser capture fixtures use different base seeds.
  const seeds = [20364033, 0x0c1de71e];
  return { locations: Math.min(...seeds.map(checkRoute)), seeds: seeds.length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = runDistrictRouteContract();
  process.stdout.write(`Traversed ${result.locations} route locations across ${result.seeds} seeds.\n`);
}
