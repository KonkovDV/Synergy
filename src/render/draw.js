// Canvas drawing primitives shared by all games (DRY). Everything is procedural: no image assets.
// 5.32 — soft 3D in the brand's light (docs/GAME_VISUALS.md): the hand, the gauge and the panels are shaded with
// gradients from render/fx.js; high contrast keeps them flat with a white rim.
import { linear, glow, mix, rgba, softShadow, sphere, roundRect, BRAND } from './fx.js';

export { roundRect };

/**
 * Canvas palettes (5.12, corporate style of «Моторика»: green → teal → blue → violet, near-black ink). Light scenes are
 * bright and airy, so text in a state colour uses its «Ink» shade (≥ 4.5:1 on the scene); fills keep the bright shade.
 * A — coral, B — blue, A+B — violet in every theme.
 */
const PALETTES = {
  light: {
    bg: '#f3f5f7', bg2: '#e8edf0', panel: '#ffffff', line: '#e1e6ea',
    text: '#05101a', muted: '#4f5b66', accent: '#0a9d63', accentInk: '#0a7a47', accentSoft: 'rgba(22,225,130,0.22)',
    a: '#f2622e', b: '#2f6fe0', good: '#0a9d63', warn: '#d98200', bad: '#e0364a', violet: '#6d4ef0',
    aInk: '#b53d0d', bInk: '#1d5fbf', goodInk: '#0a7047', warnInk: '#8a4f00', badInk: '#c21b2e',
    track: '#e6ebef', grid: 'rgba(5,16,26,0.14)', rim: '#ffffff', veil: 'rgba(243,245,247,0.82)',
    sceneTop: '#eaf8f2', sceneBottom: '#ffffff', ringNeutral: '#0e9f8f', shade: 'rgba(5,16,26,0.1)',
  },
  dark: {
    bg: '#071019', bg2: '#0e1a24', panel: '#15232f', line: '#213140',
    text: '#eef3f6', muted: '#a3b3c0', accent: '#16e182', accentInk: '#3ef0a0', accentSoft: 'rgba(22,225,130,0.2)',
    a: '#ff8a52', b: '#4d94ff', good: '#16e182', warn: '#ffc24d', bad: '#ff6b78', violet: '#9a7dff',
    aInk: '#ffb084', bInk: '#8ab8ff', goodInk: '#4cf0a6', warnInk: '#ffd27a', badInk: '#ff9aa4',
    track: 'rgba(255,255,255,0.09)', grid: 'rgba(255,255,255,0.14)', rim: 'rgba(4,10,16,0.85)', veil: 'rgba(4,10,16,0.62)',
    sceneTop: '#0d1d2a', sceneBottom: '#071019', ringNeutral: '#ffffff', shade: 'rgba(0,0,0,0.35)',
  },
};
// High contrast reaches the game field too (5.11: only the muted text changed): black surfaces, white lines.
const HIGH_CONTRAST = { bg: '#000000', bg2: '#000000', panel: '#101010', line: '#ffffff', muted: '#e8ecff', bad: '#ff8a8a', badInk: '#ff8a8a' };

/** The current palette (mutated in place by setRenderOptions, so games always read the live theme). */
export const COLORS = { ...PALETTES.light, theme: 'light', hc: false };
let textScale = 1;

/** Presentation options from the accessibility settings: canvas text size, theme, high contrast (black field). */
export function setRenderOptions({ scale = 1, highContrast = false, theme = 'light' } = {}) {
  textScale = Math.min(1.25, Math.max(1, scale)); // canvas layouts are tuned up to +25 %
  const name = highContrast ? 'dark' : PALETTES[theme] ? theme : 'light';
  Object.assign(COLORS, PALETTES[name], { theme: name, hc: !!highContrast }, highContrast ? HIGH_CONTRAST : {});
  Object.assign(SKIN_COLORS, THEME_SKINS[name]);
}

/** Scene colours of a theme: games pick their backdrop from here (light — daylight, dark — night). */
export const scene = (light, dark) => (COLORS.theme === 'dark' ? dark : light);

/** The key of the current look for cached scene layers (render/fx.js cachedLayer). */
export const lookKey = name => `${name}:${COLORS.theme}${COLORS.hc ? ':hc' : ''}`;

