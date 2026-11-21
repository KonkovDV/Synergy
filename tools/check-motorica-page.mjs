#!/usr/bin/env node
// Сайт и колода для «Моторики» в настоящем браузере, как их отдаёт GitHub Pages.   node tools/check-motorica-page.mjs
// Сайт собирается как в workflow Pages: dist/ (если собран) на /Synergy/, колода — на /Synergy/motorica/.
// Проверяется: нет ошибок консоли и упавших запросов; шрифты и картинки загружены; на широком экране — колода:
// слайд целиком в окне, листается стрелками, PageDown, Home и End, #sN открывает нужный слайд, ссылки «слайд N →»
// переходят; маршрут «20 минут» и маршруты восьми кресел (список и карточки) листают только свои слайды, ?route=
// включает маршрут; текст выступления (N) — тот же, что у слайда; калькулятор считает как tools/motorica/model.mjs,
// а ссылка на расчёт восстанавливает его; правило решения по пилоту и даты недель работают; тренажёр открывается в
// окне и закрывается Esc с возвратом фокуса; у каждого слайда в печати и в колоде нет обрезанных блоков, текста на
// тексте и подписей за краем (tools/motorica-layout.mjs), в ленте на телефоне широкие схемы листаются вбок; на телефоне — лента слайдов, ссылки прокручивают к слайду; от 320 до
// 2560 px ничего не прокручивается вбок; axe-core — 0 нарушений (WCAG 2.2 AA и best practices) в ленте со всеми
// слайдами, в колоде с открытыми заметками и тренажёром и на странице плана; страницу забирает свой service
// worker, и она открывается без сети. Нужны Playwright с Chromium и axe-core (devDependencies).
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, cpSync, existsSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { layoutIssues } from './motorica-layout.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axePath = join(root, 'node_modules/axe-core/axe.min.js');
if (!existsSync(axePath)) { console.log('Нет node_modules/axe-core — сначала npm ci'); process.exit(1); }
const { BASE, SCEN, calc } = await import(pathToFileURL(join(root, 'tools/motorica/model.mjs')).href);
const { slides: META } = JSON.parse(readFileSync(join(root, 'motorica/slides.json'), 'utf8'));
const N = META.length;
const nOf = (layout) => META.find((s) => s.layout === layout)?.n;

