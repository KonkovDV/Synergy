// 5.30 — meetup of 21.10.2026 (docs/TASK.md, «Митап»): controls under the hand that taps them, two prostheses, response
// within the prosthesis's ≈150 ms. Each test fails on 5.29.
import test from 'node:test';
import assert from 'node:assert/strict';
import { controlHand, sideOf, otherSide } from '../src/core/hands.js';
import { parseState } from '../src/core/storage.js';
import { GESTURE_SET_IDS } from '../src/core/gesture-set.js';

test('5.30 hands: the on-screen controls sit under the healthy hand unless chosen; two prostheses — the right hand', () => {
  assert.equal(controlHand({ side: 'right', controlHand: 'auto' }), 'left', 'prosthesis on the right → taps with the left');
  assert.equal(controlHand({ side: 'left', controlHand: 'auto' }), 'right');
  assert.equal(controlHand({ side: 'left', controlHand: 'left' }), 'left', 'a choice wins');
  assert.equal(controlHand({ side: 'left', prostheses: 'two', controlHand: 'auto' }), 'right', 'no healthy hand with two');
  assert.equal(controlHand({}), 'left', 'defaults: prosthesis on the right');
  assert.equal(otherSide('left'), 'right');
  for (const [v, want] of [['left', 'left'], ['R', 'right'], [' Левый ', 'left'], ['правая', 'right'], ['0', null], [1, null], ['up', null]]) assert.equal(sideOf(v), want, String(v));
});

test('5.30 hands: settings keep only known values (a backup cannot set a third hand)', () => {
  const ok = parseState(JSON.stringify({ version: 4, settings: { controlHand: 'right', prostheses: 'two' } }));
  assert.equal(ok.settings.controlHand, 'right'); assert.equal(ok.settings.prostheses, 'two');
  const bad = parseState(JSON.stringify({ version: 4, settings: { controlHand: 'middle', prostheses: 3 } }));
  assert.equal(bad.settings.controlHand, 'auto'); assert.equal(bad.settings.prostheses, 'one');
});

test('5.30 hands: A, the grasp, under the thumb of the tapping hand — DOM order, so focus follows the eye', async () => {
  // A minimal document (as in tests/app.test.mjs): the pads are built, not laid out.
  const noop = () => {};
  globalThis.Node ??= class Node {};
  const el = tag => Object.assign(new globalThis.Node(), { tag, attrs: {}, style: { setProperty: noop }, classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    addEventListener: noop, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, append(...c) { this.kids.push(...c); }, dataset: {}, kids: [] });
  globalThis.document ??= { documentElement: el('html'), createElement: el, createTextNode: t => Object.assign(new globalThis.Node(), { textContent: String(t) }), addEventListener: noop };
  const { createTwoChannelPads } = await import('../src/ui/controls.js');
  const emulator = { setTarget() {} };
  const order = hand => {
    globalThis.document.documentElement.dataset.hand = hand;
    return createTwoChannelPads(emulator).kids.filter(k => /\bpad(-co)?\b/.test(k.attrs.class)).map(k => (/\bpad-a\b/.test(k.attrs.class) ? 'A' : /\bpad-b\b/.test(k.attrs.class) ? 'B' : 'AB'));
  };
  assert.deepEqual(order('left'), ['A', 'AB', 'B']);
  assert.deepEqual(order('right'), ['B', 'AB', 'A']);
});

// The meetup: the prosthesis answers in ≈150 ms, and a fast answer makes it feel part of the body. The game must not add
// more than that on top of the source: measured from the first frame of a step to the command, at Motorica's ≤ 30 Hz.
test('5.30 response: from the first frame of a contraction to the command — within 150 ms, two channels and gestures', async () => {
  const { SignalPipeline } = await import('../src/core/signal.js');
  const { COMMAND } = await import('../src/core/vocabulary.js');
  const latency = (scheme, frame, want, hz = 30) => {
    const p = new SignalPipeline({ scheme });
    const step = 1000 / hz;
    let t = 0;
    for (; t < 600; t += step) p.process({ t, a: 0.01, b: 0.01, ...(scheme === 'gesture' ? { gesture: 'rest', confidence: 0.95 } : {}) }, t);
    const onset = t;
    for (; t < onset + 1000; t += step) if (p.process({ t, ...frame }, t).command === want) return t - onset;
    return Infinity;
  };
  const measured = {};
  for (const level of [0.3, 0.6, 1]) {
    measured[`threshold A ${level}`] = latency('threshold', { a: level, b: 0.01 }, COMMAND.CLOSE);
    measured[`proportional B ${level}`] = latency('proportional', { a: 0.01, b: level }, COMMAND.OPEN);
  }
  measured.gesture = latency('gesture', { a: 0, b: 0, gesture: 'fist', confidence: 0.9 }, COMMAND.CLOSE);
  for (const [k, ms] of Object.entries(measured)) assert.ok(ms <= 150, `${k}: ${Math.round(ms)} ms`);
  assert.ok(measured['threshold A 0.6'] <= 70, `a firm contraction is answered in two frames: ${measured['threshold A 0.6']}`);
});

