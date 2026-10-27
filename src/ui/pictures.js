// Raster pictures (5.16): the team's illustrations — public/art/, made from the graphics package by
// tools/import-art.py (docs/DESIGN.md §6) — with the SVG drawings of art.js as the fallback: a picture that is not in
// the catalogue or fails to load is drawn in code, so a screen never shows a broken image. Decorative like the
// drawings (aria-hidden): the text next to a picture carries the meaning.
import { ART, PET_LAYOUT } from './art-manifest.js';
import { setSprite } from '../render/sprites.js';

const failed = new Set();

/** Where a picture is: a data URI in the one-file build, `art/` next to the built page, `public/art/` in the sources. */
export function artUrl(name) {
  const inline = globalThis.SYNERGY_ART;
  if (inline && Object.hasOwn(inline, name)) return inline[name];
  return `${globalThis.document?.documentElement?.dataset?.build === 'dist' ? 'art/' : 'public/art/'}${name}.webp`;
}

/** Whether the catalogue has the picture and it has not failed to load in this visit. */
export const hasArt = name => Object.hasOwn(ART, name) && !failed.has(name);

/**
 * `<img>` of a catalogue picture, `size` CSS px wide (the height keeps its aspect); class `art` like the drawings, so
 * the size rules of styles/app.css apply to both. `fallback()` builds the drawing instead when the picture is missing
 * or fails to load.
 */
export function picture(name, size, cls = '', fallback = null) {
  if (!hasArt(name)) return fallback ? fallback() : null;
  const [w, h] = ART[name];
  const img = document.createElement('img');
  img.className = `art pic ${cls}`.trim();
  img.src = artUrl(name);
  img.width = size;
  img.height = Math.round(size * h / w);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  img.draggable = false;
  img.addEventListener('error', () => { failed.add(name); if (fallback && img.isConnected) img.replaceWith(fallback()); }, { once: true });
  return img;
}

const MOOD_PICTURE = { fed: 'happy', waiting: 'waiting', rest: 'rest' };
const PET_POSES = ['wave', 'read', 'star'];

/** The nest the bird can sit in: on a `…-nest` picture it is the picture itself. */
const NESTED = 'twigs';
const inPicture = (name, item) => item === NESTED && name.endsWith('-nest');

/**
 * The picture of the Firebird for a stage, a mood and an optional pose (young and grown birds wave, read and hold a
 * star). A pose that covers a slot where something is worn (the star above the head, the book on the chest) gives way
 * to the mood picture: what the player chose to wear is never hidden.
 * 26.10: with the nest of twigs worn, the bird is a picture of its own sitting in the nest (`…-nest`, generated whole —
 * one light, one scale); the nest is not laid under the bird. Where that picture is missing, the nest is laid as before.
 */
export function petPictureName(stage, mood, pose = null, items = {}) {
  const nested = name => (items.nest === NESTED && Object.hasOwn(ART, `${name}-nest`) ? `${name}-nest` : name);
  const base = nested(`pet-${stage}-${MOOD_PICTURE[mood] ?? 'waiting'}`);
  if (!pose || !PET_POSES.includes(pose)) return base;
  const posed = nested(`pet-${stage}-${pose}`);
  if (!Object.hasOwn(ART, posed)) return base;
  const layout = PET_LAYOUT[posed] ?? {};
  return Object.values(items).every(item => !item || Object.hasOwn(layout, item) || inPicture(posed, item)) ? posed : base;
}

/** Boxes of what the bird wears on this picture: [{ item, box: [cx %, cy %, w %, rot°], behind }], in drawing order. */
export function petThings(name, items = {}) {
  const layout = PET_LAYOUT[name] ?? {};
  return Object.values(items).filter(item => item && Object.hasOwn(layout, item) && !inPicture(name, item))
    .map(item => ({ item, box: layout[item], behind: item === NESTED }));
}

/**
 * The Firebird as layers: the nest behind, the bird with what it wears (one group — it moves as one, the same class
 * `fb-bird` the drawing animates), the things of the nest in front. Null when the picture is not in the catalogue.
 */
