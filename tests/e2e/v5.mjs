// v5 mobile smoke: new screens render without JS errors; screenshots for README.
// Usage: python3 tools/serve.py --dist --port 8091 & node tests/e2e/v5.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const base = process.argv[2] ?? 'http://127.0.0.1:8091/index.html';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const wait = ms => page.waitForTimeout(ms);
const go = (name, params) => page.evaluate(([n, p]) => window.Synergy.go(n, p), [name, params ?? {}]);

await page.goto(base); await wait(500); await shot('v5-01-onboarding');
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(150);
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(150);
await page.getByRole('button', { name: 'Пропустить обучение' }).click(); await wait(400);
await shot('v5-02-home');
await go('tutorial'); await wait(800); await shot('v5-03-tutorial');
await go('checkin'); await wait(300);
await page.getByRole('radio', { name: /Умеренная/ }).click(); await page.getByRole('radio', { name: /Сил много/ }).click(); await wait(200);
await shot('v5-04-checkin');
await go('settings'); await wait(300);
await page.getByRole('button', { name: 'Демо-профиль для презентации' }).click(); await wait(600);
await shot('v5-05-progress', true);
await go('home'); await wait(400); await shot('v5-06-home-showcase', true);
await go('play', { game: 'check', level: 1, demo: true }); await wait(300); await shot('v5-07-check-intro');
await page.getByRole('button', { name: 'Старт' }).click(); await wait(5000); await shot('v5-08-check-play');
await page.waitForSelector('.results', { timeout: 60000 }); await wait(600); await shot('v5-09-check-results', true);
await go('settings'); await wait(300); await shot('v5-10-settings', true);
await page.evaluate(() => { document.documentElement.classList.add('hc'); document.documentElement.style.setProperty('--text-scale', '1.3'); });
await go('home'); await wait(300); await shot('v5-11-home-contrast');
console.log(JSON.stringify({ errors }, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
