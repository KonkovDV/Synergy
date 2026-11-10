import './pin-tz.mjs'; // the set of the task — imported FIRST (tests/pin-tz.mjs)
// 6.2.1 — the audit of 06.11, evening. Each test failed on 6.2.0:
//   • answer 25 of the organizers («потерю больше 1–2 секунд считать критической и выходить»): a silent СПППР stream
//     was declared lost 1.8 s after its last packet and paused 2.8 s after it — the watchdog waited a second time on top
//     of the decoder's own limit, and the pause counted one more second from there;
//   • «Созвездие» started by a host or a link in a two-channel scheme (the default one is proportional) drew gesture pads
//     over a pipeline of channels: its spark never moved;
//   • Motorica Start lists its games in a catalog since 05.11 (public source): the entry of «Синергия» follows the builds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// One clock for the page, the bridge's arrival stamps and the play loop: the timings below are exact, not real time.
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });

const noop = () => {};
const target = () => ({ addEventListener: noop, removeEventListener: noop });
const store = new Map();
globalThis.window = Object.assign(globalThis, target());
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.Node = class Node {};
const canvas2d = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop) });
const el = tag => Object.assign(new Node(), { tag, attrs: {}, style: { setProperty: noop }, classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, addEventListener(type, fn) { (this.on ??= {})[type] = fn; }, focus: noop,
  setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, toggleAttribute: noop, append(...c) { this.kids.push(...c); }, appendChild(c) { this.kids.push(c); return c; }, remove: noop, replaceChildren(...c) { this.kids = [...c]; },
  getContext: () => canvas2d, getBoundingClientRect: () => ({ width: 360, height: 400, top: 0, left: 0, bottom: 400, right: 360 }), querySelector: () => null, querySelectorAll: () => [], closest: () => null, offsetHeight: 60, dataset: {}, kids: [] });
globalThis.document = { ...target(), documentElement: el('html'), createElement: el, createElementNS: (_, tag) => el(tag), createTextNode: t => Object.assign(new Node(), { textContent: String(t) }), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, hidden: false, body: el('body'), getAnimations: () => [] };
globalThis.requestAnimationFrame = noop;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.history = { state: null, pushState: noop, back: noop };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.scrollTo = noop; globalThis.scrollBy = noop; globalThis.innerHeight = 844; globalThis.getComputedStyle = () => ({ position: 'static' });
globalThis.Image = class { set src(_) {} addEventListener() {} decode() { return Promise.resolve(); } };

const { App } = await import('../src/app.js');
const { BridgeSource } = await import('../src/input/bridge.js');
const { SignalPipeline, LossWatch } = await import('../src/core/signal.js');
const { sppprPacket } = await import('../src/core/spppr.js');
const { toEmulatorTarget } = await import('../src/games/runner.js');
const { SIGNAL, SPPPR } = await import('../src/config.js');

const nodes = n => [n, ...(n?.kids ?? []).flatMap(nodes)];
const button = (root, label) => nodes(root).find(x => x.tag === 'button' && nodes(x).some(k => k.textContent === label));
const overlay = screen => nodes(screen.node).find(n => n.attrs?.role === 'dialog');
/** The pause «Сигнал потерян» is on the screen. */
const signalPause = screen => { const o = overlay(screen); return o?.hidden === false && nodes(o).some(n => n.textContent === 'Сигнал потерян'); };
const NEUTRAL = [0.88, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02];
const FRAME_MS = 1000 / 60;

