import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertNoPageErrors,
  attachDiagnostics,
  ensureServer,
  launchBrowser,
  openGame,
} from './lib/browserHarness.mjs';
import { CAPTURE_VIEWS } from '../tests/test-contract.mjs';

const SEED = Number(process.env.FPS_CAPTURE_SEED ?? 0x0c1de71e);
const OUTPUT = path.resolve(process.env.FPS_CAPTURE_DIR ?? 'artifacts/captures');
const VIEW_FILTER = new Set(
  String(process.env.FPS_CAPTURE_VIEWS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

async function main() {
  const server = await ensureServer();
  let browser;
  const manifest = {
    title: 'Cinderline: One Shot',
    seed: SEED,
    quality: 'high',
    viewport: { width: 1440, height: 810 },
    captures: [],
  };
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: manifest.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const diagnostics = attachDiagnostics(page);
    await mkdir(OUTPUT, { recursive: true });

    const selectedViews = VIEW_FILTER.size
      ? CAPTURE_VIEWS.filter((view) => VIEW_FILTER.has(view.id))
      : CAPTURE_VIEWS;
    if (!selectedViews.length) {
      throw new Error(`No capture views matched FPS_CAPTURE_VIEWS=${[...VIEW_FILTER].join(',')}`);
    }
    for (const view of selectedViews) {
      await openGame(page, server.baseURL, {
        seed: SEED,
        quality: 'high',
        capture: view.id,
      });
      const captureState = await page.evaluate(async (viewId) => {
        const api = window.__FPS_TEST__;
        await api.setCapturePose(viewId);
        if (viewId === 'active-combat') {
          await api.start();
          api.setInput({ KeyW: true, ShiftLeft: true });
          await api.step(24);
          api.setInput({ KeyW: false, ShiftLeft: false });
          const before = api.snapshot();
          await api.fire(1);
          await api.step(3);
          const after = api.snapshot();
          const targetBefore = before.enemies.find((enemy) => enemy.alive);
          const targetAfter = after.enemies.find((enemy) => enemy.id === targetBefore?.id);
          if (!targetBefore || !targetAfter || targetAfter.health >= targetBefore.health) {
            throw new Error('Active-combat capture did not register a real ballistic hit');
          }
          await api.captureReady();
          return {
            targetId: targetBefore.id,
            targetHealthBefore: targetBefore.health,
            targetHealthAfter: targetAfter.health,
            playerHealth: after.player.health,
            magazine: after.weapon.magazine,
            effects: after.effects,
          };
        } else {
          await api.step(3);
        }
        await api.captureReady();
        return null;
      }, view.id);
      const filePath = path.join(OUTPUT, view.file);
      await page.screenshot({
        path: filePath,
        type: 'png',
        animations: 'disabled',
        caret: 'hide',
        timeout: 120000,
      });
      const bytes = await readFile(filePath);
      const hash = createHash('sha256').update(bytes).digest('hex');
      manifest.captures.push({
        ...view,
        bytes: bytes.length,
        sha256: hash,
        ...(captureState ? { state: captureState } : {}),
      });
      process.stdout.write(`✓ ${view.file} — ${view.description}\n`);
    }

    assertNoPageErrors(diagnostics, [/favicon\.ico/i]);
    manifest.browserDiagnostics = diagnostics;
    manifest.completedAt = new Date().toISOString();
    await writeFile(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`\nCaptured ${manifest.captures.length} deterministic views to ${OUTPUT}\n`);
  } finally {
    await browser?.close();
    await server.stop();
  }
}

main().catch((error) => {
  process.stderr.write(`\nCapture failure: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
