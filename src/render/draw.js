// Canvas drawing primitives shared by all games (DRY). Everything is procedural: no image assets.

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

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRound(ctx, x, y, w, h, r, color) { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }

/** A raised panel of a scene (cards, badges): a soft contact shadow, then the surface. */
export function panel(ctx, x, y, w, h, r, color = COLORS.panel) {
  fillRound(ctx, x, y + 3, w, h, r, COLORS.shade);
  fillRound(ctx, x, y, w, h, r, color);
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
 * particles and the glider (5.8).
 */
export function text(ctx, str, x, y, { size = 16, weight = 600, color = COLORS.text, align = 'center', baseline = 'middle', font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', maxWidth = 0, outline = false } = {}) {
  let px = Math.round(size * textScale);
  ctx.font = `${weight} ${px}px ${font}`;
  if (maxWidth > 0) {
    const width = ctx.measureText(str).width;
    if (width > maxWidth) { px = Math.max(Math.round(size * textScale * 0.6), Math.floor(px * maxWidth / width)); ctx.font = `${weight} ${px}px ${font}`; }
  }
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px * 0.24); ctx.strokeStyle = COLORS.rim; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
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
 */
export function drawHand(ctx, { x, y, size, pose, skin = 'graphite', angle = 0, mirror = false, glow = 0, sleeve = true }) {
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.graphite;
  const s = size;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); if (mirror) ctx.scale(-1, 1);
  if (sleeve) {
    fillRound(ctx, -0.44 * s, -0.02 * s, 0.88 * s, 0.62 * s, 0.14 * s, c.dark);
    fillRound(ctx, -0.3 * s, 0.16 * s, 0.6 * s, 0.07 * s, 0.035 * s, c.glow);
    ctx.globalAlpha = 0.35 + 0.65 * glow;
    fillRound(ctx, -0.3 * s, 0.16 * s, 0.6 * s, 0.07 * s, 0.035 * s, c.glow);
    ctx.globalAlpha = 1;
  }
  // Fingers behind the palm edge.
  FINGERS.forEach((f, i) => {
    const flex = pose[i + 1];
    const len = f.len * s * (1 - 0.72 * flex);
    const bx = f.x * s, by = -0.95 * s, w = 0.19 * s;
    capsule(ctx, bx, by, bx, by - len, w, flex > 0.55 ? c.dark : c.base);
    if (len > 0.2 * s) capsule(ctx, bx, by - len * 0.52, bx, by - len * 0.52 + 0.001, w * 0.82, c.light);
    capsule(ctx, bx, by - len, bx, by - len + 0.001, w * 0.62, flex > 0.55 ? c.base : c.light);
  });
  // Palm.
  fillRound(ctx, -0.5 * s, -1.02 * s, 1.0 * s, 1.04 * s, 0.22 * s, c.base);
  fillRound(ctx, -0.34 * s, -0.78 * s, 0.68 * s, 0.5 * s, 0.14 * s, c.dark);
  ctx.globalAlpha = 0.4 + 0.6 * glow;
  circle(ctx, 0, -0.53 * s, 0.09 * s, c.glow);
  ctx.globalAlpha = 1;
  // Thumb: open points up-left, flexed crosses the palm.
  const t = pose[0];
  const ang = -2.25 + 1.95 * t;
  const tl = 0.56 * s * (1 - 0.25 * t);
  const tx = -0.42 * s, ty = -0.32 * s;
  capsule(ctx, tx, ty, tx + Math.cos(ang) * tl, ty + Math.sin(ang) * tl, 0.21 * s, t > 0.55 ? c.dark : c.base);
  capsule(ctx, tx + Math.cos(ang) * tl, ty + Math.sin(ang) * tl, tx + Math.cos(ang) * tl + 0.001, ty + Math.sin(ang) * tl, 0.14 * s, c.light);
  ctx.restore();
}

/** Vertical gauge with a target window — used for force and level feedback. */
export function drawGauge(ctx, { x, y, w, h, value, min = null, max = null, danger = null, color = COLORS.accent, label = '' }) {
  fillRound(ctx, x - 3, y - 3, w + 6, h + 6, (w + 6) / 2, COLORS.panel); // a white (night: dark) capsule under the scale
  fillRound(ctx, x, y, w, h, w / 2, COLORS.track);
  if (min !== null && max !== null) {
    fillRound(ctx, x, y + h * (1 - max), w, h * (max - min), 6, 'rgba(34,197,94,0.3)');
    ctx.strokeStyle = COLORS.good; ctx.lineWidth = 2;
    roundRect(ctx, x, y + h * (1 - max), w, h * (max - min), 6); ctx.stroke();
  }
  if (danger !== null) fillRound(ctx, x, y, w, h * (1 - danger), w / 2, 'rgba(239,68,68,0.25)');
  const v = Math.max(0, Math.min(1, value));
  fillRound(ctx, x + 3, y + h * (1 - v) , w - 6, Math.max(6, h * v - 3), (w - 6) / 2, color);
  if (label) text(ctx, label, x + w / 2, y + h + 16, { size: 12, weight: 700, color: COLORS.muted, outline: true });
}
