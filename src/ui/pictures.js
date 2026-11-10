// Raster pictures (5.16): the team's illustrations — public/art/, made from the graphics package by
// tools/import-art.py (docs/DESIGN.md §6) — with the SVG drawings of art.js as the fallback: a picture that is not in
// the catalogue or fails to load is drawn in code, so a screen never shows a broken image. Decorative like the
// drawings (aria-hidden): the text next to a picture carries the meaning.
import { ART, PET_LAYOUT, HOLD_LAYOUT } from './art-manifest.js';
import { setSprite, setSpriteMeta } from '../render/sprites.js';

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
/** Things that stand beside the bird, in front of it — not on it. */
const BESIDE = /^(apples|lantern|book)$/;
/** Whether a picture is a bird sitting in its nest (`…-nest`, or in a look `…-nest-<look>`). */
const inNest = name => /-nest(-|$)/.test(name);
/** 29.10: the bird in its look generated whole (`<picture>-<look>`, docs/GAME_VISUALS.md §12), when it exists. */
const dressedName = (name, look) => (name && look && Object.hasOwn(ART, `${name}-${look}`) ? `${name}-${look}` : null);
/**
 * 29.10: a sleeping bird has taken its look off — asleep it is the picture of its mood with nothing on or beside it.
 * A thing laid over a curled-up bird read worst of all, and a whole picture of each look asleep would add a third to
 * the set (docs/ART.md, «Бюджет»).
 */
const asleep = name => /^pet-[a-z]+-rest(-|$)/.test(name);

/**
 * The picture of the Firebird for a stage, a mood and an optional pose (young and grown birds wave, read and hold a
 * star). `items` — `{ nest, look }` (core/pet.js). With the nest of twigs worn, the bird is a picture of its own sitting
 * in the nest (`…-nest`, 26.10 — generated whole, one light, one scale). 29.10: in a look, the bird is the whole picture
 * of that look (`…-<look>`) — of the pose if there is one, else of the mood. Where it is not generated yet, the look is
 * laid over (petThings), and a pose that covers its place (the star above the head, the book on the chest) gives way to
 * the mood picture, so a pose does not hide what the player chose to wear.
 */
export function petPictureName(stage, mood, pose = null, items = {}) {
  const named = m => (items.nest === NESTED && Object.hasOwn(ART, `pet-${stage}-${m}-nest`) ? `pet-${stage}-${m}-nest` : `pet-${stage}-${m}`);
  const base = named(MOOD_PICTURE[mood] ?? 'waiting');
  const look = asleep(base) ? null : items.look ?? null;
  const posed = pose && PET_POSES.includes(pose) && Object.hasOwn(ART, named(pose)) ? named(pose) : null;
  const whole = dressedName(posed, look) ?? dressedName(base, look);
  if (whole) return whole;
  if (!posed) return base;
  return !look || Object.hasOwn(PET_LAYOUT[posed] ?? {}, look) ? posed : base;
}

/**
 * What is laid over the picture, [{ item, box: [cx %, cy %, w %, rot°], behind }]: the look where its whole picture is
 * missing (not on a sleeping bird), the nest of twigs under a bird that has no picture in it. Nothing on a whole picture.
 */
export function petThings(name, items = {}) {
  const layout = PET_LAYOUT[name] ?? {};
  const out = [];
  const look = asleep(name) ? null : items.look;
  if (look && !name.endsWith(`-${look}`) && Object.hasOwn(layout, look)) out.push({ item: look, box: layout[look], behind: false });
  if (items.nest === NESTED && !inNest(name) && Object.hasOwn(layout, NESTED)) out.push({ item: NESTED, box: layout[NESTED], behind: true });
  return out;
}

/**
 * The Firebird as layers: the nest behind, the bird with what it wears (one group — it moves as one, the same class
 * `fb-bird` the drawing animates), the things of the nest in front. Null when the picture is not in the catalogue.
 */
export function petPicture(stage, mood, size, { items = {}, pose = null, cls = '', fallback = null } = {}) {
  const name = petPictureName(stage, mood, pose, items);
  if (!hasArt(name)) return null;
  const box = document.createElement('span');
  // 26.10: a bird in its nest is one picture — `nested` makes its motions stay on the ground (styles/app.css)
  box.className = `art pet-pic ${cls}${inNest(name) ? ' nested' : ''}`.trim();
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
  bird.append(body, ...things.filter(t => !t.behind && !BESIDE.test(t.item)).map(thing).filter(Boolean));
  box.append(...things.filter(t => t.behind).map(thing).filter(Boolean), bird,
    ...things.filter(t => BESIDE.test(t.item)).map(thing).filter(Boolean));
  body.addEventListener('error', () => { if (fallback && box.isConnected) box.replaceWith(fallback()); }, { once: true });
  return box;
}

