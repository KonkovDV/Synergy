// Illustrations (5.12): the coach Мио, game and reward pictures, stars, light trails and the cover scene.
// Style — soft 3D («clay / glossy», like the 3D pictures of the team's sample ФинФениксы) in the corporate palette of
// «Моторика»: green → teal → blue → violet, graphite prostheses with a green glow. Every volume is lit from the top
// left: a body gradient, a darker underside, a specular gloss, a rim light and a soft contact shadow.
// Drawn in SVG from code, no emoji (they differ on every platform and are missing in some WebView fonts); a picture
// costs a few hundred bytes and follows the theme. Every picture is decorative (aria-hidden): the text next to it
// carries the meaning.
// 5.16: the team's illustrations come first (ui/pictures.js, public/art/); these drawings are the fallback for a
// picture that is missing or fails to load, and the pieces the pictures do not cover (light trails).
import { picture, petPicture } from './pictures.js';
import { outfitPlaces } from '../core/pet.js';

const NS = 'http://www.w3.org/2000/svg';
let seq = 0;

/** SVG element: s('circle', { cx: 4, cy: 4, r: 2 }). */
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c) el.append(c); // nested parts of a picture (5.13: one level dropped the apples)
  return el;
}

function root(viewBox, size, cls, height = size) {
  return s('svg', { viewBox, width: size, height, class: `art ${cls}`, 'aria-hidden': 'true', focusable: 'false' });
}

const stop = ([o, c, a = 1]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a });
/** Linear gradient top-left → bottom-right by default; stops: [[offset, colour, opacity?], …]. */
const lin = (id, stops, [x1, y1, x2, y2] = [0, 0, 1, 1]) => s('linearGradient', { id, x1, y1, x2, y2 }, stops.map(stop));
const rad = (id, stops, cx = 0.35, cy = 0.3, r = 0.75) => s('radialGradient', { id, cx, cy, r }, stops.map(stop));
const path = (d, attrs = {}) => s('path', { d, ...attrs });
// Straight strokes take a solid colour: a gradient on a zero-width box is not drawn at all.
const line = (d, stroke, width, attrs = {}) => path(d, { fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs });
const circle = (cx, cy, r, fill, attrs = {}) => s('circle', { cx, cy, r, fill, ...attrs });
const ellipse = (cx, cy, rx, ry, fill, attrs = {}) => s('ellipse', { cx, cy, rx, ry, fill, ...attrs });
const rect = (x, y, width, height, rx, fill, attrs = {}) => s('rect', { x, y, width, height, rx, fill, ...attrs });

/** Shared lighting of one picture: soft blur, glow, specular gloss and the darker underside. */
function light(id, blur = 2.2) {
  return s('defs', {},
    s('filter', { id: `${id}-soft`, x: '-60%', y: '-60%', width: '220%', height: '220%' }, s('feGaussianBlur', { stdDeviation: blur })),
    s('filter', { id: `${id}-glow`, x: '-80%', y: '-80%', width: '260%', height: '260%' }, s('feGaussianBlur', { stdDeviation: blur * 0.8 })),
    rad(`${id}-gloss`, [[0, '#ffffff', 0.95], [0.55, '#ffffff', 0.35], [1, '#ffffff', 0]], 0.5, 0.5, 0.5),
    lin(`${id}-under`, [[0, '#05101a', 0], [0.55, '#05101a', 0], [1, '#05101a', 0.28]], [0, 0, 0, 1]));
}
const contact = (id, cx, cy, rx, ry = rx * 0.22, opacity = 0.24) => ellipse(cx, cy, rx, ry, '#05101a', { opacity, filter: `url(#${id}-soft)` });
const gloss = (id, cx, cy, rx, ry, rot = -28) => ellipse(cx, cy, rx, ry, `url(#${id}-gloss)`, { transform: `rotate(${rot} ${cx} ${cy})` });
const glow = (id, cx, cy, r, color, opacity = 0.7) => circle(cx, cy, r, color, { opacity, filter: `url(#${id}-glow)` });
/** A glossy sphere: body gradient, underside, specular spot. */
function sphere(id, key, cx, cy, r, [hi, mid, lo]) {
  return [rad(`${id}-${key}`, [[0, hi], [0.5, mid], [1, lo]], 0.34, 0.28, 0.85),
    circle(cx, cy, r, `url(#${id}-${key})`), circle(cx, cy, r, `url(#${id}-under)`), gloss(id, cx - r * 0.32, cy - r * 0.38, r * 0.45, r * 0.26)];
}

const MIO_EYE = '#7dffc4';
/**
 * «Мио» — the coach: a glossy sphere in the brand gradient with the two sensor bulbs of the game on its antenna
 * (A coral, B blue) and the same A/B lights on its belt. Moods: hello, support, joy, focus, rest.
 */
export function mio(mood = 'support', size = 64) {
  return picture(`mio-${mood}`, size, `mio mio-${mood}`, () => mioDrawing(mood, size));
}

function mioDrawing(mood, size) {
  const id = `mio${++seq}`;
  const svg = root('0 0 120 120', size, `mio mio-${mood}`);
  const eye = mood === 'rest' ? '#9fd8ff' : MIO_EYE;
  const arms = {
    joy: ['M25 74 Q13 64 11 50', 'M95 74 Q107 64 109 50'],
    hello: ['M25 78 Q15 86 14 96', 'M95 74 Q107 64 109 50'],
  }[mood] ?? ['M25 78 Q15 86 14 96', 'M95 78 Q105 86 106 96'];
  const hands = arms.map(d => d.split(' ').slice(-2).map(Number));
  const eyes = {
    joy: [line('M42 66 Q48 56 54 66', eye, 4.2), line('M66 66 Q72 56 78 66', eye, 4.2)],
    rest: [line('M42 63 Q48 69 54 63', eye, 3.6), line('M66 63 Q72 69 78 63', eye, 3.6)],
    focus: [circle(48, 64, 5, eye), circle(72, 64, 5, eye), line('M42 56 Q48 52 54 55', eye, 3), line('M66 55 Q72 52 78 56', eye, 3)], // attentive, not angry
  }[mood] ?? [circle(48, 63, 5.6, eye), circle(72, 63, 5.6, eye)];
  const sparkle = mood === 'joy' || mood === 'rest' ? [] : [circle(46.2, 61.2, 1.8, '#fff'), circle(70.2, 61.2, 1.8, '#fff')];
  const mouth = {
    joy: [path('M49 71 Q60 85 71 71 Z', { fill: eye }), path('M55 77 Q60 81 65 77 Q60 75 55 77 Z', { fill: '#ff8fa3' })],
    rest: [line('M56 75 Q60 77 64 75', eye, 3), line('M89 27 h8 l-8 9 h8', '#25c2c4', 2.6), line('M101 13 h6 l-6 7 h6', '#7fd8e8', 2.2)],
    focus: [line('M54 75 H66', eye, 3.2)],
    hello: [path('M51 71 Q60 81 69 71 Z', { fill: eye })],
  }[mood] ?? [line('M53 72 Q60 78 67 72', eye, 3.2)];
  svg.append(...[
    light(id, 2.4),
    s('defs', {},
      rad(`${id}b`, [[0, '#dcfff0'], [0.2, '#5ff3b9'], [0.5, '#1fd0a6'], [0.8, '#2196d6'], [1, '#1d4fbf']], 0.32, 0.22, 0.95),
      lin(`${id}v`, [[0, '#1b3249'], [1, '#05101a']], [0, 0, 0, 1]),
      rad(`${id}h`, [[0, '#b9fff2'], [0.55, '#25c2c4'], [1, '#147f8f']], 0.35, 0.3, 0.8)),
    contact(id, 60, 112, 30, 5.5, 0.3),
    line('M50 27 Q46 17 41 12', '#0b3b4a', 3.6), line('M70 27 Q74 17 79 12', '#0b3b4a', 3.6),
    glow(id, 40, 10, 8, '#ff7a45', 0.55), glow(id, 80, 10, 8, '#3b82f6', 0.55),
    sphere(id, 'ba', 40, 10, 7.5, ['#ffe2d4', '#ff7a45', '#c63f12']), sphere(id, 'bb', 80, 10, 7.5, ['#dbe9ff', '#3b82f6', '#1a46a8']),
    arms.map(d => [line(d, '#127f86', 10.5), line(d, '#37d3c4', 4.5, { opacity: 0.75 })]),
    hands.map(([x, y]) => [circle(x, y, 6.8, `url(#${id}h)`), circle(x - 2, y - 2.2, 1.8, '#fff', { opacity: 0.7 })]),
    rect(18, 22, 84, 87, 40, `url(#${id}b)`),
    rect(18, 22, 84, 87, 40, `url(#${id}-under)`),
    path('M99 66 Q101 98 70 107', { fill: 'none', stroke: '#c9ecff', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.6 }), // rim light
    gloss(id, 42, 37, 19, 10), circle(33, 36, 3.2, '#fff', { opacity: 0.9 }),
    rect(28, 44, 64, 40, 20, `url(#${id}v)`),
    ellipse(60, 79, 24, 5, MIO_EYE, { opacity: 0.16, filter: `url(#${id}-glow)` }),
    line('M36 54 Q45 47.5 58 47.5', '#fff', 3.4, { opacity: 0.22 }), circle(82, 52, 1.6, '#fff', { opacity: 0.35 }),
    ellipse(23.5, 77, 5, 3.2, '#ff8fa3', { opacity: 0.85, filter: `url(#${id}-glow)` }), ellipse(96.5, 77, 5, 3.2, '#ff8fa3', { opacity: 0.85, filter: `url(#${id}-glow)` }),
    s('g', { opacity: 0.75, filter: `url(#${id}-glow)` }, eyes.map(e => e.cloneNode(true))), eyes, sparkle, mouth,
    rect(45, 92, 30, 7, 3.5, '#0b2233'), glow(id, 52, 95.5, 3, '#ff7a45', 0.8), glow(id, 68, 95.5, 3, '#3b82f6', 0.8),
    circle(52, 95.5, 2.2, '#ffb08a'), circle(68, 95.5, 2.2, '#8ab8ff')].flat(3));
  return svg;
}