/** Canvas fonts (5.32): the page's own Inter for words, Unbounded for numbers and verdicts (brand typography). */
export const FONT_TEXT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_DISPLAY = 'Unbounded, Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const SKIN_COLORS = {
  // Graphite follows the theme like the brand's black prostheses: dark on the light field, light on the night one
  // (≥ 3:1 on the game field either way, WCAG 1.4.11; 5.11 — it was 1.9:1).
  graphite: { base: '#3d4a57', dark: '#222b34', light: '#6b7a88', glow: '#16e182' },
  sky: { base: '#4f8ff7', dark: '#2f62c9', light: '#8fb8ff', glow: '#d6ecff' },
  coral: { base: '#ff7a6b', dark: '#d9534a', light: '#ffab9f', glow: '#fff1ee' },
  mint: { base: '#36c9a3', dark: '#1f9a7c', light: '#7fe6cb', glow: '#e6fff8' },
  gold: { base: '#e8b33a', dark: '#b8841c', light: '#f7d47d', glow: '#fff6d6' },
  neon: { base: '#9b5cff', dark: '#6a2fd6', light: '#c4a1ff', glow: '#5affd8' },
  cosmos: { base: '#26357a', dark: '#121b47', light: '#4b5fb8', glow: '#ff6ad5' },
  icon: { base: '#2e3c4a', dark: '#18222c', light: '#5f7080', glow: '#16e182' }, // UI pictograms: follows the theme
};
const THEME_SKINS = {
  light: { graphite: { base: '#3d4a57', dark: '#222b34', light: '#6b7a88', glow: '#16e182' }, icon: { base: '#2e3c4a', dark: '#18222c', light: '#5f7080', glow: '#16e182' } },
  dark: { graphite: { base: '#7d8bb0', dark: '#56627f', light: '#a9b6d8', glow: '#16e182' }, icon: { base: '#cfdbe4', dark: '#8fa2b2', light: '#ffffff', glow: '#16e182' } },
};

export function fillRound(ctx, x, y, w, h, r, color) { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }

/** A raised panel of a scene (cards, badges): a two-step soft shadow, the surface, a hairline rim (5.32). */
export function panel(ctx, x, y, w, h, r, color = COLORS.panel) {
  if (!COLORS.hc) fillRound(ctx, x - 1, y + 6, w + 2, h, r + 1, rgba('#05101a', COLORS.theme === 'dark' ? 0.28 : 0.05));
  fillRound(ctx, x, y + 2, w, h, r, COLORS.shade);
  fillRound(ctx, x, y, w, h, r, color);
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.lineWidth = 1; ctx.strokeStyle = COLORS.hc ? '#ffffff' : COLORS.theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(5,16,26,0.06)'; ctx.stroke();
}

