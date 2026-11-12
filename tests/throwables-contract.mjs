import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { THROWABLES, Throwables } from '../src/weapons/Throwables.js';

export function runThrowablesContract() {
  const physics = new PhysicsWorld();
  physics.addBox(new THREE.Vector3(0, -0.25, 0), new THREE.Vector3(100, 0.5, 100));
  physics.addBox(new THREE.Vector3(1.1, 1.5, -10.5), new THREE.Vector3(0.2, 3, 7));

  const scene = new THREE.Scene();
  const events = new EventBus();
  const deployments = [];
  const damage = [];
  events.on('throwable:deployed', (event) => deployments.push(event));
  const enemies = {
    snapshot: {
      enemies: [
        { id: 1, position: new THREE.Vector3(-2, 0, -10.3), alive: true },
        { id: 2, position: new THREE.Vector3(2.1, 0, -10.3), alive: true },
      ],
    },
    applyDamage(id, amount) {
      damage.push({ id, amount });
      return true;
    },
  };
  const player = {
    eyePosition: new THREE.Vector3(0, 1.7, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    alive: true,
  };
  const orbs = new Throwables({ scene, physics, events }, { enemies });
  const step = (frames) => {
    for (let index = 0; index < frames; index += 1) orbs.fixedUpdate(1 / 60);
  };
  try {
    assert.deepEqual(Object.keys(THROWABLES), ['pulse', 'haze', 'stasis']);
    assert.equal(orbs.throw('unknown', player), false);
    assert.equal(orbs.throw('pulse', player), true);
    step(81);
    assert.deepEqual(damage.map(({ id }) => id), [1], 'Pulse must spare NPCs behind a wall');
    assert.ok(damage[0].amount > 30 && damage[0].amount < 80);

    orbs.reset();
    assert.equal(orbs.throw('haze', player), true);
    step(99);
    const haze = orbs.snapshot.active.find(({ id }) => id === 'haze').position;
    const acrossHaze = (x) => haze.clone().add(new THREE.Vector3(x, 0.3, 0));
    assert.equal(orbs.blocksVision(acrossHaze(-8), acrossHaze(8)), true);
    assert.equal(orbs.blocksVision(acrossHaze(-8).setZ(haze.z + 6), acrossHaze(8).setZ(haze.z + 6)), false);
    step(360);
    assert.equal(orbs.blocksVision(acrossHaze(-8), acrossHaze(8)), false);

    assert.equal(orbs.throw('stasis', player), true);
    step(81);
    assert.equal(orbs.isStunned(1), true);
    assert.equal(orbs.isStunned(2), false);
    step(175);
    assert.equal(orbs.isStunned(1), false);

    const wallPlayer = { ...player, eyePosition: new THREE.Vector3(0, 1.7, -10.5), yaw: -Math.PI / 2 };
    assert.equal(orbs.throw('pulse', wallPlayer), true);
    step(80);
    assert.ok(deployments.at(-1).position.x < 1, 'Orb crossed a closed wall');

    orbs.reset();
    for (let count = 0; count < 4; count += 1) assert.equal(orbs.throw('haze', player), true);
    assert.equal(orbs.throw('haze', player), false);
    assert.equal(orbs.snapshot.active.length, 4);
    orbs.reset();
    assert.deepEqual(orbs.snapshot, { active: [], stunned: [] });
  } finally {
    orbs.dispose();
  }
  assert.equal(scene.children.length, 0);
  return { types: Object.keys(THROWABLES).length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = runThrowablesContract();
  process.stdout.write(`Verified ${result.types} orb types, cover, vision, expiry and cleanup.\n`);
}
