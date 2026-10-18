// Layout audit «from start to finish» (5.8): every screen and state of a player's journey on 7 viewports
// (320 px reflow … tablet, portrait and landscape) × 3 text sizes (100 %, 130 % — the app's largest, 200 % —
// Android 14+ system font scale in the APK WebView). Finds what screenshots hide:
//   overflow    — horizontal page scroll, text or a control past the screen edge;
//   clipped     — text cut by an ancestor with overflow hidden;
//   overlap     — two text blocks, or text and a control, drawn on top of each other (same layer);
//   target      — a control smaller than 44 × 44 px (Apple HIG 44 pt, Material 48 dp; WCAG 2.5.8 needs 24);
//   covered     — a control left under the floating bottom bar or sticky actions at the end of the page;
//   focus       — a focused control hidden under a fixed/sticky bar (WCAG 2.2, 2.4.11);
//   tiny        — visible text smaller than 12 px;
//   broken      — a word split mid-word across lines at the default text size, phones ≥ 360 px (5.9: «Пропорциональны / й»);
//   fold        — the day's «Начать» is below the fold of the home screen (portrait phones);
//   action      — the main button of an open dialog is out of sight (5.10);
//   reach       — a pad of a game, tutorial or calibration screen is off screen at the default text size (5.10).
// Usage: npm run build && npm run audit:layout [-- baseUrl] [-- --quick] [-- --view=568x320 --state=a,b]   (no URL — serves dist/ itself)
import { createRequire } from 'node:module';
import { baseUrl } from '../../tools/static-server.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const server = await baseUrl();
const base = server.url;
const quick = process.argv.includes('--quick');

// Re-check after a fix (5.11): `-- --view=568x320 --state=play-bridge,hc-play` runs one size and a few states.
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const ALL_VIEWPORTS = [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [844, 390], [568, 320]];
const VIEWPORTS = arg('view') ? ALL_VIEWPORTS.filter(([w, h]) => `${w}x${h}` === arg('view')) : quick ? [[320, 568], [390, 844], [844, 390]] : ALL_VIEWPORTS;
const SCALES = quick ? [1, 2] : [1, 1.3, 2];
const onlyStates = arg('state')?.split(',');

