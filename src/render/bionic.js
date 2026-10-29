// The bionic hand of the games from generated pictures (5.32, docs/GAME_VISUALS.md §7–8): three poses of one design —
// open palm, rest, fist — standing on its socket («Две руки», «Первые шаги») or hanging from an arm («Мастерская»).
// The pose of the hand model picks the two nearest pictures. Until the pictures load, a game draws its drawn hand.
// Also the generated room of the hands: a studio with a glossy table, by day and by night.
import { BRAND, glow, mix } from './fx.js';
import { SKIN_COLORS } from './draw.js';
import { sprite, drawSprite, drawTinted, spriteAspect, spriteMeta } from './sprites.js';

/**
 * The pictures of each kind and what tools/import-generated.py measured on them, in fractions of the picture: the palm light
 * of each pose, the wrist band, the fingertip line of each pose and (hanging) the arm across the top edge.
 */
export const BIONIC = Object.freeze({
  stand: {
    pics: { open: 'hand-open', rest: 'hand-rest', close: 'hand-close' },
    light: { open: [0.538, 0.611], rest: [0.488, 0.594], close: [0.526, 0.602], pinch: [0.46, 0.619], point: [0.478, 0.6],
      key: [0.513, 0.61], thumb: [0.526, 0.639], indication: [0.527, 0.644], thumbflex: [0.524, 0.651] },
    band: 0.724,
    // 26.10: the grips whose fingers disagree, from the sheets of the gesture pictures laid onto these (the same band
    // row and socket end — tools/import-generated.py --stand-grips)
    grips: { pinch: 'hand-pinch', point: 'hand-point', key: 'hand-key', thumb: 'hand-thumb', indication: 'hand-indication', thumbflex: 'hand-thumbflex' },
  },
  hang: {
    pics: { open: 'hand-down-open', rest: 'hand-down-rest', close: 'hand-down-close' },
    light: { open: [0.451, 0.485], rest: [0.453, 0.491], close: [0.472, 0.496], pinch: [0.431, 0.461], key: [0.447, 0.499], point: [0.435, 0.443] },
    band: 0.402,
    // the line that closes on a thing: the fingertips of a fist; for a pinch and a key — where they hold it (`grasp`)
    // put on the same line, so the Workshop lays every grip on its object one way (26.10)
    tip: { open: 0.993, rest: 0.955, close: 0.824, pinch: 0.869, key: 0.809, point: 0.984 },
    // where a grip holds a thing, in fractions of the picture: the pinch between the tips of the thumb and the index,
    // the key between the thumb's pad and the side of the index (read from 2× crops with a 0.1 grid)
    grasp: { pinch: [0.70, 0.80], key: [0.60, 0.74] },
    // 26.10: the grips whose fingers disagree (a pinch, a key), the same hand from another sheet scaled onto these
    // pictures (tools/import-generated.py --hang-grips); a grip closes from the open hand straight into its picture
    grips: { pinch: 'hand-down-pinch', key: 'hand-down-key', point: 'hand-down-point' },
  },
});

/** How closed a pose is: the four fingers (the thumb moves differently in each grip); 0 — open, 1 — fist. */
export const closure = pose => Math.min(1, Math.max(0, (pose[1] + pose[2] + pose[3] + pose[4]) / 4));

/** How far the joints disagree. A fist, a palm and rest stay under this; a pinch, a point, a key or a thumb do not. */
export const PICTURE_SPAN = 0.22;
export function poseSpan(pose) {
  let lo = pose[0], hi = pose[0];
  for (let i = 1; i < pose.length; i++) { if (pose[i] < lo) lo = pose[i]; if (pose[i] > hi) hi = pose[i]; }
  return hi - lo;
}
// The rest pose of the hand model (COMMAND_POSE.rest in core/vocabulary.js; render does not import core — a test keeps
// the two equal).
export const REST_CLOSURE = 0.275;

/** The two pictures a pose of the hand lies between and how far along: open → rest → fist. */
export function handBlend(pose) {
  const c = closure(pose);
  return c <= REST_CLOSURE ? ['open', 'rest', c / REST_CLOSURE] : ['rest', 'close', (c - REST_CLOSURE) / (1 - REST_CLOSURE)];
}

/**
 * The cross-fade weight of the second picture: a pose nearly there shows one picture, not a ghost of the other. 29.10:
 * the fade is the middle fifth of the way — a hand held half-closed (the proportional scheme holds any force) showed
 * two sets of fingers at once for as long as it was held; now it shows the nearer picture.
 */
const settle = t => { const u = Math.min(1, Math.max(0, (t - 0.4) / 0.2)); return u * u * (3 - 2 * u); };

