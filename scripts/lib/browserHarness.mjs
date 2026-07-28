import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:4173';

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureServer(baseURL = process.env.FPS_BASE_URL ?? DEFAULT_URL) {
  if (await reachable(baseURL)) {
    return { baseURL, owned: false, output: '', stop: async () => {} };
  }

  const parsed = new URL(baseURL);
  const port = parsed.port || '4173';
  const host = parsed.hostname || '127.0.0.1';
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      host,
      '--port',
      port,
      '--strictPort',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 12000) output = output.slice(-12000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (${child.exitCode}).\n${output}`);
    }
    if (await reachable(baseURL)) {
      return {
        baseURL,
        owned: true,
        get output() {
          return output;
        },
        async stop() {
          if (child.exitCode !== null) return;
          child.kill('SIGTERM');
          const timeout = delay(2500).then(() => false);
          const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
          if (!(await Promise.race([exited, timeout]))) child.kill('SIGKILL');
        },
      };
    }
    await delay(150);
  }
  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for ${baseURL}.\n${output}`);
}

export async function launchBrowser(options = {}) {
  const launchOptions = {
    headless: options.headless ?? true,
    args: [
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  };
  try {
    return await chromium.launch(launchOptions);
  } catch (bundledError) {
    try {
      return await chromium.launch({ ...launchOptions, channel: 'chrome' });
    } catch (chromeError) {
      throw new Error(
        `Unable to launch bundled Chromium or installed Chrome.\n` +
        `Bundled: ${bundledError.message}\nChrome: ${chromeError.message}`,
      );
    }
  }
}

export function attachDiagnostics(page) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      const source = location?.url
        ? ` @ ${location.url}:${location.lineNumber ?? 0}`
        : '';
      diagnostics.consoleErrors.push(`${message.text()}${source}`);
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack ?? error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      diagnostics.httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    diagnostics.requestFailures.push(`${request.url()}: ${failure?.errorText ?? 'failed'}`);
  });
  return diagnostics;
}

export function buildGameURL(baseURL, options = {}) {
  const url = new URL(baseURL);
  url.searchParams.set('test', '1');
  url.searchParams.set('seed', String(options.seed ?? 0x0c1de71e));
  url.searchParams.set('quality', options.quality ?? 'medium');
  if (options.capture) url.searchParams.set('capture', options.capture);
  return url.toString();
}

export async function openGame(page, baseURL, options = {}) {
  const url = buildGameURL(baseURL, options);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => Boolean(window.__FPS_TEST__?.ready?.()),
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    await window.__FPS_TEST__.captureReady?.();
  });
  return url;
}

export async function readTestCapabilities(page) {
  return page.evaluate(() => {
    const api = window.__FPS_TEST__;
    if (!api) return null;
    const methods = {};
    for (const name of Object.getOwnPropertyNames(api)) {
      methods[name] = typeof api[name];
    }
    return { version: api.version, methods };
  });
}

export function assertNoPageErrors(diagnostics, allowPatterns = []) {
  const allowed = (message) => allowPatterns.some((pattern) => pattern.test(message));
  const errors = [
    ...diagnostics.consoleErrors.map((value) => `console: ${value}`),
    ...diagnostics.pageErrors.map((value) => `page: ${value}`),
    ...diagnostics.requestFailures.map((value) => `request: ${value}`),
    ...diagnostics.httpErrors.map((value) => `http: ${value}`),
  ].filter((message) => !allowed(message));
  if (errors.length) {
    throw new Error(`Browser errors detected:\n${errors.join('\n')}`);
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function distance3(a, b) {
  if (!a || !b) return 0;
  const ax = Number(a.x ?? a[0] ?? 0);
  const ay = Number(a.y ?? a[1] ?? 0);
  const az = Number(a.z ?? a[2] ?? 0);
  const bx = Number(b.x ?? b[0] ?? 0);
  const by = Number(b.y ?? b[1] ?? 0);
  const bz = Number(b.z ?? b[2] ?? 0);
  return Math.hypot(ax - bx, ay - by, az - bz);
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) * 0.5;
}
