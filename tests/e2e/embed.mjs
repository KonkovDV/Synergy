// Embedding e2e (5.15, docs/embed/README.md «Как проверено»): the example host page of another origin embeds the built
// game in an iframe and talks to it only by postMessage — ready → onboarding inside the frame → the exercise from the
// address → the host's signal frames switch the source → a result without health notes → «Вернуться в приложение» →
// close → a start command opens another exercise. A third origin hears nothing.
// Usage: npm run build && node tests/e2e/embed.mjs
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { startServer } from '../../tools/static-server.mjs';
import { writeEvidence } from '../../tools/evidence.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/index.html not found — run `npm run build` first');
const game = await startServer({ root: join(ROOT, 'dist') });
const host = await startServer({ root: join(ROOT, 'docs', 'embed', 'web') });
// 127.0.0.1 and localhost are different origins: the game and the host never share storage or windows.
const gameUrl = game.url.replace('127.0.0.1', 'localhost');
const hostUrl = host.url.replace(/index\.html$/, `host.html?src=${encodeURIComponent(gameUrl)}&game=flight&level=1`);

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) }); };
const messages = () => page.evaluate(() => document.getElementById('log').textContent.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const waitFor = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred(await messages())) return true; await page.waitForTimeout(250); } return false; };

try {
  await page.goto(hostUrl);
  check('ready reaches the host of another origin', await waitFor(m => m.some(x => x.type === 'synergy:ready'), 10000));
  const ready = (await messages()).find(x => x.type === 'synergy:ready');
  check('ready says the onboarding comes first and lists the games', ready && ready.onboarded === false && ready.games.map(g => g.id).join() === 'grip,flight,rhythm,safe,check', JSON.stringify(ready));
  const frame = page.frameLocator('#game');
  await page.waitForTimeout(600); // «Дальше» ignores a tap in the first 300 ms of a page (the double-tap guard)
  await frame.getByRole('button', { name: 'Дальше' }).click(); await page.waitForTimeout(600);
  await frame.getByRole('button', { name: 'Дальше' }).click(); await page.waitForTimeout(600);
  await frame.getByRole('button', { name: 'Пропустить обучение' }).click(); await page.waitForTimeout(700);
  const inner = page.frames().find(f => f.url().startsWith(gameUrl.replace(/index\.html$/, '')));
  const screen = () => inner.evaluate(() => window.Synergy.state().screen);
  check('the exercise from the address opens after the onboarding', (await screen()) === 'play', await screen());
  await page.getByRole('button', { name: 'Демо-сигнал' }).click();
  await page.waitForTimeout(800);
  const st = await inner.evaluate(() => window.Synergy.state());
  check('the host\'s posted frames switch the source and stream', st.settings.source === 'bridge' && st.bridge === 'streaming', `${st.settings.source} ${st.bridge}`);
  await frame.getByRole('button', { name: 'Старт' }).click();
  check('a result arrives', await waitFor(m => m.some(x => x.type === 'synergy:result'), 120000));
  const result = (await messages()).find(x => x.type === 'synergy:result');
  check('the result is the exercise asked for, numbers only', result?.game === 'flight' && result.level === 1 && Number.isFinite(result.score) && !/pain|checkin|wellbeing|name/i.test(JSON.stringify(result)), JSON.stringify(result));
  await frame.locator('.results').waitFor({ timeout: 5000 });
  await frame.getByRole('button', { name: 'Вернуться в приложение' }).click();
  check('«Вернуться в приложение» hands control back', await waitFor(m => m.some(x => x.type === 'synergy:close' && x.reason === 'done'), 5000));
  check('the host hides the game on close', await page.locator('#game').isHidden());
  await page.getByRole('button', { name: 'Мастерская' }).click();
  await page.waitForTimeout(600);
  const opened = await inner.evaluate(() => window.Synergy.state().screen);
  check('a start command from the host opens another exercise', opened === 'play' && await page.locator('#game').isVisible(), opened);
  // A third origin (an opener tab or a stranger frame) cannot drive the game, and the game never posts to «*».
  const stranger = await browser.newPage();
  await stranger.goto(game.url.replace(/index\.html$/, 'index.html?embed=1'));
  const heard = await stranger.evaluate(async () => {
    const got = [];
    addEventListener('message', e => got.push(e.data?.type));
    await new Promise(r => setTimeout(r, 600));
    return got;
  });
  check('without ?host the game posts nothing to any window', !heard.some(t => String(t).startsWith('synergy:')), heard.join());
  await stranger.close();
} finally {
  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({ errors, checks }, null, 2));
  writeEvidence('embed', { checks: checks.length, passed: checks.length - failed.length, errors: errors.length });
  await browser.close(); await game.close(); await host.close();
  if (errors.length || failed.length || !checks.length) process.exit(1);
}