test('5.30 two prostheses: a frame names its arm, or both arms come at once; a side is not guessed from a number', async () => {
  const { parseExternal } = await import('../src/input/bridge.js');
  assert.deepEqual(parseExternal({ a: 0.4, b: 0.1, side: 'left' }), { a: 0.4, b: 0.1, side: 'left' });
  assert.deepEqual(parseExternal('{"a":0.2,"b":0,"hand":"Правая"}'), { a: 0.2, b: 0, side: 'right' });
  assert.deepEqual(parseExternal({ version: 1, seq: 3, openLevel: 51, closeLevel: 102, connected: true, side: 'right' }), { a: 102 / 255, b: 51 / 255, seq: 3, side: 'right' }, 'a host adds the side to Motorica\'s snapshot');
  assert.deepEqual(parseExternal({ a: 0.4, b: 0.1, side: 0 }), { a: 0.4, b: 0.1 }, 'Motorica\'s hand side 0/1 is not guessed');
  assert.deepEqual(parseExternal({ left: { a: 0.5, b: 0 }, right: { gesture: 'open', confidence: 0.9 } }),
    { pair: { left: { a: 0.5, b: 0, side: 'left' }, right: { a: 0, b: 0, gesture: 'open', confidence: 0.9, side: 'right' } } });
  assert.deepEqual(parseExternal({ sides: { right: { a: 0.3, b: 0.1 } } }), { pair: { right: { a: 0.3, b: 0.1, side: 'right' } } });
  assert.equal(parseExternal({ left: { a: 'x' }, right: null }), null, 'nothing usable in a pair is no frame');
  assert.deepEqual(parseExternal({ thresholds: [40, 60], side: 'left' }), { thresholds: [60 / 255, 40 / 255] }, 'thresholds stay one pair (as Motorica Start sends them)');
});

test('5.30 two prostheses: the leading arm drives the exercise, the other is kept apart; one prosthesis takes either', async () => {
  const { BridgeSource } = await import('../src/input/bridge.js');
  let now = 1000, lead = { side: 'right', two: true };
  const src = new BridgeSource({ clock: () => now, lead: () => lead });
  src.feed({ a: 0.9, b: 0 }); // an untagged stream before any side spoke
  assert.equal(src.sample().a, 0.9, 'an untagged stream counts while no side has spoken');
  now += 10; src.feed({ left: { a: 0.2, b: 0 }, right: { a: 0.6, b: 0.1 } });
  assert.equal(src.sample().a, 0.6, 'the right leads');
  assert.equal(src.sampleSide('left').a, 0.2);
  assert.deepEqual(src.receivedBySide, { left: 1, right: 1 });
  now += 10; src.feed({ a: 0.1, b: 0.7, side: 'left' });
  assert.equal(src.sample().a, 0.6, 'a left frame does not move the right');
  lead = { side: 'left', two: true };
  assert.equal(src.sample().b, 0.7, 'switch the lead — the left drives');
  now += 10; src.feed({ a: 0.95, b: 0 });
  assert.equal(src.sample().b, 0.7, 'with two prostheses an untagged frame does not override a side');
  // seq per arm: two snapshots with the same seq from two arms are two frames
  now += 10;
  assert.equal(src.feed({ version: 1, seq: 5, openLevel: 0, closeLevel: 100, connected: true, side: 'left' }), true);
  assert.equal(src.feed({ version: 1, seq: 5, openLevel: 0, closeLevel: 50, connected: true, side: 'right' }), true);
  assert.equal(src.feed({ version: 1, seq: 5, openLevel: 0, closeLevel: 50, connected: true, side: 'right' }), false, 'a repeated seq of the same arm is no frame');
  // one arm offline: only its stream is gone
  src.feed({ version: 1, seq: 6, openLevel: 0, closeLevel: 0, connected: false, side: 'right' });
  assert.equal(src.sampleSide('right'), null); assert.ok(src.sampleSide('left'));
  // one prosthesis: a frame of either side is the prosthesis; its own side wins when both talk
  const one = new BridgeSource({ clock: () => now, lead: () => ({ side: 'left', two: false }) });
  one.feed({ a: 0.3, b: 0, side: 'right' });
  assert.equal(one.sample().a, 0.3, 'a source tagged with the other arm still drives one prosthesis');
  now += 5; one.feed({ a: 0.4, b: 0, side: 'left' });
  assert.equal(one.sample().a, 0.4);
});

