import './pin-tz.mjs'; // the set of the published task — the product's default: this file runs on it whatever the runner chose
// 6.3.2 — audit of 09.11.2026, evening (docs/AUDIT.md §61). Since 6.0 the product starts in the gesture set of the task,
// while the suite of earlier releases stays pinned to the «Синергия» set (tests/pin-set.mjs). In the default set the hand
// of the two channels took its grips, their names and the pose of «Сжатие» from the closing gestures — and the task's
// set has one, wrist flexion: one grip called «Сгибание», no grip switch in «Мастерская», a hand that closed half-way
// instead of into a fist, a tutorial that repeated «Сгибание» and never showed the wrist. Every test here failed on 6.3.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HAND } from '../src/config.js';
import { GESTURE_SET, GESTURES, HAND_GRIPS, GRIP_NAME, GRIP_POSE, GRIPS_ARE_GESTURES, COMMAND_POSE, COMMAND, CLOSING_GESTURES, gripGesture, closingGestureWord, gestureLegend } from '../src/core/vocabulary.js';
import { BionicHand } from '../src/core/hand.js';
import { SignalPipeline } from '../src/core/signal.js';
import { tutorialSteps, TutorialRun } from '../src/core/tutorial.js';
import { PRIMER } from '../src/core/primer.js';
import { poseHint } from '../src/core/restmotion.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { BridgeSource, AMPLITUDE_FRESH_MS } from '../src/input/bridge.js';
import { GameRunner } from '../src/games/runner.js';
import { createGame, GAMES, howFor } from '../src/games/registry.js';
import { OBJECTS, objectGrip } from '../src/games/grip.js';
import { handBlend } from '../src/render/bionic.js';
import { handsFreeText } from '../src/ui/widgets.js';

const rest = { valid: true, scheme: 'proportional', command: 'rest', intensity: 0, aOn: false, bOn: false, co: false };
const open = { ...rest, command: 'open', intensity: 0.6, bOn: true };
const close = { ...rest, command: 'close', intensity: 0.8, aOn: true };
const hold = (hand, intent, s) => { for (let t = 0; t < s; t += 1 / 60) hand.update(intent, 1 / 60); };

/** A canvas stand-in that remembers the text a game draws: { text, x, y, px } (px — the font size at that moment). */
function inkRecorder() {
  const texts = [];
  const px = o => Number(/(\d+(?:\.\d+)?)px/.exec(o.font ?? '')?.[1] ?? 16);
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'fillText' ? (t, x, y) => { texts.push({ text: String(t), x, y, px: px(o) }); }
      : k === 'measureText' ? t => ({ width: String(t).length * px(o) * 0.55 }) : typeof k === 'string' && k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts };
}

test('6.3.2 default set: the hand of two channels has its own three grips — not the one closing class of the СПППР', () => {
  assert.equal(GESTURE_SET.id, 'tz', 'this file runs on the product\'s default set');
  assert.equal(GRIPS_ARE_GESTURES, false, 'wrist flexion closes the hand but is no grip');
  assert.deepEqual(HAND.twoChannelGrips, ['fist', 'pinch', 'key']);
  assert.deepEqual(HAND_GRIPS.map(g => g.name), ['Кулак', 'Щепоть', 'Ключ']);
  assert.deepEqual(GRIP_NAME, { fist: 'Кулак', pinch: 'Щепоть', key: 'Ключ' }, 'no grip is called «Сгибание»');
  for (const g of HAND_GRIPS) assert.equal(GRIP_POSE[g.grip].length, 5, `${g.grip}: a pose of five fingers`);
  assert.equal(gripGesture('pinch').id, CLOSING_GESTURES[0].id, 'in the gesture scheme every grip is taken by the one closing class');
  assert.equal(closingGestureWord(), '«Сгибание»');
  assert.match(gestureLegend(), /Сгибание — закрыть кисть/);
  assert.doesNotMatch(gestureLegend(), /нужным хватом/, 'there is no grip to choose by a gesture');
});