/** Game pictures (64 × 64): an object of the game in soft 3D. */
/** A five-point star path around (cx, cy) — the stars of «Созвездие». */
const starPath = (cx, cy, r) => `M${Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
  return `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
}).join(' L')} Z`;

const GAME_ART = {
  // 6.0 «Созвездие»: four golden stars joined by a light line, and the mint spark of the joystick on its way to the last.
  stars: id => {
    const pts = [[12, 46], [24, 30], [40, 36], [52, 16]];
    return [
      s('defs', {}, lin(`${id}g`, [[0, '#fff3c4'], [0.55, '#ffc93c'], [1, '#d98200']], [0, 0, 0, 1]), rad(`${id}m`, [[0, '#eafff5'], [0.5, '#16e182'], [1, '#0a7a47']], 0.36, 0.3, 0.85)),
      line(`M${pts.slice(0, 3).map(p => p.join(' ')).join(' L')}`, '#ffc93c', 2, { opacity: 0.75 }),
      line('M40 36 L52 16', '#ffc93c', 1.6, { opacity: 0.35, 'stroke-dasharray': '2 3' }),
      ...pts.flatMap(([x, y], i) => [glow(id, x, y, i === 3 ? 7 : 5.5, '#ffc93c', i === 3 ? 0.9 : 0.6),
        path(starPath(x, y, i === 3 ? 6.5 : 5), { fill: `url(#${id}g)`, stroke: '#c46a00', 'stroke-width': 0.8, 'stroke-linejoin': 'round' })]),
      line('M30 52 Q38 50 44 44', '#16e182', 2.4, { opacity: 0.55 }),
      glow(id, 46, 42, 6.5, '#16e182', 0.85), circle(46, 42, 4.2, `url(#${id}m)`), circle(44.8, 40.6, 1.2, '#ffffff'),
    ];
  },
  // 5.30 «Две руки»: two palms, the left in the colour of A, the right in the colour of B, and an arc between them.
  duo: () => [
    line('M14 22 Q32 8 50 22', '#a78bfa', 2.4, { opacity: 0.8 }),
    rect(7, 28, 20, 24, 7, '#ffb547'), rect(37, 28, 20, 24, 7, '#5ad1ff'),
    ...[10, 15, 20, 25].map(x => line(`M${x} 29 V${x === 10 ? 22 : 18}`, '#ffb547', 3.6)),
    ...[40, 45, 50, 55].map(x => line(`M${x} 29 V${x === 55 ? 22 : 18}`, '#5ad1ff', 3.6)),
    circle(17, 40, 3, '#ffffff'), circle(47, 40, 3, '#ffffff'),
  ],
  // «Мастерская»: a graphite bionic gripper holds an egg — force without crushing; the fingertips glow green.
  grip: id => [
    s('defs', {}, lin(`${id}f`, [[0, '#6f7f8c'], [0.5, '#2e3a45'], [1, '#05101a']]), rad(`${id}e`, [[0, '#ffffff'], [0.55, '#fff3df'], [1, '#e2c08f']], 0.36, 0.3, 0.8),
      lin(`${id}m`, [[0, '#4a5866'], [1, '#05101a']], [0, 0, 0, 1])),
    contact(id, 32, 57, 15, 3.4),
    ellipse(32, 39, 11.5, 14.5, `url(#${id}e)`), ellipse(32, 39, 11.5, 14.5, `url(#${id}-under)`), gloss(id, 27.5, 32, 3.6, 6.4, 20),
    rect(21, 3, 22, 10, 4.5, `url(#${id}m)`), line('M24 5.6 H40', '#8a9caa', 1.4, { opacity: 0.7 }),
    sphere(id, 'j', 32, 16, 5.5, ['#9aa8b5', '#3d4a57', '#0b151d']),
    line('M29 18 Q14 22 14.5 36 Q15 44 20.5 48', `url(#${id}f)`, 6.6), line('M35 18 Q50 22 49.5 36 Q49 44 43.5 48', `url(#${id}f)`, 6.6),
    line('M27 19.5 Q16.5 24 16.6 35', '#9aa8b5', 1.6, { opacity: 0.6 }), line('M37 19.5 Q47.5 24 47.4 35', '#9aa8b5', 1.2, { opacity: 0.35 }),
    glow(id, 20.5, 48, 4.4, '#16e182', 0.85), glow(id, 43.5, 48, 4.4, '#16e182', 0.85),
    circle(20.5, 48, 3.6, '#16e182'), circle(43.5, 48, 3.6, '#16e182'), circle(19.4, 46.8, 1.2, '#eafff5'), circle(42.4, 46.8, 1.2, '#eafff5'),
  ],
  // «Полёт»: a paper glider passes a coral ring above a cloud — keep the height with steady force.
  flight: id => [
    s('defs', {}, lin(`${id}r`, [[0, '#ffb08a'], [1, '#e2501f']]), lin(`${id}p`, [[0, '#ffffff'], [1, '#d6e6ff']]), lin(`${id}c`, [[0, '#ffffff'], [0.6, '#f4f9ff'], [1, '#c9e2ff']], [0, 0, 0, 1])),
    contact(id, 27, 59, 17, 2.6, 0.18),
    circle(17, 47, 7.5, `url(#${id}c)`), circle(26, 42, 9.5, `url(#${id}c)`), circle(36, 47, 7.5, `url(#${id}c)`), rect(10, 46, 33, 9, 4.5, `url(#${id}c)`),
    gloss(id, 23, 37.5, 4.5, 2.4, -10),
    ellipse(46, 27, 7.5, 15, 'none', { stroke: `url(#${id}r)`, 'stroke-width': 4.8 }),
    path('M5 31 L57 13 L31 40 Z', { fill: `url(#${id}p)`, stroke: '#2f6fe0', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    path('M31 40 L35 27 L57 13 Z', { fill: '#7fb0ff', stroke: '#2f6fe0', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }),
    path('M31 40 L33.5 32 L45 22 Z', { fill: '#2f6fe0', opacity: 0.25 }),
    path('M46 41.8 A7.5 15 0 0 0 53.5 27', { fill: 'none', stroke: `url(#${id}r)`, 'stroke-width': 4.8, 'stroke-linecap': 'round' }),
    path('M46.6 40 A6 13 0 0 0 52 30', { fill: 'none', stroke: '#ffd9c7', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.8 }),
    line('M4 42 h7', '#ffffff', 2.6), line('M3 48 h4', '#ffffff', 2.6),
  ],
  // «Ритм»: a violet drum with two sticks and two glossy notes in the channel colours.
  rhythm: id => [
    s('defs', {}, lin(`${id}d`, [[0, '#2e1f8f'], [0.3, '#8a6dff'], [0.62, '#6d4ef0'], [1, '#2e1f8f']], [0, 0, 1, 0]), rad(`${id}k`, [[0, '#ffffff'], [1, '#d9d2fb']], 0.4, 0.3, 0.9),
      lin(`${id}w`, [[0, '#e7a453'], [1, '#8a4f00']])),
    contact(id, 32, 57, 18, 3.6),
    line('M17 6 L31 26', '#8a4f00', 4), line('M17 6 L31 26', '#f0b46e', 1.6), sphere(id, 's1', 17, 6, 3.4, ['#fff2c4', '#ffd27a', '#c98a1c']),
    line('M49 5 L37 25', '#8a4f00', 4), line('M49 5 L37 25', '#f0b46e', 1.6), sphere(id, 's2', 49, 5, 3.4, ['#fff2c4', '#ffd27a', '#c98a1c']),
    path('M12 31 V48 Q32 58 52 48 V31 Z', { fill: `url(#${id}d)` }),
    line('M14 36 L20 49 L26 37 L32 51 L38 37 L44 49 L50 36', '#ffd27a', 2.2),
    ellipse(32, 31, 20, 7, `url(#${id}k)`, { stroke: '#f5a524', 'stroke-width': 2.6 }), ellipse(26, 29.5, 8, 2.2, '#fff', { opacity: 0.8 }),
    path('M12 48 Q32 58 52 48', { fill: 'none', stroke: '#f5a524', 'stroke-width': 2.6 }),
    sphere(id, 'n1', 7, 21, 3.8, ['#ffd9c7', '#ff7a45', '#c63f12']), line('M10.6 21 V10 L14 11.5', '#e2501f', 2.2),
    sphere(id, 'n2', 55, 17, 3.8, ['#dbe9ff', '#3b82f6', '#1a46a8']), line('M58.6 17 V6 L62 7.5', '#2f6fe0', 2.2),
  ],
  // «Сейф»: a teal vault with a dial — a code of exact gestures.
  safe: id => [
    s('defs', {}, lin(`${id}s`, [[0, '#5ff0d8'], [0.4, '#1fd0a6'], [1, '#0b5f58']]), rad(`${id}d`, [[0, '#ffffff'], [1, '#d0e2ee']], 0.4, 0.35, 0.8),
      lin(`${id}p`, [[0, '#19c9b8'], [1, '#0e8f84']], [0, 0, 0, 1]), lin(`${id}g`, [[0, '#fff0c2'], [1, '#d9922a']], [0, 0, 1, 0])),
    contact(id, 32, 59, 20, 3.6),
    rect(7, 9, 50, 46, 11, `url(#${id}s)`), rect(7, 9, 50, 46, 11, `url(#${id}-under)`),
    rect(12, 14, 40, 36, 7.5, `url(#${id}p)`, { stroke: '#0b5f58', 'stroke-width': 1.6 }),
    gloss(id, 19, 16, 9, 3, -8),
    contact(id, 30, 34.5, 11, 4, 0.3),
    circle(29, 32, 11.5, `url(#${id}d)`, { stroke: '#0b6b63', 'stroke-width': 2 }),
    ...[0, 60, 120, 180, 240, 300].map(a => line('M29 22.6 V25', '#0b6b63', 1.8, { transform: `rotate(${a} 29 32)` })),
    sphere(id, 'k', 29, 32, 4.6, ['#fff2c4', '#f5a524', '#b06a00']), line('M29 32 L35 27', '#8a4f00', 2.2),
    rect(45, 25, 4.5, 14, 2.2, `url(#${id}g)`),
    rect(12, 54, 9, 4.5, 2, '#06403b'), rect(43, 54, 9, 4.5, 2, '#06403b'),
  ],
  // «Проверка навыка»: a blue clipboard with a growth chart and a green check.
  check: id => [
    s('defs', {}, lin(`${id}b`, [[0, '#59c1f0'], [0.45, '#2fa6e0'], [1, '#1d4fbf']]), lin(`${id}c`, [[0, '#fff0c2'], [1, '#d9922a']], [0, 0, 0, 1])),
    contact(id, 32, 60, 18, 3.4),
    rect(11, 8, 40, 50, 9, `url(#${id}b)`), rect(11, 8, 40, 50, 9, `url(#${id}-under)`), gloss(id, 18, 13, 6, 2.6, -10),
    rect(16, 15, 30, 38, 4.5, '#05101a', { opacity: 0.18, filter: `url(#${id}-soft)` }),
    rect(16, 14, 30, 39, 4.5, '#ffffff'),
    rect(23, 4.5, 16, 9.5, 3.5, `url(#${id}c)`), rect(28, 7, 6, 3, 1.5, '#fff7e0'),
    rect(20, 37, 5, 11, 2, '#3b82f6'), rect(28, 31, 5, 17, 2, '#ff7a45'), rect(36, 24, 5, 24, 2, '#16e182'),
    line('M21.4 39 V45', '#b9d4ff', 1.2), line('M29.4 33 V45', '#ffd0b8', 1.2), line('M37.4 26 V45', '#b8f7d9', 1.2),
    line('M20 21 h12', '#d0d9e0', 2.6),
    sphere(id, 'ok', 47, 48, 9.5, ['#b8ffde', '#16e182', '#0a8a52']), circle(47, 48, 9.5, 'none', { stroke: '#fff', 'stroke-width': 2 }),
    line('M42.5 48.2 l3.1 3.1 l5.8 -6.4', '#05101a', 3),
  ],
  // «Первые шаги»: a waving graphite bionic hand with a green sensor glow.
  tutorial: id => [
    s('defs', {}, lin(`${id}h`, [[0, '#6f7f8c'], [0.45, '#2e3a45'], [1, '#05101a']])),
    contact(id, 31, 60, 13, 3),
    s('g', { transform: 'rotate(-14 31 40)' },
      line('M22 30 V16', '#2e3a45', 6.6), line('M28.5 29 V12', '#3d4a57', 6.6), line('M35 29 V13', '#3d4a57', 6.6), line('M41 31 V19', '#2e3a45', 6.6),
      line('M21 29 V17', '#8a9caa', 1.6, { opacity: 0.6 }), line('M27.5 28 V13', '#8a9caa', 1.6, { opacity: 0.6 }), line('M34 28 V14', '#8a9caa', 1.6, { opacity: 0.6 }),
      line('M20 41 L12 33', '#2e3a45', 7),
      rect(18, 26, 27, 25, 9, `url(#${id}h)`), gloss(id, 25, 31, 6, 3, -10),
      glow(id, 31.5, 37, 4.2, '#16e182', 0.9), circle(31.5, 37, 3, '#16e182'),
      rect(20, 49, 23, 12, 4, '#05101a'), rect(23, 53, 17, 3, 1.5, '#25c2c4')),
    line('M50 13 q6 6 2 14', '#16e182', 3), line('M55.5 7 q9.5 9 3 22', '#2fa6e0', 3),
  ],
};

/** Picture of a game (or «tutorial») for cards, plan rows and dialogs. */
export function gameArt(id, size = 48) {
  return picture(`game-${id}`, size, `game-art game-art-${id}`, () => gameDrawing(id, size));
}

function gameDrawing(id, size) {
  const svg = root('0 0 64 64', size, `game-art game-art-${id}`);
  const uid = `ga${++seq}`;
  svg.append(...[light(uid, 1.8), (GAME_ART[id] ?? GAME_ART.tutorial)(uid)].flat(3));
  return svg;
}

/** Small colour pictures (24 × 24) for rewards, states and headings. */
const STAR = 'M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z';
const BADGES = {
  flame: id => [s('defs', {}, lin(`${id}f`, [[0, '#ffd04a'], [0.55, '#ff7a45'], [1, '#e0364a']], [0, 0, 0, 1])),
    glow(id, 12, 15, 6, '#ff7a45', 0.5),
    path('M12 1.8 C13.2 6.8 18.6 9 18.6 15 A6.6 6.6 0 0 1 5.4 15 C5.4 11 8.6 9.6 8.8 5.8 C10.8 7.6 11.2 9 11.8 10.2 C12.4 7.4 12.4 4.8 12 1.8 Z', { fill: `url(#${id}f)` }),
    path('M12 11.5 C13.2 13.6 15.4 14.8 15.4 17.2 A3.4 3.4 0 0 1 8.6 17.2 C8.6 15.2 10.9 14 12 11.5 Z', { fill: '#fff1b8' })],
  star: id => [s('defs', {}, lin(`${id}s`, [[0, '#ffe680'], [0.6, '#f5a524'], [1, '#d97706']], [0, 0, 0, 1])),
    path(STAR, { fill: `url(#${id}s)`, stroke: '#c46a00', 'stroke-width': 1, 'stroke-linejoin': 'round' }),
    path(STAR, { fill: `url(#${id}-under)` }), gloss(id, 9.6, 9.2, 2, 3, 30)],
  'star-empty': () => [path(STAR, { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linejoin': 'round', opacity: 0.9 })],
  lock: id => [s('defs', {}, lin(`${id}l`, [[0, '#6f7f8c'], [0.5, '#2e3a45'], [1, '#05101a']])),
    line('M8 10.5 V7.6 a4 4 0 0 1 8 0 V10.5', '#8a9caa', 2.6),
    rect(4.6, 10, 14.8, 11.5, 3.4, `url(#${id}l)`), gloss(id, 8.4, 12, 2.6, 1.2, -6),
    glow(id, 12, 15.4, 2.4, '#16e182', 0.8), circle(12, 14.8, 1.8, '#16e182'), rect(11.2, 15.4, 1.6, 3.4, 0.8, '#16e182')],
  shield: id => [s('defs', {}, lin(`${id}s`, [[0, '#5ff3b9'], [0.5, '#1fd0a6'], [1, '#2f6fe0']])),
    path('M12 1.8 L20.4 5 V11.2 C20.4 16.6 16.8 20.6 12 22.2 C7.2 20.6 3.6 16.6 3.6 11.2 V5 Z', { fill: `url(#${id}s)` }),
    path('M12 1.8 L20.4 5 V11.2 C20.4 16.6 16.8 20.6 12 22.2 C7.2 20.6 3.6 16.6 3.6 11.2 V5 Z', { fill: `url(#${id}-under)` }),
    gloss(id, 8.6, 7.4, 2.4, 3.8, 20), line('M8.2 12 l2.7 2.7 l5 -5.4', '#05101a', 2.6)],
  medal: id => [s('defs', {}, rad(`${id}m`, [[0, '#fff2c4'], [0.55, '#f5a524'], [1, '#b06a00']], 0.36, 0.3, 0.8)),
    path('M6.5 1.5 h4 l2.6 7 h-4z', { fill: '#3b82f6' }), path('M17.5 1.5 h-4 l-2.6 7 h4z', { fill: '#16e182' }),
    circle(12, 15, 7, `url(#${id}m)`), circle(12, 15, 4.6, 'none', { stroke: '#fff2c4', 'stroke-width': 1, opacity: 0.8 }),
    path('M12 12.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z', { fill: '#b06a00' }), gloss(id, 9.5, 12, 1.8, 1, -20)],
  'medal-off': () => [path('M6.5 1.5 h4 l2.6 7 h-4z', { fill: 'currentColor', opacity: 0.55 }), path('M17.5 1.5 h-4 l-2.6 7 h4z', { fill: 'currentColor', opacity: 0.55 }),
    circle(12, 15, 7, 'currentColor', { opacity: 0.75 }), circle(12, 15, 4.4, 'currentColor', { opacity: 0.45 })],
  palette: id => [path('M12 3 C6.4 3 3 7 3 11.5 C3 16.2 6.6 20.4 11 20.4 C12.6 20.4 13.1 19.2 12.6 18 C12.1 16.7 13 15.6 14.4 15.6 H16.2 C19 15.6 21 13.6 21 10.6 C21 6.4 17 3 12 3 Z', { fill: '#fff8ee', stroke: '#e0a24a', 'stroke-width': 1.4 }),
    sphere(id, 'p1', 7.8, 11.2, 1.9, ['#ffd0d4', '#ef4444', '#a01818']), sphere(id, 'p2', 10.4, 7.4, 1.9, ['#fff2c4', '#f5a524', '#b06a00']),
    sphere(id, 'p3', 14.6, 7.2, 1.9, ['#c8ffe6', '#16e182', '#0a8a52']), sphere(id, 'p4', 17.4, 10.8, 1.9, ['#dbe9ff', '#3b82f6', '#1a46a8'])],
  // A gift for the Firebird (5.13): a coral box with a green ribbon and a bow.
  gift: id => [s('defs', {}, lin(`${id}g`, [[0, '#ffb38a'], [0.55, '#ff7a45'], [1, '#d4441a']], [0, 0, 0, 1])),
    rect(4, 10, 16, 11, 2.2, `url(#${id}g)`), rect(3, 7.2, 18, 4.4, 1.6, '#ff9a6b'), rect(4, 10, 16, 11, 2.2, `url(#${id}-under)`),
    rect(10.6, 7.2, 2.8, 13.8, 0.6, '#16e182'), path('M12 7.2 C9.4 2.6 5.2 4.4 7.4 7.2 Z', { fill: '#0aa865' }), path('M12 7.2 C14.6 2.6 18.8 4.4 16.6 7.2 Z', { fill: '#0aa865' }),
    gloss(id, 7.4, 13, 1.6, 2.4, 0)],
  levelup: id => [sphere(id, 'u', 12, 12, 10, ['#b8ffde', '#16e182', '#0a8a52']), line('M12 17 V7.4 M7.6 11.6 L12 7.2 L16.4 11.6', '#05101a', 2.6)],
  trophy: id => [s('defs', {}, lin(`${id}t`, [[0, '#ffe680'], [0.6, '#f5a524'], [1, '#c46a00']], [0, 0, 0, 1])),
    line('M7 5.5 H4.4 a2.6 2.6 0 0 0 2.8 4.4 M17 5.5 h2.6 a2.6 2.6 0 0 1 -2.8 4.4', '#e0a24a', 1.8),
    path('M6.8 3 h10.4 v5.2 a5.2 5.2 0 0 1 -10.4 0 z', { fill: `url(#${id}t)` }), gloss(id, 9.4, 5.8, 1.3, 2.6, 0),
    rect(10.6, 13, 2.8, 4, 0, '#d9922a'), rect(7, 17, 10, 3.6, 1.4, '#05101a'),
    path('M20.5 15.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z', { fill: '#16e182' }), path('M3.2 14l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z', { fill: '#3b82f6' })],
  moon: id => [s('defs', {}, lin(`${id}m`, [[0, '#9fc6ff'], [1, '#5b3fd6']])),
    path('M15 3.2 A8.8 8.8 0 1 0 20.8 15.6 A7.2 7.2 0 0 1 15 3.2 Z', { fill: `url(#${id}m)` }), gloss(id, 8, 8, 2, 3.2, 30),
    path('M18.5 4.5l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z', { fill: '#ffd27a' })],
  warning: id => [s('defs', {}, lin(`${id}w`, [[0, '#ffe08a'], [1, '#f5a524']], [0, 0, 0, 1])),
    path('M12 2.8 L22 20.2 H2 Z', { fill: `url(#${id}w)`, stroke: '#d98200', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
    rect(10.9, 8.6, 2.2, 6.4, 1.1, '#5a3300'), circle(12, 17.4, 1.3, '#5a3300')],
  done: id => [sphere(id, 'd', 12, 12, 10, ['#b8ffde', '#16e182', '#0a8a52']), line('M7.4 12.4 l3.2 3.2 l6 -6.6', '#05101a', 2.8)],
  // 5.15 — «Азбука протеза»: an open book (the entry, and «look at the card again» beside an answer to re-read).
  book: id => [s('defs', {}, lin(`${id}k`, [[0, '#8f7bff'], [1, '#5b3fd6']], [0, 0, 0, 1])),
    path('M2.5 6 Q 7 4.2 12 6.4 Q 17 4.2 21.5 6 V 19.6 Q 17 18 12 20 Q 7 18 2.5 19.6 Z', { fill: `url(#${id}k)` }),
    path('M4 6.6 Q 7.8 5.4 11.3 7.2 V 18.6 Q 7.8 17 4 18 Z', { fill: '#fffaf0' }), path('M20 6.6 Q 16.2 5.4 12.7 7.2 V 18.6 Q 16.2 17 20 18 Z', { fill: '#fff6e0' }),
    line('M5.8 9.4 Q 8 8.8 9.8 9.8 M5.8 12.2 Q 8 11.6 9.8 12.6 M14.2 9.8 Q 16 8.8 18.2 9.4 M14.2 12.6 Q 16 11.6 18.2 12.2', '#b9ab95', 0.9),
    path('M15.6 5.6 H17.6 V10.4 L16.6 9.4 L15.6 10.4 Z', { fill: '#16e182' })],
};

/** The illustration of each badge (5.16, public/art/ico-*); the drawing of BADGES is its fallback. */
export const BADGE_PICTURES = Object.freeze({
  flame: 'ico-streak', star: 'ico-star', 'star-empty': 'ico-star-empty', lock: 'ico-lock', shield: 'ico-safety', medal: 'ico-medal',
  'medal-off': 'ach-locked', palette: 'ico-palette', gift: 'ico-gift', levelup: 'ico-levelup', trophy: 'ico-trophy', moon: 'ico-rest',
  warning: 'ico-warning', done: 'ico-done', book: 'ico-primer',
});

/** A small colour picture by name (see BADGES). */
export function badgeArt(name, size = 24) {
  return picture(BADGE_PICTURES[name] ?? BADGE_PICTURES.star, size, `badge-art badge-art-${name}`, () => badgeDrawing(name, size));
}

function badgeDrawing(name, size) {
  const svg = root('0 0 24 24', size, `badge-art badge-art-${name}`);
  const uid = `ba${++seq}`;
  svg.append(...[light(uid, 0.9), (BADGES[name] ?? BADGES.star)(uid)].flat(3));
  return svg;
}

/** Stars of a result as a picture: filled gold and empty outlines. The caller names the count in text. */
export function starRow(n, total = 3, size = 20) {
  const row = document.createElement('span');
  row.className = 'star-row';
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < total; i++) row.append(badgeArt(i < n ? 'star' : 'star-empty', size));
  return row;
}

/**
 * Light trails — the motion streaks of the brand's covers: curves in the green → cyan → violet gradient (white on the
 * bright header). Decoration behind the content of a header; hidden in high contrast and forced colours.
 */
export function trails(tone = 'dark') {
  const id = `tr${++seq}`;
  const svg = s('svg', { class: 'trails', viewBox: '0 0 400 220', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
  const stroke = tone === 'light' ? '#ffffff' : `url(#${id})`;
  const strong = tone === 'light' ? 0.55 : 0.95, soft = tone === 'light' ? 0.12 : 0.2;
  svg.append(
    s('defs', {}, lin(id, [[0, '#16e182'], [0.45, '#25c2c4'], [0.75, '#3b82f6'], [1, '#8a6dff']], [0, 0, 1, 0])),
    path('M-30 190 C 70 120, 150 210, 250 120 S 390 30, 440 70', { fill: 'none', stroke, 'stroke-width': 16, 'stroke-linecap': 'round', opacity: soft }),
    path('M-30 190 C 70 120, 150 210, 250 120 S 390 30, 440 70', { fill: 'none', stroke, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: strong }),
    path('M-30 214 C 90 160, 170 230, 270 150 S 400 70, 440 100', { fill: 'none', stroke, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: strong * 0.75 }),
    path('M-30 160 C 60 100, 140 170, 230 96 S 360 10, 440 36', { fill: 'none', stroke, 'stroke-width': 1, 'stroke-linecap': 'round', opacity: strong * 0.6 }));
  return svg;
}

/**
 * The cover scene of the first run (like the brochure's «ecosystem» spread): the egg of the Жар-птица glows in front of
 * the brand sphere, an orbit carries the three signals of the game — A (coral), B (blue), A+B (violet) — and sparks.
 */
export function coverScene(size = 200) {
  const id = `sc${++seq}`;
  const svg = root('0 0 200 160', size, 'cover-scene', Math.round(size * 0.8));
  const orbitDot = (cx, cy, r, colours) => [glow(id, cx, cy, r * 1.4, colours[1], 0.6), sphere(id, `o${cx}`, cx, cy, r, colours)];
  const spark = (x, y, r, c) => path(`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`, { fill: c });
  const hero = firebirdDrawing('egg', 'fed', 120); // an SVG inside the SVG scene
  hero.setAttribute('x', 40); hero.setAttribute('y', 22); hero.setAttribute('width', 120); hero.setAttribute('height', 120);
  svg.append(...[
    light(id, 3),
    s('defs', {}, rad(`${id}-sun`, [[0, '#5ff3b9', 0.9], [0.45, '#25c2c4', 0.55], [0.8, '#3b82f6', 0.18], [1, '#3b82f6', 0]], 0.5, 0.5, 0.5),
      lin(`${id}-orbit`, [[0, '#16e182', 0.15], [0.5, '#25c2c4', 0.85], [1, '#8a6dff', 0.15]], [0, 0, 1, 0])),
    circle(100, 82, 78, `url(#${id}-sun)`),
    ellipse(100, 92, 88, 30, 'none', { stroke: `url(#${id}-orbit)`, 'stroke-width': 1.6, transform: 'rotate(-12 100 92)' }),
    ellipse(100, 146, 46, 7, '#16e182', { opacity: 0.35, filter: `url(#${id}-soft)` }),
    orbitDot(18, 102, 7, ['#ffe2d4', '#ff7a45', '#c63f12']), orbitDot(184, 66, 6, ['#dbe9ff', '#3b82f6', '#1a46a8']), orbitDot(160, 122, 5, ['#e6dcff', '#8a6dff', '#4a2fc0']),
    hero,
    spark(30, 40, 6, '#ffffff'), spark(172, 30, 4, '#c8ffe6'), spark(150, 18, 2.6, '#ffffff'), spark(48, 128, 3, '#bfe6ff')].flat(3));
  return svg;
}

/** A feather (leaf shape) from its base (x, y), `angle` degrees clockwise from up. */
function feather(x, y, len, width, angle, fill, attrs = {}) {
  return path(`M0 0 Q${width / 2} ${-len * 0.45} 0 ${-len} Q${-width / 2} ${-len * 0.45} 0 0 Z`, { fill, transform: `translate(${x} ${y}) rotate(${angle})`, ...attrs });
}
const tipOf = (x, y, len, angle) => [x + len * Math.sin(angle * Math.PI / 180), y - len * Math.cos(angle * Math.PI / 180)];
/** A tail plume of the Firebird: a curved feather from (x, y) that widens into a peacock eye; `bend` curls its tip sideways. */
function plume(x, y, len, width, angle, bend, fill) {
  const r = width / 2, ey = -(len - r);
  return s('g', { transform: `translate(${x} ${y}) rotate(${angle})` },
    path(`M${-width * 0.1} 0 C${-width * 0.2} ${-len * 0.3} ${bend - r} ${-len * 0.5} ${bend - r} ${ey} A${r} ${r} 0 0 1 ${bend + r} ${ey} C${bend + r} ${-len * 0.5} ${width * 0.2} ${-len * 0.3} ${width * 0.1} 0 Z`, { fill }),
    line(`M0 0 Q0 ${-len * 0.5} ${bend} ${ey}`, '#d6fff0', 1, { opacity: 0.55 }),
    ellipse(bend, ey, r * 0.86, r * 0.92, '#ffd27a'), ellipse(bend, ey + r * 0.06, r * 0.62, r * 0.68, '#ff7a45'),
    circle(bend, ey + r * 0.1, r * 0.36, '#5b3fd6'), circle(bend - r * 0.14, ey - r * 0.1, r * 0.12, '#fff', { opacity: 0.85 }));
}

/**
 * Жар-птица (5.12) — the pet the player raises from an egg: egg → chick → fledgling → young → firebird. Plumage in the
 * brand gradient (green → teal → blue → violet) with the warm «fire» of the folk tale (coral and amber crest, eye spots
 * on the tail). Moods: fed (trained today — happy eyes), waiting (round eyes), rest (asleep, a rest day). Never sad.
 * 5.13: `items` — what it wears (`{ nest, look }`, see core/pet.js), drawn at the anchors of each stage (the sample's
 * slot anchors); `alive` — a short idle (breathing, a blink, the tail swaying) that stops by itself within 5 s
 * (WCAG 2.2.2); `play` — a one-shot animation of PET_ANIMATIONS. Every motion is off with «Меньше движения».
 * 5.16: the bird is the team's picture of its stage and mood (`pose` — wave, read, star for the young and grown
 * bird); 29.10: in its look it is one whole picture, laid over only until that picture exists; this drawing is the fallback.
 */
export function firebird(stage = 'egg', mood = 'waiting', size = 96, { items = {}, alive = false, play = null, pose = null } = {}) {
  const cls = `firebird firebird-${stage} firebird-${mood}${alive ? ' alive' : ''}${play ? ` anim-${play}` : ''}`;
  // 29.10: asleep, the bird has taken its look off (ui/pictures.js) — the drawing too
  const drawing = () => firebirdDrawing(stage, mood, size, { items: mood === 'rest' ? { ...items, look: null } : items, alive, play });
  return petPicture(stage, mood, size, { items, pose, cls, fallback: drawing }) ?? drawing();
}

function firebirdDrawing(stage, mood, size, { items = {}, alive = false, play = null } = {}) {
  const id = `fb${++seq}`;
  const svg = root('0 0 120 120', size, `firebird firebird-${stage} firebird-${mood}${alive ? ' alive' : ''}${play ? ` anim-${play}` : ''}`);
  const g = (key, stops, dir) => lin(`${id}-${key}`, stops, dir);
  const defs = s('defs', {},
    g('green', [[0, '#7dffc4'], [0.5, '#16e182'], [1, '#0aa865']], [0, 0, 0, 1]),
    g('teal', [[0, '#5ff0d8'], [1, '#1f8fd0']], [0, 0, 0, 1]),
    g('tail', [[0, '#16e182'], [0.5, '#2fa6e0'], [1, '#6d4ef0']], [0, 0, 0, 1]),
    g('plume', [[0, '#16e182'], [0.45, '#25c2c4'], [1, '#3b6fe8']], [0, 1, 0, 0]),
    g('plume2', [[0, '#1fd0a6'], [0.5, '#2fa6e0'], [1, '#6d4ef0']], [0, 1, 0, 0]),
    g('fire', [[0, '#ffe680'], [0.5, '#ff9a52'], [1, '#e2501f']], [0, 1, 0, 0]),
    rad(`${id}-body`, [[0, '#d6fff0'], [0.25, '#4cf0b0'], [0.6, '#25c2c4'], [1, '#2f6fe0']], 0.38, 0.28, 0.9),
    rad(`${id}-royal`, [[0, '#d8f4ff'], [0.3, '#4cc6f0'], [0.7, '#3b6fe8'], [1, '#5b3fd6']], 0.38, 0.28, 0.9),
    rad(`${id}-chick`, [[0, '#fff6d6'], [0.45, '#ffd27a'], [1, '#ff8a52']], 0.38, 0.3, 0.85),
    rad(`${id}-egg`, [[0, '#fffdf6'], [0.55, '#ffe6b8'], [1, '#f2a94a']], 0.36, 0.28, 0.85),
    rad(`${id}-aura`, [[0, '#7dffc4', 0.55], [0.5, '#25c2c4', 0.22], [1, '#3b82f6', 0]], 0.5, 0.5, 0.5),
    rad(`${id}-heat`, [[0, '#ffd27a', 0.6], [0.45, '#ff9a52', 0.22], [1, '#6d4ef0', 0]], 0.5, 0.5, 0.5));
  const happy = mood === 'fed', asleep = mood === 'rest';
  const face = (cx, cy, k = 1) => {
    const ex = 8.5 * k, er = 4.4 * k;
    const eyes = asleep
      ? [line(`M${cx - ex - 3.5 * k} ${cy} q${3.5 * k} ${3 * k} ${7 * k} 0`, '#05101a', 2.2 * k), line(`M${cx + ex - 3.5 * k} ${cy} q${3.5 * k} ${3 * k} ${7 * k} 0`, '#05101a', 2.2 * k)]
      : happy
        ? [line(`M${cx - ex - 3.5 * k} ${cy + 1} q${3.5 * k} ${-5 * k} ${7 * k} 0`, '#05101a', 2.4 * k), line(`M${cx + ex - 3.5 * k} ${cy + 1} q${3.5 * k} ${-5 * k} ${7 * k} 0`, '#05101a', 2.4 * k)]
        : [circle(cx - ex, cy, er, '#05101a'), circle(cx + ex, cy, er, '#05101a'), circle(cx - ex - 1.4 * k, cy - 1.6 * k, 1.5 * k, '#fff'), circle(cx + ex - 1.4 * k, cy - 1.6 * k, 1.5 * k, '#fff')];
    return [s('g', { class: 'fb-eyes' }, eyes),
      path(`M${cx - 3.4 * k} ${cy + 6 * k} L${cx + 3.4 * k} ${cy + 6 * k} L${cx} ${cy + 11 * k} Z`, { fill: `url(#${id}-fire)`, 'stroke-linejoin': 'round' }),
      ellipse(cx - ex - 4 * k, cy + 7 * k, 3.6 * k, 2.2 * k, '#ff8fa3', { opacity: 0.75 }), ellipse(cx + ex + 4 * k, cy + 7 * k, 3.6 * k, 2.2 * k, '#ff8fa3', { opacity: 0.75 })];
  };
  const zz = asleep ? [line('M92 22 h8 l-8 9 h8', '#25c2c4', 2.6), line('M104 10 h6 l-6 7 h6', '#7fd8e8', 2.2)] : [];
  const sparkles = happy ? [path('M18 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z', { fill: '#ffd27a' }), path('M100 44 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4z', { fill: '#7dffc4' })] : [];
  // The tail opens behind the body like a peacock's (the bird faces us): outer plumes first, curling outwards.
  const fan = (x, y, angles, len, width, bend, key = 'plume') => s('g', { class: 'fb-tail' }, [...angles].sort((p, q) => Math.abs(q) - Math.abs(p))
    .map(a => plume(x, y, len, width, a, a < 0 ? -bend : bend, `url(#${id}-${key})`)));
  const wing = (x, y, angles, len, width, fill) => angles.map(a => feather(x, y, len, width, a, fill));
  const crest = (x, y, specs) => specs.map(([a, len, w]) => [feather(x, y, len, w, a, `url(#${id}-fire)`), circle(...tipOf(x, y, len, a), 1.6, '#ffe680')]);
  // Each stage: a glow and a contact shadow on the ground, what is behind the body (tail, wings), the body and face.
  let ground, behind, body;
  if (stage === 'egg') {
    ground = [circle(60, 62, 46, `url(#${id}-aura)`, { opacity: happy ? 1 : asleep ? 0.35 : 0.7 }), contact(id, 60, 106, 24, 4.5)];
    behind = [];
    body = [
      path('M60 20 C 82 20 92 52 92 72 C 92 92 78 104 60 104 C 42 104 28 92 28 72 C 28 52 38 20 60 20 Z', { fill: `url(#${id}-egg)` }),
      path('M30 66 L38 60 L46 68 L54 60 L62 68 L70 60 L78 68 L86 60 L91 64 L91 74 L86 70 L78 78 L70 70 L62 78 L54 70 L46 78 L38 70 L30 76 Z', { fill: `url(#${id}-tail)`, opacity: 0.95 }),
      circle(44, 46, 3.6, '#ff7a45', { opacity: 0.85 }), circle(74, 40, 2.6, '#16e182', { opacity: 0.85 }), circle(70, 90, 3, '#6d4ef0', { opacity: 0.8 }), circle(46, 88, 2.2, '#ffb02e'),
      path('M60 20 C 82 20 92 52 92 72 C 92 92 78 104 60 104 C 42 104 28 92 28 72 C 28 52 38 20 60 20 Z', { fill: `url(#${id}-under)` }),
      gloss(id, 47, 40, 9, 15, -22), circle(44, 34, 2.4, '#fff', { opacity: 0.9 })];
  } else if (stage === 'chick') {
    ground = [contact(id, 60, 108, 28, 4.5)];
    behind = [wing(36, 70, [-118], 16, 12, `url(#${id}-chick)`), wing(84, 70, [118], 16, 12, `url(#${id}-chick)`)];
    body = [
      circle(60, 64, 28, `url(#${id}-chick)`), circle(60, 64, 28, `url(#${id}-under)`),
      feather(60, 38, 15, 7, 0, `url(#${id}-green)`), feather(58, 39, 11, 6, -28, `url(#${id}-fire)`),
      gloss(id, 48, 50, 8, 5, -28),
      face(60, 62, 1),
      path('M30 80 Q30 106 60 106 Q90 106 90 80 L83 85 L76 78 L68 86 L60 78 L52 86 L44 78 L37 85 Z', { fill: `url(#${id}-egg)` }),
      path('M30 80 Q30 106 60 106 Q90 106 90 80', { fill: `url(#${id}-under)` }),
      line('M36 94 L46 88 L54 96 L62 88 L72 96 L82 90', `url(#${id}-tail)`, 2.6)];
  } else if (stage === 'fledgling') {
    ground = [contact(id, 60, 100, 26, 4.5)];
    behind = [fan(60, 74, [-60, -30, 30, 60], 40, 13, 4),
      wing(38, 70, [-112, -128, -144], 20, 9, `url(#${id}-green)`), wing(82, 70, [112, 128, 144], 20, 9, `url(#${id}-green)`)];
    body = [
      ellipse(60, 68, 25, 27, `url(#${id}-body)`), ellipse(60, 68, 25, 27, `url(#${id}-under)`),
      ellipse(60, 79, 14, 14, '#eafff6', { opacity: 0.9 }),
      crest(60, 43, [[-26, 14, 6], [0, 18, 7], [26, 14, 6]]),
      gloss(id, 49, 52, 8, 4.6, -28),
      face(60, 63, 1)];
  } else if (stage === 'young') {
    ground = [circle(60, 62, 52, `url(#${id}-aura)`, { opacity: 0.55 }), contact(id, 60, 98, 24, 4)];
    behind = [fan(60, 74, [-66, -42, -18, 18, 42, 66], 47, 14, 5),
      wing(40, 68, [-108, -124, -140, -156], 22, 9, `url(#${id}-green)`), wing(80, 68, [108, 124, 140, 156], 22, 9, `url(#${id}-green)`)];
    body = [
      ellipse(60, 66, 22, 26, `url(#${id}-body)`), ellipse(60, 66, 22, 26, `url(#${id}-under)`),
      ellipse(60, 77, 12, 13, '#e6fff5', { opacity: 0.9 }),
      crest(60, 42, [[-22, 18, 6.5], [0, 24, 7.5], [22, 18, 6.5]]),
      gloss(id, 50, 51, 7, 4.2, -28),
      face(60, 61, 0.92)];
  } else {
    ground = [circle(60, 60, 60, `url(#${id}-heat)`), contact(id, 60, 98, 22, 4)];
    behind = [fan(60, 76, [-76, -56, -36, -16, 16, 36, 56, 76], 54, 15, 6, 'plume2'),
      wing(40, 66, [-104, -120, -136, -152], 26, 10, `url(#${id}-teal)`), wing(80, 66, [104, 120, 136, 152], 26, 10, `url(#${id}-teal)`),
      wing(42, 68, [-112, -132, -152], 17, 8, `url(#${id}-green)`), wing(78, 68, [112, 132, 152], 17, 8, `url(#${id}-green)`)];
    body = [
      ellipse(60, 66, 20, 25, `url(#${id}-royal)`), ellipse(60, 66, 20, 25, `url(#${id}-under)`),
      ellipse(60, 77, 11, 12, '#e9fff6', { opacity: 0.9 }),
      crest(60, 43, [[-40, 15, 5.5], [-20, 20, 6], [0, 25, 7], [20, 20, 6], [40, 15, 5.5]]),
      gloss(id, 51, 50, 6.5, 4, -28),
      face(60, 61, 0.88)];
  }
  const worn = petItemsArt(id, stage, outfitPlaces(items));
  // The bird moves as one (with what it wears); the ground, the nest and its things stay.
  const bird = s('g', { class: 'fb-bird' }, [behind, worn.headBack, body, worn.headFront, worn.chest].flat(4));
  svg.append(...[light(id, 2.2), defs, worn.defs, ground, worn.nestBack, bird, worn.nestFront, zz, sparkles].flat(4));
  return svg;
}

/**
 * The growth ceremony (5.14 — the sample's evolution choreography, `ProceduralAnimator` «shrink with a spin → the new
 * look at the midpoint → grow with an overshoot», without its white flash and pulsing rings): the old stage turns
 * half-way and shrinks away, a warm light swells on the same spot, the new stage grows out of it with a soft spring —
 * 1.2 s, once. «Меньше движения» keeps only a cross-fade (styles/app.css). Decorative: the words next to it say it.
 */
export function evolution(fromStage, toStage, size = 120, { items = {} } = {}) {
  const layer = (cls, child) => { const el = document.createElement('span'); el.className = cls; if (child) el.append(child); return el; };
  const box = layer('evo');
  box.setAttribute('aria-hidden', 'true');
  box.style.width = box.style.height = `${size}px`;
  box.append(layer('evo-glow'), layer('evo-from', firebird(fromStage, 'fed', size, { items })), layer('evo-to', firebird(toStage, 'fed', size, { items, pose: 'star' })));
  return box;
}

// ---------- 5.16: pictures that have no drawing of their own (a drawn stand-in, or nothing next to the words) ----------

/** The medal of an achievement — its own picture when earned, the closed medal when not. */
export function achievementArt(id, earned, size = 48) {
  return picture(earned ? `ach-${id}` : 'ach-locked', size, `badge-art ach-art${earned ? '' : ' ach-off'}`, () => badgeDrawing(earned ? 'medal' : 'medal-off', size));
}

/** A gift for the Firebird (core/pet.js PET_ITEMS). */
export const giftArt = (id, size = 40) => picture(`gift-${id}`, size, 'gift-art', () => badgeDrawing('gift', size));

/** The look of the game hand (core/progress.js SKINS); null — the caller draws the hand. */
export const skinArt = (id, size = 56) => picture(`skin-${id}`, size, 'skin-art');

/** The bionic hand showing a gesture of the vocabulary; null for a gesture without a picture (a new set on 28.10). */
export const gestureArt = (id, size = 48) => picture(`gesture-${id}`, size, 'gesture-art');

/** A scene of an everyday task (core/everyday.js) on its own light tile; null if there is none. */
export const dayArt = (id, size = 96) => picture(`day-${id}`, size, 'day-art');

/** A section icon of the illustrations (ico-*: plan, goal, primer, ask, report, sensor, …); null if there is none. */
export const sectionArt = (name, size = 40) => picture(`ico-${name}`, size, 'section-art');

/** A cover of the first run (welcome, safety, prosthesis); the drawn scene stands in for the first one. */
export function coverArt(name, width = 320) {
  return picture(`cover-${name}`, width, `cover-art cover-${name}`, name === 'welcome' ? () => coverScene(Math.min(230, width)) : null);
}

/**
 * Anchors of the worn things per stage (5.13, the sample's SlotAnchors): head — the top of the head [x, y, scale];
 * chest — the middle of the chest; nest — the ground under the bird [x, y, half-width]. A slot that a stage has not
 * opened has no anchor (core/pet.js decides; the drawing only follows).
 */
const ANCHORS = {
  head: { chick: [60, 39, 0.85], fledgling: [60, 44, 0.9], young: [60, 43, 0.85], firebird: [60, 44, 0.8] },
  chest: { fledgling: [60, 84, 1], young: [60, 81, 0.92], firebird: [60, 81, 0.88] },
  nest: { egg: [60, 104, 32], chick: [60, 104, 36], fledgling: [60, 97, 32], young: [60, 95, 30], firebird: [60, 95, 30] },
};

/** The worn things of the pet, as layers: behind the head, in front of it, on the chest, the nest behind and in front. */
function petItemsArt(id, stage, items) {
  const out = { defs: [], headBack: [], headFront: [], chest: [], nestBack: [], nestFront: [] };
  if (!Object.values(items).some(Boolean)) return out;
  const at = (anchor, children) => s('g', { transform: `translate(${anchor[0]} ${anchor[1]}) scale(${anchor[2]})` }, children);
  const gold = `${id}-gold`;
  out.defs.push(s('defs', {},
    rad(gold, [[0, '#fff6c2'], [0.45, '#ffd27a'], [1, '#d98200']], 0.35, 0.3, 0.85),
    lin(`${id}-bow`, [[0, '#ffb38a'], [0.5, '#ff7a45'], [1, '#e2501f']], [0, 0, 0, 1]),
    lin(`${id}-wood`, [[0, '#d9a066'], [1, '#7a4a22']], [0, 0, 0, 1]),
    rad(`${id}-enamel`, [[0, '#9ff5e2'], [0.5, '#1fd0a6'], [1, '#1f6fd0']], 0.35, 0.3, 0.85),
    rad(`${id}-gem`, [[0, '#d8ccff'], [0.5, '#6d4ef0'], [1, '#3b2aa8']], 0.35, 0.3, 0.85)));
  const head = ANCHORS.head[stage], chest = ANCHORS.chest[stage], nest = ANCHORS.nest[stage];
  const star5 = (cx, cy, r, ri) => path(Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : r;
    return `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ') + ' Z', { fill: `url(#${gold})`, stroke: '#c27a12', 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
  if (head && items.head) {
    const art = {
      bow: () => ['front', s('g', { transform: 'translate(9 1) rotate(18)' },
        path('M0 0 C -4 -7 -11 -6 -10 0 C -11 6 -4 7 0 0 Z', { fill: `url(#${id}-bow)` }), path('M0 0 C 4 -7 11 -6 10 0 C 11 6 4 7 0 0 Z', { fill: `url(#${id}-bow)` }),
        path('M0 0 L -4 8 L -1.2 7 Z', { fill: '#e2501f' }), path('M0 0 L 4 8 L 1.2 7 Z', { fill: '#e2501f' }),
        circle(0, 0, 2.4, '#c2410c'), ellipse(-6, -2.4, 2.4, 1.2, '#fff', { opacity: 0.55 }))],
      wreath: () => ['front', s('g', {},
        Array.from({ length: 9 }, (_, i) => { const x = -16 + i * 4, y = (x / 16) ** 2 * 5 - 1, a = Math.atan(x * 10 / 256) * 180 / Math.PI;
          return ellipse(x, y, 3.6, 1.8, i % 2 ? '#0aa865' : '#16e182', { transform: `rotate(${(a + (i % 2 ? 24 : -24)).toFixed(1)} ${x} ${y.toFixed(2)})` }); }),
        [[-9, '#ff7a45'], [0, '#ffffff'], [9, '#8b6cf0']].map(([x, c]) => { const y = (x / 16) ** 2 * 5 - 2;
          return [0, 72, 144, 216, 288].map(a => circle(x + 1.7 * Math.cos(a * Math.PI / 180), y + 1.7 * Math.sin(a * Math.PI / 180), 1.5, c)).concat(circle(x, y, 1.2, '#ffd27a')); }))],
      star: () => ['front', s('g', {}, glow(id, 0, 9, 6.5, '#ffd27a', 0.55), star5(0, 9, 5.4, 2.3), circle(-1.4, 7.2, 0.9, '#fff', { opacity: 0.9 }))],
      kokoshnik: () => ['back', s('g', {},
        path('M-19 6 C-19 -7 -10 -21 0 -24 C 10 -21 19 -7 19 6 Z', { fill: `url(#${gold})`, stroke: '#c27a12', 'stroke-width': 0.8 }),
        path('M-14.5 5 C-14.5 -5 -8 -15.5 0 -18.5 C 8 -15.5 14.5 -5 14.5 5 Z', { fill: `url(#${id}-gem)` }),
        ellipse(0, -9, 3, 3.8, '#ff7a45'), circle(-8, -3, 2, '#16e182'), circle(8, -3, 2, '#2fa6e0'), circle(-0.9, -10.4, 0.9, '#fff', { opacity: 0.85 }),
        [[-18, 0], [-16.4, -8], [-11.6, -15.2], [-4.8, -21.2], [4.8, -21.2], [11.6, -15.2], [16.4, -8], [18, 0]].map(([x, y]) => circle(x, y, 1.3, '#fffdf6')))],
    }[items.head]?.();
    if (art) (art[0] === 'back' ? out.headBack : out.headFront).push(at(head, art[1]));
  }
  if (chest && items.chest) {
    const art = {
      amulet: () => s('g', {}, line('M-10 -9 Q -6 -1 0 0 Q 6 -1 10 -9', '#c58a1c', 1.3),
        circle(0, 4, 4.8, `url(#${gold})`), circle(0, 4, 3.3, `url(#${id}-enamel)`),
        rect(-1.5, 2.5, 3, 3, 0.4, '#ffe680'), rect(-1.5, 2.5, 3, 3, 0.4, '#ffe680', { transform: 'rotate(45 0 4)' }), circle(-1.6, 2.4, 0.8, '#fff', { opacity: 0.8 })),
      beads: () => s('g', {}, Array.from({ length: 9 }, (_, i) => { const t = -1 + i / 4, x = 11 * t, y = 1 - 9 * t * t;
        return [circle(x, y, i === 4 ? 2.3 : 1.8, ['#ff7a45', `url(#${gold})`, '#6d4ef0', '#16e182'][i % 4]), circle(x - 0.6, y - 0.6, 0.55, '#fff', { opacity: 0.7 })]; })),
    }[items.chest]?.();
    if (art) out.chest.push(at(chest, art));
  }
  if (nest && items.nest) {
    const [x, y, rx] = nest;
    const place = (children, k = 1) => s('g', { transform: `translate(${x} ${y}) scale(${k})` }, children);
    if (items.nest === 'twigs') {
      out.nestBack.push(place([ellipse(0, -6, rx, 5.5, '#8a5a2b'), ellipse(0, -6, rx - 3, 3.4, '#5c3a1a')]));
      out.nestFront.push(place([
        path(`M${-rx} -6 C ${-rx} 4 ${-rx * 0.55} 9 0 9 C ${rx * 0.55} 9 ${rx} 4 ${rx} -6 C ${rx * 0.6} -2 ${-rx * 0.6} -2 ${-rx} -6 Z`, { fill: `url(#${id}-wood)` }),
        line(`M${-rx + 3} -2 Q ${-rx * 0.3} 6 ${rx * 0.5} 1`, '#e0a868', 1.2), line(`M${-rx * 0.6} 4 Q 0 0 ${rx - 4} -1`, '#6b4220', 1.1),
        line(`M${-rx * 0.2} 7 Q ${rx * 0.3} 3 ${rx - 2} 2`, '#e0a868', 1), line(`M${-rx + 1} -5 L ${-rx - 4} -9`, '#7a4a22', 1.1),
        ellipse(rx - 2, -7, 3.4, 1.6, '#16e182', { transform: `rotate(-30 ${rx - 2} -7)` }), ellipse(-rx + 3, -8, 3, 1.4, '#0aa865', { transform: `rotate(28 ${-rx + 3} -8)` })]));
    } else if (items.nest === 'apples') {
      const apple = (ax, ay, r) => [circle(ax, ay, r, `url(#${gold})`), circle(ax, ay, r, `url(#${id}-under)`), ellipse(ax - r * 0.35, ay - r * 0.4, r * 0.3, r * 0.18, '#fff', { opacity: 0.8 }),
        line(`M${ax} ${ay - r} q 0.5 -2.4 1.6 -3`, '#7a4a22', 1), ellipse(ax + 2.6, ay - r - 2.2, 2.2, 1.1, '#16e182', { transform: `rotate(-24 ${ax + 2.6} ${ay - r - 2.2})` })];
      out.nestFront.push(place([apple(-rx + 1, -3, 5), apple(-rx + 10, 0, 4.2), apple(rx - 3, -2, 4.8)]));
    } else if (items.nest === 'lantern') {
      const lx = rx - 1;
      out.nestFront.push(place([glow(id, lx, -9, 9, '#ffd27a', 0.55),
        line(`M${lx - 3.5} -17 Q ${lx} -22 ${lx + 3.5} -17`, '#2a3442', 1.2),
        path(`M${lx - 4.5} -16 L ${lx + 4.5} -16 L ${lx + 3} -18 L ${lx - 3} -18 Z`, { fill: '#2a3442' }),
        rect(lx - 4.5, -16, 9, 13, 2.2, '#2a3442'), rect(lx - 3, -14.4, 6, 9.8, 1.4, '#ffd27a'), rect(lx - 1.4, -13.4, 2.8, 7.6, 1, '#fff6c2'),
        rect(lx - 5, -3.4, 10, 2.4, 1, '#2a3442')]));
    } else if (items.nest === 'book') {
      // 5.15 — «Азбука»: an open book leaning on the nest's rim (the gift for «Знаток протеза», core/primer.js).
      const bx = -rx + 8;
      const page = side => `M${bx} -9 Q ${bx + side * 4.5} -11 ${bx + side * 9} -9.5 L ${bx + side * 9} -1.5 Q ${bx + side * 4.5} -3 ${bx} -1 Z`;
      out.nestFront.push(place([
        path(`M${bx - 10} -9 L ${bx + 10} -9 L ${bx + 10} -0.4 Q ${bx} 1.2 ${bx - 10} -0.4 Z`, { fill: '#b8324a' }),
        path(page(-1), { fill: '#fff6e0' }), path(page(1), { fill: '#fffaf0' }),
        line(`M${bx} -9 L ${bx} -1`, '#c9a46a', 0.8),
        ...[-7.5, -5.5, -3.5].flatMap(y => [line(`M${bx - 7.4} ${y} Q ${bx - 4.5} ${y - 1} ${bx - 1.6} ${y + 0.3}`, '#c4b8a4', 0.6),
          line(`M${bx + 1.6} ${y + 0.3} Q ${bx + 4.5} ${y - 1} ${bx + 7.4} ${y}`, '#c4b8a4', 0.6)]),
        path(`M${bx + 4.4} -10.4 L ${bx + 6} -10.4 L ${bx + 6} -6.2 L ${bx + 5.2} -7 L ${bx + 4.4} -6.2 Z`, { fill: '#16e182' })]));
    }
  }
  return out;
}