test('5.30 «Две руки»: cards ask each hand at once — one, then both, then opposite commands; rest is both channels off', async () => {
  const { DuoGame, DUO_PROMPTS } = await import('../src/games/duo.js');
  const { GAME_BY_ID, sessionScheme, TRAINING_GAMES, DUO_GAMES } = await import('../src/games/registry.js');
  assert.deepEqual(DUO_PROMPTS.map(p => [p.left, p.right, p.from]), [
    ['close', 'rest', 1], ['rest', 'close', 1], ['open', 'rest', 2], ['rest', 'open', 2], ['close', 'close', 3], ['open', 'open', 3], ['close', 'open', 4], ['open', 'close', 4]]);
  assert.equal(DUO_PROMPTS[0].name, 'Левая сжимает, правая отдыхает');
  assert.equal(DUO_PROMPTS[4].name, 'Обе сжимают');
  assert.ok(DuoGame.levels.length >= 3, 'the meetup: at least three levels');
  const hand = (command, relaxed = command === 'rest') => ({ valid: true, command, relaxed });
  assert.equal(DuoGame.handMatches('rest', hand('rest')), true);
  assert.equal(DuoGame.handMatches('rest', { valid: true, command: 'rest', relaxed: false }), false, 'two tense muscles are not rest');
  assert.equal(DuoGame.handMatches('close', hand('close')), true);
  assert.equal(DuoGame.handMatches('close', { valid: false, command: 'close' }), false, 'no signal is no match');
  const g = new DuoGame({ level: DuoGame.levels[3], levelNumber: 4, scheme: 'proportional', seed: 2 });
  assert.ok(g.code.every(c => c.from <= 4));
  assert.deepEqual(g.autopilot(), { left: { a: 0, b: 0 }, right: { a: 0, b: 0 } }, 'rest first');
  assert.equal(sessionScheme(GAME_BY_ID.duo, 'gesture'), 'proportional', 'two-channel per arm');
  assert.equal(sessionScheme(GAME_BY_ID.grip, 'gesture'), 'gesture');
  assert.ok(!TRAINING_GAMES.some(e => e.id === 'duo') && DUO_GAMES.some(e => e.id === 'duo'), 'not in the one-arm plan');
});

test('5.30 «Две руки»: the hand that should rest but works lowers «Разделение»', async () => {
  const { createGame } = await import('../src/games/registry.js');
  const { runnerFor, drive } = await import('./helpers.mjs');
  const run = leak => {
    const game = createGame('duo', { levelNumber: 1, scheme: 'threshold', seed: 3 });
    const runner = runnerFor(game, { scheme: 'threshold', realism: 0.2, seed: 3, autopilot: false });
    for (let t = 0; !game.done && t < 200; t += 1 / 60) {
      const want = runner.intent ? game.autopilot() : { left: { a: 0, b: 0 }, right: { a: 0, b: 0 } };
      // a «leaky» player also squeezes the hand that should rest whenever the other one works
      const busy = want.left.a + want.left.b + want.right.a + want.right.b > 0;
      const leaky = side => (leak && busy && want[side].a + want[side].b === 0 ? { a: 0.5, b: 0 } : want[side]);
      drive(runner, { left: leaky('left'), right: leaky('right') });
      runner.step(t * 1000, 1 / 60);
    }
    return game.result();
  };
  const clean = run(false), sloppy = run(true);
  assert.ok(clean.stars >= 2, `clean: ${clean.score}`);
  assert.ok(clean.skills.separation > 85, `clean separation ${clean.skills.separation}`);
  assert.ok(sloppy.skills.separation === undefined || sloppy.skills.separation < clean.skills.separation, `sloppy ${sloppy.skills.separation} < clean ${clean.skills.separation}`);
});

