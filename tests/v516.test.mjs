// 5.16 — the team's illustrations in the product (ui/pictures.js, public/art/, tools/import-art.py): the catalogue is
// the files, every thing of the app that has a place for a picture has one, the Firebird wears its gifts where the
// pose leaves room, the build carries the pictures offline, the APK gets the launcher icon and the splash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ART, ART_BYTES, PET_LAYOUT } from '../src/ui/art-manifest.js';
import { petPictureName, petThings, CANVAS_PICTURES, roomPictures } from '../src/ui/pictures.js';
import { PET } from '../src/config.js';
import { PET_ITEMS, PET_SLOTS } from '../src/core/pet.js';
import { ACHIEVEMENTS, SKINS } from '../src/core/progress.js';
import { EVERYDAY } from '../src/core/everyday.js';
import { TRAINING_GAMES, ASSESSMENT } from '../src/games/registry.js';
import { sprite, setSprite, drawSprite } from '../src/render/sprites.js';
import { OBJECTS } from '../src/games/grip.js';

const manifest = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const files = readdirSync('public/art').filter(f => f.endsWith('.webp'));

/** Canvas size of a WebP file (VP8X, VP8 or VP8L header). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  const b = buf.readUInt32LE(21);
  return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
}

test('art: the catalogue is the files — every entry exists with its size, bytes and SHA-256, no file is left out', () => {
  assert.deepEqual(files.map(f => f.replace(/\.webp$/, '')).sort(), Object.keys(ART).sort());
  for (const [name, [w, h]] of Object.entries(ART)) {
    const buf = readFileSync(`public/art/${name}.webp`);
    const m = manifest.items[name];
    assert.deepEqual(webpSize(buf), [w, h], name);
    assert.equal(buf.length, m.bytes, `${name}: bytes`);
    assert.equal(createHash('sha256').update(buf).digest('hex'), m.sha256, `${name}: the file is not the one the import tool wrote`);
    assert.match(m.source, /^[0-9a-f]{64}$/, `${name}: the source picture is traced`);
  }
  assert.equal(ART_BYTES, manifest.total_bytes);
});

// 5.32: the budget follows the real limit — the platform takes a 30 MB archive, and a picture lands in it about 4.3 times
// (the tree, the history, the APK, the one-file HTML as base64). Measured 26.10: about 20 MB with 1.9 MB of pictures.
test('art: size budget — the whole set ≤ 3.5 MB, a pet ≤ 64 KB, a generated hand, prop or scene ≤ 160 KB, an icon ≤ 32 KB', () => {
  assert.ok(ART_BYTES <= 3.5 * 1024 * 1024, `${(ART_BYTES / 1024).toFixed(0)} KB`);
  const limit = name => (/^(hand|prop)-/.test(name) ? 160 : /^pet-/.test(name) ? 64 : /^bg-(duo|grip)-/.test(name) ? 160 : /^(cover|bg)-/.test(name) ? 120 : /^(mio|game|day|empty)-/.test(name) ? 48 : 32) * 1024;
  const over = Object.keys(ART).filter(n => manifest.items[n].bytes > limit(n)).map(n => `${n}: ${(manifest.items[n].bytes / 1024).toFixed(1)} KB`);
  assert.deepEqual(over, []);
});

test('art: cut-outs carry alpha, scenes keep their own light background', () => {
  for (const [name, [, , alpha]] of Object.entries(ART)) {
    const scene = /^(day|cover|bg)-/.test(name);
    assert.equal(alpha, scene ? 0 : 1, name);
  }
});

test('art: every thing of the app with a place for a picture has one', () => {
  const need = [
    ...PET.stages.flatMap(st => ['waiting', 'happy', 'rest'].map(m => `pet-${st.id}-${m}`)),
    ...['young', 'firebird'].flatMap(st => ['wave', 'read', 'star'].map(p => `pet-${st}-${p}`)),
    ...['hello', 'support', 'joy', 'focus', 'rest'].map(m => `mio-${m}`),
    ...[...TRAINING_GAMES.map(g => g.id), ASSESSMENT.id, 'tutorial'].map(id => `game-${id}`),
    ...['home', 'bird', 'progress', 'settings'].map(id => `nav-${id}`),
    ...ACHIEVEMENTS.map(a => `ach-${a.id}`), 'ach-locked',
    ...PET_ITEMS.map(i => `gift-${i.id}`),
    ...SKINS.map(s => `skin-${s.id}`),
    ...EVERYDAY.map(t => `day-${t.id}`),
    'cover-welcome', 'cover-safety', 'cover-prosthesis', 'bg-nest-room', 'bg-hero', 'empty-progress',
  ];
  assert.deepEqual(need.filter(n => !Object.hasOwn(ART, n)), []);
});

test('art: every picture the interface names exists (sectionArt, picture, badges, settings sections)', () => {
  const ui = readdirSync('src/ui').filter(f => f.endsWith('.js')).map(f => readFileSync(`src/ui/${f}`, 'utf8')).join('\n');
  const named = [
    ...[...ui.matchAll(/sectionArt\('([a-z-]+)'/g)].map(m => `ico-${m[1]}`),
    ...[...ui.matchAll(/picture\('([a-z-]+)'/g)].map(m => m[1]),
  ];
  const art = readFileSync('src/ui/art.js', 'utf8');
  const badges = art.slice(art.indexOf('BADGE_PICTURES = Object.freeze({'), art.indexOf('});', art.indexOf('BADGE_PICTURES')));
  named.push(...[...badges.matchAll(/'(ico-[a-z-]+|ach-[a-z-]+)'/g)].map(m => m[1]));
  const settings = readFileSync('src/ui/settings.js', 'utf8');
  const sections = settings.slice(settings.indexOf('const SECTION_PICTURE'), settings.indexOf('};', settings.indexOf('const SECTION_PICTURE')));
  named.push(...[...sections.matchAll(/: '([a-z]+)'/g)].map(m => `ico-${m[1]}`));
  assert.ok(named.length >= 30, `parsed ${named.length}`);
  assert.deepEqual([...new Set(named)].filter(n => !Object.hasOwn(ART, n)), []);
});

// The sample keeps a list of unused pictures (front/ICONS.md): a picture without a place is weight in the APK and a
// promise the interface does not keep. Here every picture of the catalogue has one; gesture hands may outlive a gesture
// (the set may change on 28.10 — the drill swaps «Класс» for «Трипод»).
test('art: no unused picture — every one has its place in the interface', () => {
  const src = readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js') && !f.endsWith('art-manifest.js')).map(f => readFileSync(join('src', f), 'utf8')).join('\n');
  const coach = readFileSync('src/ui/coach.js', 'utf8');
  const moods = new Set([...[...src.matchAll(/mio(?:Avatar)?\('([a-z]+)'/g)].map(m => m[1]),
    ...[...coach.slice(coach.indexOf('export function coachMood'), coach.indexOf('\n}', coach.indexOf('export function coachMood'))).matchAll(/'([a-z]+)'/g)].map(m => m[1])]);
  const family = {
    pet: n => PET.stages.some(st => n.startsWith(`pet-${st.id}-`)),
    mio: n => moods.has(n.slice(4)),
    game: n => [...TRAINING_GAMES.map(g => g.id), ASSESSMENT.id, 'tutorial'].includes(n.slice(5)),
    nav: n => ['home', 'bird', 'progress', 'settings'].includes(n.slice(4)),
    ach: n => n === 'ach-locked' || ACHIEVEMENTS.some(a => `ach-${a.id}` === n),
    gift: n => PET_ITEMS.some(i => `gift-${i.id}` === n),
    skin: n => SKINS.some(s => `skin-${s.id}` === n),
    day: n => EVERYDAY.some(t => `day-${t.id}` === n),
    obj: n => Object.hasOwn(OBJECTS, n.slice(4)),
    gesture: () => true,
    cover: n => src.includes(`coverArt('${n.slice(6)}'`) || src.includes(`cover('${n.slice(6)}'`),
    ico: n => src.includes(`'${n}'`) || src.includes(`sectionArt('${n.slice(4)}'`) || new RegExp(`: '${n.slice(4)}'[,\\s}]`).test(src),
  };
  const unused = Object.keys(ART).filter(n => !(family[n.split('-')[0]]?.(n) ?? src.includes(`'${n}'`)));
  assert.deepEqual(unused, []);
});

test('art: the canvas pictures — every Workshop object and the lock of the tutorial', () => {
  const kinds = Object.keys(OBJECTS);
  const drawnInCode = new Set(['cube', 'ring']); // 5.32: a box and a ring, drawn in grip.js, not a new picture
  assert.ok(kinds.length >= 10, kinds.join());
  assert.deepEqual(kinds.filter(k => !drawnInCode.has(k) && !CANVAS_PICTURES.includes(`obj-${OBJECTS[k].art ?? k}`)), []); // 5.31: hot tea is drawn in the cup
  assert.ok(CANVAS_PICTURES.includes('ico-lock'));
  // Rooms decode to about 4 MB each and the home screen never paints one: they load with their game.
  assert.deepEqual([...roomPictures('grip')].sort(), ['bg-grip-day', 'bg-grip-night']);
  assert.deepEqual([...roomPictures('tutorial')].sort(), ['bg-duo-day', 'bg-duo-night']);
  assert.deepEqual(roomPictures('flight'), [], 'no generated sky until the archive has room');
  const pictures = readFileSync('src/ui/pictures.js', 'utf8');
  assert.match(pictures, /names = CANVAS_PICTURES\.filter\(n => !n\.startsWith\('bg-'\)\)/);
  assert.match(readFileSync('src/ui/play.js', 'utf8'), /loadSprites\(roomPictures\(game\)\)/);
  assert.match(readFileSync('src/ui/tutorial.js', 'utf8'), /loadSprites\(roomPictures\('tutorial'\)\)/);
  assert.match(readFileSync('src/ui/tutorial.js', 'utf8'), /cleanup\(\) \{ clearTints\(\)/);
});

test('pet layout: every box inside the frame; slots by stage; the star pose leaves no head, the book no chest', () => {
  for (const [name, layout] of Object.entries(PET_LAYOUT)) {
    const [, stage, pose] = name.split('-');
    for (const [item, [cx, cy, w, rot]] of Object.entries(layout)) {
      assert.ok(w > 4 && w <= 80, `${name} ${item}: width ${w}`);
      assert.ok(cx - w / 2 >= -1 && cx + w / 2 <= 101 && cy - w / 2 >= -12 && cy + w / 2 <= 101, `${name} ${item}: [${cx}, ${cy}, ${w}]`);
      assert.ok(Math.abs(rot) <= 45, `${name} ${item}: rotation ${rot}`);
    }
    const slots = new Set(Object.keys(layout).map(i => PET_ITEMS.find(x => x.id === i).slot));
    const open = PET_SLOTS.filter(s => PET.stages.findIndex(st => st.id === stage) >= PET.stages.findIndex(st => st.id === s.from)).map(s => s.id);
    // 26.10: a bird in its nest (…-nest) is the nest itself, and lying in it, its chest is in the bowl: a chest thing
    // that does not fit above the twigs stays under the sleeping bird instead of hanging on them
    const nested = name.endsWith('-nest');
    const blocked = [...({ star: ['head'], read: ['chest'] }[pose] ?? []), ...(nested ? ['nest'] : []), ...(nested && pose === 'rest' ? ['chest'] : [])];
    const wanted = open.filter(s => !blocked.includes(s));
    if (nested && pose === 'rest' && slots.has('chest')) wanted.push('chest');
    assert.deepEqual([...slots].sort(), wanted.sort(), name);
    for (const item of PET_ITEMS) if (slots.has(item.slot) && !(nested && pose === 'rest' && item.slot === 'chest')) assert.ok(Object.hasOwn(layout, item.id), `${name}: no box for ${item.id}`);
  }
  assert.equal(Object.keys(PET_LAYOUT).length, 42, 'the 21 pictures of the team and the 21 birds in their nests');
  // every awake bird in its nest wears what is open at its stage (the pose aside)
  for (const name of Object.keys(PET_LAYOUT).filter(n => n.endsWith('-nest') && !n.includes('-rest-') && !/^pet-(egg|chick)-/.test(n) && !n.includes('-read-')))
    for (const item of ['amulet', 'beads']) assert.ok(Object.hasOwn(PET_LAYOUT[name], item), `${name}: ${item}`);
});

test('pet picture: mood and pose, and a pose gives way to what is worn where it covers', () => {
  assert.equal(petPictureName('young', 'fed'), 'pet-young-happy');
  assert.equal(petPictureName('egg', 'rest'), 'pet-egg-rest');
  assert.equal(petPictureName('firebird', 'waiting', 'wave'), 'pet-firebird-wave');
  assert.equal(petPictureName('chick', 'fed', 'star'), 'pet-chick-happy', 'a chick has no star pose');
  assert.equal(petPictureName('young', 'fed', 'dance'), 'pet-young-happy', 'an unknown pose');
  assert.equal(petPictureName('young', 'fed', 'star', { head: 'bow', chest: null, nest: 'twigs' }), 'pet-young-happy-nest', 'the bow would be under the star');
  // 26.10: with the nest of twigs worn, the bird is the picture of it sitting in the nest
  assert.equal(petPictureName('young', 'fed', null, { nest: 'twigs' }), 'pet-young-happy-nest');
  assert.equal(petPictureName('young', 'fed', 'star', { nest: 'twigs' }), 'pet-young-star-nest');
  assert.equal(petPictureName('egg', 'rest', null, { nest: 'twigs' }), 'pet-egg-rest-nest');
  assert.equal(petPictureName('young', 'fed', null, { nest: 'apples' }), 'pet-young-happy', 'apples by the nest — no nest');
  assert.deepEqual(petThings('pet-young-happy-nest', { head: 'kokoshnik', chest: 'beads', nest: 'twigs' }).map(t => t.item), ['kokoshnik', 'beads'], 'the nest is the picture');
  assert.deepEqual(petThings('pet-young-rest-nest', { chest: 'amulet', nest: 'twigs' }).map(t => t.item), [], 'the amulet is under the sleeping bird');
  assert.deepEqual(petThings('pet-young-rest-nest', { chest: 'beads', nest: 'twigs' }).map(t => t.item), ['beads'], 'beads that fit above the twigs stay visible');
  assert.equal(petPictureName('young', 'fed', 'star', { head: null, chest: 'beads', nest: 'apples' }), 'pet-young-star');
  assert.equal(petPictureName('firebird', 'fed', 'read', { chest: 'amulet' }), 'pet-firebird-happy', 'the amulet would be under the book');
  const things = petThings('pet-young-happy', { head: 'kokoshnik', chest: 'beads', nest: 'twigs' });
  assert.deepEqual(things.map(t => [t.item, t.behind]), [['kokoshnik', false], ['beads', false], ['twigs', true]]);
  assert.deepEqual(petThings('pet-egg-waiting', { head: 'bow', nest: 'lantern' }).map(t => t.item), ['lantern'], 'an egg wears nothing on a head');
});

test('26.10 the bird in its nest is one picture: its motions stay on the ground', () => {
  const css = readFileSync('styles/app.css', 'utf8'), js = readFileSync('src/ui/pictures.js', 'utf8');
  assert.match(js, /name\.endsWith\('-nest'\) \? ' nested'/, 'the box of a nest picture is marked');
  for (const [rule, name] of [[/\.firebird\.nested\.anim-hop \.fb-bird[^{]*\{ animation-name: (fb-nest-[a-z]+)/, 'fb-nest-perk'], [/\.firebird\.nested\.anim-wave \.fb-bird \{ animation-name: (fb-nest-[a-z]+)/, 'fb-nest-rock']]) {
    assert.equal(css.match(rule)?.[1], name);
  }
  for (const k of ['fb-nest-breathe', 'fb-nest-perk', 'fb-nest-rock']) {
    const frames = css.match(new RegExp(`@keyframes ${k} \\{(.*)\\}`))?.[1];
    assert.ok(frames, k);
    assert.doesNotMatch(frames, /translate/, `${k}: the nest does not leave the ground`);
  }
});

test('sprites: a game draws a picture only once it has loaded; else it keeps its drawing', () => {
  assert.equal(sprite('obj-egg-test'), null);
  const calls = [];
  const ctx = { globalAlpha: 1, save() {}, restore() {}, translate() {}, scale() {}, drawImage: (...a) => calls.push(a) };
  assert.equal(drawSprite(ctx, 'obj-egg-test', 10, 10, 40), false);
  setSprite('obj-egg-test', { complete: false, naturalWidth: 0 });
  assert.equal(drawSprite(ctx, 'obj-egg-test', 10, 10, 40), false, 'still loading');
  setSprite('obj-egg-test', { complete: true, naturalWidth: 192, naturalHeight: 192 });
  assert.equal(drawSprite(ctx, 'obj-egg-test', 10, 10, 40), true);
  assert.deepEqual(calls[0].slice(1), [-20, -20, 40, 40]);
});

test('build: dist/ carries the pictures and precaches them; the one-file build inlines every one', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['tools/build.mjs'], { stdio: 'pipe' });
  const sw = readFileSync('dist/sw.js', 'utf8');
  for (const name of Object.keys(ART)) {
    assert.ok(existsSync(`dist/art/${name}.webp`), name);
    assert.ok(sw.includes(`./art/${name}.webp`), `${name}: not precached`);
  }
  const one = readFileSync('dist/synergy-standalone.html', 'utf8');
  const inline = JSON.parse(one.match(/window\.SYNERGY_ART=(\{.*?\});<\/script>/s)[1]);
  assert.deepEqual(Object.keys(inline).sort(), Object.keys(ART).sort());
  assert.ok(Object.values(inline).every(u => u.startsWith('data:image/webp;base64,')));
  assert.ok(Buffer.byteLength(one) < 6 * 1024 * 1024, 'the one-file build stays under 6 MB (the archive limit is 30 MB)');
});

// 5.16, found on Windows: a PowerShell round trip read a UTF-8 file as Windows-1251 and wrote it back — the title of
// index.html became pairs of «Р»/«С» and a punctuation sign per letter. Two such pairs in a row never occur in Russian.
test('encoding: no file of the repository is UTF-8 read as Windows-1251 and saved again', () => {
  // The files on disk, not `git ls-files`: the gesture drill runs this suite in a copy that is not a repository (5.17).
  const skip = /^(node_modules|\.git|dist|legacy|release)(\/|$)|^android\/build\/|^tools\/\.cache\//;
  const files = readdirSync('.', { recursive: true }).map(f => String(f).replaceAll('\\', '/'))
    .filter(f => !skip.test(f) && /\.(html|md|js|mjs|css|json|xml|py|sh|kt|swift|dart|tsx?|cs|yml|webmanifest)$/.test(f));
  const twice = /(?:[РС][ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•™љ›њќћџ°±µ¶·№]){2}|вЂ[”“™¦]/;
  assert.deepEqual(files.filter(f => twice.test(readFileSync(f, 'utf8'))), []);
});

test('android: adaptive launcher icon for every density, the legacy icon and the splash of the window theme', () => {
  const xml = readFileSync('android/res/mipmap-anydpi-v26/ic_launcher.xml', 'utf8');
  assert.match(xml, /<background android:drawable="@mipmap\/ic_launcher_background"/);
  assert.match(xml, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"/);
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const f of ['ic_launcher', 'ic_launcher_foreground', 'ic_launcher_background']) assert.ok(existsSync(`android/res/mipmap-${d}/${f}.png`), `${d}/${f}`);
  }
  assert.ok(existsSync('android/res/drawable-xxhdpi/splash_bird.png'));
  assert.match(readFileSync('android/res/drawable/splash.xml', 'utf8'), /@drawable\/splash_bird/);
  assert.match(readFileSync('android/AndroidManifest.xml', 'utf8'), /android:theme="@style\/Synergy"/);
  assert.match(readFileSync('android/res/values/styles.xml', 'utf8'), /windowBackground">@drawable\/splash</);
  assert.match(readFileSync('tools/build-apk.sh', 'utf8'), /cp -r "\$ROOT\/dist\/art"/, 'the APK carries the pictures');
});