test('ответ № 25: a silent СПППР link is lost at SPPPR.linkLostMs after its last packet — the watchdog does not wait again', () => {
  for (const hz of [50, 10]) {
    let now = 0, last = 0;
    const src = new BridgeSource({ clock: () => now });
    const pipe = new SignalPipeline({ scheme: 'gesture' });
    let lostAfter = null;
    for (now = 0; now < 6000 && lostAfter === null; now += FRAME_MS) {
      if (now < 2000 && now - last >= 1000 / hz) { src.feed(JSON.stringify(sppprPacket(Math.round(7000 + now), NEUTRAL))); last = now; }
      const intent = pipe.process(src.sample(now), now);
      if (now > 2000) {
        if (!intent.valid) lostAfter = now - last;
        else assert.ok(now - last <= SPPPR.linkLostMs + FRAME_MS + 1, `${hz} Hz: still valid ${Math.round(now - last)} ms after the last packet`);
      }
    }
    assert.ok(lostAfter > SPPPR.linkLostMs - 1 && lostAfter <= SPPPR.linkLostMs + FRAME_MS + 1, `${hz} Hz: lost ${Math.round(lostAfter)} ms after the last packet, not ${SPPPR.linkLostMs}`);
  }
  // Two channels keep their watchdog: «сигнал потерян» a frame after frameTimeoutMs.
  let now = 0, last = 0, lostAfter = null;
  const src = new BridgeSource({ clock: () => now });
  const pipe = new SignalPipeline({ scheme: 'proportional' });
  for (now = 0; now < 4000 && lostAfter === null; now += FRAME_MS) {
    if (now < 2000) { src.feed({ a: 0.4, b: 0.02 }); last = now; }
    if (!pipe.process(src.sample(now), now).valid && now > 2000) lostAfter = now - last;
  }
  assert.ok(lostAfter > SIGNAL.frameTimeoutMs && lostAfter <= SIGNAL.frameTimeoutMs + FRAME_MS + 1, `two channels: ${Math.round(lostAfter)} ms`);
});

test('ответ № 25: the critical pause counts the silence of the source — once per loss, inside the organizers\' 1–2 s', () => {
  assert.ok(SIGNAL.criticalLossMs >= 1000 && SIGNAL.criticalLossMs <= 2000, 'inside «1–2 s»');
  assert.ok(SIGNAL.criticalLossMs >= SPPPR.linkLostMs, 'the stream rides on inertia up to its own limit first');
  const w = new LossWatch();
  assert.equal(w.update(false, 0), false, 'a signal: nothing to say');
  assert.equal(w.update(true, SIGNAL.criticalLossMs - 1), false, 'a shorter silence rides on');
  assert.equal(w.update(true, SIGNAL.criticalLossMs), true, 'critical: told');
  assert.equal(w.update(true, 10 * SIGNAL.criticalLossMs), false, 'once for this loss');
  assert.equal(w.update(false, 0), false, 'the signal came back');
  assert.equal(w.update(true, SIGNAL.criticalLossMs), true, 'a new loss is told again');
  // Resumed with the signal still gone: the silence of the running exercise counts from the press, a full `ms` again —
  // even when no frame of the pause came in between.
  assert.equal(w.update(true, 0), false);
  assert.equal(w.update(true, SIGNAL.criticalLossMs - 1), false);
  assert.equal(w.update(true, SIGNAL.criticalLossMs), true);
});

/** A play screen on the external source; returns how long after the last data the pause came, and the app. */
function loseSignal(kind) {
  store.clear();
  const app = new App(el('main'));
  app.profile.onboarded = true;
  app.updateSettings({ source: 'bridge', wsUrl: '', scheme: kind === 'stream' ? 'gesture' : 'proportional' });
  app.go('play', { game: 'grip', level: 1 });
  let last = -Infinity;
  const feed = now => {
    if (kind === 'stream') { if (now - last >= 20) { window.Synergy.feed(JSON.stringify(sppprPacket(Math.round(40000 + now), NEUTRAL))); last = now; } }
    else { window.Synergy.feed({ a: 0.02, b: 0.02 }); last = now; }
  };
  const tick = (withSignal = false) => { clock += FRAME_MS; if (withSignal) feed(clock); app.screen.tick(clock, 1 / 60); };
  button(app.screen.node, 'Старт').on.click();
  for (let i = 0; i < 60 * 4; i++) tick(true); // 3-2-1, then a second of play with the signal
  assert.equal(app.screen.blockState().phase, 'running');
  assert.equal(signalPause(app.screen), false);
  let pausedAfter = null;
  for (let i = 0; i < 60 * 5 && pausedAfter === null; i++) { tick(); if (signalPause(app.screen)) pausedAfter = clock - last; }
  return { app, pausedAfter, tick };
}

