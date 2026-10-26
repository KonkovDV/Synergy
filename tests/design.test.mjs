// Design system 5.12 («Моторика × ФинФениксы») as a fitness function: the colour tokens of styles/app.css keep text readable in every
// theme (WCAG 1.4.3: ≥ 4.5:1), the two copies of the dark theme stay identical, and the interface draws pictures
// instead of emoji (emoji differ on every platform and are missing in some WebView fonts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('styles/app.css', 'utf8');

/** Custom properties of the first rule whose selector text is exactly `selector`. */
function tokens(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `no rule ${selector}`);
  const body = css.slice(at + selector.length + 2, css.indexOf('\n}', at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
const LIGHT = tokens(':root');
const DARK = { ...LIGHT, ...tokens(':root[data-theme="dark"]') };
const HC = { ...LIGHT, ...tokens(':root.hc') };

const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function luminance(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a solid colour: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text token on background token, in every theme. */
const PAIRS = [
  ['text', 'bg'], ['text', 'card'], ['text', 'bg2'], ['text', 'card2'],
  ['muted', 'bg'], ['muted', 'card'], ['muted', 'bg2'], ['muted', 'card2'],
  ['accent-ink', 'bg'], ['accent-ink', 'card'], ['accent-ink', 'tint-green'],
  ['a-ink', 'card'], ['b-ink', 'card'], ['co-ink', 'card'], ['good-ink', 'card'], ['good-ink', 'tint-green'],
  ['warn-ink', 'bg'], ['warn-ink', 'card'], ['warn-ink', 'tint-yellow'], ['bad-ink', 'bg'], ['bad-ink', 'card'],
  ['accent-ink', 'tint-yellow'], ['accent-ink', 'card2'], // 5.14: the gift line on an earned / not yet earned achievement
  ['banner-text', 'banner-bg'], ['banner-btn-text', 'banner-btn'], // 5.33: the demo-profile banner in brand graphite (was warning orange)
  ...['green', 'teal', 'blue', 'violet', 'coral', 'yellow'].flatMap(t => [['text', `tint-${t}`], ['muted', `tint-${t}`], ['muted', `deco-${t}`], ['ico', `tint-${t}`]]),
];

for (const [name, theme] of [['light', LIGHT], ['dark', DARK], ['high contrast', HC]]) {
  test(`design: every text token reads at ≥ 4.5:1 on its backgrounds — ${name}`, () => {
    const low = [];
    for (const [fg, bg] of PAIRS) {
      const tint = fg === 'ico' ? bg.replace('tint-', 'ico-') : fg; // a section glyph has the colour of its tile
      const ratio = contrast(theme[tint], theme[bg]);
      if (ratio < 4.5) low.push(`${tint} on ${bg}: ${ratio.toFixed(2)}`);
    }
    assert.deepEqual(low, []);
  });
}

// 5.14 (the sample's contrast gate checks that it can fail): the same check on a broken token reports it.
test('design: the contrast gate itself catches a broken token', () => {
  const broken = { ...LIGHT, muted: '#b8c0c8' };
  const low = PAIRS.filter(([fg, bg]) => fg !== 'ico' && contrast(broken[fg], broken[bg]) < 4.5);
  assert.ok(low.some(([fg]) => fg === 'muted'), 'a pale muted text must fail the gate');
});

test('design: text on the brand gradients reads at ≥ 4.5:1 — near-black on the green tiles, white on the dark cover', () => {
  const stops = g => g.match(/#[0-9a-f]{6}/gi);
  for (const [name, g, ink] of [['hero', LIGHT['grad-hero'], LIGHT['hero-text']], ['hero, secondary text', LIGHT['grad-hero'], LIGHT['hero-muted']],
    ['primary button', LIGHT['grad-primary'], LIGHT['on-accent']], ['cover', LIGHT['grad-cover'], LIGHT['cover-text']], ['cover, secondary text', LIGHT['grad-cover'], LIGHT['cover-muted']]]) {
    for (const stop of stops(g)) assert.ok(contrast(ink, stop) >= 4.5, `${name}: ${ink} on ${stop} — ${contrast(ink, stop).toFixed(2)}`);
  }
});

test('design: the number tiles of the progress screen (the brochure\'s stacked tiles) keep their text readable', () => {
  const tiles = [...css.matchAll(/\.stats div(?::nth-child\([^)]*\))? \{([^}]*)\}/g)].map(m => m[1]);
  for (const rule of tiles) {
    const bg = /background: (#[0-9a-f]{6})/i.exec(rule)?.[1], fg = /(?:^|;)\s*color: (#[0-9a-f]{6})/i.exec(rule)?.[1];
    if (bg) assert.ok(contrast(fg ?? '#05101a', bg) >= 4.5, `${fg ?? '#05101a'} on ${bg}: ${contrast(fg ?? '#05101a', bg).toFixed(2)}`);
  }
  assert.ok(tiles.length >= 5, 'five tile colours');
});

test('design: the dark theme has one set of values — the system-setting copy equals the chosen-theme copy', () => {
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  const body = media.slice(media.indexOf(':root:not([data-theme="light"]) {'), media.indexOf('\n  }'));
  const system = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  assert.deepEqual(system, tokens(':root[data-theme="dark"]'));
});

test('design: high contrast overrides every colour token of the light theme', () => {
  const hc = tokens(':root.hc');
  const colour = v => /^#|^rgba?\(|gradient/.test(v);
  const missing = Object.entries(LIGHT).filter(([k, v]) => colour(v) && !(k in hc)).map(([k]) => k);
  assert.deepEqual(missing, []);
});

test('design: the interface draws pictures, not emoji (src/ui, src/games)', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B06}\u{2B50}]/u;
  const offenders = [];
  for (const dir of ['src/ui', 'src/games']) {
    for (const f of readdirSync(dir).filter(x => x.endsWith('.js'))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (!/^\s*(\/\/|\/?\*)/.test(line) && emoji.test(line.replace(/\/\/.*$/, ''))) offenders.push(`${dir}/${f}:${i + 1}`); // code, not comments
      });
    }
  }
  assert.deepEqual(offenders, []);
});