test('6.3.2 default set: «Сжатие» closes the hand into a fist — the picture of the fist, not of rest', () => {
  const fingers = p => (p[1] + p[2] + p[3] + p[4]) / 4;
  assert.ok(fingers(COMMAND_POSE.close) >= 0.95, `the pose of «Сжатие» bends the fingers fully: ${COMMAND_POSE.close}`);
  assert.notDeepEqual(COMMAND_POSE.switch, COMMAND_POSE.close, 'the card of a grip switch shows the next grip');
  const hand = new BionicHand();
  hold(hand, close, 1.5);
  assert.equal(hand.closure, 1);
  assert.deepEqual(handBlend(hand.pose()), ['rest', 'close', 1], 'drawBionic shows the fist (6.3.1: [rest, close, 0.41] — the rest picture)');
  // the gesture scheme: flexion of the wrist closes the prosthesis — into the same fist
  const stream = new BionicHand();
  const flexion = { valid: true, scheme: 'gesture', command: 'close', gesture: 'flexion', intensity: 0.9, aOn: true, bOn: false, co: false };
  hold(stream, flexion, 2);
  assert.deepEqual(handBlend(stream.pose()), ['rest', 'close', 1]);
});

test('6.3.2 default set: the hand switches its grip the way the settings say — fist, pinch, key and round again', () => {
  const hand = new BionicHand({ holdOpenS: 0.8 });
  assert.equal(hand.grip, 'fist');
  hold(hand, rest, 0.2); hold(hand, open, 0.9);
  assert.equal(hand.grip, 'pinch', 'the opening signal again at the open hand (Motorica)');
  hold(hand, rest, 0.2); hold(hand, open, 0.9);
  assert.equal(hand.grip, 'key');
  hold(hand, rest, 0.2); hold(hand, open, 0.9);
  assert.equal(hand.grip, 'fist');
  const co = new BionicHand({ switchMode: 'co' });
  const both = { ...rest, command: 'switch', intensity: 0.7, aOn: true, bOn: true, co: true };
  co.update(both, 1 / 60);
  assert.equal(co.grip, 'pinch', 'or a co-contraction');
});

