// v5 mobile smoke: every screen renders without JS errors and without axe-core accessibility violations
// (WCAG 2.2 A/AA + best practices, any impact — the baseline is zero); screenshots for README.
// Usage: npm run build && node tests/e2e/v5.mjs [baseUrl] [outDir]   (no URL — serves dist/ itself, no Python needed)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { baseUrl } from '../../tools/static-server.mjs';
import { writeEvidence } from '../../tools/evidence.mjs';
import { PRIMER } from '../../src/core/primer.js';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const server = await baseUrl();
const base = server.url;
const out = process.argv.slice(2).find(a => !a.startsWith('http')) ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// Light screenshots (5.8): JPEG in CSS pixels — every PNG@2× re-shot used to stay in git history (24 MB of 25).
const shot = (name, full = false) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 78, scale: 'css', fullPage: full });
const wait = ms => page.waitForTimeout(ms);
const go = (name, params) => page.evaluate(([n, p]) => window.Synergy.go(n, p), [name, params ?? {}]);
// axe-core is evaluated through the DevTools protocol, so the page's CSP (no inline scripts) stays intact.
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const a11y = [], audited = [];
async function audit(screen) {
  audited.push(screen);
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource);
  // 5.29: a toast fades in (0.25 s) and out (0.4 s). A run that lands in a fade sees its text blended with the page and
  // flagged contrast at random (once, under load). Wait for the toasts' animations; one fading out is not checked.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.target?.closest?.('#toasts')).map(a => a.finished.catch(() => null))));
  const result = await page.evaluate(() => window.axe.run({ include: [document], exclude: [['.toast.out']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }));
  for (const v of result.violations) {
    a11y.push({ screen, rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) });
  }
}

await page.goto(base); await wait(500); await shot('v5-01-onboarding'); await audit('onboarding');
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(350);
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(350);
await page.getByRole('button', { name: 'Пропустить обучение' }).click(); await wait(700);
// 5.13 — the hint tour of the home screen: a non-modal dialog with focus on its heading, a ring on the element it
// explains; using that element counts as the step; Esc dismisses; a dismissed version never returns.
const tourState = () => page.evaluate(() => ({ title: document.querySelector('.tour h2')?.textContent, focus: document.activeElement?.closest('.tour') ? 'tour' : document.activeElement?.tagName,
  ring: document.querySelector('.tour-target')?.dataset.tour, tours: window.Synergy.state().settings.tours }));