test('ответ № 25 on the play screen: a lost stream and lost channels pause the exercise inside 1–2 s of silence', () => {
  for (const kind of ['stream', 'channels']) {
    const { app, pausedAfter, tick } = loseSignal(kind);
    assert.ok(pausedAfter !== null, `${kind}: the exercise paused`);
    assert.ok(pausedAfter >= 1000 && pausedAfter <= 2000, `${kind}: paused ${Math.round(pausedAfter)} ms after the last data (answer 25: 1–2 s)`);
    assert.ok(Math.abs(pausedAfter - SIGNAL.criticalLossMs) <= 2 * FRAME_MS, `${kind}: ${Math.round(pausedAfter)} ms, the rule says ${SIGNAL.criticalLossMs}`);
    // «Продолжить» while the signal is still gone: no pause at once, the same rule again from the moment of the press.
    button(overlay(app.screen), 'Продолжить').on.click();
    let again = null;
    const resumed = clock;
    for (let i = 0; i < 60 * 4 && again === null; i++) { tick(); if (signalPause(app.screen)) again = clock - resumed; }
    assert.ok(again !== null && Math.abs(again - SIGNAL.criticalLossMs) <= 2 * FRAME_MS, `${kind}: paused again ${again === null ? 'never' : Math.round(again)} ms after «Продолжить»`);
    // The signal is back and the person goes on: the exercise runs.
    button(overlay(app.screen), 'Продолжить').on.click();
    for (let i = 0; i < 60 * 3; i++) tick(true);
    assert.equal(signalPause(app.screen), false, `${kind}: with the signal back it runs`);
    assert.equal(app.screen.session().runner.signalLost, false);
  }
});

test('ответ № 25: a signal gone during the 3-2-1 pauses the exercise as it starts, not 1.5 s into a frozen field', () => {
  store.clear();
  const app = new App(el('main'));
  app.profile.onboarded = true;
  app.updateSettings({ source: 'bridge', wsUrl: '', scheme: 'proportional' });
  app.go('play', { game: 'grip', level: 1 });
  const tick = feed => { clock += FRAME_MS; if (feed) window.Synergy.feed({ a: 0.02, b: 0.02 }); app.screen.tick(clock, 1 / 60); };
  for (let i = 0; i < 30; i++) tick(true);
  button(app.screen.node, 'Старт').on.click();
  for (let i = 0; i < 30; i++) tick(true); // half a second of the 3-2-1 with the signal, then it is gone
  let started = null, paused = null;
  for (let i = 0; i < 60 * 5 && paused === null; i++) {
    const before = app.screen.blockState().phase;
    tick(false);
    if (started === null && before === 'countdown' && app.screen.blockState().phase !== 'countdown') started = clock;
    if (started === null) assert.equal(signalPause(app.screen), false, 'no pause during the 3-2-1');
    if (signalPause(app.screen)) paused = clock;
  }
  assert.ok(started !== null && paused !== null, 'the exercise started and paused');
  assert.ok(paused - started <= 2 * FRAME_MS, `paused ${Math.round(paused - started)} ms after the start: the silence was already ${SIGNAL.criticalLossMs} ms`);
});

test('«Созвездие» started by a host in a two-channel scheme runs in its own scheme: the spark moves, the stars light', () => {
  for (const scheme of ['proportional', 'threshold']) {
    store.clear();
    const app = new App(el('main'));
    app.profile.onboarded = true;
    app.updateSettings({ scheme });
    assert.equal(window.Synergy.start('stars', 1), true, 'the task\'s set has both axes: the host may start it');
    const session = app.screen.session();
    assert.equal(session.scheme, 'gesture', 'a game of the joystick is gestures whatever the settings say');
    assert.equal(session.runner.pipeline.scheme, 'gesture', `${scheme}: the pipeline follows the exercise, not the settings`);
    assert.equal(app.inputScheme(), 'gesture', 'and so do the keys of the keyboard');
    button(app.screen.node, 'Старт').on.click();
    let farthest = 0;
    for (let i = 0; i < 60 * 90 && app.screen.name === 'play'; i++) {
      clock += FRAME_MS;
      const s = app.screen.session();
      if (s.runner.intent) app.emulator.setTarget(toEmulatorTarget(s.game.autopilot(s.runner.intent, s.hand)));
      app.screen.tick(clock, 1 / 60);
      if (app.screen.name === 'play') farthest = Math.max(farthest, Math.hypot(s.game.pos.x, s.game.pos.y));
    }
    assert.ok(farthest > 0.3, `${scheme}: the spark flew ${farthest.toFixed(2)} of the field`);
    assert.equal(app.screen.name, 'results', `${scheme}: the run ended`);
    const run = app.state.runs.at(-1);
    assert.equal(run.game, 'stars');
    assert.equal(run.scheme, 'gesture');
    assert.ok(run.stars >= 2, `${scheme}: ${run.stars}★ (${run.score})`);
    // Back on a screen of the settings' scheme, the keys speak it again.
    app.go('home');
    assert.equal(app.inputScheme(), scheme);
  }
});

