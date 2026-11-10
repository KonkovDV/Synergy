// 6.2 — the screencast (task of 28.10: «обязательные файлы: исходный код, скринкаст, документация»; Q&A of 04.11,
// answer 33: a demonstration of the current version with the questions of a checkpoint), recorded from this very build.
// Two passes:
//   1. the real game in Chromium as a 430 × 932 phone (a size the layout linter checks), driven scene by scene
//      (tools/screencast-plan.mjs); only the phone is recorded, 1 : 1 — a recorder of the whole 1920 × 1080 stage took the
//      game below the 45 frames a second of its frame guard (PERF), and the game simplified its graphics on camera;
//   2. ffmpeg puts it on a stage: a still per scene (the caption beside the phone, in the brand's fonts, rendered by the
//      same Chromium) and the phone with rounded corners over it. 1920 × 1080, H.264, with an .srt and the chapters.
//   npm run screencast                     → tools/.cache/screencast/synergy-<version>-screencast.mp4 (+ .srt, -chapters.txt)
//   node tools/screencast.mjs --out DIR    another folder; --no-build — dist/ as it is; --draft — record even when the
//                                          evidence of this build is not clean (the captions quote it)
//   npm run screencast -- --publish        also copies the video and its subtitles to submission/Synergy-<version>-screencast.*
// 6.3.4 — the video of the build is kept in submission/ (the task, «Отправка решения»: the repository carries the source
// code, the screencast and the documentation); the team uploads the same file to the platform. Needs Playwright's
// Chromium and ffmpeg.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startServer } from './static-server.mjs';
import { SCENES, CHAPTERS, evidenceValues, fill, srt, chapterList, plannedSeconds } from './screencast-plan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const out = opt('out', join(ROOT, 'tools', '.cache', 'screencast'));
/** The stage and the phone on it, 1 : 1 (the recorder captures CSS pixels: a pixel ratio of 2 only pads the frame). */
const W = 1920, H = 1080, PHONE = { w: 430, h: 932, dpr: 1, scale: 1, x: 170, radius: 34 };
const PW = Math.round(PHONE.w * PHONE.scale), PH = Math.round(PHONE.h * PHONE.scale), PY = Math.round((H - PH) / 2);
const say = (...m) => console.log('screencast:', ...m);

// The build and its evidence: the captions quote docs/evidence.json, so it must be this version's and clean.
if (!flag('no-build')) { const b = spawnSync(process.execPath, [join(ROOT, 'tools', 'build.mjs')], { stdio: 'inherit' }); if (b.status) process.exit(b.status); }
const ev = JSON.parse(readFileSync(join(ROOT, 'docs', 'evidence.json'), 'utf8'));
const unclean = [ev.version !== version && `docs/evidence.json — версия ${ev.version}, а package.json — ${version}`,
  ev.a11y?.violations !== 0 && `axe: ${ev.a11y?.violations} нарушений`, ev.layout?.findings !== 0 && `линтер раскладки: ${ev.layout?.findings} находок`,
  ev.tests?.failed !== 0 && `тесты: ${ev.tests?.failed} упали`].filter(Boolean);
if (unclean.length && !flag('draft')) { console.error(`screencast: доказательства этой сборки не чистые, а ролик их цитирует:\n  ${unclean.join('\n  ')}\nсначала прогоны и node tools/evidence.mjs, или --draft`); process.exit(1); }
const values = evidenceValues(ev);
const ffmpeg = ['ffmpeg', '/usr/bin/ffmpeg'].find(bin => spawnSync(bin, ['-version']).status === 0);
if (!ffmpeg) { console.error('screencast: нужен ffmpeg (сборка H.264): apt install ffmpeg или https://ffmpeg.org'); process.exit(1); }

mkdirSync(out, { recursive: true });
const work = join(out, 'work');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const server = await startServer({ root: join(ROOT, 'dist') });
const origin = server.url.replace(/index\.html$/, '');
const browser = await playwright.chromium.launch();
const errors = [];

// ── Pass 1: the phone ──────────────────────────────────────────────────────────────────────────────────────────────
const phone = await browser.newContext({ viewport: { width: PHONE.w, height: PHONE.h }, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true,
  locale: 'ru-RU', colorScheme: 'light', recordVideo: { dir: join(work, 'raw'), size: { width: PHONE.w, height: PHONE.h } } });
