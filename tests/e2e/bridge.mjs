// Integration: external source over WebSocket (bridge/ws_bridge.py) drives the game.
// Usage: node tests/e2e/bridge.mjs <gameUrl> <demoWsUrl> [labWsUrl] [outDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const [base, demoWs, labWs, out = 'docs/screenshots'] = process.argv.slice(2);
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base);
await page.evaluate(() => { localStorage.clear(); });
await page.reload();
await page.waitForTimeout(600);
await page.evaluate(url => { const s = window.Synergy; s.useBridge(url); s.go('play', { game: 'flight', level: 1 }); }, demoWs);
await page.waitForTimeout(2500);
const demo = await page.evaluate(() => window.Synergy.state().bridge);
const statusText = await page.locator('.bridge-status').first().textContent();
// 6.1 (Q&A of 04.11, answer 13): a source that does not read the pads gets none — with real EMG no multi-touch.
const demoPads = await page.locator('.controls .pads').count();
await page.getByRole('button', { name: 'Старт' }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/60-bridge-demo.jpg`, type: 'jpeg', quality: 78, scale: 'css' });
const result = { demoStatus: demo, statusText, demoPads };
if (labWs) {
  await page.evaluate(url => { const s = window.Synergy; s.go('settings'); }, labWs);
  await page.getByRole('radio', { name: /Жесты/ }).first().click();
  await page.evaluate(url => { window.Synergy.useBridge(url); window.Synergy.go('play', { game: 'safe', level: 6 }); }, labWs);
  await page.waitForTimeout(2500);
  // The intro dialog makes the pads inert (5.11): the exercise starts first, then the remote is pressed.
  await page.getByRole('button', { name: 'Старт' }).click();
  await page.waitForFunction(() => !/Старт через/.test(document.body.innerText), null, { timeout: 20000 });
  // 6.0: the default set is the task's dictionary — the lab's LDA has the same classes (lab/lab7.py GESTURES)
  const key = page.locator('.gkey', { hasText: 'Сгибание' });
  const box = await key.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.down(); await page.waitForTimeout(1500);
  result.labChip = await page.locator('.meter-chip').textContent();
  await page.screenshot({ path: `${out}/61-bridge-lab-flexion.jpg`, type: 'jpeg', quality: 78, scale: 'css' });
  await page.mouse.up(); await page.waitForTimeout(800);
  result.labChipAfter = await page.locator('.meter-chip').textContent();
}
console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
// The lab greets with «bridge-hello»: its remote is there (the flexion above is pressed on it).
if (errors.length || result.demoStatus !== 'streaming' || result.demoPads !== 0 || (labWs && result.labChip !== 'Сгибание')) process.exit(1);
