import assert from 'node:assert/strict';
import { CREDIT_REWARDS, OPENING_CREDITS, OperationEconomy } from '../src/game/OperationEconomy.js';

export function runArmoryContract() {
  const items = [
    { id: 'default', slot: 'primary', price: 0 },
    { id: 'alternate', slot: 'primary', price: 200 },
    { id: 'expensive', slot: 'primary', price: 5000 },
    ...['one', 'two', 'three'].map((id) => ({ id, kind: 'throwable', price: 75, max: 2 })),
  ];
  const economy = new OperationEconomy(items, { primary: 'default' });

  assert.equal(economy.state.credits, OPENING_CREDITS);
  assert.equal(economy.buy('expensive'), false);
  assert.equal(economy.buy('invalid'), false);
  assert.equal(economy.buy('alternate'), true);
  assert.equal(economy.state.credits, 1200);
  assert.equal(economy.buy('default'), true);
  assert.equal(economy.buy('alternate'), true);
  assert.equal(economy.state.credits, 1200, 'Already owned equipment was charged twice');

  for (const id of ['one', 'one', 'two', 'two']) assert.equal(economy.buy(id), true);
  assert.equal(economy.buy('one'), false, 'Individual pouch cap was bypassed');
  assert.equal(economy.buy('three'), false, 'Total pouch cap was bypassed');
  economy.saveCheckpoint();
  assert.equal(economy.use('one'), true);
  assert.equal(economy.reward(CREDIT_REWARDS.relay), 250);
  assert.equal(economy.buy('three'), true);
  economy.retry();
  assert.equal(economy.state.earned, 0);
  assert.equal(economy.state.credits, 900);
  assert.deepEqual(economy.snapshot().supplies, { one: 2, two: 2 });
  const external = economy.snapshot();
  external.equipped.primary = 'unknown';
  external.owned.push('unknown');
  assert.equal(economy.state.equipped.primary, 'alternate');
  assert(!economy.state.owned.includes('unknown'));
  return { openingCredits: OPENING_CREDITS };
}

export async function runBrowserArmoryContract(page) {
  const show = (name) => page.locator(`[data-screen="${name}"]`);
  const state = () => page.evaluate(() => window.__FPS_TEST__.state());
  await page.evaluate(() => window.__CINDERLINE__.events.emit('game:menu'));
  await show('start').locator('[data-action="armory-deploy"]').click();
  assert.equal((await state()).phase, 'armory');
  assert.equal((await state()).economy.credits, 1400);
  assert(await show('armory').locator('[data-buy="reserve-case"]').isDisabled());

  for (const id of ['precision', 'pulse', 'haze', 'stasis']) {
    await show('armory').locator(`[data-buy="${id}"]`).click();
  }
  assert(await show('armory').locator('[data-buy="heavy-sidearm"]').isDisabled());
  await show('armory').locator('[data-action="armory-close"]').click();
  const first = await state();
  assert.equal(first.phase, 'playing');
  assert.equal(first.economy.credits, 10);
  assert.deepEqual(first.economy.supplies, { pulse: 1, haze: 1, stasis: 1 });

  const combat = await page.evaluate(async () => {
    const api = window.__FPS_TEST__;
    const game = window.__CINDERLINE__;
    const key = async (record, frames) => {
      api.setInput(record);
      await api.step(frames);
      api.setInput({});
      await api.step(1);
    };
    await api.step(35);
    api.setInput({ ads: true });
    await api.step(35);
    const aim = { weapon: api.snapshot().weapon, fov: game.rendering.camera.fov };
    await key({ ads: true, fire: true }, 95);
    const precisionAmmo = api.snapshot().weapon.magazine;
    await key({ Digit2: true }, 25);
    await key({ fire: true }, 30);
    const sidearm = api.snapshot().weapon;
    await key({ KeyR: true }, 78);
    await key({ Digit1: true }, 28);
    const preservedAmmo = api.snapshot().weapon.magazine;
    await key({ Digit3: true }, 22);
    let meleeEvents = 0;
    const off = game.events.on('weapon:melee', () => { meleeEvents += 1; });
    const enemy = game.enemies.enemies[0];
    game.enemies.paused = true;
    const victim = enemy.rig.root.position;
    const player = game.player.position;
    victim.copy(player);
    victim.x -= Math.sin(game.player.yaw) * 1.25;
    victim.z -= Math.cos(game.player.yaw) * 1.25;
    victim.y = 0.02;
    enemy.groundY = 0.02;
    await key({ fire: true }, 25);
    off();
    const closeHit = enemy.health < 100;
    await key({ KeyB: true }, 1);
    const blockedWhileThreatened = api.state().phase === 'playing';
    game.enemies.paused = false;
    await key({ Digit5: true, KeyT: true }, 1);
    const thrown = api.snapshot();
    const [rewardTarget] = thrown.enemies.filter((entry) => entry.alive);
    await api.killEnemy(rewardTarget.id);
    const rewarded = api.state().economy;
    const nextTarget = api.snapshot().enemies.find((entry) => entry.alive);
    await api.killEnemy(nextTarget.id);
    await key({ KeyB: true }, 1);
    const safeLockerReopened = api.state().phase === 'armory';
    return { aim, precisionAmmo, sidearm, preservedAmmo, meleeEvents, closeHit, thrown, rewarded, blockedWhileThreatened, safeLockerReopened };
  });

  assert.equal(combat.aim.weapon.id, 'precision');
  assert(combat.aim.weapon.scoped && combat.aim.fov < 32, 'Precision scope did not zoom');
  assert.equal(combat.precisionAmmo, 4, 'Holding precision fire produced more than one shot');
  assert.equal(combat.sidearm.id, 'sidearm');
  assert.equal(combat.sidearm.magazine, 11, 'Sidearm trigger did not fire one shot');
  assert.equal(combat.preservedAmmo, 4, 'Weapon switching refilled a magazine');
  assert.equal(combat.meleeEvents, 1, 'Melee input did not perform a swing');
  assert(combat.closeHit, 'Melee did not hit an unobstructed nearby opponent');
  assert(combat.blockedWhileThreatened && combat.safeLockerReopened,
    'The locker failed to enforce or release its nearby-threat restriction');
  assert.equal(combat.thrown.state.economy.supplies.haze, 0);
  assert(combat.thrown.throwables.active.some((item) => item.id === 'haze' && item.phase === 'flight'),
    'Purchased utility was consumed without a live throw');
  assert.equal(combat.rewarded.credits, 135);
  await show('armory').locator('[data-buy="reserve-case"]').click();
  assert(await show('armory').locator('[data-buy="reserve-case"]').isDisabled());
  assert.equal(await page.evaluate(() => window.__CINDERLINE__.weaponInstances.get('sidearm').reserve), 48);
  assert.equal((await state()).economy.credits, 80);
  await page.evaluate(() => window.__FPS_TEST__.restart());
  const retry = (await state()).economy;
  assert.equal(retry.credits, 10, 'Retry duplicated credits');
  assert.equal(retry.supplies.haze, 1, 'Retry did not restore the opening pouch');
  assert.equal(retry.equipped.primary, 'precision');
  await page.evaluate(() => window.__CINDERLINE__.events.emit('game:menu'));
}
