// Canvas drawing primitives shared by all games (DRY). Everything is procedural: no image assets.

export const COLORS = {
  bg: '#0d1530', bg2: '#16224a', panel: '#1b2a57', line: '#2c3d73',
  text: '#f2f5ff', muted: '#9fb0dd', accent: '#5ad1ff', a: '#ffb547', b: '#5ad1ff',
  good: '#3fe0a0', warn: '#ffcc4d', bad: '#ff6b6b', violet: '#9b7bff',
};

const BASE_MUTED = COLORS.muted;
let textScale = 1;

/** Presentation options from the accessibility settings (canvas text size, high contrast). */
export function setRenderOptions({ scale = 1, highContrast = false } = {}) {
  textScale = Math.min(1.25, Math.max(1, scale)); // canvas layouts are tuned up to +25 %
  COLORS.muted = highContrast ? '#e8ecff' : BASE_MUTED;
}

export const SKIN_COLORS = {
  graphite: { base: '#46506a', dark: '#2b3245', light: '#6b7898', glow: '#5ad1ff' },
  sky: { base: '#4f8ff7', dark: '#2f62c9', light: '#8fb8ff', glow: '#d6ecff' },
  coral: { base: '#ff7a6b', dark: '#d9534a', light: '#ffab9f', glow: '#fff1ee' },
  mint: { base: '#36c9a3', dark: '#1f9a7c', light: '#7fe6cb', glow: '#e6fff8' },
  gold: { base: '#e8b33a', dark: '#b8841c', light: '#f7d47d', glow: '#fff6d6' },
  neon: { base: '#9b5cff', dark: '#6a2fd6', light: '#c4a1ff', glow: '#5affd8' },
  cosmos: { base: '#26357a', dark: '#121b47', light: '#4b5fb8', glow: '#ff6ad5' },
  icon: { base: '#cfe0ff', dark: '#8ea9dc', light: '#ffffff', glow: '#ffb547' }, // UI pictograms on dark surfaces
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

/**
 * Canvas text. `maxWidth` — the font shrinks (not squeezes) until the line fits, down to 60 % of its size;
 * `outline` — a dark rim, so a label stays readable over notes, particles and the glider (5.8).
 */
export function text(ctx, str, x, y, { size = 16, weight = 600, color = COLORS.text, align = 'center', baseline = 'middle', font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', maxWidth = 0, outline = false } = {}) {
  let px = Math.round(size * textScale);
  ctx.font = `${weight} ${px}px ${font}`;
  if (maxWidth > 0) {
    const width = ctx.measureText(str).width;
    if (width > maxWidth) { px = Math.max(Math.round(size * textScale * 0.6), Math.floor(px * maxWidth / width)); ctx.font = `${weight} ${px}px ${font}`; }
  }
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px * 0.22); ctx.strokeStyle = 'rgba(8,12,30,0.85)'; ctx.strokeText(str, x, y); }
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
  fillRound(ctx, x, y, w, h, w / 2, 'rgba(255,255,255,0.08)');
  if (min !== null && max !== null) {
    fillRound(ctx, x, y + h * (1 - max), w, h * (max - min), 6, 'rgba(63,224,160,0.35)');
    ctx.strokeStyle = COLORS.good; ctx.lineWidth = 2;
    roundRect(ctx, x, y + h * (1 - max), w, h * (max - min), 6); ctx.stroke();
  }
  if (danger !== null) fillRound(ctx, x, y, w, h * (1 - danger), w / 2, 'rgba(255,107,107,0.25)');
  const v = Math.max(0, Math.min(1, value));
  fillRound(ctx, x + 3, y + h * (1 - v) , w - 6, Math.max(6, h * v - 3), (w - 6) / 2, color);
  if (label) text(ctx, label, x + w / 2, y + h + 14, { size: 12, color: COLORS.muted });
}

/**
 * «Мио» — the coach: a round bionic buddy with a two-sensor antenna (channels A and B) and a visor face.
 * Moods: joy (success), support (keep going), rest (stop for today). Procedural, no assets.
 */
export function drawMio(ctx, { x, y, size, mood = 'support' }) {
  const r = size / 2, body = mood === 'rest' ? COLORS.violet : COLORS.accent;
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = COLORS.muted; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, -r * 1.12); ctx.stroke();
  circle(ctx, -r * 0.16, -r * 1.16, r * 0.11, COLORS.a); circle(ctx, r * 0.16, -r * 1.16, r * 0.11, COLORS.b);
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, body); grad.addColorStop(1, mood === 'rest' ? '#5b3fc4' : '#2f7fd6');
  circle(ctx, 0, 0, r, grad);
  fillRound(ctx, -r * 0.66, -r * 0.4, r * 1.32, r * 0.9, r * 0.4, '#0f1a36');
  const eyeY = -r * 0.1, eyeX = r * 0.3, ink = mood === 'rest' ? '#c4b5ff' : COLORS.good;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = r * 0.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (mood === 'joy') ctx.arc(side * eyeX, eyeY + r * 0.06, r * 0.13, Math.PI * 1.1, Math.PI * 1.9);
    else if (mood === 'rest') { ctx.moveTo(side * eyeX - r * 0.12, eyeY); ctx.lineTo(side * eyeX + r * 0.12, eyeY); }
    else { ctx.arc(side * eyeX, eyeY, r * 0.11, 0, Math.PI * 2); ctx.fill(); }
    ctx.stroke();
  }
  ctx.beginPath(); // mouth
  if (mood === 'joy') ctx.arc(0, r * 0.12, r * 0.22, Math.PI * 0.15, Math.PI * 0.85);
  else if (mood === 'rest') { ctx.moveTo(-r * 0.1, r * 0.25); ctx.lineTo(r * 0.1, r * 0.25); }
  else ctx.arc(0, r * 0.14, r * 0.14, Math.PI * 0.25, Math.PI * 0.75);
  ctx.stroke();
  if (mood === 'joy') for (const side of [-1, 1]) circle(ctx, side * r * 0.5, r * 0.22, r * 0.08, 'rgba(255,130,170,0.7)');
  ctx.restore();
}