let t = await tourState();
if (t.title !== 'Тренировка дня' || t.focus !== 'tour' || t.ring !== 'home.plan') errors.push(`home tour, step 1: ${JSON.stringify(t)}`);
await shot('v5-14-tour'); await audit('home-tour');
await page.locator('.tour').getByRole('button', { name: 'Дальше' }).click(); await wait(500);
t = await tourState();
if (t.ring !== 'home.pet') errors.push(`home tour, step 2: ${JSON.stringify(t)}`);
await page.getByRole('button', { name: /Погладить/ }).click(); await wait(300); // the explained element used = the step done
t = await tourState();
if (t.ring !== 'nav.nest') errors.push(`using the explained element did not move the tour on: ${JSON.stringify(t)}`);
const said = await page.locator('.pet-say').textContent();
if (!/Тук-тук|Яйцо|вылуплюсь|слышу/.test(said)) errors.push(`a touch of the egg answered «${said}»`);
await page.keyboard.press('Escape'); await wait(200);
t = await tourState();
if (t.title || t.tours.home?.status !== 'dismissed') errors.push(`Esc did not dismiss the tour: ${JSON.stringify(t)}`);
await page.reload(); await wait(500);
if (await page.locator('.tour').count()) errors.push('a dismissed tour came back after a reload');
await shot('v5-02-home'); await audit('home');
await go('tutorial'); await wait(800); await shot('v5-03-tutorial'); await audit('tutorial');
await go('checkin'); await wait(300);
await page.getByRole('radio', { name: /Умеренная/ }).click();
if (await page.getByRole('button', { name: 'Пропустить', exact: true }).isVisible()) errors.push('checkin: «Пропустить» after an answer (5.11 P0: severe pain could be skipped into the full plan)');
await page.getByRole('radio', { name: /Сил много/ }).click(); await wait(200);
await shot('v5-04-checkin'); await audit('checkin');
await go('settings'); await wait(300);
await page.locator('summary', { hasText: 'Данные' }).click(); await wait(150); // folded section (progressive disclosure)
await page.getByRole('button', { name: 'Демо-профиль для презентации' }).click(); await wait(600);
await audit('progress-tour');
if ((await tourState()).ring !== 'progress.week') errors.push(`progress tour: ${JSON.stringify(await tourState())}`); // 5.14: week to week first
await page.locator('.tour').getByRole('button', { name: 'Пропустить подсказки' }).click(); await wait(200);
await shot('v5-05-progress', true); await audit('progress');
// 5.14 — the nest: the bird's own section, with its short hint; the outfit lives here now.
await go('nest'); await wait(600); await audit('nest-tour');
if ((await tourState()).ring !== 'nest.bird') errors.push(`nest tour: ${JSON.stringify(await tourState())}`);
await page.locator('.tour').getByRole('button', { name: 'Пропустить подсказки' }).click(); await wait(200);
await shot('v5-16-nest'); await audit('nest');
// 5.13 — the outfit: a choice in a slot is worn at once (the demo bird has earned items).
const headGroup = page.getByRole('radiogroup', { name: 'Наряд: на голову' });
if (await headGroup.count()) {
  await headGroup.getByRole('radio', { name: 'Без' }).click(); await wait(300);
  if ((await page.evaluate(() => window.Synergy.state().profile.pet.head)) !== null) errors.push('«Без» did not take the head item off');
} else errors.push('no outfit choice for the head in the demo profile');
await go('faq', { topic: 'false' }); await wait(300); await audit('faq');
if (!(await page.locator('#faq-false[open]').count())) errors.push('«Вопросы к Мио»: the asked topic is not open');
await go('home'); await wait(400); await shot('v5-06-home-showcase', true);
// 5.13 — goals: the bird offers goals; one is taken and shows on its card with progress 0 of N.
await go('goals'); await wait(300); await audit('goals');
await page.getByRole('button', { name: 'Взять цель' }).first().click(); await wait(300);
const mission = await page.evaluate(() => window.Synergy.state().profile.mission);
if (!mission || mission.done !== 0) errors.push(`taking a goal: ${JSON.stringify(mission)}`);
await audit('goals-active');
await go('home'); await wait(300);
if (!(await page.locator('.pet-goal [role=progressbar]').count())) errors.push('the taken goal is not on the bird\'s card');
await page.evaluate(() => document.querySelector('.pet-card').scrollIntoView({ block: 'center' })); await wait(200);
await shot('v5-15-pet-goal');
await go('play', { game: 'check', level: 1, demo: true }); await wait(300); await shot('v5-07-check-intro'); await audit('play-intro');
await page.getByRole('button', { name: 'Старт' }).click(); await wait(5000); await shot('v5-08-check-play'); await audit('play');
// The demo layout let axe pass page-level rules while the play screen had no h1 and no main (found in 5.7): audit the player's screen too.
await go('play', { game: 'rhythm', level: 1 }); await wait(300); await audit('play-intro-player');
await go('play', { game: 'check', level: 1, demo: true }); await wait(300); await page.getByRole('button', { name: 'Старт' }).click();
await page.waitForSelector('.results', { timeout: 60000 }); await wait(600); await shot('v5-09-check-results', true); await audit('results');
await go('settings'); await wait(300); await shot('v5-10-settings', true); await audit('settings');
// 5.32 — the live trace of A and B under «Чувствительность» (folded by default): drawn, sized to the card, named for a screen reader.
await page.evaluate(() => { const d = [...document.querySelectorAll('details.fold')].find(x => x.querySelector('.trace')); if (d) d.open = true; });
await page.keyboard.down('f'); await wait(700); await page.keyboard.down('j'); await wait(300); await page.keyboard.up('j'); await page.keyboard.up('f'); await wait(1100);
const trace = await page.evaluate(() => { const c = document.querySelector('.trace'); return c && { drawn: c.width > 0, fits: c.getBoundingClientRect().right <= document.documentElement.clientWidth, label: c.getAttribute('aria-label'), sum: document.querySelector('.trace-sum')?.textContent ?? '' }; });
if (!trace?.drawn || !trace.fits || !trace.label) errors.push(`settings: the signal trace is not drawn or does not fit (${JSON.stringify(trace)})`);
if (!/Чистота за 5/.test(trace?.sum ?? '')) errors.push(`settings: the line under the trace did not count the squeeze (${trace?.sum})`);
await audit('settings-trace');
await go('calibration'); await wait(300); await audit('calibration');
await go('audiosync'); await wait(500); await audit('audiosync'); // no screenshot: the archive is at its size limit (PLAN C.1.61)
await go('levels', { game: 'grip' }); await wait(300); await audit('levels');
await go('rest', { next: { game: 'flight', level: 1, retention: false } }); await wait(300); await audit('rest');
await go('pin'); await wait(300); await audit('pin');
// 5.15 — «Азбука протеза» (topics, a turned card, an answered check, the result) and the safety re-read.
await go('primer'); await wait(300); await audit('primer');
// 5.29: every card of the deck, from the deck itself. 5.28 added a sixth card, the loop still opened five, the check
// never unlocked and the run stopped here — so the a11y numbers of 5.28.0 were those of 5.27.
const signalCards = PRIMER.find(d => d.id === 'signal').cards.length;
for (let k = 0; k < signalCards; k++) { await go('primer', { deck: 'signal', card: k }); await wait(120); await page.locator('.flash-face').click(); await wait(120); }
const seenCards = await page.evaluate(() => (window.Synergy.state().profile.primer?.signal?.seen ?? []).length);
if (seenCards !== signalCards) errors.push(`«Азбука»: ${seenCards} of ${signalCards} cards of «Сигнал» marked read`);
await audit('primer-card-open');
await go('primer', { deck: 'signal', check: true }); await wait(300); await page.locator('.primer-options .option').nth(1).click(); await wait(200); await audit('primer-check');
const signalQuestions = PRIMER.find(d => d.id === 'signal').check().length; // 5.29: from the deck, like the cards
for (let k = 0; k < signalQuestions && !(await page.locator('.primer-summary').count()); k++) {
  if (!(await page.locator('.primer-why').count())) await page.locator('.primer-options .option').first().click();
  await page.locator('.primer-check ~ .sticky-actions .btn.primary').click(); await wait(150);
}
if (!(await page.locator('.primer-summary').count())) errors.push('«Азбука»: the check of «Сигнал» did not reach its result');
await audit('primer-result');
await go('onboarding', { safety: true }); await wait(300); await audit('safety-update');
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
// 5.26.4 saves a PIN only when it is typed twice; the script kept typing it once, so from 5.26.4 the PIN was never set
// and the run stopped at the gate below (found by the 5.27 audit — the e2e had not been run after that change).
await page.getByLabel('Повторите PIN').fill('1234');
await page.getByRole('button', { name: 'Сохранить PIN' }).click(); await wait(200);
if (!(await page.evaluate(() => window.Synergy.state().settings.parentPin))) errors.push('a PIN typed twice was not saved');
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

