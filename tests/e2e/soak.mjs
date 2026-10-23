// 15 minutes of the emulator with no JavaScript errors, a living frame loop and a bounded heap (docs/MEETUP_PLAN.md M-15).
// Not part of npm test. Usage: node tests/e2e/soak.mjs    SOAK_S=60 node tests/e2e/soak.mjs
import { createRequire } from 'node:module';
import { baseUrl } from '../../tools/static-server.mjs';
import { writeEvidence } from '../../tools/evidence.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const seconds = Number(process.env.SOAK_S) > 0 ? Number(process.env.SOAK_S) : 15 * 60;
const server = await baseUrl({ source: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const heap = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0;
};

await page.goto(server.url);
await page.waitForTimeout(500); // the first «Дальше» ignores a tap in the first 300 ms
await page.getByRole('button', { name: 'Дальше' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Дальше' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Пропустить обучение' }).click();
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__soakFrames = 0;
  const loop = () => { window.__soakFrames++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const heap0 = await heap();
const frames0 = await page.evaluate(() => window.__soakFrames);
const until = Date.now() + seconds * 1000;
const games = ['grip', 'flight', 'rhythm', 'safe'];
let runs = 0;
while (Date.now() < until) {
  const game = games[runs % games.length];
  const level = (runs % 8) + 1;
  await page.evaluate(({ game, level }) => window.Synergy.go('play', { game, level, demo: true }), { game, level });
  await page.getByRole('button', { name: 'Старт' }).click();
  await page.waitForSelector('.results', { timeout: 180000 });
  runs++;
}
const heap1 = await heap();
const frames1 = await page.evaluate(() => window.__soakFrames);
const growthMb = (heap1 - heap0) / (1024 * 1024);
const report = { seconds, runs, errors: errors.length, frames: frames1 - frames0, growthMb: Math.round(growthMb * 10) / 10, heap0, heap1 };
console.log(JSON.stringify(report, null, 1));
writeEvidence('soak', report);
await browser.close();
await server.close();
if (errors.length || report.frames < seconds * 10 || growthMb > 30) process.exit(1);