// Motorica Start opens its games by package and activity; a link opens one too. The query the APK builds passes only
// known shapes (compiled with the JDK against the stubs, as tools/build-apk.sh does; skipped where there is no JDK).
test('5.30 Android: launch extras and synergy:// links become a checked query of the page', async t => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync, readdirSync, statSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  if (spawnSync('javac', ['-version']).status !== 0) { t.skip('no JDK here'); return; }
  const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.java') ? [join(d, f)] : []));
  const dir = mkdtempSync(join(tmpdir(), 'synergy-apk-'));
  try {
    const javac = (out, cp, files) => spawnSync('javac', ['-encoding', 'UTF-8', '--release', '8', '-nowarn', ...(cp ? ['-cp', cp] : []), '-d', out, ...files], { encoding: 'utf8' });
    assert.equal(javac(join(dir, 'stubs'), null, walk('android/stubs')).status, 0);
    const harness = join(dir, 'Harness.java');
    writeFileSync(harness, `package ru.synergy.trainer;
public class Harness { public static void main(String[] a) {
  String[][] cases = { {"grip", "2", "ubi4"}, {"duo", null, null}, {"../x", "2", "ubi4"}, {"grip", "100", "evil"}, {null, null, null}, {"check", "0", "synergy"}, {"grip", "3", "spr8"} };
  for (String[] c : cases) System.out.println("[" + MainActivity.launchQuery(c[0], c[1], c[2]) + "]"); } }`);
    const built = javac(join(dir, 'classes'), join(dir, 'stubs'), [...walk('android/src'), harness]);
    assert.equal(built.status, 0, built.stderr);
    const run = spawnSync('java', ['-cp', [join(dir, 'stubs'), join(dir, 'classes')].join(process.platform === 'win32' ? ';' : ':'), 'ru.synergy.trainer.Harness'], { encoding: 'utf8' });
    assert.deepEqual(run.stdout.trim().split(/\r?\n/), ['[?game=grip&level=2&gestures=ubi4&self=1]', '[?game=duo&self=1]', '[?level=2&gestures=ubi4&self=1]', '[?game=grip&self=1]', '[]', '[?game=check&gestures=synergy&self=1]', '[?game=grip&level=3&gestures=spr8&self=1]']);
    const manifest = readFileSync('android/AndroidManifest.xml', 'utf8');
    assert.match(manifest, /android:scheme="synergy" android:host="play"/);
    assert.match(manifest, /android:launchMode="singleTask"/, 'a second link reaches onNewIntent, not a second copy of the game');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The iPhone app (ios/) cannot be compiled here (no Xcode on Linux; .github/workflows/ios.yml builds it on macOS).
// What can be checked without it: the page gets the same native object on iOS and Android, links pass the same shapes,
// the standalone app does not pretend to be a host, and the versions agree.
test('5.30 iOS: SynergyNative has the methods of the Android bridge; links pass what Android passes; not a host', async () => {
  const { readFileSync } = await import('node:fs');
  const swift = readFileSync('ios/Synergy/NativeBridge.swift', 'utf8');
  const java = readFileSync('android/src/ru/synergy/trainer/MainActivity.java', 'utf8');
  const iosMethods = [...swift.matchAll(/^\s{12}(\w+): (?:\(|\w+ =>)/gm)].map(m => m[1]).sort();
  const androidMethods = [...java.matchAll(/@JavascriptInterface\s+public \w+ (\w+)\(/g)].map(m => m[1]).sort();
  assert.deepEqual(iosMethods, androidMethods, 'the same window.SynergyNative on both phones');
  for (const m of iosMethods.filter(m => m !== 'nightMode')) assert.match(swift, new RegExp(`case "${m}"`), `${m} is handled`);
  assert.match(swift, /nightMode: \(\) => !!window\.__synergyNight/, 'nightMode() answers at once, as on Android');
  assert.match(swift, /func themeChanged\(\)/, 'and follows the system theme');
  const app = readFileSync('ios/Synergy/SynergyApp.swift', 'utf8');
  // 5.32: the gesture sets come from the web's own list — the shells kept «synergy|ubi4» after spr8 joined it (5.31).
  for (const [field, pattern] of [['game', '[a-z]{2,16}'], ['level', '[1-9][0-9]?'], ['gestures', GESTURE_SET_IDS.join('|')]]) {
    assert.ok(app.includes(`value("${field}")`) && app.includes(pattern), `iOS link: ${field} ~ ${pattern}`);
    assert.ok(java.includes(pattern), `Android: ${pattern}`);
  }
  const view = readFileSync('ios/Synergy/GameView.swift', 'utf8');
  assert.ok(!/name: "synergyHost"/.test(view + swift), 'the standalone app registers no «synergyHost» (services/host.js would think it is embedded)');
  assert.match(swift, /runJavaScriptConfirmPanelWithMessage/, 'confirm() of the settings works (WKWebView ignores it without a UI delegate)');
  const spec = readFileSync('ios/project.yml', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(spec.match(/MARKETING_VERSION: "([^"]+)"/)[1], pkg.version);
  assert.equal(spec.match(/CURRENT_PROJECT_VERSION: "(\d+)"/)[1], readFileSync('android/AndroidManifest.xml', 'utf8').match(/versionCode="(\d+)"/)[1], 'one build number on both phones');
  assert.match(spec, /CFBundleURLSchemes: \[synergy\]/);
  assert.match(readFileSync('.github/workflows/ios.yml', 'utf8'), /shasum -a 256 -c/, 'XcodeGen is checked by SHA-256');
});

test('5.30 links: an exercise the app opens itself (APK or iPhone link, PWA shortcut) is not a host\'s', async () => {
  const { parseLaunch, isEmbedded } = await import('../src/services/host.js');
  const info = id => (['grip', 'duo', 'check'].includes(id) ? { levels: 8 } : null);
  const own = parseLaunch('?game=duo&level=1&self=1', info);
  assert.equal(own.game, 'duo'); assert.equal(own.self, true);
  assert.equal(isEmbedded(own, {}), false, 'no «Вернуться в приложение», the person\'s own source stays');
  assert.equal(isEmbedded(parseLaunch('?game=duo&level=1', info), {}), true, 'a host\'s ?game= is still a host');
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.ok(manifest.shortcuts.length >= 3 && manifest.shortcuts.every(x => /[?&]self=1\b/.test(x.url) && info(new URLSearchParams(x.url.split('?')[1]).get('game'))), 'shortcuts of the installed app open known games as its own');
});

// Тренер качества сигнала: the meetup — people give up when the signal is bad (interference, a loose contact).
test('5.30 signal quality: noise at rest, spikes, a frozen value and saturation are told apart; a clean signal is quiet', async () => {
  const { SignalQualityMonitor, QUALITY_TIPS } = await import('../src/core/signalquality.js');
  const cal = { rest: [0, 0], max: [1, 1] };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const stream = (seconds, f, hz = 30) => { const m = new SignalQualityMonitor({ calibration: cal }); for (let i = 0; i < seconds * hz; i++) { const t = (i / hz) * 1000; m.push({ t, ...f(t / 1000, i) }); } return m; };
  // clean: quiet rest with a squeeze in the middle
  const clean = stream(8, s => ({ a: Math.abs(0.01 * gauss()) + (s > 3 && s < 5 ? 0.6 : 0), b: Math.abs(0.01 * gauss()) }));
  assert.deepEqual(clean.issues(), []); assert.equal(clean.verdict.ok, true); assert.deepEqual(clean.summary(), []);
  // interference: the rest line does not settle
  const noisy = stream(8, () => ({ a: Math.max(0, 0.07 + 0.1 * gauss()), b: 0.02 }));
  assert.deepEqual(noisy.issues(), ['noise']);
  assert.equal(noisy.verdict.tip, QUALITY_TIPS.noise.tip);
  assert.ok(noisy.summary().some(x => x.id === 'noise' && x.seconds >= 4), 'how long, for the specialist');
  // the same noise centred on the calibrated rest (the calibration takes the median of rest): half of it is under the
  // rest line, and the spread is still seen
  const centred = new SignalQualityMonitor({ calibration: { rest: [0.2, 0.2], max: [1.2, 1.2] } });
  for (let i = 0; i < 240; i++) centred.push({ t: (i / 30) * 1000, a: 0.2 + 0.1 * gauss(), b: 0.2 + 0.005 * gauss() });
  assert.deepEqual(centred.issues(), ['noise']);
  // a slipping electrode: one-frame jumps that come back
  const spiky = stream(6, (s, i) => ({ a: i % 25 === 0 ? 0.85 : 0.02, b: 0.02 }));
  assert.ok(spiky.issues().includes('spikes'), JSON.stringify(spiky.issues()));
  // a frozen stream above rest
  const frozen = stream(5, s => ({ a: s > 2 ? 0.5 : 0.02 + 0.01 * rnd(), b: 0.01 + 0.01 * rnd() }));
  assert.ok(frozen.issues().includes('stuck'));
  // too strong: at the top of the span for seconds (the raw value still moves)
  const strong = stream(6, s => ({ a: s > 2 ? 1.2 + 0.05 * rnd() : 0.02, b: 0.02 * rnd() }));
  assert.deepEqual(strong.issues(), ['saturation']);
  // a held contraction under the top is not an issue; nor is a duplicate frame
  const held = stream(6, s => ({ a: s > 1 ? 0.7 + 0.02 * gauss() : 0.02, b: 0.02 * rnd() }));
  assert.deepEqual(held.issues(), []);
  const m = new SignalQualityMonitor({ calibration: cal });
  m.push({ t: 0, a: 0, b: 0 }); m.push({ t: 0, a: 1, b: 1 }); m.push(null); m.push({ t: 'x', a: 0, b: 0 });
  assert.equal(m.samples.length, 1);
});

test('5.30 session length: the plan fits the meetup\'s 5–10 min; under 5 min one more exercise is offered, never on a stop or a light day', async () => {
  const { sessionTopUp, buildDailyPlan, createProfile } = await import('../src/core/progress.js');
  const { PLAN_CATALOG } = await import('../src/games/registry.js');
  const { SESSION } = await import('../src/config.js');
  const { playNovice } = await import('./helpers.mjs');
  assert.deepEqual(SESSION.activeMin, [5, 10]);
  const plan = buildDailyPlan(createProfile(), [], PLAN_CATALOG, 'proportional', '2026-10-22');
  const first = plan.items.find(i => !i.retention);
  assert.deepEqual(sessionTopUp({ plan, secondsToday: 200 }), { game: first.game, level: first.level, minutes: 3 });
  assert.equal(sessionTopUp({ plan, secondsToday: 5 * 60 }), null, 'five minutes — enough');
  assert.equal(sessionTopUp({ plan, secondsToday: 100, stopAdvice: 'Пора отдохнуть' }), null, 'fatigue or the cap — no offer');
  assert.equal(sessionTopUp({ plan, secondsToday: 100, light: true }), null, 'a light day — no offer');
  // Measured, not assumed: a beginner's plan (novice bot: reaction 0.25 s, noise, lapses) is under 10 minutes of play.
  const playS = plan.items.reduce((sum, i) => sum + playNovice(i.game, { scheme: 'proportional', levelNumber: i.level }).durationS, 0);
  const restS = (plan.items.length - 1) * SESSION.restBetweenExercisesS;
  assert.ok(playS + restS < SESSION.activeMin[1] * 60, `plan ${playS} s of play + ${restS} s of rest`);
});

test('5.30 lab stream: a recognizer\'s decision and its distribution together — the label decides, the distribution is shown', async () => {
  const { parseExternal, CLASS_ORDER } = await import('../src/input/bridge.js');
  // what bridge/ws_bridge.py --lab sends (lab/lab7.py Classifier7.predict)
  const f = parseExternal(JSON.stringify({ gesture: 'pinch', confidence: 0.7, probs: { rest: 0.05, fist: 0.15, pinch: 0.7, open: 0.1 }, a: 0.4, b: 0.1 }));
  assert.equal(f.gesture, 'pinch'); assert.equal(f.confidence, 0.7);
  assert.equal(f.probs.length, CLASS_ORDER.length);
  assert.ok(Math.abs(f.probs[CLASS_ORDER.indexOf('pinch')] - 0.7) < 0.06, 'aligned to our class order');
  // a broken distribution is not shown; the decision stays
  const g = parseExternal(JSON.stringify({ gesture: 'fist', confidence: 0.9, probs: 'oops', a: 0.5, b: 0 }));
  assert.equal(g.gesture, 'fist'); assert.equal(g.probs, undefined);
});