// 5.8 — back: the browser/PWA back gesture pauses a running game, a second back leaves it; Esc goes back too.
await go('play', { game: 'grip', level: 1, demo: true }); await wait(300);
await page.getByRole('button', { name: 'Старт' }).click(); await wait(4200);
await page.goBack(); await wait(300);
if (!(await page.getByRole('heading', { name: 'Пауза' }).count())) errors.push('back during a run did not pause it');
await page.goBack(); await wait(300);
if ((await page.evaluate(() => window.Synergy.state().screen)) === 'play') errors.push('second back did not leave the game');
await go('tutorial'); await wait(300); await page.keyboard.press('Escape'); await wait(300);
if ((await page.evaluate(() => window.Synergy.state().screen)) === 'tutorial') errors.push('Esc did not go back from the tutorial');
// 5.8 — keyboard and switch access outside the game: F works in the tutorial, Space on a focused pad holds it.
await go('tutorial'); await wait(300);
await page.keyboard.down('KeyF'); await wait(400);
const chipF = await page.locator('.meter-chip').textContent(); await page.keyboard.up('KeyF'); await wait(300);
if (chipF !== 'Сжатие') errors.push(`F in the tutorial: «${chipF}»`);
await page.locator('.pad-b').focus(); await page.keyboard.down('Space'); await wait(400);
const chipSpace = await page.locator('.meter-chip').textContent(); await page.keyboard.up('Space'); await wait(200);
if (chipSpace !== 'Раскрытие') errors.push(`Space on pad B: «${chipSpace}»`);
// 5.11 — F/J work while a button has focus (after «Старт» focus is on «Пауза»); a held key stays at the strength set
// with the arrows on the pad (it used to climb to 100 %, «вполсилы» could not be held).
await page.locator('.back-btn').focus(); await page.keyboard.down('KeyF'); await wait(400);
const chipFocus = await page.locator('.meter-chip').textContent(); await page.keyboard.up('KeyF'); await wait(300);
if (chipFocus !== 'Сжатие') errors.push(`F with a button focused: «${chipFocus}»`);
await page.locator('.pad-a').focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
if ((await page.locator('.pad-a').getAttribute('aria-valuenow')) !== '70') errors.push('arrows on pad A did not set 70 %');
await page.keyboard.down('Space'); await wait(1600);
const held = await page.locator('.pad-a .pad-value').textContent(); await page.keyboard.up('Space'); await wait(200);
if (held.replace(/\s/g, '') !== '70%') errors.push(`Space on pad A held at «${held}», expected 70 %`);