/**
 * Pictures that games draw on the canvas: the Workshop objects and the hand holding each (29.10), the gesture hands of
 * «Сейф», the bionic hands, the generated rooms and the basket, the tutorial lock.
 */
export const CANVAS_PICTURES = Object.freeze(Object.keys(ART).filter(n => /^(obj|gesture|hand|hold|bg-(duo|grip|flight|rhythm|safe)|prop)-/.test(n)).concat('ico-lock'));

/** The rooms of one game. «Первые шаги» uses the studio of «Две руки». Empty until those files exist. */
export function roomPictures(game) {
  const prefix = { duo: 'bg-duo-', grip: 'bg-grip-', flight: 'bg-flight-', rhythm: 'bg-rhythm-', safe: 'bg-safe-', tutorial: 'bg-duo-' }[game];
  return prefix ? CANVAS_PICTURES.filter(n => n.startsWith(prefix)) : [];
}

const spriteLoads = new Set();

/**
 * Loads canvas pictures once, in the background, into render/sprites.js (a game draws its drawing until then).
 * Rooms stay out of the default set: a room is about 4 MB decoded, and the home screen never paints one.
 * A game and the tutorial ask for their own (`roomPictures`) when they open.
 */
export function loadSprites(names = CANVAS_PICTURES.filter(n => !n.startsWith('bg-'))) {
  if (typeof Image === 'undefined') return;
  for (const name of names) {
    if (!hasArt(name) || spriteLoads.has(name)) continue;
    spriteLoads.add(name);
    const img = new Image();
    img.decoding = 'async';
    // 5.32: given to the games once decoded (HTMLImageElement.decode) — the first frame that draws a big picture (a
    // room, a hand) does not stall on decoding it, which a weak phone shows as a jerk. Not an ImageBitmap: those stay
    // decoded in memory for good (≈ 4 MB a room), an <img> the browser may drop and decode again under memory pressure.
    if (Object.hasOwn(HOLD_LAYOUT, name)) setSpriteMeta(name, HOLD_LAYOUT[name]);
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => setSprite(name, img));
    img.onerror = () => { spriteLoads.delete(name); failed.add(name); };
    img.src = artUrl(name);
  }
}

/** The picture of the Firebird that flies in «Полёт»: from the fledgling on, wings up; null — the glider flies. */
export const petFlyer = stageId => (['egg', 'chick'].includes(stageId) ? null : `pet-${stageId}-happy`);

/** What the flying bird can wear: on its head and chest — the nest and the things beside it stay at home. */
const WORN_IN_FLIGHT = item => !!item && item !== NESTED && !BESIDE.test(item);

/**
 * 26.10: the Firebird of «Полёт» wears what it wears in the nest. 29.10: the happy picture of its look generated whole
 * (`pet-<stage>-happy-<look>`); until that exists, the thing laid at its box of art-manifest.js (as petPicture lays it),
 * drawn once into a canvas — the game draws one sprite. Until the pictures load, or if a thing fails to, the bird flies
 * as it is; the egg and the chick leave it to the glider.
 */
let flierTicket = 0;

export function useFlier(alias, stageId, items = {}) {
  const ticket = ++flierTicket;
  const name = petFlyer(stageId);
  if (!name || !hasArt(name) || typeof Image === 'undefined') { setSprite(alias, null); return; }
  const look = WORN_IN_FLIGHT(items.look) ? items.look : null;
  const whole = dressedName(name, look);
  const layout = PET_LAYOUT[name] ?? {};
  const worn = !whole && look && Object.hasOwn(layout, look) && hasArt(`gift-${look}`) ? [look] : [];
  const load = n => new Promise((ok, no) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => { failed.add(n); no(new Error(n)); };
    img.src = artUrl(n);
  });
  const current = () => ticket === flierTicket;
  setSprite(alias, null); // until it has loaded, the game draws its own
  (whole && hasArt(whole) ? load(whole).catch(() => load(name)) : load(name)).then(body => {
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
/**
 * A picture for a CSS background, as an absolute address (audit 06.11.2026, F7). It travels in a custom property
 * (`--room`) and is used in styles/app.css, so a relative `public/art/…` was read against the stylesheet: the source
 * build asked for styles/public/art/bg-nest-room.webp and the nest had no room. The built page hid it (app.css sits
 * beside index.html). A data URI of the one-file build stays as it is.
 */
export const artBackground = name => {
  if (!hasArt(name)) return null;
  const url = artUrl(name);
  let href = url;
  try { href = new URL(url, globalThis.document?.baseURI).href; } catch { /* no document: the address as it is */ }
  return `url("${href}")`;
};
