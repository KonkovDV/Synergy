// Pictures for the canvas (5.16): the UI layer loads the team's illustrations (ui/pictures.js) and hands them in;
// a game draws a sprite only when it has loaded, else its procedural drawing — headless tests, a failed load and a
// picture that does not exist (a new gesture on 28.10) look as before.
const SPRITES = new Map();

/** Registers a loaded image under its catalogue name. */
export function setSprite(name, image) {
  SPRITES.set(name, image);
}

/** The image if it is ready to draw, else null. */
export function sprite(name) {
  const img = SPRITES.get(name);
  return img && img.complete !== false && (img.naturalWidth ?? img.width) > 0 ? img : null;
}

/** Height ÷ width of a loaded sprite, or null. */
export function spriteAspect(name) {
  const img = sprite(name);
  return img ? (img.naturalHeight ?? img.height) / (img.naturalWidth ?? img.width) : null;
}

function place(ctx, img, x, y, w, h, sx, sy, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Draws a sprite centred at (x, y), `w` wide (the height keeps its aspect); false if there is none. */
export function drawSprite(ctx, name, x, y, w, { sx = 1, sy = 1, alpha = 1 } = {}) {
  const img = sprite(name);
  if (!img) return false;
  place(ctx, img, x, y, w, w * spriteAspect(name), sx, sy, alpha);
  return true;
}

const TINTED = new Map();

/** Drops the tinted copies (the play screen calls it on leaving, with the layer cache). */
export function clearTints() {
  for (const canvas of TINTED.values()) { canvas.width = 0; canvas.height = 0; }
  TINTED.clear();
}

/**
 * A sprite with a band of its height (`band` — from, to, in fractions) multiplied by `tint`: the shell of a hand in
 * the colour of the player's skin, the socket or the arm beyond the wrist band as it is (5.32). Each tint is painted
 * once into a small canvas. Without a document (Node) the sprite is drawn as it is.
 */
export function drawTinted(ctx, name, x, y, w, { sx = 1, sy = 1, alpha = 1, tint = null, band = [0, 1] } = {}) {
  const img = sprite(name);
  if (!img) return false;
  if (!tint || typeof document === 'undefined') return drawSprite(ctx, name, x, y, w, { sx, sy, alpha });
  const key = `${name}|${tint}|${band}`;
  let canvas = TINTED.get(key);
  if (!canvas) {
    const iw = img.naturalWidth ?? img.width, ih = img.naturalHeight ?? img.height;
    canvas = document.createElement('canvas');
    canvas.width = iw; canvas.height = ih;
    const g = canvas.getContext('2d');
    if (!g) return drawSprite(ctx, name, x, y, w, { sx, sy, alpha });
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint; g.fillRect(0, Math.round(ih * band[0]), iw, Math.round(ih * (band[1] - band[0])));
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0); // the multiply filled the clear corners too: keep only the hand
    TINTED.set(key, canvas);
    while (TINTED.size > 12) { const oldest = TINTED.keys().next().value; const old = TINTED.get(oldest); if (old) { old.width = 0; old.height = 0; } TINTED.delete(oldest); }
  }
  place(ctx, canvas, x, y, w, w * spriteAspect(name), sx, sy, alpha);
  return true;
}