// 5.9 — pads without holding (tremor): a tap latches the pad, a second tap releases it.
const openSettings = async () => { await go('settings'); await wait(300); if (await page.locator('.screen.pin').count()) { await page.getByLabel('PIN родителя').fill('1234'); await page.keyboard.press('Enter'); await wait(300); } };
await openSettings(); await page.getByRole('switch', { name: /Площадки без удержания/ }).check(); await wait(200);
await go('tutorial'); await wait(300);
await page.locator('.pad-a').click(); await wait(400);
const latched = await page.locator('.meter-chip').textContent();
await page.locator('.pad-a').click(); await wait(400);
const released = await page.locator('.meter-chip').textContent();
if (latched !== 'Сжатие' || released !== 'Покой') errors.push(`pads without holding: «${latched}» then «${released}»`);
// A latched pad does not carry over to the next screen: the emulator target is reset to rest on navigation.
await page.locator('.pad-a').click(); await wait(200); await go('tutorial'); await wait(600);
const carried = await page.locator('.meter-chip').textContent();
if (carried !== 'Покой') errors.push(`a latched pad carried over to the next screen: «${carried}»`);
await openSettings(); await page.getByRole('switch', { name: /Площадки без удержания/ }).uncheck(); await wait(200);
// 5.9 — the system's «increase contrast» turns the contrast mode on by itself.
await page.emulateMedia({ contrast: 'more' }); await page.reload(); await wait(500);
if (!(await page.evaluate(() => document.documentElement.classList.contains('hc')))) errors.push('prefers-contrast: more did not switch the contrast mode on');
await page.emulateMedia({ contrast: 'no-preference' }); await page.reload(); await wait(500);

// 5.11 — the dark theme of «Bloom» by the system setting: the same screens, no axe violations (contrast of every token).
await page.emulateMedia({ colorScheme: 'dark' }); await page.reload(); await wait(500);
if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'dark') errors.push('prefers-color-scheme: dark did not switch the theme');
const darkRun = { id: 'd1', at: new Date().toISOString(), game: 'grip', level: 2, levelCount: 8, scheme: 'proportional', score: 74, stars: 2,
  skills: { precision: 62, switching: 48, stability: 81 }, details: { delivered: 4, total: 5, difficulty: 0.5 }, durationS: 96 };
