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

    for (const view of CAPTURE_VIEWS) {
      await openGame(page, server.baseURL, {
        seed: SEED,
        quality: 'high',
        capture: view.id,
      });
      await page.evaluate(async (viewId) => {
        const api = window.__FPS_TEST__;
        await api.setCapturePose(viewId);
        if (viewId === 'active-combat') {
          await api.start();
          api.setInput({ KeyW: true, ShiftLeft: true });
          await api.step(24);
          api.setInput({ KeyW: false, ShiftLeft: false });
          await api.fire(2);
          await api.step(2);
        } else {
          await api.step(3);
        }
        await api.captureReady();
      }, view.id);
      const filePath = path.join(OUTPUT, view.file);
      await page.screenshot({
        path: filePath,
        type: 'png',
        animations: 'disabled',
        caret: 'hide',
      });
      const bytes = await readFile(filePath);
      const hash = createHash('sha256').update(bytes).digest('hex');
      manifest.captures.push({
        ...view,
        bytes: bytes.length,
        sha256: hash,
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