test('6.3.2 default set: «Мастерская» asks for a pinch and a key again in the two-channel schemes, and the bot switches', () => {
  assert.equal(OBJECTS.coin.grip, 'pinch'); assert.equal(OBJECTS.berry.grip, 'pinch'); assert.equal(OBJECTS.ring.grip, 'pinch');
  assert.equal(OBJECTS.card.grip, 'key'); assert.equal(OBJECTS.key.grip, 'key'); assert.equal(OBJECTS.egg.grip, 'fist');
  for (const kind of Object.keys(OBJECTS)) assert.equal(objectGrip(kind, 'gesture'), 'fist', `${kind}: the gesture scheme has one closing class`);
  for (const scheme of ['proportional', 'threshold']) {
    const game = createGame('grip', { levelNumber: 4, scheme, seed: 3 });
    const emulator = new EmgEmulator({ realism: 0.3, seed: 3 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
    const grips = new Set(), hints = new Set();
    for (let t = 0; !game.done && t < 240000; t += 1000 / 60) { runner.step(t, 1 / 60); if (game.current) grips.add(game.current.grip); hints.add(game.hint); }
    assert.ok(game.done, `${scheme}: the level ends`);
    assert.deepEqual([...grips].sort(), ['fist', 'pinch'], `${scheme}: level 4 — apple, coin, can, coin, egg, coin`);
    const r = game.result();
    assert.ok(r.details.switches >= 3, `${scheme}: the grip was switched for the coins — ${r.details.switches} (6.3.1: 0)`);
    assert.ok(Number.isFinite(r.skills.switching), `${scheme}: «Переключение» is measured (6.3.1: never)`);
    assert.ok(r.stars >= 2, `${scheme}: the bot still plays the level — ${r.score}`);
    assert.ok([...hints].some(h => /хват «Щепоть»/.test(h)), `${scheme}: the hint names the grip`);
    assert.ok(![...hints].some(h => /Сгибание/.test(h)), `${scheme}: no grip is called by a wrist movement`);
  }
});

test('6.3.2 default set: the grip badge shows a grip, and is not drawn where there is nothing to choose', () => {
  const draw = scheme => {
    const game = createGame('grip', { levelNumber: 1, scheme, seed: 1 });
    const { ctx, texts } = inkRecorder();
    game.update(1, { ...rest, scheme, gesture: scheme === 'gesture' ? 'rest' : null }, new BionicHand());
    game.render(ctx, { w: 360, h: 600 }, new BionicHand(), rest);
    return { texts: texts.map(t => t.text), hint: game.hint };
  };
  const two = draw('proportional');
  assert.ok(two.texts.includes('Хват: Кулак'), `two channels: ${two.texts.filter(t => /Хват/.test(t))}`);
  assert.ok(two.texts.includes('Нужен: Кулак'));
  const stream = draw('gesture');
  assert.ok(!stream.texts.some(t => /Хват:|Нужен:/.test(t)), 'the gesture scheme of the СПППР: no «Хват: Сгибание · Нужен: Сгибание»');
  assert.match(stream.hint, /держите «Сгибание» до зелёной зоны/);
});

test('6.3.2 default set: «Первые шаги» in the gesture scheme show every movement of the dictionary once', () => {
  const ids = tutorialSteps('gesture').map(s => s.gesture).filter(Boolean);
  const active = GESTURES.filter(g => g.command !== COMMAND.REST).map(g => g.id);
  assert.deepEqual([...ids].sort(), [...active].sort(), 'flexion, extension and the four movements of the wrist');
  assert.equal(new Set(ids).size, ids.length, 'no step is asked twice (6.3.1: «Сгибание» again as a «second grip»)');
  const steps = tutorialSteps('gesture');
  assert.equal(new Set(steps.map(s => s.id)).size, steps.length, 'step ids are unique');
  for (const [k, s] of steps.entries()) if (s.gesture) assert.match(steps[k + 1]?.id ?? '', /^relax/, `${s.id}: rest after every movement`);
  // a step of the wrist completes on that gesture only
  const run = new TutorialRun('gesture');
  while (run.step && run.step.gesture !== 'pronation') run.skipStep();
  const intent = g => ({ valid: true, scheme: 'gesture', gesture: g, command: g === 'rest' ? 'rest' : 'wrist', relaxed: g === 'rest' });
  for (let i = 0; i < 90; i++) run.update(intent('supination'), 1 / 60);
  assert.equal(run.step.gesture, 'pronation', 'another movement does not pass the step');
  for (let i = 0; i < 90; i++) run.update(intent('pronation'), 1 / 60);
  assert.notEqual(run.step.gesture, 'pronation');
});

test('6.3.2 default set: the step «Смена хвата» of the two channels really changes the grip of the hand on the screen', () => {
  const run = new TutorialRun('proportional');
  const hand = new BionicHand();
  const pipeline = new SignalPipeline({ scheme: 'proportional' });
  let t = 0;
  const feed = (frame, s) => { for (let k = 0; k < s * 60; k++) { t += 1000 / 60; const i = pipeline.process({ t, ...frame }, t); hand.update(i, 1 / 60); run.update(i, 1 / 60); } };
  while (run.step && run.step.id !== 'grip-switch') {
    const id = run.step.id;
    feed(id === 'close' ? { a: 0.7, b: 0.02 } : id === 'open' ? { a: 0.02, b: 0.7 } : { a: 0.02, b: 0.02 }, 1.6);
    assert.ok(t < 60000, `stuck at ${id}`);
  }
  assert.equal(hand.grip, 'fist');
  feed({ a: 0.02, b: 0.7 }, 1.4);
  assert.equal(hand.grip, 'pinch', 'the hand shows what the step teaches (6.3.1: one grip — nothing changed)');
});

test('6.3.2 default set: the words of the gesture scheme name the one closing gesture, the primer names the grips', () => {
  assert.match(handsFreeText('gesture', 1, 'старт'), /удерживайте «Сгибание»/);
  assert.doesNotMatch(handsFreeText('gesture', 1, 'старт'), /любой хват/);
  assert.match(handsFreeText('proportional', 1, 'старт'), /сжатие \(A\)/);
  const how = id => howFor(GAMES.find(g => g.id === id), 'gesture').join(' ');
  assert.doesNotMatch(how('grip'), /например|Хват — тот/, 'one closing gesture is not «an example», and there is no grip to change by a gesture');
  assert.match(how('grip'), /Держите «Сгибание»/);
  assert.match(how('flight'), /^«Сгибание» — набрать высоту/);
  assert.match(how('rhythm'), /Левая дорожка — «Сгибание»/);
  const deck = PRIMER.find(d => d.id === 'grip');
  const card = deck.cards.find(c => c.id === 'grips').back();
  assert.match(card, /«Кулак»/); assert.match(card, /«Щепоть»/); assert.match(card, /«Ключ»/);
  assert.doesNotMatch(card, /Сгибание/);
  assert.ok(deck.check().some(q => q.id === 'grip-use'), 'the question about grips is asked (6.3.1: dropped — one «grip»)');
});

test('6.3.2 art: «Приведение» and «Отведение» are the corrected pictures — tilt towards the arrow, one hand in both', () => {
  const manifest = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
  const old = { 'gesture-adduction': 'a75fbbd2bf303aa0e3a1123b5aab232ee22f11da5c2b586896f435e84f90ffa2', 'gesture-abduction': '8e4b016cda645b58508c8e3e65c731df4bcbe634743b3c624eb452d2b39e38b0' };
  for (const [name, was] of Object.entries(old)) {
    const sha = createHash('sha256').update(readFileSync(`public/art/${name}.webp`)).digest('hex');
    assert.notEqual(sha, was, `${name}: the picture of 6.3.1 leaned against its own arrow`);
    assert.equal(manifest.items[name].sha256, sha);
    assert.match(manifest.items[name].fixed ?? '', /fix-deviation-art\.py/, `${name}: the catalogue says how it was made`);
  }
  assert.ok(existsSync('tools/fix-deviation-art.py'));
  assert.match(readFileSync('docs/ART.md', 'utf8'), /fix-deviation-art\.py/, 'docs/ART.md tells where the two pictures come from');
});

test('6.3.2 «Сейф»: «Протез видит» is under the feet of the safe, the safe stands in the middle of the room, the pose hint keeps its size', () => {
  const frame = (w, h) => {
    const game = createGame('safe', { levelNumber: 1, scheme: 'gesture', seed: 1 });
    const { ctx, texts } = inkRecorder();
    const intent = { ...rest, scheme: 'gesture', gesture: 'rest', relaxed: true };
    game.update(0.05, intent, new BionicHand());
    assert.equal(game.phase, 'rest');
    game.render(ctx, { w, h }, new BionicHand(), intent);
    return { texts, game };
  };
  const tall = frame(390, 680);
  const seen = tall.texts.find(t => t.text.startsWith('Протез видит'));
  assert.ok(seen.y > 680 * 0.8 && seen.y <= 680 - 10, `a tall field: the line under the safe in the middle of the room — y ${Math.round(seen.y)} (6.3.1: 463, on the feet, half the field empty below)`);
  const short = frame(390, 420).texts.find(t => t.text.startsWith('Протез видит'));
  assert.ok(short.y <= 420 - 10, `a short field: the line stays in the field — y ${Math.round(short.y)}`);
  const first = poseHint(tall.game.index).split('. ')[0];
  const lines = tall.texts.filter(t => first.includes(t.text.replace(/\.$/, '')) && t.text !== 'Покой');
  assert.equal(lines.map(t => t.text).join(' '), `${first}.`, 'the card says what to do: the first sentence of the pose hint, whole');
  for (const t of lines) assert.ok(t.px >= 12, `«${t.text}» at ${t.px} px (6.3.1: the whole hint on one line, shrunk to ≈ 9 px)`);
});

test('6.3.2 both streams from a host: in a scheme of two channels the amplitudes drive the exercise, in the gesture scheme the СПППР', () => {
  let now = 1000;
  const packet = i => ({ timestamp_ms: 1000 + i * 100, dist: { neutral: 0.1, flexion: 0.8, extension: 0.02, pronation: 0.02, supination: 0.02, adduction: 0.02, abduction: 0.02 } });
  const run = channels => {
    const src = new BridgeSource({ clock: () => now, channels: () => channels });
    now = 1000;
    for (let i = 0; i < 5; i++) { now += 100; src.feed(packet(i)); }
    src.feed({ a: 0.5, b: 0.1 });
    return src;
  };
  const two = run(true);
  assert.equal(two.sample(now).a, 0.5, 'two channels: the amplitude frame (6.3.1: the probability of flexion became A)');
  assert.ok(!two.sample(now).stable);
  assert.ok(two.sample(now + AMPLITUDE_FRESH_MS + 50)?.stable, 'the amplitudes stopped: the stream drives again');
  const gesture = run(false);
  assert.ok(gesture.sample(now).stable, 'the gesture scheme reads the stream');
  assert.equal(new BridgeSource().channels(), false, 'a source without the option keeps the old rule');
});

test('6.3.2 iOS: the game under its own origin, the screen stays on, a privacy manifest, the return to the caller', () => {
  const read = f => readFileSync(f, 'utf8');
  const view = read('ios/Synergy/GameView.swift'), bridge = read('ios/Synergy/NativeBridge.swift');
  const handler = read('ios/Synergy/BundleSchemeHandler.swift'), launch = read('ios/Synergy/LaunchRequest.swift'), spec = read('ios/project.yml');
  assert.match(view, /setURLSchemeHandler\(BundleSchemeHandler\(\), forURLScheme: BundleSchemeHandler\.scheme\)/, 'synergy-app://game/ — WKURLSchemeHandler');
  assert.match(view, /web\.load\(URLRequest\(url: url\)\)/);
  assert.doesNotMatch(view, /loadFileURL/, 'not from file:// any more (6.3.1)');
  assert.match(handler, /static let scheme = "synergy-app"/);
  assert.match(handler, /hasPrefix\(root\.path \+ "\/"\)/, 'nothing out of «dist»');
  assert.match(bridge, /url\.scheme == BundleSchemeHandler\.scheme, url\.host == BundleSchemeHandler\.host \{ return \.allow \}/);
  assert.match(view, /isIdleTimerDisabled = true/, 'the screen stays on while the game is played by muscle signals…');
  assert.match(read('android/src/ru/synergy/trainer/MainActivity.java'), /FLAG_KEEP_SCREEN_ON/, '…as on Android');
  assert.match(view, /allowsLinkPreview = false/);
  assert.match(read('styles/app.css'), /\.controls, \.controls \*, img\.pic[^{]*\{ -webkit-touch-callout: none \}/, 'no system menu on a held pad (Safari, the PWA, the app)');
  const privacy = read('ios/Synergy/PrivacyInfo.xcprivacy');
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(privacy, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  assert.match(spec, /path: Synergy\/PrivacyInfo\.xcprivacy\n\s+buildPhase: resources/, 'the manifest is a resource of the app');
  assert.match(launch, /returnURL = LaunchRequest\.returnTarget\(value\("x-success"\)\)/, 'x-success of a launch link');
  assert.match(launch, /forbiddenReturn: Set<String> = \["http", "https", "file", "javascript"/, 'never a web page, a file or a script');
  assert.match(bridge, /case "synergy:close":/, 'the answer goes back on «synergy:close» (services/host.js closeMessage)');
  assert.ok(existsSync('tools/check-ios.sh') && existsSync('tests/ios/main.swift') && existsSync('ios/stubs/WebKit.swift'));
});

test('6.3.2 iOS: the Swift code type-checks against the SDK stubs and its unit tests pass (tools/check-ios.sh, needs SWIFTC)', t => {
  const swiftc = process.env.SWIFTC;
  if (!swiftc) { t.skip('нет Swift: SWIFTC=/путь/к/swiftc npm test — проверка типов и тесты логики iOS (tools/check-ios.sh)'); return; }
  const run = spawnSync('sh', ['tools/check-ios.sh'], { encoding: 'utf8', env: { ...process.env, SWIFTC: swiftc } });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /iOS tests: all passed/);
});

