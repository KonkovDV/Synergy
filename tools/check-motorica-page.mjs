#!/usr/bin/env node
// Сайт презентации для «Моторики» в настоящем браузере, как его отдаёт GitHub Pages.   node tools/check-motorica-page.mjs
// Сайт собирается как в workflow Pages: dist/ (если собран) на /Synergy/, страница — на /Synergy/motorica/.
// Проверяется: нет ошибок консоли, упавших запросов и битых картинок; шрифты загружены; якоря ведут к разделам;
// просмотрщик открывается кликом и кнопкой, листается стрелками, Home и End, закрывается Esc и возвращает фокус;
// #slide-N открывает страницу на нужном слайде; от 320 до 1920 px ничего не прокручивается вбок; axe-core —
// 0 нарушений (WCAG 2.2 AA и best practices), в том числе с открытым просмотрщиком; страницу забирает свой service
// worker, и она открывается без сети. Нужны Playwright с Chromium и axe-core (devDependencies).
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, cpSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axePath = join(root, 'node_modules/axe-core/axe.min.js');
if (!existsSync(axePath)) { console.log('Нет node_modules/axe-core — сначала npm ci'); process.exit(1); }

const site = mkdtempSync(join(tmpdir(), 'motorica-pages-'));
const withGame = existsSync(join(root, 'dist/index.html'));
if (withGame) cpSync(join(root, 'dist'), join(site, 'Synergy'), { recursive: true });
else cpSync(join(root, 'public/icons'), join(site, 'Synergy/icons'), { recursive: true });
const FILES = ['index.html', 'plan.html', 'site.css', 'app.js', 'sw.js', 'og.jpg', 'fonts', 'img', 'slides', 'MOTUS-Lab-Motorica.pptx', 'MOTUS-Lab-Motorica.pdf', 'MOTUS-Lab-Motorica-model.xlsx'];
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
let offline = false;   // без сети запросы мимо service worker (build.json, значок игры) падают — так и должно быть
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error' && !(offline && /ERR_INTERNET_DISCONNECTED/.test(m.text()))) fail(`консоль: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`ошибка скрипта: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) fail(`HTTP ${r.status()}: ${r.url()}`); });
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page);
  if (withGame) { await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1500); }   // посетитель сначала открыл игру

  // 1. Картинки, шрифты, якоря.
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
  await page.waitForTimeout(800);
  const broken = await page.evaluate(() => [...document.images].filter((i) => !i.closest('dialog') && !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')));
  if (broken.length) fail(`картинки не загрузились: ${broken.join(', ')}`);
  if (!(await page.evaluate(() => document.fonts.check('800 40px Unbounded', 'Моторика')))) fail('шрифт Unbounded не загрузился');
  if (!(await page.evaluate(() => document.fonts.check('400 16px Inter', 'Моторика')))) fail('шрифт Inter не загрузился');
  const dead = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(h.slice(1))));
  if (dead.length) fail(`якоря никуда не ведут: ${dead.join(', ')}`);
  const total = await page.locator('a.shot').count();

  // 2. Просмотрщик: клик, клавиши, адрес, фокус.
  await page.locator('a.shot[data-n="2"]').click();
  const opened = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, cap: document.querySelector('#viewer .cap').textContent }));
  if (!opened.open || opened.hash !== '#slide-2' || !opened.cap.startsWith(`2 / ${total} · `)) fail(`просмотрщик по клику: ${JSON.stringify(opened)}`);
  const steps = [['ArrowRight', 3], ['End', total], ['Home', 1], ['PageDown', 2]];
  for (const [key, want] of steps) {
    await page.keyboard.press(key);
    const h = await page.evaluate(() => location.hash);
    if (h !== `#slide-${want}`) fail(`просмотрщик: ${key} → ${h}, а нужно #slide-${want}`);
  }
  const shown = await page.evaluate(() => document.querySelector('#viewer img').currentSrc);
  if (!/slides\/slide-02\.webp\?v=/.test(shown)) fail(`просмотрщик показывает ${shown}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, focus: document.activeElement?.dataset?.n }));
  if (after.open || after.hash !== '#slide-2' || after.focus !== '2') fail(`после Esc: ${JSON.stringify(after)}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-present="1"]').click();
  if ((await page.evaluate(() => [document.getElementById('viewer').open, location.hash].join(' '))) !== 'true #slide-1') fail('кнопка «Смотреть презентацию» не открывает первый слайд');
  await page.locator('#viewer [data-close]').click();

  // 3. Глубокая ссылка: страница открывается на нужном слайде.
  const deep = await ctx.newPage();
  watch(deep);
  await deep.goto(`${url}#slide-16`, { waitUntil: 'load' });
  await deep.waitForTimeout(600);
  const top = await deep.evaluate(() => document.getElementById('slide-16').getBoundingClientRect().top);
  if (top < 0 || top > 160) fail(`#slide-16: слайд не у верхнего края (top ${Math.round(top)})`);
  await deep.close();

  // 3а. План сотрудничества: картинки, якоря, ссылка на контакты главной.
  const pp = await ctx.newPage();
  watch(pp);
  await pp.goto(`${url}plan.html`, { waitUntil: 'load' });
  await pp.evaluate(() => document.fonts.ready);
  const planInfo = await pp.evaluate(() => ({
    sections: document.querySelectorAll('main h2[id^="sec-"]').length,
    dead: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
    back: !!document.querySelector('a[href="./#contacts"]'),
  }));
  if (planInfo.sections < 10 || planInfo.dead.length || !planInfo.back) fail(`план: ${JSON.stringify(planInfo)}`);
  await pp.close();

  // 4. Ширины от телефона до большого монитора: ничего не прокручивается вбок, цели касания на телефоне — от 44 px.
  for (const [w, target] of [320, 375, 414, 768, 1024, 1280, 1440, 1920].flatMap((x) => [[x, url], [x, `${url}plan.html`]])) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: 800 });
    await p.goto(target, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) fail(`${w}px ${target.endsWith('plan.html') ? 'план' : 'главная'}: страница шире окна на ${over}px`);
    const wide = await p.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((e) => !e.closest('dialog, .table-scroll') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll|hidden/.test(getComputedStyle(e).overflowX))
      .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${e.className}`));
    if (wide.length) fail(`${w}px ${target.endsWith('plan.html') ? 'план' : 'главная'}: содержимое вылезает из блоков: ${wide.join(', ')}`);
    if (w <= 414) {
      const tiny = await p.evaluate(() => [...document.querySelectorAll('.btn, .icon-btn, summary')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).length);
      if (tiny) fail(`${w}px: ${tiny} кнопок ниже 44 px`);
    }
    await p.close();
  }

  // 5. axe-core: страница и открытый просмотрщик (скрипт axe внедряется, поэтому этот контекст обходит CSP страницы).
  const ax = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true, serviceWorkers: 'block' });
  const ap = await ax.newPage();
  await ap.goto(url, { waitUntil: 'load' });
  await ap.addScriptTag({ path: axePath });
  const run = () => ap.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }))
    .violations.map((x) => `${x.id} ×${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')}`));
  let v = await run();
  if (v.length) fail(`axe, страница: ${v.join(' | ')}`);
  await ap.locator('a.shot[data-n="5"]').click();
  v = await run();
  if (v.length) fail(`axe, просмотрщик: ${v.join(' | ')}`);
  await ap.goto(`${url}plan.html`, { waitUntil: 'load' });
  await ap.addScriptTag({ path: axePath });
  v = await run();
  if (v.length) fail(`axe, план: ${v.join(' | ')}`);
  await ax.close();

  // 6. Свой service worker забирает страницу, и она открывается без сети.
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
  const cached = await page.evaluate(() => ({ title: document.title, css: getComputedStyle(document.querySelector('.hero')).backgroundColor,
    thumbs: [...document.querySelectorAll('a.shot img')].filter((i) => i.complete && i.naturalWidth > 0).length }));
  if (!/Моторика/.test(cached.title) || cached.css !== 'rgb(7, 16, 25)') fail(`без сети: ${JSON.stringify(cached)}`);
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
console.log(`Сайт «Моторики»${withGame ? ' (рядом с игрой)' : ''}: главная и план — ошибок, битых картинок и якорей нет; просмотрщик, #slide-N и фокус работают; 320–1920 px без прокрутки вбок; axe — 0 нарушений; свой service worker и офлайн-копия`);