/** Runs in the page: geometry checks of the current screen. */
function inspect({ width, checkWords = false, minTarget = 44, minFont = 12 }) {
  const out = [];
  // The device width, not innerWidth: a mobile browser zooms out a page that is too wide and innerWidth grows with it.
  const vw = width;
  const LAYERS = '.overlay, #toasts, .bottom-nav, .sticky-actions, .sheet-actions, .top-bar, .showcase-banner';
  const visible = el => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || n.hidden) return false;
      if (n.classList?.contains('sr-only')) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = el => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}«${t}»`;
  };
  const layerOf = el => el.closest(LAYERS);
  const fixedLike = el => !!el.closest('.bottom-nav, .sticky-actions, .top-bar, #toasts, .showcase-banner, .play-top');
  // Text in a region that scrolls sideways (a data table, WCAG 1.4.10 exception) is reachable if the region fits the screen.
  const inScroller = el => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowX)) { const b = n.getBoundingClientRect(); return b.left >= -1 && b.right <= vw + 1; }
    }
    return false;
  };
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 1 && h > 1 ? w * h : 0; };

  // 1. Horizontal overflow of the page — and the deepest elements that stick out (the cause, not the symptom).
  if (document.documentElement.scrollWidth > vw + 1) {
    const wide = [...document.querySelectorAll('#app *')].filter(el => el.getBoundingClientRect().right > vw + 1 && visible(el) && ![...el.children].some(c => c.getBoundingClientRect().right > vw + 1));
    out.push({ kind: 'overflow', what: `page ${document.documentElement.scrollWidth}px > ${vw}px: ${wide.slice(0, 3).map(name).join(', ')}` });
  }

  // Text blocks: rects of direct text nodes (the real ink box, not the block's full width).
  const texts = [];
  const walker = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!visible(el) || el.closest('[aria-hidden="true"]:not(.plan-icon)') && el.closest('.big-emoji, .onb-art')) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    texts.push({ el, rects });
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < minFont - 0.01) out.push({ kind: 'tiny', what: `${name(el)} ${fs.toFixed(1)}px` });
    // A word split across lines mid-word («Пропорциональны / й»): `overflow-wrap: anywhere` hides the overflow, not
    // the defect. At the default text size every word must fit; at 130–200 % a split beats text past the edge.
    if (checkWords) {
      for (const m of node.textContent.matchAll(/[^\s\-–—/­]{2,}/g)) {
        const word = document.createRange(); word.setStart(node, m.index); word.setEnd(node, m.index + m[0].length);
        const lines = new Set([...word.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top / 4)));
        if (lines.size > 1) { out.push({ kind: 'broken', what: `${name(el)} word «${m[0]}» split across lines` }); break; }
      }
    }
    // Clipped by an ancestor that hides overflow, or past the screen edge.
    for (const r of rects) {
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) { out.push({ kind: 'overflow', what: `${name(el)} text x ${Math.round(r.left)}…${Math.round(r.right)} of ${vw}` }); break; }
      let clip = null;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { clip = n; break; }
      }
      if (clip && !/(auto|scroll)/.test(getComputedStyle(clip).overflowY)) {
        const c = clip.getBoundingClientRect();
        if (r.right > c.right + 1.5 || r.left < c.left - 1.5 || r.bottom > c.bottom + 1.5 || r.top < c.top - 1.5) { out.push({ kind: 'clipped', what: `${name(el)} in ${name(clip)}` }); break; }
      }
    }
  }

  // Controls.
  const controls = [...document.querySelectorAll('#app button, #app [role=button], #app [role=radio], #app a[href], #app summary, #app select, #app input:not([type=hidden]), #app textarea')]
    .filter(visible);
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const target = el.closest('label') ?? el; // a checkbox inside its label row: the row is the target
    const t = target.getBoundingClientRect();
    if (Math.min(t.width, t.height) < minTarget - 0.5 && !(el.type === 'range' && t.width >= 200)) out.push({ kind: 'target', what: `${name(el)}[${el.type ?? ''}] ${Math.round(t.width)}×${Math.round(t.height)}` });
    if (r.right > vw + 1 || r.left < -1) out.push({ kind: 'overflow', what: `${name(el)} x ${Math.round(r.left)}…${Math.round(r.right)} of ${vw}` });
  }

  // 3. Overlaps in the same layer (text–text, text–control, control–control), ancestors excluded.
  // A rect is clipped to its scrolling ancestors first (5.10): text scrolled out of a scrolling body is not drawn over
  // the dock below it.
  const clipToScrollers = (el, r) => {
    let { left, top, right, bottom } = r;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = n.getBoundingClientRect();
      left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
    }
    return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
  };
  const items = [...texts.flatMap(t => t.rects.map(r => ({ el: t.el, r, text: true }))), ...controls.map(el => ({ el, r: el.getBoundingClientRect(), text: false }))]
    .map(i => ({ ...i, r: clipToScrollers(i.el, i.r) })).filter(i => i.r);
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (layerOf(a.el) !== layerOf(b.el)) continue;
      // Text inside a control vs that control's sibling text is fine only when they do not intersect.
      const area = inter(a.r, b.r);
      if (area < 6) continue;
      const ca = a.el.closest('button, [role=button], [role=radio], summary, label') ?? a.el, cb = b.el.closest('button, [role=button], [role=radio], summary, label') ?? b.el;
      if (ca === cb && !(a.text && b.text)) continue; // a label's own text and its control
      const key = [name(a.el), name(b.el)].sort().join(' × ');
      if (seen.has(key)) continue; seen.add(key);
      out.push({ kind: 'overlap', what: `${key} (${Math.round(area)} px²)` });
    }
  }
  return out;
}

/**
 * 5.10 — what a player must be able to press without scrolling (default text size):
 *   action — the main button of an open dialog sheet is inside the sheet's visible part and the screen
 *            (the intro sheet scrolled «Старт» out of sight on 390×844 — the linter skipped scroll containers);
 *   reach  — on screens driven by the pads (game, «Первые шаги», calibration) every pad is on screen at once
 *            (the tutorial put the pads below the fold: the hand and the instruction scrolled away to press them).
 */
function reachable() {
  const out = [], vh = innerHeight, vw = document.documentElement.clientWidth;
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  for (const sheet of document.querySelectorAll('.overlay:not([hidden]) .sheet')) {
    const s = sheet.getBoundingClientRect();
    const btn = sheet.querySelector('.btn.primary');
    if (!btn) continue;
    const b = btn.getBoundingClientRect();
    if (b.top < Math.max(0, s.top) - 1 || b.bottom > Math.min(vh, s.bottom) + 1) out.push({ kind: 'action', what: `«${label(btn)}» out of sight in the dialog (${Math.round(b.top)}…${Math.round(b.bottom)} of ${Math.round(Math.min(vh, s.bottom))})` });
  }
  if (document.querySelector('.play-screen, .tutorial, .calibration')) {
    for (const pad of document.querySelectorAll('.pad, .gkey, .pad-co')) {
      const r = pad.getBoundingClientRect();
      if (!r.width) continue;
      if (r.top < -1 || r.bottom > vh + 1 || r.right > vw + 1) { out.push({ kind: 'reach', what: `pad «${label(pad)}» off screen (${Math.round(r.top)}…${Math.round(r.bottom)} of ${vh})` }); break; }
    }
  }
  return out;
}

/** At the end of the page every control must be reachable: not under the bottom bar or the sticky actions. */
function coveredAtEnd() {
  const out = [];
  const scroller = document.scrollingElement;
  scroller.scrollTop = scroller.scrollHeight;
  for (const s of document.querySelectorAll('.scroll')) s.scrollTop = s.scrollHeight;
  const bars = [...document.querySelectorAll('.bottom-nav, .sticky-actions')].filter(b => /fixed|sticky/.test(getComputedStyle(b).position)).map(b => b.getBoundingClientRect()).filter(r => r.height > 0);
  for (const el of document.querySelectorAll('#app button, #app [role=radio], #app summary, #app input, #app [role=button]')) {
    if (el.closest('.bottom-nav, .sticky-actions, .overlay, .play-screen')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    for (const b of bars) {
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top), w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      if (h > r.height * 0.5 && w > 4) out.push({ kind: 'covered', what: `«${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30)}» under a bar at the end of the page` });
    }
  }
  scroller.scrollTop = 0;
  return out;
}

/** Tab through the screen: each focused control must be visible, not under a fixed or sticky bar. */
async function focusWalk(page) {
  const out = [];
  await page.evaluate(() => { document.activeElement?.blur(); document.scrollingElement.scrollTop = 0; });
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || !document.querySelector('#app').contains(el)) return null;
      if (el.closest('.bottom-nav, .sticky-actions, .top-bar, .play-top, .showcase-banner, .overlay')) return { skip: true, id: el.outerHTML.slice(0, 60) };
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20);
      if (y < 0 || y > innerHeight) return { bad: `focused off-screen: ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}`, id: el.outerHTML.slice(0, 60) };
      const top = document.elementFromPoint(x, y);
      const hidden = top && !el.contains(top) && !top.contains(el) && top.closest('.bottom-nav, .sticky-actions, .top-bar, .showcase-banner, #toasts');
      return { id: el.outerHTML.slice(0, 60), bad: hidden ? `focus under a bar: ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}` : null };
    });
    if (!r) break;
    if (r.bad) out.push({ kind: 'focus', what: r.bad });
    if (i > 0 && r.id === out.lastId) break;
    out.lastId = r.id;
  }
  delete out.lastId;
  return out;
}

const run = { id: 'r1', at: new Date().toISOString(), game: 'grip', level: 2, levelCount: 8, scheme: 'proportional', score: 74, stars: 2,
  skills: { precision: 62, switching: 48, stability: 81 }, details: { delivered: 4, total: 5, difficulty: 0.5 }, durationS: 96 };
const check = { ...run, id: 'r2', game: 'check', level: 1, levelCount: 1, score: 81, stars: 2, skills: { precision: 70, timing: 64, switching: 50 },
  details: { assessment: true, completionRate: 88, selectionMs: 640, completionMs: 2310, accuracy: 74, overshoots: 2, throughputBps: 1.4, fittsTrials: 6, pathEfficiency: 71 } };

/** The journey: [name, setup(page)] — each setup leaves the screen to audit. */
const STATES = [
  ['onboarding-1', async p => {}],
  ['onboarding-2', async p => { await p.waitForTimeout(350); await p.getByRole('button', { name: 'Дальше' }).click(); }],
  ['onboarding-3', async p => { await p.waitForTimeout(350); await p.getByRole('button', { name: 'Дальше' }).click(); }],
  ['home-new', async p => { await p.getByRole('button', { name: 'Пропустить обучение' }).click(); }],
  ['tutorial', async p => go(p, 'tutorial')],
  ['checkin', async p => { await go(p, 'checkin'); await p.getByRole('radio', { name: /Умеренная/ }).click(); await p.getByRole('radio', { name: /Есть усталость/ }).click(); }],
  ['checkin-sensors', async p => { await p.evaluate(() => window.Synergy.useBridge('')); await go(p, 'checkin'); }],
  ['play-bridge', async p => { await go(p, 'play', { game: 'grip', level: 1 }); await p.evaluate(() => window.Synergy.useTouch()); }],
  ...['grip', 'flight', 'rhythm', 'safe', 'check'].map(g => [`levels-${g}`, async p => go(p, 'levels', { game: g })]),
  ...['grip', 'flight', 'rhythm', 'safe', 'check'].map(g => [`play-intro-${g}`, async p => go(p, 'play', { game: g, level: 1 })]),
  ['play-running', async p => { await go(p, 'play', { game: 'grip', level: 3, demo: true }); await p.getByRole('button', { name: 'Старт' }).click(); await p.waitForTimeout(3600); }],
  ['play-paused', async p => { await p.getByRole('button', { name: 'Пауза' }).click(); }],
  ['play-retention', async p => go(p, 'play', { game: 'rhythm', level: 2, retention: true })],
  ['results', async p => go(p, 'results', { run, report: { xp: 119, levelUp: false, achievements: [], skins: [], unlockedLevel: 3 }, planBonus: 0, calibrationNote: { recalibrate: true, stuckChannel: 0, shiftPct: 0 } })],
  ['results-check', async p => go(p, 'results', { run: check, report: { xp: 111, levelUp: false, achievements: [], skins: [], unlockedLevel: null } })],
  ['rest', async p => go(p, 'rest', { next: { game: 'flight', level: 2, retention: true } })],
  ['progress-empty', async p => go(p, 'progress')],
  ['settings', async p => { await go(p, 'settings'); const closed = p.locator('details.fold:not([open]) > summary'); while (await closed.count()) await closed.first().click(); }],
  ['calibration', async p => go(p, 'calibration')],
  ['audiosync', async p => go(p, 'audiosync')],
  ['pin', async p => { await go(p, 'pin'); await p.getByLabel('PIN родителя').fill('12'); await p.keyboard.press('Enter'); }],
  ['gesture-play', async p => { await p.evaluate(() => window.Synergy.go('settings')); await p.getByRole('radiogroup', { name: 'Схема управления' }).getByRole('radio', { name: /Жесты/ }).click(); await go(p, 'play', { game: 'safe', level: 5 }); }],
  ['gesture-running', async p => { await go(p, 'play', { game: 'safe', level: 5, demo: true }); await p.getByRole('button', { name: 'Старт' }).click(); await p.waitForTimeout(3600); }],
  ['gesture-tutorial', async p => go(p, 'tutorial')],
  ['showcase-progress', async p => { await go(p, 'settings'); await p.locator('summary', { hasText: 'Данные' }).click(); await p.getByRole('button', { name: 'Демо-профиль для презентации' }).click(); }],
  ['showcase-home', async p => go(p, 'home')],
  // 5.9: the system asks for more contrast (the app follows it) and Windows forced colors — borders and outlines change.
  ['hc-home', async p => { await p.emulateMedia({ contrast: 'more' }); await go(p, 'home'); }],
  ['hc-play', async p => go(p, 'play', { game: 'flight', level: 1 })],
  ['forced-colors-settings', async p => { await p.emulateMedia({ contrast: 'no-preference', forcedColors: 'active' }); await go(p, 'settings'); const closed = p.locator('details.fold:not([open]) > summary'); while (await closed.count()) await closed.first().click(); }],
];
const go = (p, name, params = {}) => p.evaluate(([n, q]) => window.Synergy.go(n, q), [name, params]);

const browser = await playwright.chromium.launch();
const issues = [];
const errors = [];
for (const [w, h] of VIEWPORTS) {
  for (const scale of SCALES) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: w < 700 });
    page.on('pageerror', e => errors.push(`${w}×${h}@${scale}: ${e.message}`));
    await page.goto(base); await page.waitForTimeout(250);
    for (const [state, setup] of STATES) {
      if (onlyStates && !onlyStates.includes(state) && !/^(home-new|onboarding)/.test(state)) continue;
      try { await setup(page); } catch (e) { errors.push(`${w}×${h}@${scale} ${state}: setup ${e.message.split('\n')[0]}`); continue; }
      await page.evaluate(s => { document.documentElement.style.setProperty('--text-scale', String(s)); document.querySelectorAll('.toast').forEach(t => t.remove()); }, scale);
      await page.waitForTimeout(state.startsWith('play') || state.startsWith('gesture') ? 350 : 150);
      // Whole words at the default text size on phones from 360 px; at 320 px (the WCAG reflow width) and at 130–200 %
      // text a split is the lesser evil than text past the edge.
      const found = [...await page.evaluate(inspect, { width: w, checkWords: scale === 1 && w >= 360 }), ...(scale === 1 ? await page.evaluate(reachable) : []), ...await page.evaluate(coveredAtEnd)];
      if (scale === 1 && w < 700) found.push(...await focusWalk(page));
      // The day's main action is visible on the home screen without scrolling (portrait phones, default text).
      if (/home/.test(state) && scale === 1 && h > w && w < 700) {
        const fold = await page.evaluate(() => { document.scrollingElement.scrollTop = 0; const b = document.querySelector('.plan-start')?.getBoundingClientRect(), nav = document.querySelector('.bottom-nav')?.getBoundingClientRect(); return b && nav ? b.bottom <= nav.top : true; });
        if (!fold) found.push({ kind: 'fold', what: '«Начать» тренировку дня not visible without scrolling' });
      }
      for (const f of found) issues.push({ ...f, state, view: `${w}×${h}`, scale });
    }
    await page.close();
  }
}
await browser.close();
await server.close();

// Group the same finding across viewports and scales.
const groups = new Map();
for (const i of issues) {
  const key = `${i.kind} · ${i.state} · ${i.what.replace(/\d+(\.\d+)?(px|×\d+| px²|…\d+| of \d+)/g, '#')}`;
  const g = groups.get(key) ?? { kind: i.kind, state: i.state, what: i.what, where: [] };
  g.where.push(`${i.view}@${i.scale}`); groups.set(key, g);
}
const list = [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.state.localeCompare(b.state));
console.log(JSON.stringify({ errors, issues: list.length, list }, null, 1));
process.exit(errors.length || list.length ? 1 : 0);
