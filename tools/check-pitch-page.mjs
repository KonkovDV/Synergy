// The pitch page in a real browser, as GitHub Pages serves it.   node tools/check-pitch-page.mjs   (after npm run build)
// The site is assembled as the Pages workflow does: dist/ at /Synergy/, the pitch at /Synergy/pitch/, 404.html at the root.
// Checked: the game opens; the pitch page has no console errors, failed requests or broken pictures; nothing scrolls
// sideways from 320 to 2560 px; the viewer works by click, keys and #slide-N and gives the focus back; the chapters move
// the reel; axe-core finds nothing (WCAG 2.2 AA and best practices); the page's own service worker takes it over; an
// unknown address gets the 404 page. Needs Playwright with Chromium (CI: the e2e step) and axe-core (devDependencies).
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
if (!existsSync(join(root, 'dist/index.html'))) { console.log('Нет dist/ — сначала npm run build'); process.exit(1); }

const site = mkdtempSync(join(tmpdir(), 'synergy-pages-'));
cpSync(join(root, 'dist'), join(site, 'Synergy'), { recursive: true });
for (const f of ['index.html', 'app.js', 'sw.js', 'web', 'synergy-gameplay-reel.mp4']) cpSync(join(root, 'pitch', f), join(site, 'Synergy/pitch', f), { recursive: true });
cpSync(join(root, 'pitch/404.html'), join(site, 'Synergy/404.html'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let f = join(site, p), status = 200, st;
  try { st = statSync(f); if (st.isDirectory()) { res.writeHead(301, { location: `${p}/` }); return res.end(); } } catch { f = join(site, 'Synergy/404.html'); st = statSync(f); status = 404; }
  const type = TYPES[extname(f)] ?? 'application/octet-stream';
  const range = status === 200 && req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const a = range[1] ? Number(range[1]) : 0, b = range[2] ? Number(range[2]) : st.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 });
    return createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(status, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
  createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/Synergy/`;
const problems = [];
const fail = m => problems.push(m);
const browser = await chromium.launch();

try {
  // 1. The game first, so its service worker is installed (a visitor who played and then opened the pitch).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') fail(`консоль: ${m.text()}`); });
  page.on('pageerror', e => fail(`ошибка скрипта: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) fail(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(base, { waitUntil: 'load' });
  if (!/Синергия/.test(await page.title())) fail('игра: нет заголовка «Синергия»');
  await page.waitForTimeout(2000);

  // 2. The pitch page: pictures, fonts, anchors.
  await page.goto(`${base}pitch/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  for (let y = 0; y < 20000; y += 700) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForTimeout(600);
  const pics = await page.evaluate(() => [...document.images].filter(i => !i.closest('dialog') && !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')));
  if (pics.length) fail(`картинки не загрузились: ${pics.join(', ')}`);
  if (!(await page.evaluate(() => document.fonts.check('800 40px Unbounded', 'Синергия')))) fail('шрифт Unbounded не загрузился');
  const anchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
  if (anchors.length) fail(`ссылки на несуществующие разделы: ${anchors.join(', ')}`);

  // 3. The viewer: click, keys, the address, the focus.
  await page.locator('a.slide[data-n="2"]').click();
  const opened = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, cap: document.querySelector('#viewer figcaption').textContent }));
  if (!opened.open || opened.hash !== '#slide-2' || !/^2 \/ \d+ · /.test(opened.cap)) fail(`просмотрщик по клику: ${JSON.stringify(opened)}`);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('End'); await page.keyboard.press('Home'); await page.keyboard.press('PageDown');
  if ((await page.evaluate(() => location.hash)) !== '#slide-2') fail('просмотрщик: стрелки, Home, End, PageDown листают не так');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, focus: document.activeElement?.dataset?.n }));
  if (after.open || after.hash || after.focus !== '2') fail(`просмотрщик после Esc: ${JSON.stringify(after)}`);
  await page.goto(`${base}pitch/#slide-8`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => document.getElementById('viewer').open && /slide-08\.webp/.test(document.querySelector('#viewer img').src)))) fail('адрес #slide-8 не открывает слайд 8');
  await page.keyboard.press('Escape');
  // The appendices are their own gallery, numbered as their deck: #appx-3 is page 3 of 9, End stays inside it.
  await page.goto(`${base}pitch/#appx-3`, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.keyboard.press('End');
  const ap = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, cap: document.querySelector('#viewer figcaption').textContent, n: document.querySelectorAll('[data-gallery="appx"] a.slide').length }));
  if (!ap.open || ap.hash !== `#appx-${ap.n}` || !ap.cap.startsWith(`${ap.n} / ${ap.n} · `)) fail(`приложения в просмотрщике: ${JSON.stringify(ap)}`);
  await page.keyboard.press('Escape');

  // 4. The chapters move the reel.
  await page.locator('[data-seek="21.3"]').click(); await page.waitForTimeout(400);
  const t = await page.evaluate(() => document.getElementById('reel').currentTime);
  if (!(t > 20 && t < 25)) fail(`глава «Ритм» ставит ролик на ${t.toFixed(1)} с`);

  // 5. The page's own worker takes it over and empties the game's cache of /pitch/.
  await page.reload({ waitUntil: 'load' });
  // A slow runner takes longer to swap the worker and empty the cache: wait for the state, not for a fixed time.
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/pitch/sw.js')) return false;
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.includes('/pitch/')) return false;
    return true;
  }, null, { timeout: 15000, polling: 250 }).catch(() => {});
  const sw = await page.evaluate(async () => {
    const left = [];
    for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (new URL(r.url).pathname.includes('/pitch/')) left.push(r.url); }
    return { controller: navigator.serviceWorker.controller?.scriptURL ?? '', left: left.length };
  });
  if (!sw.controller.endsWith('/pitch/sw.js') || sw.left) fail(`service worker: ${JSON.stringify(sw)}`);
  await ctx.close();

  // 6. No sideways scroll at any width, from a small phone to a 4K monitor.
  for (const width of [320, 360, 375, 390, 412, 430, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
    const c = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: 'reduce' });
    const p = await c.newPage();
    await p.goto(`${base}pitch/`, { waitUntil: 'load' });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) fail(`ширина ${width}: страница шире экрана на ${over} px`);
    // A word wider than its own box (a long heading on a phone) is a defect even when nothing scrolls sideways.
    const wide = await p.evaluate(() => [...document.querySelectorAll('main *, header *, footer *')]
      .filter(e => !e.closest('dialog') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX))
      .map(e => `${e.tagName.toLowerCase()} «${e.textContent.trim().slice(0, 40)}»`));
    if (wide.length) fail(`ширина ${width}: текст шире своего блока — ${wide.slice(0, 3).join('; ')}`);
    await c.close();
  }

  // 7. axe-core (its script is injected, so this context bypasses the page's CSP).
  const ax = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  for (const path of ['pitch/', 'no-such-page']) {
    const p = await ax.newPage();
    await p.goto(base + path, { waitUntil: 'load' });
    for (let y = 0; y < 20000; y += 900) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(40); }
    await p.addScriptTag({ path: join(root, 'node_modules/axe-core/axe.min.js') });
    const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map(x => `${x.id} ×${x.nodes.length}`));
    if (v.length) fail(`axe на ${path}: ${v.join(', ')}`);
    if (path === 'no-such-page' && !/Такой страницы нет/.test(await p.textContent('h1'))) fail('неизвестный адрес не показывает страницу 404');
    await p.close();
  }
  await ax.close();
} finally {
  await browser.close();
  server.close();
  rmSync(site, { recursive: true, force: true });
}

if (problems.length) {
  for (const p of [...new Set(problems)]) console.log(`✗ ${p}`);
  process.exit(1);
}
console.log('Страница питча: игра открывается; ошибок, битых картинок и ссылок нет; от 320 до 2560 px без прокрутки вбок; просмотрщик, главы ролика и свой service worker работают; axe — 0 нарушений; 404 на месте');