/** Height ÷ width of the pictures of a kind, or null until they load. */
export const bionicAspect = (kind = 'stand') => spriteAspect(BIONIC[kind].pics.rest);

/**
 * The shell colour for a skin of the prosthesis: a pastel of it, as on the skin pictures of the nest. «Графит», the
 * first skin, is a light silver close to the glossy white of the pictures (a grey shell read dull on a bright scene);
 * its graphite is the joints and the fingertips.
 */
export const skinTint = skin => mix(SKIN_COLORS[skin]?.light ?? SKIN_COLORS.graphite.light, '#ffffff', !skin || skin === 'graphite' ? 0.78 : 0.5);

/** The picture of a grip and how far the hand is closed into it, when there is one (else null). */
function gripBlend(kind, grip, amount) {
  const name = grip && BIONIC[kind].grips?.[grip];
  return name && sprite(name) && Number.isFinite(amount) ? ['open', grip, Math.min(1, Math.max(0, amount))] : null;
}

/**
 * How far to move a hanging hand sideways so that its grip closes on the thing under its centre, in fractions of the
 * picture's width (toward the thumb; 0 for a fist, the open hand or a grip without a picture). Grows as it closes.
 */
export function bionicGraspShift({ grip = null, amount = null } = {}) {
  const held = gripBlend('hang', grip, amount), at = held && BIONIC.hang.grasp[grip];
  return at ? (at[0] - 0.5) * settle(held[2]) : 0;
}

/** Whether drawBionic can show this pose: its grip picture is loaded, or the fingers agree enough for open/rest/fist. */
export function bionicHolds(kind, pose, grip, amount) {
  return !!gripBlend(kind, grip, amount) || (!!pose && poseSpan(pose) <= PICTURE_SPAN);
}

/** Where the fingertips of a hanging hand are in this pose (or closing into `grip`), in fractions of the picture. */
export function bionicTip(pose, { grip = null, amount = null } = {}) {
  const [a, b, t] = gripBlend('hang', grip, amount) ?? handBlend(pose), k = settle(t), tip = BIONIC.hang.tip;
  return (tip[a] ?? tip.close) + ((tip[b] ?? tip.close) - (tip[a] ?? tip.close)) * k;
}

/**
 * Draws the hand `ht` tall. `kind` 'stand' — (x, y) is the bottom of the socket; 'hang' — (x, y) is the top of the
 * picture, and the arm goes on up to `armTo`. The shell is tinted, the arm and the socket stay white. `lit` lights the
 * palm; `reflect` — the mirror image on a glossy table down to `reflectTo`. False until the pictures load.
 */
export function drawBionic(ctx, x, y, ht, pose, { kind = 'stand', mirror = false, tint = null, lit = 0, reflect = 0, reflectTo = Infinity, armTo = null, grip = null, amount = null } = {}) {
  // Three pictures cannot show a grip whose fingers disagree: a grip with its own picture closes into it (`grip`,
  // `amount` — the hand's closure); else the caller draws the hand model, which can.
  const held = gripBlend(kind, grip, amount);
  if (!pose || (!held && poseSpan(pose) > PICTURE_SPAN)) return false;
  const spec = BIONIC[kind], aspect = bionicAspect(kind);
  if (!aspect) return false;
  const pics = held ? { ...spec.pics, [grip]: spec.grips[grip] } : spec.pics;
  const wd = ht / aspect, sx = mirror ? -1 : 1, hang = kind === 'hang';
  const [a, b, t] = held ?? handBlend(pose), k = settle(t);
  const band = hang ? [spec.band, 1] : [0, spec.band];
  const pair = (cy, sy, alpha) => {
    const one = (pose, al) => al > 0.01 && drawTinted(ctx, pics[pose], x, cy, wd, { sx, sy, alpha: al * alpha, tint, band: sy > 0 ? band : [0, 1] });
    if (k < 0.5) { one(a, 1); one(b, k * 2); } else { one(a, (1 - k) * 2); one(b, 1); }
  };
  const top = hang ? y : y - ht;
  if (hang && armTo !== null && armTo < top) drawArm(ctx, x, top, ht, armTo, sx);
  if (reflect > 0 && !hang) {
    // the mirror image fades out in bands down the table top
    const depth = Math.min(ht * 0.4, reflectTo - y), bands = 5;
    for (let i = 0; i < bands; i++) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - wd, y + depth * i / bands, wd * 2, depth / bands + 0.5); ctx.clip?.();
      pair(y + ht / 2, -1, reflect * (1 - i / bands));
      ctx.restore();
    }
  }
  pair(top + ht / 2, 1, 1);
  if (lit > 0.05) {
    const [fx, fy] = spec.light[k < 0.5 ? a : b] ?? spec.light.close;
    glow(ctx, x + sx * (fx - 0.5) * wd, top + fy * ht, wd * 0.42 * Math.min(1, lit + 0.2), BRAND.mint, Math.min(1, lit));
  }
  return true;
}