test('Motorica Start game catalog (public source, 05.11): the entry of «Синергия» follows the builds and the catalog\'s rules', () => {
  const catalog = JSON.parse(readFileSync('docs/embed/motorica-start-catalog.json', 'utf8'));
  assert.equal(catalog.games.length, 1);
  const [g] = catalog.games;
  const manifest = readFileSync('android/AndroidManifest.xml', 'utf8');
  const spec = readFileSync('ios/project.yml', 'utf8');
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  assert.ok(typeof g.id === 'string' && /^[a-z][a-z0-9_]*$/.test(g.id) && g.title === 'Синергия');
  // Android: Motorica Start calls Intent().setClassName(packageName, launcherActivity) — a full class name, exported.
  assert.equal(g.android.packageName, manifest.match(/package="([^"]+)"/)[1]);
  assert.equal(g.android.launcherActivity, `${g.android.packageName}.MainActivity`);
  assert.match(manifest, /android:name="\.MainActivity"\s+android:exported="true"/);
  assert.equal(g.android.versionCode, Number(manifest.match(/android:versionCode="(\d+)"/)[1]), 'the APK\'s versionCode: an update is a higher number');
  assert.equal(g.android.versionName, version);
  // The game control service admits only apps signed by Motorica (protectionLevel="signature", docs/INTEGRATION.md):
  // the extra `motorica_ms_control` would promise a control this APK cannot bind.
  assert.equal(g.android.usesMotoricaControl, false);
  // iOS: Motorica Start opens <urlScheme>://launch; the shell takes it (the home screen), as a link of its own scheme.
  assert.equal(g.ios.bundleId, spec.match(/PRODUCT_BUNDLE_IDENTIFIER: (\S+)/)[1]);
  assert.ok(spec.includes(`CFBundleURLSchemes: [${g.ios.urlScheme}]`), 'the scheme is the app\'s own');
  assert.equal(g.ios.versionCode, Number(spec.match(/CURRENT_PROJECT_VERSION: "(\d+)"/)[1]), 'CFBundleVersion');
  assert.equal(g.ios.versionName, spec.match(/MARKETING_VERSION: "([^"]+)"/)[1]);
  assert.equal(g.ios.appStoreUrl, '', 'empty until the app is in the App Store (the catalog\'s README)');
  // The checks of their parser and publisher (GameCatalog.kt, AccountGame.swift, ops/ms-games/README.md).
  assert.match(g.android.packageName, /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/);
  assert.ok(Number.isSafeInteger(g.android.versionCode) && g.android.versionCode >= 0);
  assert.match(g.ios.bundleId, /^[A-Za-z0-9.-]+$/);
  assert.match(g.ios.urlScheme, /^[A-Za-z][A-Za-z0-9+.-]*$/);
  assert.ok(Number.isInteger(g.ios.versionCode) && g.ios.versionCode > 0);
  // The iPhone shell answers the catalog's link: synergy://launch opens the home screen (no exercise, nothing refused).
  const swift = readFileSync('ios/Synergy/LaunchRequest.swift', 'utf8'); // 6.3.2: LaunchRequest has its own file
  const init = swift.slice(swift.indexOf('init?(url: URL)'));
  assert.ok(init.indexOf('url.scheme == "synergy"') < init.indexOf('url.host == "launch"'), 'only its own scheme');
  assert.match(init, /if url\.host == "launch" \{ return \}/, 'synergy://launch is a plain start (a request without an exercise)');
  assert.ok(init.indexOf('url.host == "launch"') < init.indexOf('url.host == "play"'), 'checked before the exercise links');
});
