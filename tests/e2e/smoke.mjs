// Mobile smoke test: onboarding → home → every game intro + demo frames → results → progress → settings.
// Usage: node tests/e2e/smoke.mjs [baseUrl] [outDir]   (no URL — serves the repository itself: unbundled source)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { baseUrl } from '../../tools/static-server.mjs';
import { writeEvidence } from '../../tools/evidence.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const server = await baseUrl({ source: true });
const base = server.url;
const out = process.argv.slice(2).find(a => !a.startsWith('http')) ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// Light screenshots (5.8): JPEG in CSS pixels — every PNG@2× re-shot used to stay in git history (24 MB of 25).
const shot = name => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 78, scale: 'css' });
const wait = ms => page.waitForTimeout(ms);

await page.goto(base);
await wait(400); await shot('01-onboarding');
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(350);
await page.getByRole('button', { name: 'Дальше' }).click(); await wait(350);
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

// 6.0, 05.11 — «Созвездие» on the joystick of the СПППР stream: the home card, the levels, a demo run to the results,
// and a run by hand on the keys of the set (2 — flexion) that moves the spark.
await page.evaluate(() => window.Synergy.go('home')); await wait(400);
const starsCard = page.getByRole('button', { name: 'Играть на джойстике' });
if (!(await starsCard.count())) errors.push('home: no «Созвездие» card in the gesture scheme of the task set');
else { await starsCard.click(); await wait(300); await shot('14-stars-levels'); }
await page.evaluate(() => window.Synergy.go('play', { game: 'stars', level: 4, demo: true }));
await wait(300); await page.getByRole('button', { name: 'Старт' }).click();
await wait(5000); await shot('15-stars-demo');
await page.waitForSelector('.results', { timeout: 90000 }).catch(() => errors.push('stars: the demo run did not reach the results'));
await wait(400); await shot('16-stars-results');
await page.evaluate(() => window.Synergy.go('play', { game: 'stars', level: 1 }));
await wait(300); await page.getByRole('button', { name: 'Старт' }).click(); await wait(4200);
await page.keyboard.down('Digit3'); await wait(900); await shot('17-stars-hand'); await page.keyboard.up('Digit3'); await wait(300);

// 06.11 — Q&A of 04.11, answer 25: «потерю больше 1–2 секунд надо считать критической и выходить». The host's frames
// stop in the middle of an exercise: after 1.5 s without a frame (6.2.1: SIGNAL.criticalLossMs) it pauses and says why.
await page.evaluate(() => { window.Synergy.feed({ a: 0.02, b: 0.02 }); window.__feed = setInterval(() => window.Synergy.feed({ a: 0.02, b: 0.02 }), 40); });
await page.evaluate(() => window.Synergy.go('play', { game: 'grip', level: 1 }));
await wait(300); await page.getByRole('button', { name: 'Старт' }).click();
// 6.2.1: the 3-2-1 first begins, then ends — right after the click the hint still shows the intro, and a wait for «no
// countdown» passed at once: the frames stopped during the 3-2-1, not in the middle of the exercise.
await page.waitForFunction(() => /Старт через/.test(document.querySelector('.stage-hint')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => errors.push('loss: the countdown did not begin'));
await page.waitForFunction(() => !/Старт через/.test(document.querySelector('.stage-hint')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => errors.push('loss: the countdown did not end'));
await wait(600);
await page.evaluate(() => clearInterval(window.__feed));
await page.getByRole('heading', { name: 'Сигнал потерян' }).waitFor({ timeout: 4000 }).catch(() => errors.push('loss: a lost signal did not pause the exercise (answer 25)'));
await shot('18-signal-lost-pause');
await page.locator('.overlay').getByRole('button', { name: 'Выйти' }).click().catch(() => errors.push('loss: no «Выйти» on the pause'));
await page.evaluate(() => window.Synergy.useTouch()); await wait(300);

const state = await page.evaluate(() => window.Synergy.state());
console.log(JSON.stringify({ errors, screen: state.screen, runs: state.runs, scheme: state.settings.scheme }, null, 2));
writeEvidence('smoke', { errors: errors.length, out });
await browser.close();
await server.close();
if (errors.length) process.exit(1);
