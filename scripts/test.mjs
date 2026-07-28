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

const results = [];
const startedAt = performance.now();

function pass(name, detail = '') {
  results.push({ name, status: 'passed', detail });
  process.stdout.write(`✓ ${name}${detail ? ` — ${detail}` : ''}\n`);
}

async function main() {
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
    pass('deterministic movement', `${movementDistance.toFixed(2)} m`);

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
    pass('complete victory loop', `${combat.killed} hostiles neutralized`);

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
      document.exitPointerLock?.();
      return { requested, locked };
    });
    assert(
      pointerLock.locked === true || pointerLock.requested === true,
      'Pointer-lock probe did not report a successful request',
    );
    pass('pointer-lock probe');

    const internalDiagnostics = await page.evaluate(
      () => window.__FPS_TEST__.diagnostics(),
    );
    const internalErrors = internalDiagnostics?.errors ?? [];
    assert(
      !Array.isArray(internalErrors) || internalErrors.length === 0,
      `Internal diagnostics reported errors: ${JSON.stringify(internalErrors)}`,
    );
    assertNoPageErrors(diagnostics, [/favicon\.ico/i]);
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

