import './pin-set.mjs'; // the suite of earlier releases speaks the «Синергия» set; the task's set is read by name below
// 29.10 — whole pictures instead of collages (docs/GAME_VISUALS.md §12, docs/REGEN.md): the jobs the team generates in
// ChatGPT name pictures the code reads, the documents carry every prompt, and the code prefers a whole picture to two
// laid together — a bird in its look, a hand holding a thing, the gesture of a card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GESTURE_SETS } from '../src/core/vocabulary.js';
import { PET_ITEMS, placeOpen } from '../src/core/pet.js';
import { PET } from '../src/config.js';
import { OBJECTS } from '../src/games/grip.js';
import { BIONIC } from '../src/render/bionic.js';
import { ART } from '../src/ui/art-manifest.js';
import { CANVAS_PICTURES } from '../src/ui/pictures.js';
import { cardPicture } from '../src/games/base.js';

const JOBS = JSON.parse(readFileSync('tools/regen-jobs.json', 'utf8'));
const names = kind => JOBS.filter(j => j.kind === kind).flatMap(j => j.names.filter(n => n !== '-'));

test('regen: every job has a prompt, a reference of catalogue pictures, a grid that holds its names, a priority', () => {
  assert.ok(JOBS.length >= 15, `${JOBS.length} jobs`);
  assert.equal(new Set(JOBS.map(j => j.id)).size, JOBS.length, 'job ids are file names — one each');
  for (const j of JOBS) {
    assert.match(j.id, /^[a-z0-9-]+$/, j.id);
    assert.ok([1, 2, 3].includes(j.priority), j.id);
    assert.equal(j.names.length, j.grid[0] * j.grid[1], `${j.id}: one name per cell`);
    assert.ok(j.prompt.length > 400 && /magenta \(#FF00FF\)/.test(j.prompt) && /no text/.test(j.prompt), `${j.id}: the prompt asks for the key and no text`);
    for (const n of [...(j.ref.top ?? []), ...(j.ref.bottom ?? [])]) assert.ok(Object.hasOwn(ART, n), `${j.id}: reference ${n} is in the catalogue`);
  }
  const all = JOBS.flatMap(j => j.names.filter(n => n !== '-'));
  assert.equal(new Set(all).size, all.length, 'no picture is generated twice');
});

test('regen: the gestures of the task\'s set and the coactivation, under the names the cards read', () => {
  const tz = GESTURE_SETS.tz.gestures.map(g => `gesture-${g.id}`);
  assert.deepEqual(names('gestures').sort(), [...tz, 'gesture-coact'].sort());
  // a card shows the gesture it asks for, a two-channel command the same picture in every set
  assert.equal(cardPicture({ gesture: 'flexion', command: 'close' }), 'flexion');
  assert.deepEqual(['close', 'open', 'switch', 'rest'].map(command => cardPicture({ command })), ['fist', 'open', 'coact', 'rest']);
  for (const file of ['src/games/safe.js', 'src/games/assess.js']) assert.match(readFileSync(file, 'utf8'), /cardPicture\((card|t)\)/, file);
});

test('regen: a hand holding each thing of «Мастерская», and the three hanging grips whole', () => {
  const things = [...new Set(Object.entries(OBJECTS).map(([k, o]) => o.art ?? k))];
  assert.deepEqual(names('holds').sort(), things.map(k => `hold-${k}`).sort());
  assert.deepEqual(names('hang-grips').sort(), Object.values(BIONIC.hang.grips).sort());
  assert.ok(CANVAS_PICTURES.every(n => !n.startsWith('hold-') || Object.hasOwn(ART, n)));
  assert.match(readFileSync('src/ui/pictures.js', 'utf8'), /\^\(obj\|gesture\|hand\|hold\|/, 'the hold pictures load with the canvas pictures');
});

test('regen: a look of the bird is a whole picture of a stage that has its place, awake, on the bird it is matched to', () => {
  const stages = PET.stages.map(s => s.id);
  for (const n of [...names('looks'), ...names('flight')]) {
    const m = /^pet-([a-z]+)-(happy|waiting)(-nest)?-([a-z]+)$/.exec(n);
    assert.ok(m, `${n}: pet-<stage>-<happy|waiting>[-nest]-<look> (asleep the bird takes its look off)`);
    const [, stage, mood, nest, look] = m;
    assert.ok(stages.includes(stage), n);
    assert.ok(PET_ITEMS.some(i => i.id === look && i.slot === 'look'), `${n}: ${look} is a look`);
    assert.ok(placeOpen(look, stage), `${n}: a ${stage} has no place for ${look}`);
    assert.ok(Object.hasOwn(ART, `pet-${stage}-${mood}${nest ?? ''}`), `${n}: the bird it is matched to`);
  }
  // every look of every stage, in the nest, both awake moods
  for (const stage of stages) for (const item of PET_ITEMS.filter(i => i.slot === 'look' && placeOpen(i, stage)))
    for (const mood of ['happy', 'waiting']) assert.ok(names('looks').includes(`pet-${stage}-${mood}-nest-${item.id}`), `${stage} ${mood} ${item.id}`);
  // the flying bird wears what it wears on its head and chest
  for (const stage of ['fledgling', 'young', 'firebird']) for (const item of PET_ITEMS.filter(i => ['head', 'chest'].includes(i.place)))
    assert.ok(names('flight').includes(`pet-${stage}-happy-${item.id}`), `${stage} flies with ${item.id}`);
});

test('regen: docs/REGEN.md carries every job and its prompt word for word, the first priority first', () => {
  const doc = readFileSync('docs/REGEN.md', 'utf8');
  for (const j of JOBS) {
    assert.ok(doc.includes(`### \`${j.id}\``), j.id);
    assert.ok(doc.includes(j.prompt), `${j.id}: the prompt`);
  }
  const first = JOBS.filter(j => j.priority === 1).map(j => doc.indexOf(`### \`${j.id}\``));
  const later = JOBS.filter(j => j.priority > 1).map(j => doc.indexOf(`### \`${j.id}\``));
  assert.ok(Math.max(...first) < Math.min(...later));
  assert.match(readFileSync('docs/GAME_VISUALS.md', 'utf8'), /## 12\. Цельные картинки вместо коллажей/);
});

test('regen: the code prefers the whole picture — the held thing, the narrow cross-fade, the basket in front of a delivered thing', () => {
  const grip = readFileSync('src/games/grip.js', 'utf8');
  assert.match(grip, /holding = deco && !o\.hot && \(o\.phase === 'carry' \|\| \(o\.phase === 'grasp' && hand\.inContact\)\) && heldPicture\(o, this\.skin\);/);
  assert.match(grip, /if \(!holding && !\(o\.phase === 'done' && o\.failed === 'timeout'\)\) drawObject/);
  assert.match(grip, /if \(o\.phase === 'done' && o\.delivered\) drawBasket\(ctx, bx, by, s, deco, 0\);/);
  assert.match(readFileSync('src/render/bionic.js', 'utf8'), /const settle = t => \{ const u = Math\.min\(1, Math\.max\(0, \(t - 0\.4\) \/ 0\.2\)\);/);
});

test('regen: drawHeld lays the picture so the thing is where the game keeps it, the arm above it, the cut-out over a tint', async () => {
  const { setSprite, setSpriteMeta } = await import('../src/render/sprites.js');
  const { drawHeld } = await import('../src/render/bionic.js');
  const calls = [];
  const ctx = {
    save() {}, restore() {}, translate(x, y) { this.t = [x, y]; }, scale(sx, sy) { this.s = [sx, sy]; },
    drawImage(img, ...a) { calls.push({ img: img.id, a, t: this.t, s: this.s }); }, globalAlpha: 1,
  };
  const img = (id, w, h) => ({ id, complete: true, naturalWidth: w, naturalHeight: h });
  setSprite('hand-down-rest', img('rest', 364, 686));
  setSprite('hold-test', img('hold', 372, 660));
  setSpriteMeta('hold-test', [0.05, 0.8, 372 / 686, 660 / 686, 0.42]);
  try {
    assert.equal(drawHeld(ctx, 'hold-test', 200, 300, 100, { armTo: 0 }), true);
    const arm = calls.find(c => c.img === 'rest'), pic = calls.find(c => c.img === 'hold');
    assert.ok(arm, 'the arm goes on above the picture');
    // the thing's centre (0.05, 0.8 of ht from the arm's axis and the top) falls on (200, 300)
    const top = 300 - 0.8 * 100, axis = 200 - 0.05 * 100;
    assert.ok(Math.abs(pic.t[0] - axis) < 1e-9 && Math.abs(pic.t[1] - (top + 660 / 686 * 100 / 2)) < 1e-9, JSON.stringify(pic));
    assert.deepEqual([arm.a[5], arm.a[7]], [0, top + 1], 'the arm runs from the top of the field down to the picture');
    calls.length = 0;
    drawHeld(ctx, 'hold-test', 200, 300, 100, { mirror: true });
    assert.equal(calls.find(c => c.img === 'hold').t[0], 200 + 0.05 * 100, 'a left hand holds it on the other side of its arm');
    assert.equal(drawHeld(ctx, 'hold-none', 0, 0, 100), false, 'no picture — the game draws the hand and the thing');
  } finally {
    setSprite('hand-down-rest', null); setSprite('hold-test', null); setSpriteMeta('hold-test', null);
  }
});
