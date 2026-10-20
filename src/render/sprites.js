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

/** Draws a sprite centred at (x, y), `w` wide (the height keeps its aspect); false if there is none. */
export function drawSprite(ctx, name, x, y, w, { sx = 1, sy = 1, alpha = 1 } = {}) {
  const img = sprite(name);
  if (!img) return false;
  const h = w * (img.naturalHeight ?? img.height) / (img.naturalWidth ?? img.width);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
