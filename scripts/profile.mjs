import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
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
const PROFILE_OPTIONS = Object.freeze({
  movement: true,
  combat: true,
  resolution: [1280, 720],
  quality: 'medium',
  healthFloor: 60,
});

function percentile(values, amount) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))];
}

function commitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
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
      capture: 'active-combat',
    });
    const measurement = await page.evaluate(async () => {
      const api = window.__FPS_TEST__;
      await api.start();
      await api.setCapturePose('active-combat');
      await api.runPerformance(120, {
        movement: true,
        combat: true,
        resolution: [1280, 720],
        quality: 'medium',
        healthFloor: 60,
      });
      await api.restart();
      await api.setCapturePose('active-combat');
      const result = await api.runPerformance(600, {
        movement: true,
        combat: true,
        resolution: [1280, 720],
        quality: 'medium',
        healthFloor: 60,
      });
      const frameStats = await api.frameStats();
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2');
      return {
        result,
        frameStats,
        diagnostics: api.diagnostics(),
        snapshot: api.snapshot(),
        drawingBuffer: [gl?.drawingBufferWidth ?? 0, gl?.drawingBufferHeight ?? 0],
        renderer: gl
          ? {
              vendor: gl.getParameter(gl.VENDOR),
              renderer: gl.getParameter(gl.RENDERER),
              version: gl.getParameter(gl.VERSION),
            }
          : null,
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
    const p99FrameMs = percentile(samples, 0.99);
    const maxFrameMs = samples.length ? Math.max(...samples) : 0;
    const renderer = measurement.diagnostics?.rendererInfo
      ?? measurement.diagnostics?.renderer
      ?? {};
    const report = {
      title: 'Cinderline: One Shot moving-combat profile',
      completedAt: new Date().toISOString(),
      commit: commitSha(),
      quality: 'medium',
      requestedInternalResolution: PROFILE_OPTIONS.resolution,
      actualDrawingBuffer: measurement.drawingBuffer,
      measuredFrames: samples.length,
      warmupFrames: 120,
      medianFrameMs,
      p95FrameMs,
      p99FrameMs,
      maxFrameMs,
      medianFps,
      targetMedianFps: 45,
      targetMet: medianFps >= 45,
      longFramesOver50Ms: samples.filter((value) => value > 50).length,
      longFramesOver100Ms: samples.filter((value) => value > 100).length,
      samplesMs: samples,
      movementDistance: measurement.result?.movementDistance ?? null,
      displacement: measurement.result?.displacement ?? null,
      shotsFired: measurement.result?.shotsFired ?? null,
      reloads: measurement.result?.reloads ?? null,
      drawCalls: renderer.render?.calls ?? renderer.calls ?? null,
      triangles: renderer.render?.triangles ?? renderer.triangles ?? null,
      textures: renderer.memory?.textures ?? null,
      geometries: renderer.memory?.geometries ?? null,
      game: measurement.snapshot?.state ?? measurement.snapshot,
      player: measurement.snapshot?.player ?? null,
      effects: measurement.snapshot?.effects ?? null,
      sustainHealthFloor: PROFILE_OPTIONS.healthFloor,
      browserVersion: browser.version(),
      platform: `${os.platform()} ${os.arch()} ${os.release()}`,
      graphics: measurement.renderer,
      runnerNote:
        'Headless Playwright Chromium forced to SwiftShader software WebGL; results are reproducible on this runner but are not a hardware-GPU laptop benchmark.',
      diagnostics: measurement.diagnostics,
      browserDiagnostics: diagnostics,
    };
    if (
      report.actualDrawingBuffer[0] !== PROFILE_OPTIONS.resolution[0]
      || report.actualDrawingBuffer[1] !== PROFILE_OPTIONS.resolution[1]
    ) {
      throw new Error(
        `Profile drawing buffer was ${report.actualDrawingBuffer.join('×')}, expected ${PROFILE_OPTIONS.resolution.join('×')}`,
      );
    }
    if (!samples.length || !Number.isFinite(medianFrameMs) || medianFrameMs <= 0) {
      throw new Error('Profile did not produce finite frame-time samples');
    }
    if (String(report.game?.phase).toLowerCase() !== 'playing') {
      throw new Error(`Profile ended outside active play (phase=${report.game?.phase})`);
    }
    if (Number(report.movementDistance) < 5) {
      throw new Error(
        `Profile did not sustain real movement (${report.movementDistance} m accumulated)`,
      );
    }
    if (Number(report.shotsFired) < 30 || Number(report.reloads) < 1) {
      throw new Error(
        `Profile combat workload was incomplete (${report.shotsFired} shots, ${report.reloads} reloads)`,
      );
    }
    assertNoPageErrors(diagnostics);
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(
      path.join(OUTPUT, 'moving-combat.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`Moving-combat profile: ${medianFps.toFixed(1)} median FPS`);
    if (medianFrameMs > 0) process.stdout.write(` (${medianFrameMs.toFixed(2)} ms)`);
    process.stdout.write(`, p95 ${p95FrameMs.toFixed(2)} ms, max ${maxFrameMs.toFixed(2)} ms`);
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