for (const [name, params] of [['home'], ['progress'], ['levels', { game: 'rhythm' }], ['play', { game: 'flight', level: 1 }], ['checkin'], ['tutorial'],
  ['rest', { next: { game: 'safe', level: 1, retention: false } }], ['results', { run: darkRun, report: { xp: 90, levelUp: true, level: 3, achievements: ['first_run'], skins: ['sky'], unlockedLevel: 3 } }], ['settings'], ['primer', { deck: 'grip', card: 0 }]]) {
  await go(name, params); await wait(350); await audit(`dark-${name}`);
  if (name === 'home') await shot('v5-13-home-dark');
}
await page.emulateMedia({ colorScheme: 'light' }); await page.reload(); await wait(400);

// 5.27 (medical review) — «Стало больно» in the pause of a real (not demo) run closes today: home shows the rest day.
await go('play', { game: 'grip', level: 1 }); await wait(300);
await page.getByRole('button', { name: 'Старт' }).click(); await wait(4200);
await page.getByRole('button', { name: 'Пауза' }).click(); await wait(300);
await audit('pause-pain');
await page.getByRole('button', { name: 'Стало больно — закончить на сегодня' }).click(); await wait(500);
const painStop = await page.evaluate(() => {
  const d = new Date(), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const st = window.Synergy.state();
  return { screen: st.screen, checkin: st.profile.days[key]?.checkin ?? null, text: document.querySelector('.card.plan')?.textContent ?? '' };
});
if (painStop.screen !== 'home' || !painStop.checkin?.during || !/остановили занятие из-за боли/.test(painStop.text)) errors.push(`«Стало больно»: ${JSON.stringify({ ...painStop, text: painStop.text.slice(0, 120) })}`);

// 5.7 — landscape (WCAG 1.3.4: orientation not locked): the pads fit, nothing is cut off, no axe violations.
const land = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
land.on('pageerror', e => errors.push(`landscape: ${e.message}`));
await land.goto(base); await land.waitForTimeout(400);
for (let i = 0; i < 2; i++) { await land.getByRole('button', { name: 'Дальше' }).click(); await land.waitForTimeout(350); }
await land.getByRole('button', { name: 'Пропустить обучение' }).click(); await land.waitForTimeout(300);
for (const [scheme, game] of [['proportional', 'grip'], ['gesture', 'safe']]) {
  if (scheme === 'gesture') { await land.evaluate(() => window.Synergy.go('settings')); await land.waitForTimeout(200); await land.getByRole('radiogroup', { name: 'Схема управления' }).getByRole('radio', { name: /Жесты/ }).click(); await land.waitForTimeout(200); }
  await land.evaluate(g => window.Synergy.go('play', { game: g, level: 1 }), game); await land.waitForTimeout(400);
  const box = await land.evaluate(() => { const c = document.querySelector('.controls').getBoundingClientRect(), s = document.querySelector('.stage').getBoundingClientRect(); return { controls: c.bottom, stage: s.height, h: innerHeight }; });
  if (box.controls > box.h + 1 || box.stage < 150) errors.push(`landscape ${scheme}: ${JSON.stringify(box)}`);
  await land.screenshot({ path: `${out}/v5-12-landscape-${game}.jpg`, type: 'jpeg', quality: 78, scale: 'css' });
  if (!(await land.evaluate(() => !!window.axe))) await land.evaluate(axeSource);
  const r = await land.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }));
  audited.push(`landscape-${game}`);
  for (const v of r.violations) a11y.push({ screen: `landscape-${game}`, rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) });
}
console.log(JSON.stringify({ errors, a11y }, null, 1));
// 5.17 — the numbers of this run for docs/evidence.json (tools/evidence.mjs): states audited, light and dark.
writeEvidence('e2e-a11y', { light: audited.filter(s => !s.startsWith('dark-')).length, dark: audited.filter(s => s.startsWith('dark-')).length, violations: a11y.length, errors: errors.length, browser: browser.version(), axe: require('axe-core/package.json').version });
await browser.close();
await server.close();
process.exit(errors.length || a11y.length ? 1 : 0);
