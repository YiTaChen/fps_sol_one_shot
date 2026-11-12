import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assert,
  assertNoPageErrors,
  attachDiagnostics,
  distance3,
  ensureServer,
  launchBrowser,
  openGame,
  readTestCapabilities,
} from './lib/browserHarness.mjs';
import { missingMethods } from '../tests/test-contract.mjs';
import { assertRestartSnapshot } from '../tests/restart-contract.mjs';
import { runEnemyAiContract } from '../tests/enemy-ai-contract.mjs';
import { runPhysicsStepContract } from '../tests/physics-step-contract.mjs';
import { runProgressionContract } from '../tests/progression-contract.mjs';
import { runRelayAndInputContract } from '../tests/relay-and-input-contract.mjs';
import { runDistrictRouteContract } from '../tests/district-route-contract.mjs';

const results = [];
const startedAt = performance.now();

function pass(name, detail = '') {
  results.push({ name, status: 'passed', detail });
  process.stdout.write(`✓ ${name}${detail ? ` — ${detail}` : ''}\n`);
}

async function main() {
  const physicsContract = runPhysicsStepContract();
  pass('physics step contract', `${physicsContract.checks} collision cases`);
  const districtRoute = runDistrictRouteContract();
  pass('district route contract', `${districtRoute.locations} reachable objective locations across ${districtRoute.seeds} seeds`);
  const enemyAiContract = runEnemyAiContract();
  pass(
    'enemy AI contract',
    `±${enemyAiContract.coneDegrees}°, ${enemyAiContract.reactionSeconds.toFixed(2)}s reaction, ${enemyAiContract.spreadHits}/${enemyAiContract.spreadShots} hits`,
  );
  const progressionContract = runProgressionContract();
  pass(
    'local progression contract',
    `validated through operation ${progressionContract.maximumLevel}`,
  );
  const server = await ensureServer();
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const diagnostics = attachDiagnostics(page);
    await openGame(page, server.baseURL, {
      seed: 0x0c1de71e,
      quality: 'medium',
    });
    pass('game boot', 'test interface reported ready');

    const capabilities = await readTestCapabilities(page);
    const missing = missingMethods(capabilities);
    assert(
      missing.length === 0,
      `window.__FPS_TEST__ is missing required methods: ${missing.join(', ')}`,
    );
    pass('test contract', `version ${capabilities.version ?? 'unversioned'}`);

    const initial = await page.evaluate(() => window.__FPS_TEST__.snapshot());
    const initialEnemies = initial?.enemies ?? initial?.enemy?.enemies ?? [];
    assert(Array.isArray(initialEnemies) && initialEnemies.length >= 6, 'Expected at least six enemies');
    assert(
      initialEnemies.filter((enemy) => enemy.alive !== false).length >= 6,
      'Expected at least six living enemies at match initialization',
    );
    pass('enemy population', `${initialEnemies.length} procedural soldiers`);

    await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.start();
      await api.step(3);
    });
    let state = await page.evaluate(() => window.__FPS_TEST__.state());
    assert(String(state.phase).toLowerCase() === 'playing', 'Start did not enter playing phase');
    pass('start state');

    const positionBeforeMove = await page.evaluate(() => {
      const snapshot = window.__FPS_TEST__.snapshot();
      return snapshot.player?.position ?? snapshot.camera?.position;
    });
    await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      api.setInput({ KeyW: true, ShiftLeft: true });
      await api.step(75);
      api.setInput({ KeyW: false, ShiftLeft: false });
      await api.step(2);
    });
    const positionAfterMove = await page.evaluate(() => {
      const snapshot = window.__FPS_TEST__.snapshot();
      return snapshot.player?.position ?? snapshot.camera?.position;
    });
    const movementDistance = distance3(positionBeforeMove, positionAfterMove);
    assert(movementDistance > 0.6, `Synthetic movement advanced only ${movementDistance.toFixed(3)}m`);
    assert(
      Number.isFinite(positionAfterMove?.y) && positionAfterMove.y > -0.5,
      `Player left the walkable world during movement (y=${positionAfterMove?.y})`,
    );
    pass('deterministic movement', `${movementDistance.toFixed(2)} m`);

    const locomotion = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;

      api.setInput({ Space: true });
      await api.step(1);
      const jump = api.snapshot().player;
      api.setInput({});
      await api.step(45);

      api.setInput({ ControlLeft: true });
      await api.step(4);
      const crouch = api.snapshot().player;
      api.setInput({});
      await api.step(10);

      api.setInput({ KeyQ: true });
      await api.step(12);
      const leanLeft = api.snapshot().player.lean;
      api.setInput({ KeyE: true });
      await api.step(12);
      const leanRight = api.snapshot().player.lean;
      api.setInput({});
      await api.step(4);

      api.setInput({ KeyW: true, ShiftLeft: true });
      await api.step(42);
      api.setInput({ KeyW: true, ShiftLeft: true, ControlLeft: true });
      await api.step(2);
      const slide = api.snapshot().player;
      api.setInput({});
      await api.step(4);

      return { jump, crouch, leanLeft, leanRight, slide };
    });
    assert(
      locomotion.jump.grounded === false && locomotion.jump.velocity.y > 0,
      'Jump did not produce an airborne upward state',
    );
    assert(locomotion.crouch.crouched === true, 'Crouch input did not lower the stance');
    assert(locomotion.leanLeft < -0.03, `Left lean was only ${locomotion.leanLeft}`);
    assert(locomotion.leanRight > 0.03, `Right lean was only ${locomotion.leanRight}`);
    assert(
      locomotion.slide.sliding === true || locomotion.slide.moveState === 'slide',
      `Sprint-crouch did not enter slide (state=${locomotion.slide.moveState})`,
    );
    pass('advanced locomotion', 'jump, crouch, slide, and protected lean');

    const slopeTraversal = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.restart();
      await api.teleport([-28, 0.02, -30.65], 0);
      api.setInput({ KeyW: true });
      await api.step(60);
      api.setInput({});
      await api.step(2);
      return api.snapshot().player;
    });
    assert(
      slopeTraversal.position.z < -34.25 && slopeTraversal.position.y > 0.3,
      `Continuous loading ramp was not traversed (${JSON.stringify(slopeTraversal.position)})`,
    );
    assert(
      slopeTraversal.grounded === true,
      'Player lost grounded contact while walking onto the ramp landing',
    );
    pass(
      'collision and continuous slope',
      `landed at y=${slopeTraversal.position.y.toFixed(2)} m`,
    );

    await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.pause();
      await api.step(2);
    });
    state = await page.evaluate(() => window.__FPS_TEST__.state());
    assert(String(state.phase).toLowerCase() === 'paused', 'Pause did not enter paused phase');
    const pausedPosition = await page.evaluate(() => {
      const snapshot = window.__FPS_TEST__.snapshot();
      return snapshot.player?.position ?? snapshot.camera?.position;
    });
    await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      api.setInput({ KeyW: true });
      await api.step(60);
      api.setInput({ KeyW: false });
    });
    const afterPausedInput = await page.evaluate(() => {
      const snapshot = window.__FPS_TEST__.snapshot();
      return snapshot.player?.position ?? snapshot.camera?.position;
    });
    assert(
      distance3(pausedPosition, afterPausedInput) < 0.01,
      'Player moved while simulation was paused',
    );
    await page.evaluate(async () => {
      await window.__FPS_TEST__.resume();
      await window.__FPS_TEST__.step(2);
    });
    state = await page.evaluate(() => window.__FPS_TEST__.state());
    assert(String(state.phase).toLowerCase() === 'playing', 'Resume did not restore playing phase');
    pass('pause and input reset');

    await page.setViewportSize({ width: 960, height: 540 });
    const resizeResult = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.resize(960, 540);
      window.dispatchEvent(new Event('resize'));
      await api.captureReady();
      const canvas = document.querySelector('canvas');
      const bounds = canvas?.getBoundingClientRect();
      return {
        width: bounds?.width ?? 0,
        height: bounds?.height ?? 0,
        bufferWidth: canvas?.width ?? 0,
        bufferHeight: canvas?.height ?? 0,
      };
    });
    assert(resizeResult.width > 0 && resizeResult.height > 0, 'Canvas collapsed after resize');
    assert(resizeResult.bufferWidth > 0 && resizeResult.bufferHeight > 0, 'Render buffer collapsed after resize');
    assert(
      Math.abs(resizeResult.width / resizeResult.height - 16 / 9) < 0.08,
      `Unexpected resized aspect ratio ${resizeResult.width}×${resizeResult.height}`,
    );
    pass('resize safety', `${resizeResult.bufferWidth}×${resizeResult.bufferHeight} buffer`);

    const ammoTest = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      const before = api.snapshot();
      await api.fire(3);
      await api.step(14);
      const after = api.snapshot();
      return {
        before: before.weapon?.magazine ?? before.weapon?.ammo,
        after: after.weapon?.magazine ?? after.weapon?.ammo,
      };
    });
    assert(
      Number(ammoTest.after) < Number(ammoTest.before),
      `Firing did not consume ammunition (${ammoTest.before} → ${ammoTest.after})`,
    );
    pass('weapon firing', `${ammoTest.before} → ${ammoTest.after}`);

    const weaponState = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      api.setInput({ ads: true });
      await api.step(24);
      const ads = api.snapshot().weapon;
      api.setInput({});
      await api.step(4);

      const beforeReload = api.snapshot().weapon;
      api.setInput({ KeyR: true });
      await api.step(1);
      const duringReload = api.snapshot().weapon;
      api.setInput({});
      await api.step(115);
      const afterReload = api.snapshot().weapon;
      return { ads, beforeReload, duringReload, afterReload };
    });
    assert(
      weaponState.ads.isADS === true && weaponState.ads.ads > 0.85,
      `ADS did not converge (${weaponState.ads.ads})`,
    );
    assert(weaponState.duringReload.reloading === true, 'Reload state did not begin');
    assert(
      weaponState.afterReload.magazine > weaponState.beforeReload.magazine
      && weaponState.afterReload.reserve < weaponState.beforeReload.reserve
      && weaponState.afterReload.reloading === false,
      'Reload did not transfer reserve ammunition and complete',
    );
    pass(
      'ADS and reload state machine',
      `${weaponState.beforeReload.magazine} → ${weaponState.afterReload.magazine} rounds`,
    );

    const damageTest = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      const before = api.snapshot().player?.health;
      await api.damagePlayer(17);
      await api.step(2);
      const after = api.snapshot().player?.health;
      return { before, after };
    });
    assert(
      Number(damageTest.after) < Number(damageTest.before),
      `Player damage did not reduce health (${damageTest.before} → ${damageTest.after})`,
    );
    pass('player damage', `${damageTest.before} → ${damageTest.after}`);

    const ballisticCombat = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.restart();
      const poseResult = await api.setCapturePose('active-combat');
      const before = api.snapshot();
      const target = before.enemies.find(
        (enemy) => enemy.id === poseResult?.targetId,
      ) ?? before.enemies.find((enemy) => enemy.alive);
      const playerHealthBefore = before.player.health;
      await api.fire(2);
      await api.step(7);
      const after = api.snapshot();
      const targetAfter = after.enemies.find((enemy) => enemy.id === target?.id);
      return {
        targetId: target?.id,
        targetHealthBefore: target?.health,
        targetHealthAfter: targetAfter?.health,
        targetAliveAfter: targetAfter?.alive,
        playerHealthBefore,
        playerHealthAfter: after.player.health,
        enemyState: targetAfter?.state,
        effects: after.effects,
      };
    });
    assert(
      Number(ballisticCombat.targetHealthAfter) < Number(ballisticCombat.targetHealthBefore),
      'Real projectile fire did not damage the authored combat target',
    );
    assert(
      Number(ballisticCombat.playerHealthAfter) < Number(ballisticCombat.playerHealthBefore),
      'Enemy controlled fire did not damage the player during the combat probe',
    );
    assert(
      ballisticCombat.effects.activeDecals > 0
      && ballisticCombat.effects.activeParticles > 0,
      'Ballistic combat did not create impact decals and particles',
    );
    pass(
      'real ballistic combat',
      `target ${ballisticCombat.targetHealthBefore} → ${ballisticCombat.targetHealthAfter}; player ${ballisticCombat.playerHealthBefore} → ${ballisticCombat.playerHealthAfter}`,
    );

    await page.evaluate(async () => {
      await window.__FPS_TEST__.restart();
      await window.__FPS_TEST__.step(3);
    });
    const combat = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      const snapshot = api.snapshot();
      const enemies = snapshot.enemies ?? snapshot.enemy?.enemies ?? [];
      const targetCount = Number(
        snapshot.state?.requiredKills ??
        api.state().requiredKills ??
        Math.min(6, enemies.length),
      );
      let killed = 0;
      for (const enemy of enemies) {
        if (enemy.alive === false || killed >= targetCount) continue;
        await api.killEnemy(enemy.id, 'head');
        await api.step(2);
        killed += 1;
      }
      await api.step(5);
      return { state: api.state(), snapshot: api.snapshot(), killed };
    });
    assert(combat.killed >= 6, `Combat test only killed ${combat.killed} enemies`);
    assert(
      String(combat.state.phase).toLowerCase() === 'victory',
      `Killing the objective did not trigger victory (phase=${combat.state.phase})`,
    );
    pass('objective victory loop', `${combat.killed} hostiles neutralized`);

    const progression = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      const game = window.__CINDERLINE__;
      const before = api.snapshot();
      const beforePositions = before.enemies.map((enemy) => enemy.position);
      const worldRoot = game.world.root.uuid;
      const stored = localStorage.getItem('cinderline.highest-cleared-level.v1');
      const record = document.querySelector('[data-highest-cleared]');
      const recordState = {
        hidden: record?.hidden,
        text: record?.textContent,
      };
      const stateAfterAdvance = await api.nextLevel();
      const after = api.snapshot();
      const spawn = game.player.spawnPosition;
      const minimumSpawnDistance = Math.min(...after.enemies
        .filter((enemy) => enemy.alive)
        .map((enemy) => Math.hypot(
          enemy.position.x - spawn.x,
          enemy.position.y - spawn.y,
          enemy.position.z - spawn.z,
        )));
      const positionsChanged = after.enemies.some((enemy, index) => {
        const previous = beforePositions[index];
        return !previous || Math.hypot(
          enemy.position.x - previous.x,
          enemy.position.y - previous.y,
          enemy.position.z - previous.z,
        ) > 0.25;
      });
      return {
        stored,
        recordState,
        stateAfterAdvance,
        activeEnemies: after.enemies.filter((enemy) => enemy.alive).length,
        totalEnemies: game.enemies.snapshot.total,
        minimumSpawnDistance,
        positionsChanged,
        sameWorld: worldRoot === game.world.root.uuid,
        initiallyAlerted: after.enemies.filter((enemy) => enemy.alerted).length,
        playerHealth: after.player.health,
      };
    });
    assert(
      progression.stored === '1'
      && progression.recordState.hidden === false
      && /OPERATION 1/.test(progression.recordState.text ?? ''),
      `Highest cleared operation was not persisted/displayed (${JSON.stringify(progression)})`,
    );
    assert(
      progression.stateAfterAdvance.level === 2
      && progression.stateAfterAdvance.requiredKills === 14
      && progression.totalEnemies === 14
      && progression.activeEnemies === 12,
      `Next operation did not scale 7 × level (${JSON.stringify(progression)})`,
    );
    assert(
      progression.sameWorld
      && progression.positionsChanged
      && progression.minimumSpawnDistance >= 41.5
      && progression.initiallyAlerted === 0
      && progression.playerHealth === 100,
      `Next operation spawn safety/map reuse failed (${JSON.stringify(progression)})`,
    );
    pass(
      'infinite operation progression',
      `operation 2: ${progression.totalEnemies} total, ${progression.activeEnemies} active`,
    );

    await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.restart();
      await api.step(3);
      await api.damagePlayer(1000);
      await api.step(3);
    });
    state = await page.evaluate(() => window.__FPS_TEST__.state());
    assert(
      String(state.phase).toLowerCase() === 'defeat',
      `Lethal player damage did not trigger defeat (phase=${state.phase})`,
    );
    pass('complete defeat loop');

    let restartBaseline = null;
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const restarted = await page.evaluate(async () => {
        const api = window.__FPS_TEST__;
        await api.restart();
        await api.step(3);
        return api.snapshot();
      });
      if (!restartBaseline) restartBaseline = restarted;
      assertRestartSnapshot(restartBaseline, restarted, cycle);
    }
    pass('restart stability', '3 deterministic cycles');

    const pointerLock = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      const requested = await api.pointerLock();
      await api.step(1);
      const locked = await api.pointerLocked();
      await api.restart();
      api.setInput({ KeyW: true });
      const stateAfterExit = await api.simulatePointerLockLoss();
      const positionBefore = api.snapshot().player.position;
      await api.step(12);
      const positionAfter = api.snapshot().player.position;
      return {
        requested,
        locked,
        phaseAfterExit: stateAfterExit.phase,
        movementAfterExit: Math.hypot(
          positionAfter.x - positionBefore.x,
          positionAfter.y - positionBefore.y,
          positionAfter.z - positionBefore.z,
        ),
      };
    });
    assert(
      pointerLock.locked === true || pointerLock.requested === true,
      'Pointer-lock probe did not report a successful request',
    );
    assert(
      String(pointerLock.phaseAfterExit).toLowerCase() === 'paused'
      && pointerLock.movementAfterExit < 0.01,
      `Pointer-lock loss did not pause/reset input (${JSON.stringify(pointerLock)})`,
    );
    pass('pointer-lock loss and input reset');

    const relay = await runRelayAndInputContract(page);
    pass('relay route and extraction', '3 relays, early exit, damage, pause, replay');
    pass('short click and same-step aim', `yaw difference ${relay.yawError.toFixed(4)} rad`);

    const internalDiagnostics = await page.evaluate(
      () => window.__FPS_TEST__.diagnostics(),
    );
    const internalErrors = internalDiagnostics?.errors ?? [];
    assert(
      !Array.isArray(internalErrors) || internalErrors.length === 0,
      `Internal diagnostics reported errors: ${JSON.stringify(internalErrors)}`,
    );
    assertNoPageErrors(diagnostics);
    pass('console and page errors', 'none');

    const report = {
      status: 'passed',
      durationMs: performance.now() - startedAt,
      results,
      browserDiagnostics: diagnostics,
      gameDiagnostics: internalDiagnostics,
    };
    const outputDirectory = path.resolve('artifacts/tests');
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, 'smoke-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`\n${results.length} checks passed in ${(report.durationMs / 1000).toFixed(2)}s\n`);
  } finally {
    await browser?.close();
    await server.stop();
  }
}

main().catch((error) => {
  process.stderr.write(`\nTest failure: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
