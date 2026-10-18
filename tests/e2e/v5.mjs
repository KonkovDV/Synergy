// v5 mobile smoke: every screen renders without JS errors and without axe-core accessibility violations
// (WCAG 2.2 A/AA + best practices, any impact — the baseline is zero); screenshots for README.
// Usage: python3 tools/serve.py --dist --port 8091 & node tests/e2e/v5.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
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
// axe-core is evaluated through the DevTools protocol, so the page's CSP (no inline scripts) stays intact.
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const a11y = [];
async function audit(screen) {
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }));
  for (const v of result.violations) {
    a11y.push({ screen, rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) });
  }
}

await page.goto(base); await wait(500); await shot('v5-01-onboarding'); await audit('onboarding');
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(150);
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(150);
await page.getByRole('button', { name: 'Пропустить обучение' }).click(); await wait(400);
await shot('v5-02-home'); await audit('home');
await go('tutorial'); await wait(800); await shot('v5-03-tutorial'); await audit('tutorial');
await go('checkin'); await wait(300);
await page.getByRole('radio', { name: /Умеренная/ }).click(); await page.getByRole('radio', { name: /Сил много/ }).click(); await wait(200);
await shot('v5-04-checkin'); await audit('checkin');
await go('settings'); await wait(300);
await page.locator('summary', { hasText: 'Данные' }).click(); await wait(150); // folded section (progressive disclosure)
await page.getByRole('button', { name: 'Демо-профиль для презентации' }).click(); await wait(600);
await shot('v5-05-progress', true); await audit('progress');
await go('home'); await wait(400); await shot('v5-06-home-showcase', true);
await go('play', { game: 'check', level: 1, demo: true }); await wait(300); await shot('v5-07-check-intro'); await audit('play-intro');
await page.getByRole('button', { name: 'Старт' }).click(); await wait(5000); await shot('v5-08-check-play'); await audit('play');
// The demo layout let axe pass page-level rules while the play screen had no h1 and no main (found in 5.7): audit the player's screen too.
await go('play', { game: 'rhythm', level: 1 }); await wait(300); await audit('play-intro-player');
await go('play', { game: 'check', level: 1, demo: true }); await wait(300); await page.getByRole('button', { name: 'Старт' }).click();
await page.waitForSelector('.results', { timeout: 60000 }); await wait(600); await shot('v5-09-check-results', true); await audit('results');
await go('settings'); await wait(300); await shot('v5-10-settings', true); await audit('settings');
await go('calibration'); await wait(300); await audit('calibration');
await go('levels', { game: 'grip' }); await wait(300); await audit('levels');
await go('rest', { next: { game: 'flight', level: 1, retention: false } }); await wait(300); await audit('rest');
await go('pin'); await wait(300); await audit('pin');
await page.evaluate(() => { document.documentElement.classList.add('hc'); document.documentElement.style.setProperty('--text-scale', '1.3'); });
await go('home'); await wait(300); await shot('v5-11-home-contrast'); await audit('home-contrast');
// Route change: the new screen's heading has focus and names the tab (screen readers hear the change).
await go('progress'); await wait(200);
const route = await page.evaluate(() => ({ title: document.title, focus: document.activeElement?.tagName }));
if (!/Прогресс/.test(route.title) || !/^H[12]$/.test(route.focus)) errors.push(`route announce: ${JSON.stringify(route)}`);