export function petPicture(stage, mood, size, { items = {}, pose = null, cls = '', fallback = null } = {}) {
  const name = petPictureName(stage, mood, pose, items);
  if (!hasArt(name)) return null;
  const box = document.createElement('span');
  box.className = `art pet-pic ${cls}`.trim();
  box.setAttribute('aria-hidden', 'true');
  box.style.setProperty('--size', `${size}px`);
  // The layers are not `.art`: the size rules of a context (`.pet-card .pet-art .art`) size the whole bird, not its parts.
  const thing = ({ item, box: [cx, cy, w, rot] }) => {
    const el = picture(`gift-${item}`, Math.max(8, Math.round(size * w / 100)), 'pet-thing');
    if (!el) return null;
    el.classList.remove('art');
    el.style.left = `${cx}%`; el.style.top = `${cy}%`; el.style.width = `${w}%`;
    if (rot) el.style.setProperty('--rot', `${rot}deg`);
    return el;
  };
  const things = petThings(name, items);
  const bird = document.createElement('span');
  bird.className = 'fb-bird';
  const body = picture(name, size, 'pet-body');
  body.classList.remove('art');
  bird.append(body, ...things.filter(t => !t.behind && !t.item.match(/^(apples|lantern|book)$/)).map(thing).filter(Boolean));
  box.append(...things.filter(t => t.behind).map(thing).filter(Boolean), bird,
    ...things.filter(t => /^(apples|lantern|book)$/.test(t.item)).map(thing).filter(Boolean));
  body.addEventListener('error', () => { if (fallback && box.isConnected) box.replaceWith(fallback()); }, { once: true });
  return box;
}

/** Pictures that games draw on the canvas: the Workshop objects, the gesture hands of «Сейф», the bionic hands, the generated rooms and the basket, the tutorial lock. */
export const CANVAS_PICTURES = Object.freeze(Object.keys(ART).filter(n => /^(obj|gesture|hand|bg-(duo|grip|flight|rhythm|safe)|prop)-/.test(n)).concat('ico-lock'));

/** Loads the canvas pictures once, in the background, into render/sprites.js (a game draws its drawing until then). */
export function loadSprites(names = CANVAS_PICTURES) {
  if (typeof Image === 'undefined') return;
  for (const name of names) {
    if (!hasArt(name)) continue;
    const img = new Image();
    img.decoding = 'async';
    // 5.32: given to the games once decoded (HTMLImageElement.decode) — the first frame that draws a big picture (a
    // room, a hand) does not stall on decoding it, which a weak phone shows as a jerk. Not an ImageBitmap: those stay
    // decoded in memory for good (≈ 4 MB a room), an <img> the browser may drop and decode again under memory pressure.
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => setSprite(name, img));
    img.onerror = () => failed.add(name);
    img.src = artUrl(name);
  }
}

/** The picture of the Firebird that flies in «Полёт»: from the fledgling on, wings up; null — the glider flies. */
export const petFlyer = stageId => (['egg', 'chick'].includes(stageId) ? null : `pet-${stageId}-happy`);

/** What the flying bird can wear: on its head and chest — the things of the nest stay in the nest. */
const WORN_IN_FLIGHT = item => item && !/^(twigs|apples|lantern|book)$/.test(item);

/**
 * 26.10: the Firebird of «Полёт» wears what it wears in the nest. The happy picture with its head and chest things laid
 * at the boxes of art-manifest.js (as petPicture lays them), drawn once into a canvas — the game draws one sprite.
 * Until the pictures load, or if a thing fails to, the bird flies as it is; the egg and the chick leave it to the glider.
 */
let flierTicket = 0;

export function useFlier(alias, stageId, items = {}) {
  const ticket = ++flierTicket;
  const name = petFlyer(stageId);
  if (!name || !hasArt(name) || typeof Image === 'undefined') { setSprite(alias, null); return; }
  const layout = PET_LAYOUT[name] ?? {};
  const worn = Object.values(items).filter(item => WORN_IN_FLIGHT(item) && Object.hasOwn(layout, item) && hasArt(`gift-${item}`));
  const load = n => new Promise((ok, no) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => { failed.add(n); no(new Error(n)); };
    img.src = artUrl(n);
  });
  const current = () => ticket === flierTicket;
  setSprite(alias, null); // until it has loaded, the game draws its own
  load(name).then(body => {
    if (!current()) return;
    if (!worn.length || typeof document === 'undefined') { setSprite(alias, body); return; }
    Promise.allSettled(worn.map(item => load(`gift-${item}`))).then(results => {
      if (!current()) return;
      const W = body.naturalWidth, H = body.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const g = canvas.getContext('2d');
      if (!g) { setSprite(alias, body); return; }
      g.drawImage(body, 0, 0);
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const [cx, cy, w, rot] = layout[worn[i]], side = w / 100 * W;
        g.save(); g.translate(cx / 100 * W, cy / 100 * H); g.rotate((rot || 0) * Math.PI / 180);
        g.drawImage(r.value, -side / 2, -side / 2, side, side);
        g.restore();
      });
      setSprite(alias, canvas);
    });
  }, () => { if (current()) setSprite(alias, null); });
}

/** CSS `url()` of a picture for a background (the nest room, the home header), or null. */
export const artBackground = name => (hasArt(name) ? `url("${artUrl(name)}")` : null);