const site = mkdtempSync(join(tmpdir(), 'motorica-pages-'));
const withGame = existsSync(join(root, 'dist/index.html'));
if (withGame) cpSync(join(root, 'dist'), join(site, 'Synergy'), { recursive: true });
else {   // без сборки игры — заглушка на её месте: колода открывает тренажёр по адресу ../
  cpSync(join(root, 'public/icons'), join(site, 'Synergy/icons'), { recursive: true });
  writeFileSync(join(site, 'Synergy/index.html'), '<!doctype html><html lang="ru"><title>Синергия</title><p>Тренажёр</p></html>');
}
mkdirSync(join(site, 'Synergy/motorica'), { recursive: true });
const FILES = ['index.html', 'plan.html', 'site.css', 'app.js', 'sw.js', 'og.jpg', 'fonts', 'img', 'MOTUS-Lab-Motorica.pptx', 'MOTUS-Lab-Motorica.pdf', 'MOTUS-Lab-Motorica-model.xlsx'];
for (const f of FILES) cpSync(join(root, 'motorica', f), join(site, 'Synergy/motorica', f), { recursive: true });
let sha = '0'.repeat(40);
try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); } catch { /* не git */ }
writeFileSync(join(site, 'Synergy/motorica/build.json'), JSON.stringify({ sha, run: '1', at: new Date().toISOString().slice(0, 16) + 'Z' }));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.mp4': 'video/mp4' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(site, p);
  let st;
  try { st = statSync(f); } catch { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
  if (st.isDirectory()) { res.writeHead(301, { location: `${p}/` }); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'content-length': st.size });
  createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/Synergy/`;
const url = `${base}motorica/`;
const problems = [];
const fail = (m) => problems.push(m);
const browser = await chromium.launch();
let offline = false;   // без сети запросы мимо service worker (build.json, игра) падают — так и должно быть
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error' && !(offline && /ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()))) fail(`консоль: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`ошибка скрипта: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) fail(`HTTP ${r.status()}: ${r.url()}`); });
};
const ready = (p) => p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 15000 });
const on = (p) => p.evaluate(() => [...document.querySelectorAll('#deck > .s.on')].map((s) => +s.dataset.n));
const digits = (s) => String(s).replace(/\s/g, '');
const ru = (x) => Math.round(x).toLocaleString('ru-RU').replace(/\s/g, '');
const go = async (p, n) => { await p.evaluate((v) => { location.hash = `#s${v}`; }, n); await p.waitForTimeout(80); };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
// axe внедряется скриптом, а строгая CSP страницы его не пустит: аудит идёт в отдельном контексте с bypassCSP,
// основная проверка — под настоящей CSP (её нарушения попадают в консоль как ошибки).
const axe = async (p, label) => {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: axePath });
  const v = await p.evaluate(async (tags) => (await window.axe.run(document, { runOnly: tags })).violations
    .map((x) => `${x.id} ×${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')}`), AXE_TAGS);
  if (v.length) fail(`axe, ${label}: ${v.join(' | ')}`);
};
async function audit(viewport, path, label, setup = async () => {}) {
  const c = await browser.newContext({ viewport, bypassCSP: true, serviceWorkers: 'block' });
  const p = await c.newPage();
  await p.goto(`${url}${path}`, { waitUntil: 'load' });
  if (!path.startsWith('plan')) await ready(p);
  await p.evaluate(() => document.fonts.ready);
  await setup(p);
  await axe(p, label);
  await c.close();
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  const page = await ctx.newPage();
  watch(page);
  if (withGame) { await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1500); }   // посетитель сначала открыл игру

  // ── 1. Колода: режим, шрифты, картинки, слайд в окне ──
  await page.goto(url, { waitUntil: 'load' });
  await ready(page);
  const first = await page.evaluate(() => ({ mode: document.documentElement.className, n: document.querySelectorAll('#deck > .s').length,
    dots: document.querySelectorAll('.track .dot').length, opts: document.querySelectorAll('select[data-route] option').length }));
  if (!/\bdeck\b/.test(first.mode) || first.n !== N) fail(`колода на 1440 × 900: ${JSON.stringify(first)}`);
  if (first.dots !== N) fail(`точек навигации ${first.dots}, слайдов ${N}`);
  if (first.opts !== 10) fail(`в списке маршрутов ${first.opts} пунктов, а нужно 10: все, «20 минут» и 8 кресел`);
  if (JSON.stringify(await on(page)) !== '[1]') fail(`при открытии показан не первый слайд: ${await on(page)}`);
  if (!(await page.evaluate(() => document.fonts.check('600 40px Unbounded', 'Моторика')))) fail('шрифт Unbounded не загрузился');
  if (!(await page.evaluate(() => document.fonts.check('400 16px Inter', 'Моторика')))) fail('шрифт Inter не загрузился');
  const broken = await page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')));
  if (broken.length) fail(`картинки не загрузились: ${broken.join(', ')}`);
  const fits = async (label) => {
    const r = await page.evaluate(() => { const b = document.querySelector('#deck > .s.on').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, innerWidth, innerHeight].map(Math.round); });
    if (r[0] < 0 || r[1] < 0 || r[2] > r[4] || r[3] > r[5]) fail(`${label}: слайд не помещается в окно: ${r}`);
  };
  await fits('1440 × 900');

  // ── 2. Клавиши и адрес ──
  for (const [key, want] of [['ArrowRight', 2], ['End', N], ['Home', 1], ['PageDown', 2], ['ArrowLeft', 1]]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
    const [h, s] = await page.evaluate(() => [location.hash, document.querySelector('#deck > .s.on')?.dataset.n]);
    if (h !== `#s${want}` || +s !== want) fail(`колода: ${key} → ${h}, слайд ${s}, а нужно ${want}`);
  }
  // Ссылки «слайд N →» и точки навигации
  await go(page, nOf('summary'));
  await page.locator(`#s${nOf('summary')} a.sum-col`).first().click();
  if (JSON.stringify(await on(page)) !== `[${nOf('model')}]`) fail(`ссылка с карточки «Коротко» ведёт на ${await on(page)}, а нужно ${nOf('model')}`);
  await page.locator(`.track .dot[data-n="${nOf('weeks')}"]`).click();
  if (JSON.stringify(await on(page)) !== `[${nOf('weeks')}]`) fail(`точка навигации ведёт на ${await on(page)}`);

  // ── 3. Маршруты: «20 минут» и кресла ──
  const deckData = await page.evaluate(() => JSON.parse(document.getElementById('deck-data').textContent));
  await page.selectOption('select[data-route]', 'core');
  const core = await page.evaluate(() => [...document.querySelectorAll('#deck > .s.inroute')].map((s) => +s.dataset.n));
  if (JSON.stringify(core) !== JSON.stringify(deckData.core)) fail(`маршрут «20 минут»: ${core}`);
  await page.keyboard.press('Home');
  for (const want of deckData.core.slice(1, 4)) {
    await page.keyboard.press('ArrowRight');
    const s = await on(page);
    if (s[0] !== want) fail(`маршрут «20 минут»: → показывает ${s}, а нужно ${want}`);
  }
  await go(page, nOf('chairs'));
  await page.selectOption('select[data-route]', '');
  await go(page, nOf('chairs'));
  await page.locator(`#s${nOf('chairs')} [data-chair="cfo"]`).click();
  const cfo = await page.evaluate(() => ({ sel: document.querySelector('select[data-route]').value, n: [...document.querySelectorAll('#deck > .s.inroute')].map((s) => +s.dataset.n), q: location.search }));
  if (cfo.sel !== 'cfo' || JSON.stringify(cfo.n) !== JSON.stringify(deckData.chairs.cfo.slides) || !cfo.q.includes('route=cfo')) fail(`карточка кресла CFO: ${JSON.stringify(cfo)}`);
  await page.locator(`#s${nOf('chairs')} [data-chair="cfo"]`).click().catch(() => {});
  await page.selectOption('select[data-route]', '');
  if ((await page.evaluate(() => document.querySelectorAll('#deck > .s.inroute').length)) !== N) fail('после «Все слайды» маршрут не снят');

  // ── 4. Текст выступления ──
  await go(page, nOf('levers'));
  await page.keyboard.press('n');
  const notes = await page.evaluate(() => ({ hidden: document.getElementById('notes').hidden, text: document.querySelector('[data-np-text]').textContent,
    own: document.querySelector('#deck > .s.on .speech p').textContent }));
  if (notes.hidden || !notes.text || notes.text !== notes.own) fail(`заметки (N): ${JSON.stringify(notes).slice(0, 200)}`);
  await page.keyboard.press('n');

  // ── 5. Калькулятор = модель ──
  await go(page, nOf('model'));
  const mc = await page.evaluate(() => { const r = window.motoricaCalc({}, {}); const c = window.motoricaCalc({ repeat: 0.45, period: 2 }, { reach: 0.7, drop: 0.15 }); return { r, c }; });
  const ref = calc(BASE, SCEN.base), refC = calc({ ...BASE, repeat: 0.45, period: 2 }, { ...SCEN.base, reach: 0.7, drop: 0.15 });
  for (const [k, a, b] of [['2031', mc.r.total[4], ref.total[4]], ['cum', mc.r.cum, ref.cum], ['EBITDA все рычаги', mc.r.ebitdaFull[4], ref.ebitdaFull[4]], ['рычаги L3–L7', mc.r.ops, ref.ops],
    ['свой сценарий 2031', mc.c.total[4], refC.total[4]], ['свой сценарий EBITDA', mc.c.ebitdaFull[4], refC.ebitdaFull[4]]]) {
    if (Math.abs(a - b) > 1e-6) fail(`калькулятор ≠ модель (${k}): ${a} и ${b}`);
  }
  const shown = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-calc] [data-o]')].map((e) => [e.dataset.o, e.textContent])));
  for (const k of ['cons', 'base', 'opt']) {
    const r = calc(BASE, SCEN[k]);
    for (const [o, x] of [['2031', r.total[4]], ['cum', r.cum], ['ebitda', r.ebitdaFull[4]]]) if (digits(shown[`${k}-${o}`]) !== ru(x)) fail(`таблица сценариев: ${k}-${o} = ${shown[`${k}-${o}`]}, а модель — ${ru(x)}`);
  }
  await page.locator('[data-calc] input[data-k="reach"]').fill('70');
  await page.locator('[data-calc] input[data-k="drop"]').fill('15');
  const my = calc(BASE, { ...SCEN.base, reach: 0.7, drop: 0.15 });
  const mine = await page.evaluate(() => ({ v: document.querySelector('[data-o="my-2031"]').textContent, line: !!document.querySelector('[data-chart] .c-mine polyline') }));
  if (digits(mine.v) !== ru(my.total[4]) || !mine.line) fail(`ползунки: «ваш сценарий» ${mine.v}, а модель — ${ru(my.total[4])}; линия на графике: ${mine.line}`);
  await page.locator('[data-calc] [data-share]').click();
  await page.waitForTimeout(150);
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  if (!/[?&]reach=70\b/.test(shared) || !/[?&]drop=15\b/.test(shared) || !shared.endsWith(`#s${nOf('model')}`)) fail(`ссылка на расчёт: ${shared}`);
  const sp = await ctx.newPage();
  watch(sp);
  await sp.goto(shared.replace(/^https?:\/\/[^/]+/, new URL(base).origin), { waitUntil: 'load' });
  await ready(sp);
  const restored = await sp.evaluate(() => ({ on: document.querySelector('#deck > .s.on')?.dataset.n, v: document.querySelector('[data-o="my-2031"]').textContent }));
  if (+restored.on !== nOf('model') || digits(restored.v) !== ru(my.total[4])) fail(`ссылка на расчёт не восстановила его: ${JSON.stringify(restored)}`);
  await sp.close();
  await page.locator('[data-calc] [data-reset]').click();
  if (digits(await page.locator('[data-o="my-2031"]').textContent()) !== ru(ref.total[4])) fail('«Исходные цифры» не вернули базовый сценарий');

  // ── 5б. Интерактив не двигает вёрстку: наведение, ползунки и галочки не меняют размеры блоков слайда ──
  // Сравниваются блоки двух верхних уровней тела слайда: если подсказка или число переносится на новую строку,
  // блок меняет высоту — это и есть «скачет пропорция». Самая длинная и самая короткая подсказка карты — обязательно.
  const boxesOf = (n) => page.evaluate((n) => [...document.querySelectorAll(`#s${n} .body > *, #s${n} .body > * > *`)]
    .filter((e) => !e.parentElement.closest('svg')).map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }), n);
  // Блоки слайда появляются с короткой анимацией: мерить — когда она закончилась, иначе «сдвиг» — это полёт блока
  const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 });
  const steady = async (layout, label, act) => {
    const n = nOf(layout);
    await go(page, n);
    await settled();
    const before = await boxesOf(n);
    await act(n);
    await page.waitForTimeout(80);
    await settled();
    const after = await boxesOf(n);
    const moved = before.filter((x, i) => x !== after[i]).length;
    if (moved || before.length !== after.length) fail(`${label}: вёрстка сдвигается при взаимодействии — ${moved} блоков`);
  };
  await steady('heatmap', 'карта компетенций, наведение', async (n) => {
    const cells = page.locator(`#s${n} svg.heat .hm`);
    const [longest, shortest] = await page.evaluate((n) => { const t = [...document.querySelectorAll(`#s${n} svg.heat .hm`)].map((e) => e.dataset.tip.length); return [t.indexOf(Math.max(...t)), t.indexOf(Math.min(...t))]; }, n);
    for (const i of [longest, shortest, 0, longest]) await cells.nth(i).hover({ force: true });
  });
  await steady('mapping', 'связи портфеля, наведение', async (n) => { for (const g of await page.locator(`#s${n} [data-map] .mr`).all()) await g.hover({ force: true }); });
  await steady('gantt', 'дорожная карта, наведение', async (n) => { for (const g of (await page.locator(`#s${n} [data-gantt] .gr`).all()).slice(0, 4)) await g.hover({ force: true }); });
  await steady('risks', 'риски, наведение', async (n) => { for (const g of (await page.locator(`#s${n} [data-risk]`).all()).slice(0, 6)) await g.hover({ force: true }); });
  await steady('model', 'калькулятор, ползунки', async (n) => {
    for (const r of await page.locator(`#s${n} [data-calc] input[type="range"]`).all()) { await r.evaluate((e) => { e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true })); }); }
    for (const r of await page.locator(`#s${n} [data-calc] input[type="range"]`).all()) { await r.evaluate((e) => { e.value = e.min; e.dispatchEvent(new Event('input', { bubbles: true })); }); }
  });
  await steady('weeks', 'первые 90 дней, дата старта', async (n) => { await page.locator(`#s${n} input[data-start]`).fill('2027-12-27'); await page.locator(`#s${n} input[data-start]`).dispatchEvent('change'); });
  await steady('decision', 'правило решения, галочки', async (n) => { for (const b of await page.locator(`#s${n} [data-decide] input[data-h]`).all()) await b.click(); });

  // ── 5в. Счётчик, перехват мыши и подсказки карты: мышь, касание, клавиатура ──
  {   // при включении колоды виден ровно один слайд — без затухания всех остальных стопкой
    const fresh = await ctx.newPage();
    await fresh.goto(`${url}#s${nOf('decision')}`, { waitUntil: 'load' });
    await ready(fresh);
    const shown = await fresh.evaluate(() => [...document.querySelectorAll('#deck > .s')].filter((s) => getComputedStyle(s).visibility === 'visible').length);
    if (shown !== 1) fail(`после загрузки видно слайдов: ${shown}, а должен быть один`);
    await fresh.close();
  }
  const count = (await page.locator('.count').textContent()).replace(/\s+/g, ' ').trim();
  if (!new RegExp(`/ ${N}$`).test(count)) fail(`счётчик слайдов «${count}», а слайдов ${N}`);
  for (const layout of ['heatmap', 'scorecard', 'wpmap', 'decisions']) {
    const n = nOf(layout);
    await go(page, n);
    await page.waitForTimeout(450);   // гаснущий слайд ещё виден 0,35 с
    const stray = await page.evaluate((n) => {
      const s = document.getElementById(`s${n}`); const r = s.querySelector('.body').getBoundingClientRect(); const out = [];
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
        const e = document.elementFromPoint(r.left + (r.width * i) / 6, r.top + (r.height * j) / 6);
        if (e && !s.contains(e) && e.closest('#deck')) out.push(`${e.tagName.toLowerCase()} со слайда ${e.closest('.s')?.dataset.n}`);
      }
      return out.slice(0, 3);
    }, n);
    if (stray.length) fail(`слайд ${n}: мышь перехватывает невидимый слайд — ${stray.join(', ')}`);
  }
  {
    const n = nOf('heatmap');
    await go(page, n);
    await page.waitForTimeout(450);
    const tipText = () => page.locator(`#s${n} [data-heat-tip]`).textContent();
    const cell = page.locator(`#s${n} svg.heat .hm`).nth(150);
    await cell.hover();
    if (!/ · .+: /.test(await tipText())) fail(`карта компетенций: наведение не показывает подсказку — «${(await tipText()).slice(0, 60)}»`);
    const cols = await page.evaluate(() => document.querySelectorAll('.heat .hm-row')[0].querySelectorAll('.hm').length);
    const edge = page.locator(`#s${n} svg.heat .hm`).nth(cols - 1);   // крайний правый столбец — в зоне «щелчок листает дальше»
    await edge.click();
    if ((await on(page))[0] !== n) fail('карта компетенций: касание клетки у правого края листает слайд');
    if ((await tipText()) !== (await edge.getAttribute('data-tip'))) fail('карта компетенций: касание клетки не показывает подсказку');
    const link = page.locator(`#s${n} svg.heat .hm-link`).nth(5);
    await link.focus();
    if ((await tipText()) !== (await link.getAttribute('data-tip'))) fail('карта компетенций: фокус на названии репозитория не показывает подсказку');
  }

  // ── 5г. Вёрстка каждого слайда: нет обрезанных блоков, текста на тексте и на картинках, подписей за краем, ──
  // слипшихся подписей и линий сквозь буквы (tools/motorica-layout.mjs). Печать — из неё PDF и PPTX; колода —
  // в ней видны ползунки, поля и кнопки. Переходы выключены, чтобы мерить слайд на месте, а не в полёте.
  {
    const c = await browser.newContext({ viewport: { width: 1600, height: 900 }, bypassCSP: true, serviceWorkers: 'block' });
    const p = await c.newPage();
    for (const mode of ['print', 'deck']) {
      await p.goto(`${url}${mode === 'print' ? '?print=1' : ''}`, { waitUntil: 'load' });
      await ready(p);
      await p.evaluate(() => document.fonts.ready);
      await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important }' });
      for (let n = 1; n <= N; n++) {
        if (mode === 'deck') await go(p, n);
        for (const x of await p.evaluate(layoutIssues, `#s${n}`)) fail(`вёрстка (${mode === 'print' ? 'печать' : 'колода'}), слайд ${n}: ${x}`);
      }
    }
    await c.close();
    // Лента на телефоне (390 px): широкие схемы листаются вбок в своём блоке, остальное — без наложений и обрезок
    const f = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true, serviceWorkers: 'block' });
    const fp = await f.newPage();
    await fp.goto(url, { waitUntil: 'load' });
    await ready(fp);
    await fp.evaluate(() => document.fonts.ready);
    await fp.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important }' });
    if (!(await fp.evaluate(() => document.documentElement.classList.contains('flow')))) fail('390 px: страница не в режиме ленты');
    if (!(await fp.evaluate(() => document.querySelectorAll('.hscroll > svg').length >= 7))) fail('390 px: широкие схемы не листаются вбок (.hscroll)');
    for (let n = 1; n <= N; n++) for (const x of await fp.evaluate(layoutIssues, `#s${n}`)) fail(`вёрстка (лента 390 px), слайд ${n}: ${x}`);
    await f.close();
  }

  // ── 6. Правило решения по пилоту, даты недель, итог встречи ──
  await go(page, nOf('decision'));
  const verdict = async () => page.locator('[data-decide] [data-verdict]').textContent();
  const boxes = page.locator('[data-decide] input[data-h]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  if (!/масштабировать/.test(await verdict())) fail(`правило решения при всех «да»: ${await verdict()}`);
  await page.locator('[data-decide] input[data-h="H5"]').uncheck();
  if (!/остановить/.test(await verdict())) fail(`правило решения при жалобе на безопасность: ${await verdict()}`);
  await go(page, nOf('weeks'));
  const weekDates = await page.evaluate(() => [...document.querySelectorAll('[data-week]')].map((e) => e.textContent));
  if (!weekDates.length || weekDates.some((d) => !/^\d\d\.\d\d$/.test(d))) fail(`даты недель: ${weekDates.slice(0, 4)}`);
  await go(page, nOf('decisions'));
  await page.locator('input[data-d="0"]').check();
  await page.locator('[data-copy-summary]').click();
  await page.waitForTimeout(150);
  const summary = await page.evaluate(() => navigator.clipboard.readText());
  if (!/^Итог встречи/.test(summary) || !/Принято 1 из \d+ решений/.test(summary)) fail(`итог встречи: ${summary.slice(0, 120)}`);

  // ── 7. Тренажёр в окне: открывается, Esc закрывает и возвращает фокус ──
  const gameSlide = await page.evaluate(() => document.querySelector('[data-game] button')?.closest('.s')?.dataset.n);
  if (!gameSlide) fail('нет кнопки тренажёра');
  else {
    await go(page, +gameSlide);
    await page.locator('[data-game] button').click();
    const g = await page.evaluate(() => ({ hidden: document.getElementById('game').hidden, src: document.querySelector('#game iframe')?.src, focus: document.activeElement?.hasAttribute('data-game-close'), inert: document.getElementById('deck').inert && document.getElementById('bar').inert }));
    if (g.hidden || !g.src?.endsWith('/Synergy/') || !g.focus || !g.inert) fail(`тренажёр: ${JSON.stringify(g)}`);
    await page.waitForTimeout(withGame ? 1500 : 300);
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({ hidden: document.getElementById('game').hidden, focus: !!document.activeElement?.closest('[data-game]'), inert: document.getElementById('deck').inert || document.getElementById('bar').inert }));
    if (!closed.hidden || !closed.focus || closed.inert) fail(`тренажёр после Esc: ${JSON.stringify(closed)}`);
  }

  // ── 8. Глубокие ссылки: #sN и ?route= ──
  const deep = await ctx.newPage();
  watch(deep);
  await deep.goto(`${url}?route=med#s${nOf('levers')}`, { waitUntil: 'load' });
  await ready(deep);
  const dl = await deep.evaluate(() => ({ on: document.querySelector('#deck > .s.on')?.dataset.n, route: document.querySelector('select[data-route]').value, n: document.querySelectorAll('#deck > .s.inroute').length }));
  if (dl.route !== 'med' || dl.n !== deckData.chairs.med.slides.length) fail(`?route=med: ${JSON.stringify(dl)}`);
  if (deckData.chairs.med.slides.includes(nOf('levers')) && +dl.on !== nOf('levers')) fail(`#s${nOf('levers')} с маршрутом: открыт слайд ${dl.on}`);
  await deep.close();

  // ── 9. Телефон: лента слайдов, ссылка прокручивает к слайду ──
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  watch(pp);
  await pp.goto(`${url}#s${nOf('summary')}`, { waitUntil: 'load' });
  await ready(pp);
  if (!(await pp.evaluate(() => document.documentElement.classList.contains('flow')))) fail('на телефоне не лента');
  await pp.locator(`#s${nOf('summary')} a.sum-col`).first().click();
  await pp.waitForTimeout(400);
  const top = await pp.evaluate((n) => Math.round(document.getElementById(`s${n}`).getBoundingClientRect().top), nOf('model'));
  if (Math.abs(top) > 4) fail(`телефон: ссылка на слайд ${nOf('model')} не прокрутила к нему (top ${top})`);
  await phone.close();

  // ── 10. План сотрудничества ──
  const plan = await ctx.newPage();
  watch(plan);
  await plan.goto(`${url}plan.html`, { waitUntil: 'load' });
  await plan.evaluate(() => document.fonts.ready);
  const planInfo = await plan.evaluate(() => ({
    sections: document.querySelectorAll('main h2[id^="sec-"]').length,
    dead: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
    contacts: document.querySelector('a[href^="./#s"]')?.getAttribute('href'),
  }));
  if (planInfo.sections < 10 || planInfo.dead.length || planInfo.contacts !== `./#s${nOf('decisions')}`) fail(`план: ${JSON.stringify(planInfo)}`);
  await plan.locator(`a[href="./#s${nOf('decisions')}"]`).first().click();
  await plan.waitForLoadState('load');
  await ready(plan);
  if (JSON.stringify(await on(plan)) !== `[${nOf('decisions')}]`) fail(`из плана ссылка «Контакты» открыла слайд ${await on(plan)}`);
  await plan.close();

  // ── 10а. axe-core: колода (обложка, заметки, тренажёр, калькулятор), лента со всеми слайдами, план ──
  const wide = { width: 1440, height: 900 };
  await audit(wide, '', 'колода, обложка');
  await audit(wide, `#s${nOf('levers')}`, `колода, слайд ${nOf('levers')} с заметками`, async (p) => { await p.keyboard.press('n'); });
  await audit(wide, `#s${nOf('model')}`, 'колода, калькулятор', async (p) => { await p.locator('[data-calc] input[data-k="reach"]').fill('70'); });
  await audit(wide, `#s${nOf('decision')}`, 'колода, правило решения');
  await audit(wide, '', 'колода с открытым тренажёром', async (p) => {
    const n = await p.evaluate(() => document.querySelector('[data-game] button')?.closest('.s')?.dataset.n);
    await p.evaluate((v) => { location.hash = `#s${v}`; }, n);
    await p.locator('[data-game] button').click();
    await p.waitForTimeout(withGame ? 1500 : 300);
  });
  await audit({ width: 375, height: 800 }, '', 'лента на телефоне, все слайды');
  await audit({ width: 1440, height: 900 }, 'plan.html', 'план');

  // ── 11. Ширины от телефона до большого монитора ──
  for (const [w, target] of [320, 375, 414, 768, 1024, 1280, 1440, 1920, 2560].flatMap((x) => [[x, url], [x, `${url}plan.html`]])) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: w <= 414 ? 800 : w < 1440 ? 768 : w > 1920 ? 1440 : 1000 });
    await p.goto(target, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const name = `${w}px ${target.endsWith('plan.html') ? 'план' : 'колода'}`;
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) fail(`${name}: страница шире окна на ${over}px`);
    const deckMode = await p.evaluate(() => document.documentElement.classList.contains('deck'));
    if (deckMode) {
      const r = await p.evaluate(() => { const b = document.querySelector('#deck > .s.on').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, innerWidth, innerHeight].map(Math.round); });
      if (r[0] < 0 || r[1] < 0 || r[2] > r[4] || r[3] > r[5]) fail(`${name}: слайд не помещается в окно: ${r}`);
    } else {
      const wide = await p.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((e) => !e.closest('.table-scroll, .sprite, #game, svg') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll|hidden|clip/.test(getComputedStyle(e).overflowX))
        .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).trim().replace(/\s+/g, '.')}`));
      if (wide.length) fail(`${name}: содержимое вылезает из блоков: ${wide.join(', ')}`);
    }
    if (w <= 414) {
      const tiny = await p.evaluate(() => [...document.querySelectorAll('.btn, .icon-btn, summary, select')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44)
        .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${e.className} ${Math.round(e.getBoundingClientRect().height)}`));
      if (tiny.length) fail(`${name}: кнопки ниже 44 px: ${tiny.join(', ')}`);
    }
    await p.close();
  }

  // ── 12. Свой service worker забирает страницу, и она открывается без сети ──
  await page.goto(url, { waitUntil: 'load' });
  const sw = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
    return navigator.serviceWorker.controller?.scriptURL ?? '';
  });
  if (!sw.endsWith('/motorica/sw.js')) fail(`страницу не забрал её service worker: «${sw}»`);
  await page.waitForTimeout(500);
  offline = true;
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch((e) => fail(`без сети страница не открылась: ${e.message}`));
  await ready(page).catch(() => fail('без сети колода не дошла до готовности'));
  const cached = await page.evaluate(() => ({ title: document.title, bg: getComputedStyle(document.body).backgroundColor, n: document.querySelectorAll('#deck > .s').length,
    deck: document.documentElement.classList.contains('deck'), font: document.fonts.check('600 40px Unbounded', 'Моторика') }));
  if (!/Моторика/.test(cached.title) || cached.bg !== 'rgb(7, 16, 25)' || cached.n !== N || !cached.deck || !cached.font) fail(`без сети: ${JSON.stringify(cached)}`);
  const offPlan = await page.goto(`${url}plan.html`, { waitUntil: 'load' }).then((r) => r?.ok() ?? true).catch(() => false);
  if (!offPlan) fail('без сети план не открылся');
  await ctx.setOffline(false);
  offline = false;
  await ctx.close();
} finally {
  await browser.close();
  server.close();
  rmSync(site, { recursive: true, force: true });
}

if (problems.length) {
  console.error(`Сайт «Моторики» в браузере — ${problems.length} проблем:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Сайт «Моторики»${withGame ? ' (рядом с игрой)' : ''}: колода ${N} слайдов — клавиши, #sN, ссылки, маршруты «20 минут» и 8 кресел, заметки, калькулятор = модель, ссылка на расчёт, правило решения, недели, итог встречи, тренажёр; вёрстка всех слайдов без обрезок и наложений (колода, печать, лента 390 px); телефон — лента; 320–2560 px без прокрутки вбок; axe — 0 нарушений; офлайн-копия`);