/** Vertical backdrop gradient of a scene: stops [[offset, colour], …]. */
export function backdrop(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/**
 * Canvas text. `maxWidth` — the font shrinks (not squeezes) until the line fits, down to 60 % of its size;
 * `outline` — a rim in the scene colour (white by day, dark at night), so a label stays readable over notes,
 * particles and the glider (5.8); a colour string — a rim of that colour (light ink on a dark surface by day).
 */
export function text(ctx, str, x, y, { size = 16, weight = 600, color = COLORS.text, align = 'center', baseline = 'middle', display = false, font = display ? FONT_DISPLAY : FONT_TEXT, maxWidth = 0, outline = false } = {}) {
  let px = Math.round(size * textScale);
  if (display) weight = Math.min(800, Math.max(500, weight)); // Unbounded ships 500–800
  ctx.font = `${weight} ${px}px ${font}`;
  if (maxWidth > 0) {
    const width = ctx.measureText(str).width;
    if (width > maxWidth) { px = Math.max(Math.round(size * textScale * 0.6), Math.floor(px * maxWidth / width)); ctx.font = `${weight} ${px}px ${font}`; }
  }
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px * 0.24); ctx.strokeStyle = typeof outline === 'string' ? outline : COLORS.rim; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

/** The pixel size text() will use for a nominal size (the canvas text follows the accessibility text size). */
export const scaledPx = size => Math.round(size * textScale);

/** The width a label will take when drawn by text() with the same options (plates sized to their words). */
export function textWidth(ctx, str, { size = 16, weight = 600, display = false } = {}) {
  const px = Math.round(size * textScale), wt = display ? Math.min(800, Math.max(500, weight)) : weight;
  ctx.font = `${wt} ${px}px ${display ? FONT_DISPLAY : FONT_TEXT}`;
  const m = typeof ctx.measureText === 'function' ? ctx.measureText(str) : null;
  return m && Number.isFinite(m.width) ? m.width : str.length * px * 0.6;
}

/**
 * Words of a name for a narrow column, wrapped greedily at the given size (UBI4 «Сгиб большого пальца» did not fit a
 * card even at the 60 % floor of text()). More than `maxLines` lines — the name is returned as one line to shrink.
 */
export function wrapLines(ctx, str, maxWidth, opts, maxLines = 3) {
  const lines = [];
  for (const word of str.split(' ')) {
    const joined = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && textWidth(ctx, joined, opts) <= maxWidth) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines.length <= maxLines ? lines : [str];
}

export function circle(ctx, x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }

/** Capsule from (x1,y1) to (x2,y2) with width w. */
function capsule(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

const FINGERS = [ // index, middle, ring, little: x offset, length (× palm width)
  { x: -0.36, len: 0.66 }, { x: -0.12, len: 0.74 }, { x: 0.12, len: 0.69 }, { x: 0.36, len: 0.54 },
];

/**
 * Stylized bionic hand, palm toward the viewer, fingers up (rotate with `angle`).
 * pose — flexion [thumb, index, middle, ring, little] 0..1.
 * 5.32 — soft 3D: a carbon shell with a sheen, lighter knuckles and tips, a mint light on the palm that grows with the
 * grip force (`glow`), a hairline rim. The geometry is the same as before: the games and their tests see the same hand.
 */
export function drawHand(ctx, { x, y, size, pose, skin = 'graphite', angle = 0, mirror = false, glow: lit = 0, sleeve = true, wrist = 0, roll = 0, dev = 0 }) {
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.graphite;
  const s = size, flat = COLORS.hc;
  const shade = (tone, x0, x1) => (flat ? tone : linear(ctx, x0, 0, x1, 0, [[0, mix(tone, '#ffffff', 0.3)], [0.45, tone], [1, mix(tone, '#000000', 0.32)]], tone));
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); if (mirror) ctx.scale(-1, 1);
  if (sleeve) {
    roundRect(ctx, -0.44 * s, -0.02 * s, 0.88 * s, 0.62 * s, 0.14 * s);
    ctx.fillStyle = shade(c.dark, -0.44 * s, 0.44 * s); ctx.fill();
    if (!flat && lit > 0.05) glow(ctx, 0, 0.195 * s, 0.36 * s, c.glow, 0.2 + 0.6 * lit);
    fillRound(ctx, -0.3 * s, 0.16 * s, 0.6 * s, 0.07 * s, 0.035 * s, rgba(c.glow, 0.35 + 0.65 * lit));
  }
  // 5.29 — wrist flexion (1) and extension (−1) of the UBI4 set: palm and fingers turn about the wrist, a curved arrow
  // shows the direction. A front view cannot show the sagittal plane, so this is a sign, not anatomy (cue says it in words).
  if (wrist) {
    ctx.rotate(0.55 * Math.max(-1, Math.min(1, wrist)));
    ctx.strokeStyle = c.glow; ctx.lineWidth = 0.07 * s; ctx.lineCap = 'round';
    const dir = wrist > 0 ? 1 : -1;
    ctx.beginPath(); ctx.arc(0, -0.1 * s, 0.78 * s, -Math.PI / 2 - dir * 0.25, -Math.PI / 2 + dir * 0.45, dir < 0); ctx.stroke();
    const end = -Math.PI / 2 + dir * 0.45, ex = Math.cos(end) * 0.78 * s, ey = -0.1 * s + Math.sin(end) * 0.78 * s;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - dir * 0.16 * s, ey - 0.06 * s); ctx.moveTo(ex, ey); ctx.lineTo(ex - dir * 0.02 * s, ey + 0.16 * s); ctx.stroke();
  }
  // 6.0 — the states of the task's СПППР. Deviation (adduction +1 toward the little finger, abduction −1 toward the thumb)
  // tilts the hand in the picture's plane with a short arrow at the fingertips; pronation (+1) and supination (−1) turn
  // the forearm — the palm narrows as seen edge-on and an arrow circles the wrist. Signs, not anatomy (the cue says it).
  if (dev) {
    const d = Math.max(-1, Math.min(1, dev));
    ctx.rotate(0.42 * d);
    ctx.strokeStyle = c.glow; ctx.lineWidth = 0.07 * s; ctx.lineCap = 'round';
    const r = 1.55 * s, from = -Math.PI / 2 - d * 0.05, to = -Math.PI / 2 + d * 0.32;
    ctx.beginPath(); ctx.arc(0, 0, r, from, to, d < 0); ctx.stroke();
    const ex = Math.cos(to) * r, ey = Math.sin(to) * r;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - d * 0.17 * s, ey - 0.07 * s); ctx.moveTo(ex, ey); ctx.lineTo(ex - d * 0.05 * s, ey + 0.16 * s); ctx.stroke();
  }
  if (roll) {
    const d = Math.max(-1, Math.min(1, roll));
    ctx.strokeStyle = c.glow; ctx.lineWidth = 0.07 * s; ctx.lineCap = 'round';
    const rx = 0.62 * s, ry = 0.2 * s, cy = -0.02 * s, start = d > 0 ? Math.PI * 0.15 : Math.PI * 0.85, end = d > 0 ? Math.PI * 1.75 : -Math.PI * 0.75;
    ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, start, end, d < 0); ctx.stroke();
    const ex = Math.cos(end) * rx, ey = cy + Math.sin(end) * ry;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - d * 0.15 * s, ey - 0.1 * s); ctx.moveTo(ex, ey); ctx.lineTo(ex - d * 0.16 * s, ey + 0.08 * s); ctx.stroke();
    ctx.scale(1 - 0.28 * Math.abs(d), 1);
  }
  // Fingers behind the palm edge: a shaded segment, a lighter knuckle, a pad at the tip.
  FINGERS.forEach((f, i) => {
    const flex = pose[i + 1];
    const len = f.len * s * (1 - 0.72 * flex);
    const bx = f.x * s, by = -0.95 * s, w = 0.19 * s;
    const tone = flex > 0.55 ? c.dark : c.base;
    capsule(ctx, bx, by, bx, by - len, w, shade(tone, bx - w / 2, bx + w / 2));
    if (len > 0.2 * s) capsule(ctx, bx, by - len * 0.52, bx, by - len * 0.52 + 0.001, w * 0.82, c.light);
    capsule(ctx, bx, by - len, bx, by - len + 0.001, w * 0.62, flex > 0.55 ? c.base : c.light);
  });
  // Palm: the shell, the sensor plate, the light; a hairline rim keeps it apart from a busy scene.
  roundRect(ctx, -0.5 * s, -1.02 * s, 1.0 * s, 1.04 * s, 0.22 * s);
  ctx.fillStyle = flat ? c.base : linear(ctx, -0.5 * s, -1.02 * s, 0.5 * s, 0.02 * s, [[0, mix(c.base, '#ffffff', 0.32)], [0.42, c.base], [1, mix(c.base, '#000000', 0.3)]], c.base);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 0.025 * s); ctx.strokeStyle = flat ? '#ffffff' : rgba('#05101a', 0.22); ctx.stroke();
  roundRect(ctx, -0.34 * s, -0.78 * s, 0.68 * s, 0.5 * s, 0.14 * s);
  ctx.fillStyle = flat ? c.dark : linear(ctx, 0, -0.78 * s, 0, -0.28 * s, [[0, mix(c.dark, '#000000', 0.25)], [1, mix(c.dark, '#ffffff', 0.12)]], c.dark);
  ctx.fill();
  if (!flat) glow(ctx, 0, -0.53 * s, 0.34 * s, c.glow, 0.25 + 0.75 * lit);
  ctx.globalAlpha = 0.45 + 0.55 * lit;
  circle(ctx, 0, -0.53 * s, 0.09 * s, c.glow);
  ctx.globalAlpha = 1;
  // Thumb: open points up-left, flexed crosses the palm.
  const t = pose[0];
  const ang = -2.25 + 1.95 * t;
  const tl = 0.56 * s * (1 - 0.25 * t);
  const tx = -0.42 * s, ty = -0.32 * s;
  const ttone = t > 0.55 ? c.dark : c.base;
  capsule(ctx, tx, ty, tx + Math.cos(ang) * tl, ty + Math.sin(ang) * tl, 0.21 * s, flat ? ttone : linear(ctx, tx, ty - 0.1 * s, tx + Math.cos(ang) * tl, ty + Math.sin(ang) * tl + 0.1 * s, [[0, mix(ttone, '#000000', 0.2)], [1, mix(ttone, '#ffffff', 0.25)]], ttone));
  capsule(ctx, tx + Math.cos(ang) * tl, ty + Math.sin(ang) * tl, tx + Math.cos(ang) * tl + 0.001, ty + Math.sin(ang) * tl, 0.14 * s, c.light);
  ctx.restore();
}