/** The arm above a hanging picture, up to `armTo`: the top rows of the rest picture stretched (the same in every pose). */
function drawArm(ctx, x, top, ht, armTo, sx) {
  const img = sprite(BIONIC.hang.pics.rest), aspect = bionicAspect('hang');
  if (!img || !aspect) return;
  const wd = ht / aspect, iw = img.naturalWidth ?? img.width;
  ctx.save(); ctx.translate(x, 0); ctx.scale(sx, 1);
  ctx.drawImage(img, 0, 2, iw, 3, -wd / 2, armTo, wd, top - armTo + 1);
  ctx.restore();
}

/**
 * 29.10 — the hanging hand holding a thing, generated whole (`hold-<thing>`, docs/GAME_VISUALS.md §12): its fingers
 * wrap the thing, which a hand and a thing laid as two pictures did not (the thing hung under the fingertips). What
 * tools/regen.py measured (`spriteMeta`): [x, y] — the thing's centre from the arm's axis and the picture's top,
 * [w, h] — the picture, in heights `ht` of the hanging pictures, whose arm it shares; the wrist band, of its height. The shell below the wrist
 * band takes the tint of the skin; the thing, cut out of the same picture (`hold-<thing>-obj`), is laid back untinted —
 * a coral hand, not a coral egg. Draws with the thing's centre at (x, y); false until the picture loads.
 */
export function drawHeld(ctx, name, x, y, ht, { mirror = false, tint = null, armTo = null } = {}) {
  const meta = spriteMeta(name);
  if (!meta || !sprite(name)) return false;
  const [ox, oy, pw, ph, band = BIONIC.hang.band / ph] = meta, sx = mirror ? -1 : 1;
  const axis = x - sx * ox * ht, top = y - oy * ht, cy = top + ph * ht / 2;
  if (armTo !== null && armTo < top) drawArm(ctx, axis, top, ht, armTo, sx);
  drawTinted(ctx, name, axis, cy, pw * ht, { sx, tint, band: [Math.min(1, band), 1] });
  if (tint) drawSprite(ctx, `${name}-obj`, axis, cy, pw * ht, { sx });
  return true;
}

// The generated rooms by day and by night (measured by tools/import-generated.py, fractions of the picture's height):
// «Две руки» — the back edge of the table top and its front light strip; «Мастерская» — the light strip of the bench.
const ROOM = { light: ['bg-duo-day', 0.646, 0.778], dark: ['bg-duo-night', 0.624, 0.784] };
const WORKSHOP = { light: ['bg-grip-day', 0.708], dark: ['bg-grip-night', 0.693] };

/**
 * Lays a scene picture over a field so that its line `frac` (of its height) falls on `lineY`, covering the field
 * whatever its shape. Null until the picture loads.
 */
export function placeScene(name, frac, w, h, lineY) {
  const img = sprite(name);
  if (!img) return null;
  const iw = img.naturalWidth ?? img.width, ih = img.naturalHeight ?? img.height;
  const k = Math.max(w / iw, lineY / (frac * ih), (h - lineY) / ((1 - frac) * ih));
  return { img, x: (w - iw * k) / 2, y: lineY - frac * ih * k, w: iw * k, h: ih * k, k, ih };
}

/** The room of «Две руки» on a field: the back edge of the table on `tableY`; `strip` — y of the front light strip. */
export function roomPlace(w, h, tableY, dark) {
  const [name, back, front] = ROOM[dark ? 'dark' : 'light'];
  const at = placeScene(name, back, w, h, tableY);
  return at && { ...at, strip: tableY + (front - back) * at.ih * at.k };
}

/** The workshop of «Мастерская» on a field: the light strip of the bench on `stripY`. */
export function workshopPlace(w, h, stripY, dark) {
  const [name, frac] = WORKSHOP[dark ? 'dark' : 'light'];
  return placeScene(name, frac, w, h, stripY);
}

/**
 * A generated scene covering the whole field (the sky of «Полёт», the stage of «Ритм», the vault of «Сейф»): `anchor`
 * — which part of the picture stays in view when the field is narrower or shorter (0 — the top, 0.5 — the middle,
 * 1 — the bottom). Null until the picture loads; the game then paints its drawn scene.
 */
export function coverScene(name, w, h, anchor = 0.5) {
  const img = sprite(name);
  if (!img) return null;
  const iw = img.naturalWidth ?? img.width, ih = img.naturalHeight ?? img.height;
  const k = Math.max(w / iw, h / ih);
  return { img, x: (w - iw * k) / 2, y: (h - ih * k) * anchor, w: iw * k, h: ih * k };
}
