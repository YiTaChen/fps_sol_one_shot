import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WEAPON_DEFINITIONS } from '../src/weapons/Arsenal.js';
import { THROWABLES } from '../src/weapons/Throwables.js';
import { assertNoPageErrors, attachDiagnostics, ensureServer, launchBrowser } from './lib/browserHarness.mjs';

const ITEM_IDS = [...Object.keys(WEAPON_DEFINITIONS), ...Object.keys(THROWABLES), 'reserve-case'];
const OUTPUT = path.resolve('src/ui/armory-art');
const server = await ensureServer(process.env.FPS_BASE_URL ?? 'http://127.0.0.1:4181');
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const diagnostics = attachDiagnostics(page);
  const url = new URL('/__armory_studio', server.baseURL).href;
  await page.route(url, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><script type="module" src="/scripts/lib/armoryStudio.js"></script>',
  }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.renderArmoryCard === 'function');
  const rendered = new Map();
  for (const id of ITEM_IDS) {
    const image = await page.evaluate((item) => window.renderArmoryCard(item), id);
    const prefix = 'data:image/webp;base64,';
    if (!image.startsWith(prefix)) throw new Error(`Browser could not encode the ${id} WebP`);
    rendered.set(id, Buffer.from(image.slice(prefix.length), 'base64'));
  }
  assertNoPageErrors(diagnostics);
  await mkdir(OUTPUT, { recursive: true });
  await Promise.all([...rendered].map(async ([id, bytes]) => {
    await writeFile(path.join(OUTPUT, `${id}.webp`), bytes);
    process.stdout.write(`${id}.webp  ${bytes.length} bytes\n`);
  }));
} finally {
  await browser?.close();
  await server.stop();
}