/** A soft shadow of the hand on the surface below it (5.32): wider when the hand is lower. */
export function handShadow(ctx, x, y, size, alpha = 0.18) {
  if (!COLORS.hc) softShadow(ctx, x, y, size * 0.7, size * 0.16, COLORS.theme === 'dark' ? alpha * 1.6 : alpha);
}

/**
 * Vertical gauge with a target window — used for force and level feedback. 5.32 — a glass capsule: a shaded track,
 * the green window glows with brackets beside it, the danger zone fades in coral, the fill is a brand gradient with a
 * light cap on the current value.
 */
export function drawGauge(ctx, { x, y, w, h, value, min = null, max = null, danger = null, color = COLORS.accent, label = '' }) {
  const flat = COLORS.hc;
  if (!flat) fillRound(ctx, x - 5, y - 1, w + 10, h + 10, (w + 10) / 2, rgba('#05101a', COLORS.theme === 'dark' ? 0.3 : 0.07));
  fillRound(ctx, x - 4, y - 4, w + 8, h + 8, (w + 8) / 2, COLORS.panel); // a white (night: dark) capsule under the scale
  roundRect(ctx, x, y, w, h, w / 2);
  ctx.fillStyle = flat ? COLORS.track : linear(ctx, x, 0, x + w, 0, [[0, scene('#dfe6eb', 'rgba(255,255,255,0.05)')], [0.5, COLORS.track], [1, scene('#dfe6eb', 'rgba(255,255,255,0.05)')]], COLORS.track);
  ctx.fill();
  if (min !== null && max !== null) {
    const wy = y + h * (1 - max), wh = h * (max - min);
    if (!flat) fillRound(ctx, x - 5, wy - 3, w + 10, wh + 6, 9, rgba(COLORS.good, 0.14));
    fillRound(ctx, x, wy, w, wh, 6, rgba(COLORS.good, 0.3));
    ctx.strokeStyle = COLORS.good; ctx.lineWidth = 2;
    roundRect(ctx, x, wy, w, wh, 6); ctx.stroke();
    // brackets beside the window: it reads at a glance even under the fill
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const yy of [wy, wy + wh]) { ctx.moveTo(x - 8, yy); ctx.lineTo(x - 3, yy); ctx.moveTo(x + w + 3, yy); ctx.lineTo(x + w + 8, yy); }
    ctx.stroke();
  }
  // the danger zone over the window (where they overlap, the overlap must read as risky)
  if (danger !== null && danger < 1) {
    roundRect(ctx, x, y, w, h * (1 - danger), w / 2);
    ctx.fillStyle = flat ? 'rgba(255,138,138,0.35)' : linear(ctx, 0, y, 0, y + h * (1 - danger), [[0, rgba(COLORS.bad, 0.45)], [1, rgba(COLORS.bad, 0.12)]], 'rgba(239,68,68,0.25)');
    ctx.fill();
  }
  const v = Math.max(0, Math.min(1, value));
  const top = y + h * (1 - v), fh = Math.max(6, h * v - 3);
  roundRect(ctx, x + 3, top, w - 6, fh, (w - 6) / 2);
  ctx.fillStyle = flat ? color : linear(ctx, 0, y + h, 0, top, [[0, mix(color, '#000000', 0.18)], [1, mix(color, '#ffffff', 0.28)]], color);
  ctx.fill();
  if (v > 0.02) {
    if (!flat) glow(ctx, x + w / 2, top + 3, w * 0.95, color, 0.7);
    fillRound(ctx, x + 1, top - 2, w - 2, 5, 2.5, flat ? '#ffffff' : rgba('#ffffff', 0.95));
  }
  if (label) text(ctx, label, x + w / 2, y + h + 16, { size: 12, weight: 700, color: COLORS.muted, outline: true });
}