const page = await phone.newPage();
const opened = Date.now(); // the recording starts with the page
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.url);
await page.waitForFunction(() => !!window.Synergy?.go);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);

const wait = ms => page.waitForTimeout(ms);
const go = (name, params = {}) => page.evaluate(([n, p]) => window.Synergy.go(n, p), [name, params]);
const unfocus = () => page.evaluate(() => document.activeElement?.blur?.());
const hold = async (key, ms) => { await unfocus(); await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
/** Opens the folded section that holds `selector` and brings the element into view. */
const show = (selector, block = 'start') => page.evaluate(([sel, b]) => {
  const el = document.querySelector(sel);
  el?.closest('details')?.setAttribute('open', '');
  el?.scrollIntoView({ block: b });
  return !!el;
}, [selector, block]);
const skipTour = async () => { const skip = page.locator('.tour').getByRole('button', { name: 'Пропустить подсказки' }); if (await skip.count()) await skip.click(); };
const start = () => page.getByRole('button', { name: 'Старт' }).click();
const scheme = async name => { await go('settings'); await wait(250); await page.getByRole('radiogroup', { name: 'Схема управления' }).getByRole('radio', { name }).click(); await wait(250); };

/** What each scene does in the game. A scene lasts its `seconds` at least, longer when its action needs it. */
const ACT = {
  cover: async () => {},
  start: async () => {
    for (const name of ['Дальше', 'Дальше']) { await page.getByRole('button', { name }).click(); await wait(700); }
    await page.getByRole('button', { name: 'Пропустить обучение' }).click(); await wait(1200);
    await page.keyboard.press('Escape'); // the hint tour of the home screen
  },
  // 6.3.3 — the training mode (the organizers, 10.11): the first steps pass with the keys of the emulator's pads.
  tutorial: async () => {
    await go('tutorial'); await wait(2600);        // «Покой» passes by itself
    await hold('KeyF', 2400); await wait(2600);   // «Сжатие · A», then «Снова покой»
    await hold('KeyJ', 2400); await wait(1400);   // «Раскрытие · B»
  },
  stream1: async () => {
    await go('settings'); await wait(300);
    await show('.meter', 'start'); await wait(700);
    await hold('KeyF', 1600); await wait(500);
    await hold('KeyJ', 1600); await wait(500);
    await hold('Space', 1800);
  },
  stream2: async () => {
    await scheme(/Жесты/);
    await show('.stream-rate', 'start'); await wait(300);
    await page.getByRole('radiogroup', { name: 'Частота пакетов эмулятора СПППР' }).getByRole('radio', { name: /10 Гц/ }).click(); await wait(1600);
    await show('.meter', 'start'); await wait(600);
    await hold('Digit2', 1900); await wait(600);
    await hold('Digit3', 1900); await wait(600);
    await hold('Digit4', 1500);
  },
  rhythm: async () => { await go('play', { game: 'rhythm', level: 2, demo: true }); await wait(700); await start(); },
  // 6.3.3 — a whole level with the emulator in the frame (the organizers, 10.11): the demo presses the pads of the emulator
  // (ui/play.js), in the threshold scheme — the scheme of serial hands (answer 2 of the experts, 09.11).
  grip: async () => {
    await scheme(/Порог/); await go('play', { game: 'grip', level: 1, demo: true }); await wait(700); await start();
    await page.waitForSelector('.results', { timeout: 60000 });
  },
  results: async () => {
    await wait(1800); // the score and the stars of the level just played first
    await page.evaluate(() => [...document.querySelectorAll('.results p, .results li, .results div')].find(x => /^Команды каналов/.test(x.textContent ?? ''))?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await wait(2700); // then the line of the channels, long enough to read
  },
  motivation: async () => {
    await go('settings'); await wait(300);
    await page.locator('summary', { hasText: 'Данные' }).click(); await wait(250);
    // 6.3.4: straight to the nest — the demo profile opens «Прогресс» with its hint tour, and the caption about the
    // Firebird stood beside «Неделя к неделе» for the first two seconds of the scene.
    await page.getByRole('button', { name: 'Демо-профиль для презентации' }).click(); await wait(250);
    await skipTour();
    await go('nest'); await wait(900); await skipTour();
  },
  specialist: async () => {
    await go('progress'); await wait(500); await skipTour();
    await show('[data-tour="progress.week"]', 'start'); await wait(2600);
    await page.evaluate(() => document.querySelector('[data-tour="progress.report"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  },
  access: async () => {
    await go('settings'); await wait(300);
    await page.getByRole('radiogroup', { name: 'Размер текста' }).getByRole('radio', { name: /^130/ }).click(); await wait(300);
    await page.getByRole('switch', { name: /Высокий контраст/ }).check(); await wait(300);
    await go('home'); await wait(300);
  },
  outro: async () => {
    await go('settings'); await wait(300);
    await page.getByRole('switch', { name: /Высокий контраст/ }).uncheck();
    await page.getByRole('radiogroup', { name: 'Размер текста' }).getByRole('radio', { name: /^100/ }).click();
    await go('home'); await wait(300);
  },
};

const captions = SCENES.map(scene => ({ id: scene.id, chapter: scene.chapter, chapterName: fill(CHAPTERS[scene.chapter], values), title: fill(scene.title, values), text: fill(scene.text, values) }));
const cues = [];
const t0 = Date.now();
for (const [i, scene] of SCENES.entries()) {
  const begin = Date.now();
  say(`${i + 1}/${SCENES.length} ${scene.id}`);
  try { await ACT[scene.id](); } catch (e) { errors.push(`${scene.id}: ${e.message.split('\n')[0]}`); }
  const left = scene.seconds * 1000 - (Date.now() - begin);
  if (left > 0) await wait(left);
  cues.push({ ...captions[i], start: (begin - t0) / 1000, end: (Date.now() - t0) / 1000 });
}
const total = (Date.now() - t0) / 1000;
const video = page.video();
await phone.close();
const webm = await video.path();

// ── Pass 2: the stage ──────────────────────────────────────────────────────────────────────────────────────────────
function stageHtml() {
  const face = (family, file, range) => `@font-face{font-family:${family};src:url(fonts/${file}) format('woff2');font-weight:100 900;font-display:block${range ? `;unicode-range:${range}` : ''}}`;
  const cyr = 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
  const fonts = [face('Unbounded', 'unbounded-cyr.woff2', cyr), face('Unbounded', 'unbounded-lat.woff2'), face('Inter', 'inter-cyr.woff2', cyr), face('Inter', 'inter-lat.woff2')].join('');
  const chapters = [...new Set(SCENES.map(s => s.chapter))];
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Синергия ${version} — скринкаст</title><style>${fonts}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(1200px 900px at 22% 50%,#123047 0,#071019 62%) #071019;color:#fff;font-family:Inter,system-ui,sans-serif}
.phone{position:absolute;left:${PHONE.x}px;top:${PY}px;width:${PW}px;height:${PH}px;border-radius:${Math.round(PHONE.radius * PHONE.scale)}px;background:#0e1a24;box-shadow:0 0 0 10px #0e1a24,0 0 0 12px #34495a,0 30px 90px rgba(0,0,0,.55)}
.mask{position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;background:#000}.mask i{display:block;width:100%;height:100%;border-radius:${Math.round(PHONE.radius * PHONE.scale)}px;background:#fff}
.brand{position:absolute;left:760px;top:74px;font:800 30px/1 Unbounded;letter-spacing:.01em}.brand small{font:500 22px/1 Inter;color:#8fa3b3;margin-left:16px;letter-spacing:0}
.panel{position:absolute;left:760px;right:110px;top:250px}
.chapter{font:700 26px/1.2 Inter;color:#16e182}.title{font:800 54px/1.16 Unbounded;margin:20px 0 28px;text-wrap:balance}
.text{font:400 33px/1.45 Inter;color:#d6e0e8;max-width:1000px;text-wrap:pretty}
.progress{position:absolute;left:760px;right:110px;bottom:84px;display:flex;gap:12px}
.progress b{flex:1;height:7px;border-radius:4px;background:#213140}.progress b.on{background:#16e182}.progress b.done{background:#1f6f52}
</style></head><body>
<div class="phone"></div>
<div class="brand">Синергия<small>${version} · экран телефона ${PHONE.w} × ${PHONE.h} · эмулятор сигнала, протез не нужен</small></div>
<div class="panel"><div class="chapter" id="chapter"></div><div class="title" id="title"></div><div class="text" id="text"></div></div>
<div class="progress">${chapters.map(c => `<b data-chapter="${c}"></b>`).join('')}</div>
</body></html>`;
}
const stage = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ru-RU' });
await stage.route('**/__screencast.html', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: stageHtml() }));
const still = await stage.newPage();
await still.goto(`${origin}__screencast.html`);
await still.evaluate(() => document.fonts.ready);
const stills = [];
for (const cue of cues) {
  await still.evaluate(({ c }) => {
    for (const k of ['chapter', 'title', 'text']) document.getElementById(k).textContent = c[k === 'chapter' ? 'chapterName' : k];
    let seen = true;
    for (const b of document.querySelectorAll('.progress b')) { b.className = b.dataset.chapter === c.chapter ? 'on' : seen ? 'done' : ''; if (b.dataset.chapter === c.chapter) seen = false; }
  }, { c: cue });
  const file = join(work, `stage-${String(stills.length + 1).padStart(2, '0')}.png`);
  await still.screenshot({ path: file });
  stills.push({ file, seconds: cue.end - cue.start });
}
// The mask of the phone's screen: white where the screen is, rounded like the bezel.
await still.setContent(`<div style="position:fixed;inset:0;background:#000"><div style="width:${PW}px;height:${PH}px;border-radius:${Math.round(PHONE.radius * PHONE.scale)}px;background:#fff"></div></div>`);
await still.setViewportSize({ width: PW, height: PH });
const mask = join(work, 'mask.png');
await still.screenshot({ path: mask });
await stage.close();
await browser.close();
await server.close();

// The stills as a slideshow (the concat demuxer repeats the last file), the phone over it.
const list = join(work, 'stage.txt');
writeFileSync(list, `${stills.map(s => `file '${s.file}'\nduration ${s.seconds.toFixed(3)}`).join('\n')}\nfile '${stills.at(-1).file}'\n`);
const name = `synergy-${version}-screencast`;
const mp4 = join(out, `${name}.mp4`);
const trim = (t0 - opened) / 1000;
const filter = `[0:v]trim=start=${trim.toFixed(3)}:duration=${total.toFixed(3)},setpts=PTS-STARTPTS,scale=${PW}:${PH}:flags=lanczos,format=yuva420p[ph];`
  + `[2:v]scale=${PW}:${PH},format=gray[m];[ph][m]alphamerge[phm];[1:v]fps=30,format=yuva420p[bg];[bg][phm]overlay=${PHONE.x}:${PY}:shortest=1,format=yuv420p[v]`;
const enc = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', webm, '-f', 'concat', '-safe', '0', '-i', list, '-loop', '1', '-i', mask,
  '-filter_complex', filter, '-map', '[v]', '-t', total.toFixed(3), '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
if (enc.status) { console.error('screencast: ffmpeg не собрал ролик'); process.exit(1); }
writeFileSync(join(out, `${name}.srt`), srt(cues));
writeFileSync(join(out, `${name}-chapters.txt`), `${chapterList(cues)}\n`);
writeFileSync(join(out, `${name}.json`), `${JSON.stringify({ version, recorded: new Date().toISOString(), seconds: Math.round(total * 10) / 10, planned: plannedSeconds(),
  evidence: { tests: ev.tests?.total, a11y: ev.a11y?.source, layout: ev.layout?.source }, errors, cues }, null, 1)}\n`);
if (!flag('keep')) rmSync(work, { recursive: true, force: true });
say(`${mp4} — ${Math.round(total)} с, ${Math.round(statSync(mp4).size / 1024 / 102.4) / 10} МБ; субтитры .srt и главы рядом`);
if (errors.length) { console.error(`screencast: ошибки во время записи:\n  ${errors.join('\n  ')}`); process.exit(1); }
if (flag('publish')) {
  // One video in the repository — of this version (the gate refuses another one): the earlier files go.
  const dir = join(ROOT, 'submission');
  for (const f of readdirSync(dir).filter(f => /^Synergy-.*-screencast\.(mp4|srt)$/.test(f))) rmSync(join(dir, f));
  for (const ext of ['mp4', 'srt']) copyFileSync(join(out, `${name}.${ext}`), join(dir, `Synergy-${version}-screencast.${ext}`));
  say(`submission/Synergy-${version}-screencast.mp4 и .srt — для репозитория и загрузки на платформу`);
}
