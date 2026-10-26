// Visual effects of the game field (5.32, docs/GAME_VISUALS.md): the brand's light — gradients, glows, soft shadows,
// light trails, sparkles — and a cache for the static layer of a scene. Pure drawing, no game state. Every helper
// survives a stand-in canvas (the headless tests): a gradient that cannot take colour stops falls back to a solid colour,
// and without a document the cached layer is painted straight into the frame.

/** The brand colours of the canvas (brochure 2025, docs/DESIGN.md): green → teal → cyan → sky → blue → violet. */
export const BRAND = {
  mint: '#16e182', teal: '#1fd0a6', cyan: '#25c2c4', sky: '#2fa6e0', blue: '#2f6fe0', violet: '#5b4fd6',
  graphite: '#05101a', coral: '#ff7a45', gold: '#ffc93c',
};

/** `#rrggbb` (or `#rgb`) with an alpha → `rgba(…)`; any other colour string is returned as it is. */
export function rgba(hex, a) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return hex;
  const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function stopsOn(g, stops, fallback) {
  if (!g || typeof g.addColorStop !== 'function') return fallback;
  for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

/** A linear gradient from (x0, y0) to (x1, y1); stops [[offset, colour], …]. */
export function linear(ctx, x0, y0, x1, y1, stops, fallback = stops[0][1]) {
  return stopsOn(typeof ctx.createLinearGradient === 'function' ? ctx.createLinearGradient(x0, y0, x1, y1) : null, stops, fallback);
}

/** A radial gradient around (x, y) from radius r0 to r1. */
export function radial(ctx, x, y, r0, r1, stops, fallback = stops[stops.length - 1][1]) {
  return stopsOn(typeof ctx.createRadialGradient === 'function' ? ctx.createRadialGradient(x, y, r0, x, y, r1) : null, stops, fallback);
}

/** A soft glow: the colour at the centre fading to nothing at radius r (instead of shadowBlur, costly on weak phones). */
export function glow(ctx, x, y, r, color, alpha = 1) {
  if (!(r > 0) || alpha <= 0) return;
  ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, rgba(color, 0.55 * alpha)], [0.45, rgba(color, 0.22 * alpha)], [1, rgba(color, 0)]], 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/** A soft contact shadow under a thing standing on a surface: an ellipse with blurred edges. */
export function softShadow(ctx, x, y, rx, ry, alpha = 0.22, color = '#05101a') {
  if (!(rx > 0) || !(ry > 0)) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, ry / rx);
  ctx.fillStyle = radial(ctx, 0, 0, 0, rx, [[0, rgba(color, alpha)], [0.6, rgba(color, alpha * 0.45)], [1, rgba(color, 0)]], rgba(color, alpha * 0.5));
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A glossy sphere (the brand's «экосистема» ball, a note of «Ритм», the knob of the safe): lit from the top left. */
export function sphere(ctx, x, y, r, base, light = '#ffffff', dark = null) {
  const lx = x - r * 0.35, ly = y - r * 0.4;
  ctx.fillStyle = radial(ctx, lx, ly, r * 0.05, r * 1.35, [[0, mix(base, light, 0.55)], [0.35, base], [1, dark ?? mix(base, '#05101a', 0.35)]], base);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = radial(ctx, lx, ly, 0, r * 0.55, [[0, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']], 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.55, 0, Math.PI * 2); ctx.fill();
}

/** Mixes two `#rrggbb` colours (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  const p = c => { const m = /^#([0-9a-f]{6})$/i.exec(c ?? ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const x = p(a), y = p(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A light trail of the brochure covers along a polyline: a wide soft band, a brighter band and a near-white core.
 * `alpha` scales the whole trail (quiet by day, bright at night).
 */
export function lightTrail(ctx, pts, color, width = 3, alpha = 1) {
  if (pts.length < 2 || alpha <= 0) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [wMul, aMul, c] of [[7, 0.12, color], [2.6, 0.32, color], [1, 0.9, mix(color, '#ffffff', 0.6)]]) {
    ctx.globalAlpha = Math.min(1, alpha * aMul);
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, width * wMul);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Points of a smooth wave from x0 to x1 (a light trail across a scene). */
export function wavePoints(x0, x1, y, amp, len, phase = 0, step = 14) {
  const pts = [];
  for (let x = x0; x <= x1 + step; x += step) pts.push([x, y + amp * Math.sin((x + phase) / len) + amp * 0.35 * Math.sin((x + phase * 1.7) / (len * 0.47))]);
  return pts;
}

/** A four-point sparkle (successes only, 5.17). */
export function sparkle(ctx, x, y, r, color, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, rr = i % 2 ? r * 0.32 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** A rounded-rectangle path (render/draw.js re-exports it). */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A glass plate (HUD badges, pills over a scene): a translucent fill, a hairline rim, a top sheen. */
export function glassPlate(ctx, x, y, w, h, r, { fill = 'rgba(255,255,255,0.86)', rim = 'rgba(5,16,26,0.08)', sheen = true } = {}) {
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rim; ctx.stroke();
  if (sheen) {
    ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip?.();
    ctx.fillStyle = linear(ctx, 0, y, 0, y + h * 0.55, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 'rgba(255,255,255,0)');
    ctx.fillRect(x, y, w, h * 0.55);
    ctx.restore();
  }
}

// ── The static layer of a scene ─────────────────────────────────────────────────────────────────────────────────────
const LAYERS = new Map();
const MAX_LAYERS = 2;

// A zero-sized canvas gives its bitmap back at once (WebKit otherwise holds it until a late collection).
const release = entry => { if (entry) { entry.canvas.width = 0; entry.canvas.height = 0; } };

/** Drops every cached layer (the play screen calls it on leaving: the bitmaps are not kept in the background). */
export function clearLayers() { for (const entry of LAYERS.values()) release(entry); LAYERS.clear(); }

/** How many layers are cached (tests). */
export const layerCount = () => LAYERS.size;

/**
 * Draws the static part of a scene from a cache: `paint(g)` runs once per key, field size and pixel density, then the
 * frame only copies the picture (backgrounds have hundreds of shapes and gradients). `key` carries the theme. Without
 * a document (Node) or if the copy fails, the scene is painted straight into the frame.
 */
export function cachedLayer(ctx, key, w, h, paint) {
  if (typeof document === 'undefined' || typeof ctx.drawImage !== 'function' || !(w > 0) || !(h > 0)) { paint(ctx); return; }
  try {
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const dpr = m && m.a > 0 ? m.a : 1;
    const id = `${Math.round(w)}x${Math.round(h)}@${dpr}`;
    let entry = LAYERS.get(key);
    if (!entry || entry.id !== id) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      const g = canvas.getContext('2d');
      if (!g) { paint(ctx); return; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(g);
      entry = { id, canvas };
      release(LAYERS.get(key)); LAYERS.delete(key);
      LAYERS.set(key, entry);
      // One game is on screen at a time: keep its layer and one more (a theme switch). A layer is a full-screen bitmap —
      // at a pixel density of 2.5 about 6 MB — so a bigger cache would cost a weak phone tens of megabytes.
      while (LAYERS.size > MAX_LAYERS) { const oldest = LAYERS.keys().next().value; release(LAYERS.get(oldest)); LAYERS.delete(oldest); }
    }
    ctx.drawImage(entry.canvas, 0, 0, w, h);
  } catch {
    paint(ctx);
  }
}