/**
 * A code or trial lamp (26.10): an LED in a socket. `color` — the state colour or null (unlit). Glow and gloss only
 * outside high contrast.
 */
export function drawLamp(ctx, x, y, r, color) {
  const deco = !COLORS.hc;
  circle(ctx, x, y, r + 2, deco ? scene('#c9d3da', '#0a1620') : '#ffffff');
  if (!color) { circle(ctx, x, y, r, scene('#e6ecf0', 'rgba(255,255,255,0.12)')); return; }
  if (deco) { glow(ctx, x, y, r * 3, color, 0.75); sphere(ctx, x, y, r, color); } else circle(ctx, x, y, r, color);
}

/** The hold ring (26.10): a faint track and the done part in the brand gradient, a light at its tip. `k` 0..1. */
export function holdRing(ctx, x, y, r, k, width = 5) {
  const deco = !COLORS.hc;
  ctx.lineCap = 'round'; ctx.lineWidth = width;
  ctx.strokeStyle = deco ? scene('rgba(5,16,26,0.08)', 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = deco ? linear(ctx, x - r, y - r, x + r, y + r, [[0, BRAND.mint], [0.6, BRAND.teal], [1, BRAND.sky]], COLORS.good) : COLORS.good;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, k))); ctx.stroke();
  if (deco && k > 0) { const a = -Math.PI / 2 + Math.PI * 2 * Math.min(1, k); glow(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, width * 2.6, BRAND.mint, 0.9); }
}