// 5.13 (the sample's art test: «points only at pictures that exist»): badgeArt() falls back to a star for an unknown
// name, so a typo would draw a wrong picture silently. Every badge named in the interface is in the catalog.
test('design: every badge named in the interface exists in the catalog (no silent star)', () => {
  const art = readFileSync('src/ui/art.js', 'utf8');
  const block = art.slice(art.indexOf('const BADGES = {'), art.indexOf('\n};', art.indexOf('const BADGES = {')));
  const known = new Set([...block.matchAll(/^ {2}'?([a-z-]+)'?: (?:id|\(\))/gm)].map(m => m[1]));
  assert.ok(known.size >= 14, `badges parsed: ${[...known]}`);
  const ui = readdirSync('src/ui').filter(f => f.endsWith('.js')).map(f => readFileSync(`src/ui/${f}`, 'utf8')).join('\n');
  const named = new Set([...[...ui.matchAll(/badgeArt\(([^,)]+)/g)].flatMap(m => [...m[1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])),
    ...[...ui.matchAll(/\{ art: '([a-z-]+)'/g)].map(m => m[1])]);
  assert.ok(named.size >= 10);
  assert.deepEqual([...named].filter(n => !known.has(n)), []);
});

// 5.24 — a mint ring on a white card is about 1.7:1. Keyboard focus has to change those pixels by ≥ 3:1
// (WCAG 2.4.7 in practice, 2.4.13's contrast). The ring is the text colour of the theme.
test('design: the keyboard focus ring contrasts at ≥ 3:1; the mint accent on white does not', () => {
  assert.ok(contrast('#16e182', '#ffffff') < 3, 'mint on white is the ring this release replaced');
  for (const [name, theme] of [['light', LIGHT], ['dark', DARK], ['high contrast', HC]]) {
    for (const bg of ['bg', 'card', 'bg2']) {
      const ratio = contrast(theme.focus, theme[bg]);
      assert.ok(ratio >= 3, `${name}: --focus on ${bg} is ${ratio.toFixed(2)}`);
    }
  }
  assert.equal(css.includes('outline: 3px solid var(--accent)'), false);
  assert.match(css, /\.btn\.primary:disabled \{[^}]*opacity: 1/);
});

