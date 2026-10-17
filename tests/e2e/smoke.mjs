// Mobile smoke test: onboarding → home → every game intro + demo frames → results → progress → settings.
// Usage: node tests/e2e/smoke.mjs [baseUrl] [outDir]   (server: python3 tools/serve.py --port 8090)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const base = process.argv[2] ?? 'http://127.0.0.1:8090/index.html';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const wait = ms => page.waitForTimeout(ms);

await page.goto(base);
await wait(400); await shot('01-onboarding');
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(200);
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(200);
await shot('02-setup');
await page.getByRole('button', { name: 'Пропустить обучение' }).click(); await wait(400); // v5 onboarding: setup → home
await shot('03-home');

for (const game of ['grip', 'flight', 'rhythm', 'safe']) {
  await page.evaluate(g => window.Synergy.go('play', { game: g, level: 3, demo: true }), game);
  await wait(300); await shot(`10-${game}-intro`);
  await page.getByRole('button', { name: 'Старт' }).click();
  await wait(game === 'rhythm' ? 5200 : 4200); await shot(`11-${game}-demo`);
}
// Manual play with touch pads (two-channel): hold A at ~40 %.
await page.evaluate(() => window.Synergy.go('play', { game: 'grip', level: 1 }));
await wait(300);
await page.getByRole('button', { name: 'Старт' }).click();
await wait(4200);
const pad = await page.locator('.pad-a').boundingBox();
await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height * 0.6);
await page.mouse.down(); await wait(900); await shot('12-grip-touch-hold'); await page.mouse.up();
await wait(800);

// A full demo run to the results screen.
await page.evaluate(() => window.Synergy.go('play', { game: 'safe', level: 1, demo: true }));
await wait(300); await page.getByRole('button', { name: 'Старт' }).click();
await page.waitForSelector('.results', { timeout: 60000 });
await wait(600); await shot('20-results');

await page.evaluate(() => window.Synergy.go('progress')); await wait(400); await shot('30-progress');
await page.evaluate(() => window.Synergy.go('settings')); await wait(400); await shot('40-settings');
await page.evaluate(() => window.Synergy.go('calibration')); await wait(2500); await shot('41-calibration');
await page.evaluate(() => window.Synergy.go('levels', { game: 'grip' })); await wait(300); await shot('50-levels');

// Gesture scheme pads.
await page.evaluate(() => { window.Synergy.go('settings'); });
await page.getByRole('radio', { name: /Жесты/ }).first().click(); await wait(200);
await page.evaluate(() => window.Synergy.go('play', { game: 'safe', level: 6 }));
await wait(300); await page.getByRole('button', { name: 'Старт' }).click(); await wait(4000); await shot('13-safe-gestures');

const state = await page.evaluate(() => window.Synergy.state());
console.log(JSON.stringify({ errors, screen: state.screen, runs: state.runs, scheme: state.settings.scheme }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