// 5.7 — radio groups are named and arrow keys move the choice (WAI-ARIA APG); a label click selects nothing.
await page.evaluate(() => { document.documentElement.classList.remove('hc'); document.documentElement.style.setProperty('--text-scale', '1'); });
await go('settings'); await wait(300);
const unnamed = await page.evaluate(() => [...document.querySelectorAll('[role=radiogroup]')].filter(g => !g.getAttribute('aria-label')).length);
if (unnamed) errors.push(`radio groups without a name: ${unnamed}`);
const textScale = page.getByRole('radiogroup', { name: 'Размер текста' });
await textScale.getByRole('radio', { name: '115 %' }).click(); await wait(100);
await page.getByText('Размер текста', { exact: true }).first().click(); await wait(100);
if ((await page.evaluate(() => window.Synergy.state().settings.textScale)) !== 1.15) errors.push('a click on the «Размер текста» caption changed the setting');
await textScale.getByRole('radio', { name: '115 %' }).focus(); await page.keyboard.press('ArrowRight'); await wait(100);
if ((await page.evaluate(() => window.Synergy.state().settings.textScale)) !== 1.3) errors.push('ArrowRight in a radio group did not move the choice');
await textScale.getByRole('radio', { name: '100 %' }).click(); await wait(100);

// 5.7 — parent PIN: one wrong Enter is one attempt (5.6 counted keydown and keyup).
await page.locator('summary', { hasText: 'Тренировка' }).click(); await wait(150);
await page.getByRole('radiogroup', { name: 'Кто занимается' }).getByRole('radio', { name: /Ребёнок/ }).click(); await wait(150);
await page.getByLabel('Новый PIN родителя').fill('1234');
await page.getByRole('button', { name: 'Сохранить PIN' }).click(); await wait(200);
await go('home'); await wait(200); await go('settings'); await wait(300);
await page.getByLabel('PIN родителя').fill('0000'); await page.keyboard.press('Enter'); await wait(200);
const fails = await page.evaluate(() => window.Synergy.state().settings.pinLock.fails);
if (fails !== 1) errors.push(`one wrong Enter counted as ${fails} PIN attempts`);
await page.getByLabel('PIN родителя').fill('1234'); await page.keyboard.press('Enter'); await wait(300);
if (!(await page.locator('.screen.settings').count())) errors.push('the right PIN did not open the settings');

// 5.7 — check-in with real sensors asks about the skin under the electrodes.
await page.evaluate(() => window.Synergy.useBridge('')); await go('checkin'); await wait(300);
if (!(await page.getByRole('radiogroup', { name: 'Кожа под датчиками' }).count())) errors.push('no skin question with external sensors');
await audit('checkin-sensors');
await page.evaluate(() => window.Synergy.useTouch());

// 5.7 — landscape (WCAG 1.3.4: orientation not locked): the pads fit, nothing is cut off, no axe violations.
const land = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
land.on('pageerror', e => errors.push(`landscape: ${e.message}`));
await land.goto(base); await land.waitForTimeout(400);
for (let i = 0; i < 2; i++) { await land.getByRole('button', { name: 'Дальше' }).click(); await land.waitForTimeout(120); }
await land.getByRole('button', { name: 'Пропустить обучение' }).click(); await land.waitForTimeout(300);
for (const [scheme, game] of [['proportional', 'grip'], ['gesture', 'safe']]) {
  if (scheme === 'gesture') { await land.evaluate(() => window.Synergy.go('settings')); await land.waitForTimeout(200); await land.getByRole('radiogroup', { name: 'Схема управления' }).getByRole('radio', { name: /Жесты/ }).click(); await land.waitForTimeout(200); }
  await land.evaluate(g => window.Synergy.go('play', { game: g, level: 1 }), game); await land.waitForTimeout(400);
  const box = await land.evaluate(() => { const c = document.querySelector('.controls').getBoundingClientRect(), s = document.querySelector('.stage').getBoundingClientRect(); return { controls: c.bottom, stage: s.height, h: innerHeight }; });
  if (box.controls > box.h + 1 || box.stage < 150) errors.push(`landscape ${scheme}: ${JSON.stringify(box)}`);
  await land.screenshot({ path: `${out}/v5-12-landscape-${game}.png` });
  if (!(await land.evaluate(() => !!window.axe))) await land.evaluate(axeSource);
  const r = await land.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }));
  for (const v of r.violations) a11y.push({ screen: `landscape-${game}`, rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) });
}
console.log(JSON.stringify({ errors, a11y }, null, 1));
await browser.close();
process.exit(errors.length || a11y.length ? 1 : 0);
