import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertNoPageErrors,
  attachDiagnostics,
  ensureServer,
  launchBrowser,
  median,
  openGame,
} from './lib/browserHarness.mjs';

const OUTPUT = path.resolve('artifacts/performance');

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
      capture: 'active-combat',
    });
    const measurement = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.start();
      await api.setCapturePose('active-combat');
      api.setInput({ KeyW: true, ShiftLeft: true });
      await api.step(90);
      api.setInput({ KeyW: false, ShiftLeft: false, KeyD: true });
      await api.fire(4);
      await api.step(90);
      api.setInput({ KeyD: false, KeyS: true });
      await api.fire(5);
      await api.step(90);
      api.setInput({ KeyS: false });
      const result = await api.runPerformance(600, {
        movement: true,
        combat: true,
        resolution: [1280, 720],
        quality: 'medium',
      });
      const frameStats = await api.frameStats();
      return {
        result,
        frameStats,
        diagnostics: api.diagnostics(),
        snapshot: api.snapshot(),
      };
    });

    const samples = measurement.result?.frameTimes
      ?? measurement.frameStats?.frameTimes
      ?? measurement.frameStats?.samples
      ?? [];
    const medianFrameMs = Number(
      measurement.result?.medianFrameMs ??
      measurement.frameStats?.medianFrameMs ??
      median(samples),
    );
    const p95FrameMs = Number(
      measurement.result?.p95FrameMs ??
      measurement.frameStats?.p95FrameMs ??
      0,
    );
    const medianFps = Number(
      measurement.result?.medianFps ??
      measurement.frameStats?.medianFps ??
      (medianFrameMs > 0 ? 1000 / medianFrameMs : 0),
    );
    const renderer = measurement.diagnostics?.rendererInfo
      ?? measurement.diagnostics?.renderer
      ?? {};
    const report = {
      title: 'Cinderline: One Shot moving-combat profile',
      quality: 'medium',
      internalResolution: [1280, 720],
      simulatedFrames: 870,
      medianFrameMs,
      p95FrameMs,
      medianFps,
      targetMedianFps: 45,
      targetMet: medianFps >= 45,
      drawCalls: renderer.render?.calls ?? renderer.calls ?? null,
      triangles: renderer.render?.triangles ?? renderer.triangles ?? null,
      textures: renderer.memory?.textures ?? null,
      geometries: renderer.memory?.geometries ?? null,
      game: measurement.snapshot?.state ?? measurement.snapshot,
      diagnostics: measurement.diagnostics,
      browserDiagnostics: diagnostics,
    };
    assertNoPageErrors(diagnostics, [/favicon\.ico/i]);
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(
      path.join(OUTPUT, 'moving-combat.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`Moving-combat profile: ${medianFps.toFixed(1)} median FPS`);
    if (medianFrameMs > 0) process.stdout.write(` (${medianFrameMs.toFixed(2)} ms)`);
    process.stdout.write(`\nTarget ≥45 FPS: ${report.targetMet ? 'met' : 'not met on this runner'}\n`);
    process.stdout.write(`Report: ${path.join(OUTPUT, 'moving-combat.json')}\n`);
  } finally {
    await browser?.close();
    await server.stop();
  }
}

main().catch((error) => {
  process.stderr.write(`\nProfile failure: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

