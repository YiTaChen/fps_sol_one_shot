import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { Rifle, WEAPON_DEFINITIONS } from '../src/weapons/index.js';

const STEP = 1 / 60;

function tick(weapon, count) {
  for (let frame = 0; frame < count; frame += 1) {
    weapon.fixedUpdate(STEP);
    weapon.update(STEP);
  }
}

function makeWeapon(id, raycast = () => null) {
  const context = {
    scene: new THREE.Scene(),
    viewScene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    events: new EventBus(),
    physics: { raycast },
    state: { phase: 'playing' },
    input: {
      fire: false,
      aim: false,
      buttonDown(button) { return button === 0 ? this.fire : this.aim; },
    },
  };
  return { context, weapon: new Rifle(context, WEAPON_DEFINITIONS[id]) };
}

function meleeContact(direction) {
  return {
    distance: 1.35,
    target: { enemyId: 5 },
    point: new THREE.Vector3(0, 0, -1.35),
    normal: direction.clone().negate(),
    material: 'flesh',
    hitZone: 'head',
  };
}

export function runArsenalContract() {
  const defaultWeapon = new Rifle();
  const smg = makeWeapon('smg');
  const pistol = makeWeapon('sidearm');
  const precision = makeWeapon('precision');
  const melee = makeWeapon('melee', (_origin, direction, range) =>
    range >= 1.35 ? meleeContact(direction) : null);

  try {
    assert.equal(defaultWeapon.snapshot.id, 'vesper');
    assert.equal(defaultWeapon.snapshot.magazine, 30);

    smg.context.input.fire = true;
    tick(smg.weapon, 40);
    assert.ok(smg.weapon.magazine < 29, 'Automatic fire did not repeat while held');

    pistol.context.input.fire = true;
    tick(pistol.weapon, 60);
    assert.equal(pistol.weapon.magazine, 11, 'Semi-automatic fire repeated while held');
    pistol.context.input.fire = false;
    tick(pistol.weapon, 1);
    pistol.weapon.triggerDown();
    pistol.weapon.triggerUp();
    tick(pistol.weapon, 1);
    assert.equal(pistol.weapon.magazine, 10, 'A second edge did not fire');
    assert.ok(pistol.weapon.requestReload());
    tick(pistol.weapon, 4);
    pistol.weapon.holster();
    assert.equal(pistol.weapon.magazine, 10, 'Switching early during reload changed ammo');
    assert.equal(pistol.weapon.snapshot.reloading, false);
    assert.equal(pistol.weapon.root.visible, false);
    pistol.weapon.equip();
    assert.equal(pistol.weapon.snapshot.action, 'draw');

    precision.context.input.aim = true;
    tick(precision.weapon, 30);
    assert.equal(precision.weapon.snapshot.scoped, true);
    assert.equal(precision.weapon.root.visible, false);
    precision.context.input.fire = true;
    tick(precision.weapon, 15);
    assert.equal(precision.weapon.snapshot.action, 'bolt');
    assert.equal(precision.weapon.snapshot.scoped, false);
    assert.equal(precision.weapon.root.visible, true);
    tick(precision.weapon, 65);
    assert.equal(precision.weapon.magazine, 4, 'Holding fire repeated during the precision cycle');
    assert.equal(precision.weapon.snapshot.scoped, true, 'Precision aim did not recover');

    const impacts = [];
    let swings = 0;
    melee.context.events.on('projectile:impact', (event) => impacts.push(event));
    melee.context.events.on('weapon:melee', () => { swings += 1; });
    assert.equal(melee.weapon.requestReload(), false);
    melee.context.input.fire = true;
    tick(melee.weapon, 5);
    assert.equal(impacts.length, 0, 'Melee hit before the windup');
    tick(melee.weapon, 60);
    assert.equal(swings, 1);
    assert.equal(impacts.length, 1, 'Melee swing did not resolve exactly one contact');
    assert.equal(impacts[0].enemyId, 5);
    assert.equal(impacts[0].damage, WEAPON_DEFINITIONS.melee.damage);
    assert.equal(impacts[0].headshot, false);
    assert.equal(impacts[0].kind, 'melee');
    assert.equal(melee.weapon.projectiles.activeCount, 0, 'Melee spawned a persistent projectile');

    melee.context.physics.raycast = (origin, direction, range) => {
      assert.equal(range, WEAPON_DEFINITIONS.melee.meleeReach);
      return {
        distance: 0.8, point: origin.clone().addScaledVector(direction, 0.8),
        normal: direction.clone().negate(), material: 'glass',
      };
    };
    melee.context.input.fire = false;
    tick(melee.weapon, 1);
    melee.context.input.fire = true;
    tick(melee.weapon, 15);
    assert.equal(impacts.length, 2, 'Melee resolved more than one surface impact');
    assert.equal(impacts[1].penetrated, false, 'Melee penetrated an intervening surface');

    const distinctBounds = new Set();
    for (const id of Object.keys(WEAPON_DEFINITIONS)) {
      const { weapon } = makeWeapon(id);
      weapon.root.updateMatrixWorld();
      const size = new THREE.Box3().setFromObject(weapon.root).getSize(new THREE.Vector3());
      distinctBounds.add(size.toArray().map((value) => value.toFixed(3)).join(','));
      weapon.dispose();
    }
    assert.equal(distinctBounds.size, Object.keys(WEAPON_DEFINITIONS).length);
    return { models: distinctBounds.size };
  } finally {
    for (const weapon of [defaultWeapon, smg.weapon, pistol.weapon, precision.weapon, melee.weapon]) {
      weapon.dispose();
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = runArsenalContract();
  process.stdout.write(`Verified fire, reload, scope, melee and ${result.models} distinct viewmodels.\n`);
}
