// The pitch page in a real browser, as GitHub Pages serves it.   node tools/check-pitch-page.mjs   (after npm run build)
// The site is assembled as the Pages workflow does: dist/ at /Synergy/, the pitch at /Synergy/pitch/, 404.html at the root.
// Checked: the game opens; the pitch page has no console errors, failed requests or broken pictures; nothing scrolls
// sideways from 320 to 2560 px; the viewer works by click, keys and #slide-N and gives the focus back; the chapters move
// the reel; axe-core finds nothing (WCAG 2.2 AA and best practices); the page's own service worker takes it over; an
// unknown address gets the 404 page. Needs Playwright with Chromium (CI: the e2e step) and axe-core (devDependencies).
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, cpSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
// …and, as the workflow does after the tests, the commit the page is built from (pitch/app.js shows it in the footer)
let sha = '0'.repeat(40);
try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); } catch { /* not a git checkout */ }
writeFileSync(join(site, 'Synergy/pitch/build.json'), JSON.stringify({ sha, run: '1', at: new Date().toISOString().slice(0, 16) + 'Z' }));

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
  const opened = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, cap: document.querySelector('#viewer .cap').textContent }));
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
  const ap = await page.evaluate(() => ({ open: document.getElementById('viewer').open, hash: location.hash, cap: document.querySelector('#viewer .cap').textContent, n: document.querySelectorAll('[data-gallery="appx"] a.slide').length }));
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
      .filter(e => !e.closest('dialog, .sr') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX))   // .sr: text for screen readers, 1 px on purpose
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

  // 8. A phone as a tester holds it, in every engine this machine has (CI: Chromium; ENGINES=chromium,webkit,firefox).
  // Every target 44 pt (Apple HIG), the reel on the first screen, the checklist answering a group, a criterion, words.
  const pw = require('playwright');
  for (const name of (process.env.ENGINES ?? 'chromium').split(',').map(e => e.trim()).filter(Boolean)) {
    const b = name === 'chromium' ? browser : await pw[name].launch();
    try {
      for (const dev of ['iPhone SE', 'iPhone 15 Pro', 'Pixel 7']) {
        const d = pw.devices[dev];
        const c = await b.newContext({ ...(name === 'firefox' ? { viewport: d.viewport, userAgent: d.userAgent } : d), reducedMotion: 'reduce' });
        const p = await c.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        await p.goto(`${base}pitch/`, { waitUntil: 'load' });
        await p.waitForTimeout(300);
        const tag = `${name}, ${dev}`;
        const m = await p.evaluate(() => ({
          over: document.documentElement.scrollWidth - innerWidth,
          reel: document.getElementById('reel').getBoundingClientRect().top, vh: innerHeight,
          small: [...document.querySelectorAll('.top a, .btn, .chapters button, .seg button, .tz-open, .tz-find input, .req summary, .plus li > a, .ck')]
            .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); })
            .map(e => `«${e.textContent.trim().slice(0, 18)}» ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`),
        }));
        if (m.over > 0) fail(`${tag}: страница шире экрана на ${m.over} px`);
        if (m.reel >= m.vh) fail(`${tag}: ролик не на первом экране — сверху ${Math.round(m.reel)} px при высоте ${m.vh}`);
        if (m.small.length) fail(`${tag}: цели касания меньше 44 pt — ${m.small.slice(0, 4).join(', ')}`);
        const list = () => p.evaluate(() => ({ shown: [...document.querySelectorAll('.reqs .req')].filter(r => !r.hidden).length, total: document.querySelectorAll('.reqs .req').length, count: document.querySelector('.tz-count').textContent }));
        const inGroups = (...g) => p.evaluate(ids => ids.reduce((n, id) => n + document.querySelectorAll(`.rg[data-group="${id}"] .req`).length, 0), g);
        await p.locator('.seg [data-show="s2"]').click();
        let l = await list();
        const s2 = await inGroups('s2');
        if (l.shown !== s2 || l.count !== `Показано ${s2} из ${l.total}`) fail(`${tag}: фильтр «Поток 2» — ${JSON.stringify(l)}`);
        await p.locator('.crit .ck').first().click();
        l = await list();
        if (l.shown !== await inGroups('s1', 's2')) fail(`${tag}: карточка критерия 33 % показывает ${l.shown} строк`);
        await p.locator('.seg [data-show="all"]').click();
        await p.fill('#tz-q', '200 мс');
        l = await list();
        if (!(l.shown > 0 && l.shown < l.total)) fail(`${tag}: поиск «200 мс» — ${JSON.stringify(l)}`);
        await p.fill('#tz-q', 'нет-такого-слова');
        if (!(await p.isVisible('.tz-none'))) fail(`${tag}: пустой поиск не говорит «Ничего не нашлось»`);
        if (errs.length) fail(`${tag}: ошибки — ${errs.slice(0, 2).join('; ')}`);
        await c.close();
      }
      const c = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const p = await c.newPage();
      await p.goto(`${base}pitch/#rg-ux`, { waitUntil: 'load' });
      await p.waitForTimeout(300);
      const ux = await p.evaluate(() => [...document.querySelectorAll('.reqs .req')].filter(r => !r.hidden).length === document.querySelectorAll('.rg[data-group="ux"] .req').length);
      if (!ux) fail(`${name}: адрес #rg-ux не оставляет только раздел «UX и доступность»`);
      await p.evaluate(() => document.getElementById('pilot').scrollIntoView());
      await p.waitForTimeout(700);
      if ((await p.getAttribute('.top nav a[href="#pilot"]', 'aria-current')) !== 'true') fail(`${name}: раздел «Пилот» на экране, а в строке разделов не отмечен`);
      await p.goto(`${base}pitch/#slide-2`, { waitUntil: 'load' });
      await p.waitForTimeout(300);
      const box = await p.locator('#viewer img').boundingBox();
      if (!box) fail(`${name}: просмотрщик не открылся по адресу #slide-2`);
      else {
        await p.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
        await p.mouse.down();
        await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
        await p.mouse.up();
        await p.waitForTimeout(200);
        if ((await p.evaluate(() => location.hash)) !== '#slide-3') fail(`${name}: свайп влево не листает слайд вперёд`);
      }
      await c.close();
    } finally { if (b !== browser) await b.close(); }
  }

  // 9. The games and the launch link open the game itself, as a new visitor meets it: the onboarding, then the exercise.
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const p = await c.newPage();
    await p.goto(`${base}pitch/`, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const links = await p.evaluate(() => ({
      games: [...document.querySelectorAll('.gcards a.btn')].map(a => a.getAttribute('href')),
      live: document.querySelector('.embed .live a')?.getAttribute('href'),
      stamp: document.querySelector('footer .build')?.hidden === false ? document.querySelector('footer .build').textContent : '',
    }));
    const want = ['grip', 'flight', 'rhythm', 'safe', 'stars', 'duo'].map(g => `../?game=${g}&level=1&self=1`);
    if (JSON.stringify(links.games) !== JSON.stringify(want)) fail(`ссылки «Играть» у игр: ${JSON.stringify(links.games)}`);
    if (links.live !== '../?game=grip&level=2&side=left&closeThreshold=60&openThreshold=45&self=1') fail(`ссылка «Открыть так в браузере»: ${links.live}`);
    if (!/^Страница собрана из коммита [0-9a-f]{7}/.test(links.stamp)) fail(`в подвале нет коммита сборки: «${links.stamp}»`);
    await c.close();
    for (const [href, title] of [[want[0], 'Мастерская · ур. 1'], [links.live, 'Мастерская · ур. 2']]) {
      const g = await browser.newContext({ ...require('playwright').devices['iPhone 15 Pro'], reducedMotion: 'reduce' });
      const q = await g.newPage();
      await q.goto(new URL(href, `${base}pitch/`).href, { waitUntil: 'load' });
      for (let i = 0; i < 6 && !(await q.evaluate(() => !!document.querySelector('canvas'))); i++) {
        await q.evaluate(() => { const els = [...document.querySelectorAll('button')].filter(e => e.getBoundingClientRect().height > 0); for (const w of ['Пропустить обучение', 'Дальше']) { const e = els.find(x => x.textContent.trim().startsWith(w)); if (e) { e.click(); return; } } });
        await q.waitForTimeout(600);
      }
      const text = await q.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      if (!text.includes(title)) fail(`${href} не открывает «${title}» после знакомства с игрой`);
      await g.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  rmSync(site, { recursive: true, force: true });
}

if (problems.length) {
  for (const p of [...new Set(problems)]) console.log(`✗ ${p}`);
  process.exit(1);
}
console.log(`Страница питча: игра открывается; ошибок, битых картинок и ссылок нет; от 320 до 2560 px без прокрутки вбок; просмотрщик, главы ролика и свой service worker работают; axe — 0 нарушений; 404 на месте; на телефонах цели касания от 44 pt, ролик на первом экране, чек-лист ТЗ отвечает (${process.env.ENGINES ?? 'chromium'})`);
