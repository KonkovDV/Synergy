// App state flows headless (5.10): the composition root with minimal browser stubs — no screen is rendered
// (e2e covers screens), but what the App does to the store, the plan and the signal source is checked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const noop = () => {};
const target = () => ({ addEventListener: noop, removeEventListener: noop });
const store = new Map();
globalThis.window = Object.assign(globalThis, target());
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.Node = class Node {};
const canvas2d = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop) });
// A small tree: screens built here can be searched by class and text (no layout, no events).
const el = tag => Object.assign(new Node(), { tag, attrs: {}, style: { setProperty: noop }, classList: { toggle: noop, add: noop, remove: noop }, addEventListener(type, fn) { (this.on ??= {})[type] = fn; }, focus: noop,
  setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, append(...c) { this.kids.push(...c); }, appendChild(c) { this.kids.push(c); return c; }, remove: noop, replaceChildren(...c) { this.kids = [...c]; },
  getContext: () => canvas2d, dataset: {}, kids: [] });
globalThis.document = { ...target(), documentElement: el('html'), createElement: el, createElementNS: (_, tag) => el(tag), createTextNode: t => Object.assign(new Node(), { textContent: String(t) }), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, hidden: false, body: el('body') };
globalThis.requestAnimationFrame = noop;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.history = { state: null, pushState: noop, back: noop };

const { App } = await import('../src/app.js');
const { emptyState } = await import('../src/core/storage.js');
const { dayKey, recordDayNote } = await import('../src/core/progress.js');
const { calibrationScreen } = await import('../src/ui/settings.js');
const { tutorialScreen } = await import('../src/ui/tutorial.js');

const fresh = () => { store.clear(); return new App(el('main')); };
const nodes = n => [n, ...(n?.kids ?? []).flatMap(nodes)];
const textOf = n => nodes(n).map(x => x.textContent ?? '').join(' ');
const byClass = (n, c) => nodes(n).filter(x => String(x.attrs?.class ?? '').split(' ').includes(c));

test('reset and undo re-apply the signal source (the game loop threw on a null bridge after undo)', () => {
  let app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  app.resetProgress();
  assert.equal(app.settings.source, 'touch');
  assert.equal(app.bridge, null, 'the bridge is stopped with the reset');
  const before = emptyState(); before.settings.source = 'bridge'; before.settings.wsUrl = '';
  store.clear(); store.set('synergy.v4.beforeReset', JSON.stringify(before));
  app = new App(el());
  app.undoReset();
  assert.equal(app.settings.source, 'bridge');
  assert.ok(app.bridge, 'the bridge runs again');
  assert.doesNotThrow(() => window.Synergy.feed({ a: 0.5, b: 0 }));
  assert.doesNotThrow(() => app.createSession({ game: 'grip', level: 1 }).runner.step(1000, 0.016));
});

test('a skin day refuses host frames and a sensor connection, and does not calibrate the bridge', async () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  assert.ok(app.bridge);
  const today = dayKey();
  recordDayNote(app.profile, today, { checkin: { action: 'stop', reason: 'skin', pain: 0, fatigue: 0, skin: 1 } });
  app.applySource();
  assert.equal(app.bridge, null);
  assert.equal(window.Synergy.feed({ a: 0.5, b: 0 }), false);
  await assert.rejects(() => app.connectBle(), /кожа под ними раздражена/);
  assert.equal(app.ble, null);
  const before = JSON.stringify(app.state.calibrations.bridge);
  assert.match(textOf(calibrationScreen(app).node), /Калибровка\s— в другой день/);
  assert.equal(JSON.stringify(app.state.calibrations.bridge), before);
  delete app.profile.days[today].checkin;
  app.daySeen = '1999-01-01';
  app.frame(1000);
  assert.ok(app.bridge, 'the next day reconnects the saved source');
});

test('a skin day trains on the emulator: «Первые шаги» show its pads, and no screen of the signal asks for the saved source', () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  assert.equal(byClass(tutorialScreen(app).node, 'pads').length, 0, 'with sensors the tutorial has no pads');
  recordDayNote(app.profile, dayKey(), { checkin: { action: 'stop', reason: 'skin', pain: 0, fatigue: 0, skin: 1 } });
  app.applySource();
  assert.equal(app.liveSource(), 'touch');
  assert.equal(byClass(tutorialScreen(app).node, 'pads').length, 1, 'the emulator gives the signal, so its pads are there');
  // The game screen decides «external source» by the live source too (it is too browser-bound to build here).
  for (const f of ['play.js', 'tutorial.js']) assert.doesNotMatch(readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'), /\bs\.source\b/, f);
});

test('the hand of every exercise switches its grip the way the settings say (5.23)', () => {
  const app = fresh();
  assert.equal(app.createHand().switchMode, 'open');
  app.updateSettings({ gripSwitch: 'co', holdOpenS: 1.4 });
  const hand = app.createSession({ game: 'grip', level: 1 }).hand;
  assert.deepEqual([hand.switchMode, hand.holdOpenS], ['co', 1.4]);
});

test('irritated skin with moderate pain is a short day without sensors; the pain answer is not lost', () => {
  const app = fresh();
  const full = app.dailyPlan().items.length;
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  recordDayNote(app.profile, dayKey(), { checkin: { action: 'stop', reason: 'skin', light: true, pain: 2, fatigue: 0, skin: 1 } });
  const plan = app.dailyPlan();
  assert.equal(plan.light, true);
  assert.ok(plan.items.length < full, `${plan.items.length} of ${full}`);
  assert.equal(app.liveSource(), 'touch');
});

test('only plan runs complete the plan; the run records where it came from', () => {
  const app = fresh();
  const plan = app.dailyPlan();
  const probe = plan.items.find(i => i.retention);
  const free = app.createSession({ game: probe.game, level: probe.level, retention: true });
  free.game.done = true;
  const outcome = app.finishSession(free);
  assert.equal(outcome.run.plan, false);
  assert.equal(app.dailyPlan().items.find(i => i.retention).done, false, 'free play «без подсказки» does not tick the plan (B-7)');
  const first = plan.items[0];
  const planned = app.createSession({ game: first.game, level: first.level, plan: true });
  planned.game.done = true;
  app.finishSession(planned);
  assert.equal(app.dailyPlan().items[0].done, true);
});

test('a scheme switched and switched back keeps today\'s finished exercises (B-3)', () => {
  const app = fresh();
  const first = app.dailyPlan().items[0];
  const s = app.createSession({ game: first.game, level: first.level, plan: true });
  s.game.done = true; app.finishSession(s);
  app.updateSettings({ scheme: 'threshold' });
  assert.ok(app.dailyPlan().items.some(i => i.done && i.game === first.game), 'kept in the other scheme');
  app.updateSettings({ scheme: 'proportional' });
  const plan = app.dailyPlan();
  assert.equal(plan.day, dayKey());
  assert.ok(plan.items.some(i => i.done && i.game === first.game), 'kept after switching back (it went back to 0/4)');
});

test('arm pose (5.11): asked and recorded only with real sensors, never with the on-screen emulator or in a demo', () => {
  const app = fresh();
  assert.equal(app.createSession({ game: 'grip', level: 1, retention: true, pose: 'elbow' }).pose, null, 'emulator on the screen');
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  assert.equal(app.createSession({ game: 'grip', level: 1, retention: true, pose: 'elbow' }).pose?.id, 'elbow');
  assert.equal(app.createSession({ game: 'grip', level: 1, retention: true, pose: 'elbow', demo: true }).pose, null, 'demo');
  assert.equal(app.createSession({ game: 'grip', level: 1, retention: true, pose: 'nope' }).pose, null, 'unknown id');
  const session = app.createSession({ game: 'grip', level: 1, retention: true, pose: 'forward' });
  for (let t = 0; t < 400 && !session.game.done; t++) session.runner.step(t * 50, 0.05);
  const { run } = app.finishSession(session);
  assert.equal(run.pose, 'forward');
});

test('another window\'s save does not restart an unchanged source (5.11 — a running exercise froze on «Нет сигнала»)', () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  app.save();
  const bridge = app.bridge;
  app.store.state = app.store.load();
  app.refreshFromState();
  assert.equal(app.bridge, bridge, 'same source, same bridge');
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = undefined; // no real connection from a unit test
  try {
    app.state.settings.wsUrl = 'ws://127.0.0.1:9999';
    app.refreshFromState();
    assert.notEqual(app.bridge, bridge, 'a changed address restarts it');
  } finally { app.bridge?.stop(); globalThis.WebSocket = ws; }
});

test('leaving the demo profile reads what another window saved meanwhile (5.11 — it wrote old data over it)', async () => {
  const app = fresh();
  app.save();
  app.enterShowcase();
  const other = JSON.parse(store.get('synergy.v4'));
  other.settings.name = 'Борис';
  store.set('synergy.v4', JSON.stringify(other)); // the other window's save
  app.exitShowcase();
  assert.equal(app.settings.name, 'Борис');
  app.updateSettings({ textScale: 1.3 });
  app.save();
  assert.equal(JSON.parse(store.get('synergy.v4')).settings.name, 'Борис', 'not overwritten by the stale copy');
});

test('the demo profile keeps the person\'s settings and brings read hints back (5.13: it dropped them to defaults)', () => {
  const app = fresh();
  app.updateSettings({ textScale: 1.3, theme: 'dark', contrast: true, scheme: 'gesture', tours: { home: { v: 1, status: 'completed', step: 2 } } });
  app.enterShowcase();
  for (const [k, v] of Object.entries({ textScale: 1.3, theme: 'dark', contrast: true, scheme: 'gesture', source: 'touch' })) assert.equal(app.settings[k], v, k);
  assert.equal(app.settings.tours.home.status, 'completed', 'hints read before the demo are not shown again in it');
  app.updateSettings({ tours: { ...app.settings.tours, progress: { v: 1, status: 'dismissed', step: 0 } } });
  app.exitShowcase();
  assert.deepEqual(Object.keys(app.settings.tours).sort(), ['home', 'progress'], 'hints read in the demo stay read');
  assert.equal(app.settings.textScale, 1.3);
});

test('5.15 embedding: a host\'s exercise waits for the onboarding; posted frames switch to the external source once; back at home hands control back', async () => {
  const { SCREENS } = await import('../src/ui/screens.js');
  const shown = [];
  const keep = { home: SCREENS.home, play: SCREENS.play, onboarding: SCREENS.onboarding };
  const stub = name => (app, params) => { shown.push([name, params]); return { node: { ...el(), querySelector: () => null } }; };
  for (const name of Object.keys(keep)) SCREENS[name] = stub(name);
  window.scrollTo = noop;
  const ws = globalThis.WebSocket;
  globalThis.WebSocket = undefined; // no real connection from a unit test
  let app;
  try {
    store.clear();
    app = new App({ ...el(), querySelector: () => null, querySelectorAll: () => [] });
    const sent = [];
    window.ReactNativeWebView = { postMessage: json => sent.push(JSON.parse(json)) };
    app.embedded = true;
    assert.equal(window.Synergy.start('grip', 2), false, 'not onboarded: the safety pages first');
    assert.deepEqual(shown.at(-1), ['onboarding', {}]);
    app.profile.onboarded = true;
    app.go('home', { from: 'home' });
    assert.deepEqual(shown.at(-1), ['play', { game: 'grip', level: 2 }], 'the asked exercise opens on the way home');
    app.go('home');
    assert.equal(shown.at(-1)[0], 'home', 'once only');
    // The safety rules changed since this person read them: the re-read comes before the host's exercise.
    app.profile.safetySeen = 0; app.pendingLaunch = { game: 'safe', level: 1 };
    app.go('home');
    assert.equal(shown.at(-1)[0], 'home', 'home shows the safety re-read first (ui/home.js)');
    app.profile.safetySeen = 1;
    app.go('home');
    assert.deepEqual(shown.at(-1), ['play', { game: 'safe', level: 1 }]);
    app.profile.safetySeen = 0;
    assert.equal(window.Synergy.start('rhythm', 2), false, 'Synergy.start does not skip the re-read either');
    assert.equal(shown.at(-1)[0], 'home');
    app.profile.safetySeen = 1; app.go('home');
    assert.deepEqual(shown.at(-1), ['play', { game: 'rhythm', level: 2 }]);
    // A frame posted by the embedding frame switches the source like Synergy.feed and is not lost.
    assert.equal(app.settings.source, 'touch');
    app.onHostCommand({ source: null, data: { type: 'synergy-frame', a: 0.6, b: 0 } });
    assert.equal(app.settings.source, 'bridge');
    assert.equal(app.bridge.received, 1, 'the first frame is fed');
    app.onHostCommand({ source: null, data: { type: 'synergy-frame', a: 0.6, b: 0 } });
    assert.equal(app.bridge.received, 1, 'then BridgeSource hears frames itself — none fed twice');
    assert.equal(app.bridge.url, '', 'the host gives the signal: no WebSocket to the stored address');
    app.updateSettings({ wsUrl: 'ws://192.168.1.5:8765' });
    assert.equal(app.bridge.url, 'ws://192.168.1.5:8765', 'an address the person typed is used again');
    app.onHostCommand({ source: { other: 'tab' }, data: { type: 'synergy-start', game: 'flight' } });
    assert.notDeepEqual(shown.at(-1), ['play', { game: 'flight', level: 1 }], 'an opener tab is not the host (RT-7)');
    app.onHostCommand({ source: null, data: { type: 'synergy-start', game: 'flight' } });
    assert.deepEqual(shown.at(-1), ['play', { game: 'flight', level: 1 }]);
    app.onHostCommand({ source: null, data: { type: 'synergy-ping' } });
    assert.equal(sent.at(-1).type, 'synergy:ready');
    assert.equal(sent.at(-1).onboarded, true);
    app.go('home');
    assert.equal(app.handleBack(), false);
    assert.deepEqual([sent.at(-1).type, sent.at(-1).reason], ['synergy:close', 'back']);
    app.embedded = false;
    const before = sent.length;
    app.handleBack();
    assert.equal(sent.length, before, 'the app on its own (the APK, a browser) sends nothing on back');
  } finally {
    Object.assign(SCREENS, keep);
    delete window.ReactNativeWebView;
    app?.bridge?.stop(); globalThis.WebSocket = ws;
  }
});

test('5.27: severe pain with irritated skin keeps the sensors off for free play (the skin answer was lost)', () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  recordDayNote(app.profile, dayKey(), { checkin: { pain: 3, fatigue: 0, skin: 1, action: 'stop', reason: 'pain' } });
  assert.equal(app.sensorsPaused(), true);
  assert.equal(app.liveSource(), 'touch', 'free play stays open on a pain day — on the emulator, not on the electrodes');
  assert.equal(app.signalSource(), app.emulator);
});

test('5.27: «Стало больно» in the pause closes today — no plan, the morning answers kept, the exercise not saved', () => {
  const app = fresh();
  app.profile.onboarded = true;
  recordDayNote(app.profile, dayKey(), { checkin: { pain: 0, fatigue: 1, action: 'go', reason: null } });
  const first = app.dailyPlan().items[0];
  app.createSession({ game: first.game, level: first.level, plan: true }); // started, then paused and stopped
  const runs = app.state.runs.length;
  let went = null;
  app.go = name => { went = name; }; // screens are not rendered here (e2e covers them)
  app.stopForPain();
  assert.equal(went, 'home');
  const c = app.checkin();
  assert.deepEqual([c.action, c.reason, c.during, c.pain, c.fatigue], ['stop', 'pain', true, 0, 1]);
  assert.equal(app.state.runs.length, runs, 'an exercise left in pain is not a result');
  went = null;
  app.startPlan();
  assert.equal(went, 'home', 'the plan does not start again today');
  assert.ok(JSON.parse(store.get('synergy.v4')).profile.days[dayKey()].checkin.during, 'saved');
});

test('5.29: the prosthesis\'s thresholds from the host — used for the external source only, with the setting on', () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  app.state.calibrations.bridge = { rest: [10 / 255, 20 / 255], max: [210 / 255, 220 / 255], at: '2026-10-21T10:00:00Z' };
  assert.equal(app.prosthesisThresholds(), null, 'nothing passed yet');
  window.Synergy.feed({ openThreshold: 140, closeThreshold: 90 }); // what MotoricaStartLink.kt forwards from getLatestThresholds()
  assert.deepEqual(app.prosthesisThresholds(), [90 / 255, 140 / 255]);
  assert.deepEqual(app.switchOn().map(x => Math.round(x * 100)), [40, 60]);
  const session = app.createSession({ game: 'grip', level: 1 });
  assert.deepEqual(session.runner.pipeline.params.prosthesisThresholds, [90 / 255, 140 / 255]);
  assert.equal(Math.round(session.game.onThreshold * 100), 60, 'force bands sit above the higher line');
  assert.equal(app.bridge.received, 0, 'thresholds are not signal frames');
  session.game.done = true;
  assert.equal(app.finishSession(session).run.thresholds, 'prosthesis', 'the run says which line it was played on');
  // The demo, the setting off, the emulator, a skin day: the game's own threshold.
  assert.equal(app.createSession({ game: 'grip', level: 1, demo: true }).runner.pipeline.params.prosthesisThresholds, null);
  app.updateSettings({ prosthesisThresholds: false });
  assert.equal(app.prosthesisThresholds(), null);
  assert.equal(app.createSession({ game: 'grip', level: 1 }).game.onThreshold, app.settings.sensitivity);
  app.updateSettings({ prosthesisThresholds: true, swapChannels: true });
  assert.deepEqual(app.prosthesisThresholds(), [140 / 255, 90 / 255], 'kept through the rebuilt source, swapped with the channels');
  app.updateSettings({ swapChannels: false });
  recordDayNote(app.profile, dayKey(), { checkin: { pain: 0, fatigue: 0, skin: 1, action: 'stop', reason: 'skin' } });
  assert.equal(app.prosthesisThresholds(), null, 'no sensors today — no sensor thresholds');
});

test('5.29: settings say whether the prosthesis\'s thresholds came and are used', async () => {
  const { settingsScreen } = await import('../src/ui/settings.js');
  globalThis.location ??= { protocol: 'https:', search: '' }; // the «Данные» section names where the page was opened from
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  assert.match(textOf(settingsScreen(app).node), /Сейчас их нет — работают пороги игры/);
  assert.match(textOf(settingsScreen(app).node), /Порог закрытия \(A\)/);
  assert.match(textOf(settingsScreen(app).node), /Порог открытия \(B\)/);
  app.updateSettings({ sensitivity: 0.2, sensitivityB: 0.4 });
  assert.deepEqual(app.switchOn(), [0.2, 0.4]);
  assert.equal(app.createSession({ game: 'grip', level: 1 }).game.onThreshold, 0.4, 'force bands sit above the higher game threshold');
  window.Synergy.feed({ thresholds: [140, 90] });
  assert.match(textOf(settingsScreen(app).node), /Пороги протеза получены: канал A включается на \d+\s?%, B — на \d+\s?%/);
  app.updateSettings({ prosthesisThresholds: false });
  assert.match(textOf(settingsScreen(app).node), /получены, но не используются/);
});

test('5.32: settings draw the live trace of A and B in the two-channel schemes and say its cleanliness', async () => {
  const { settingsScreen } = await import('../src/ui/settings.js');
  globalThis.location ??= { protocol: 'https:', search: '' };
  const app = fresh();
  app.updateSettings({ source: 'touch', scheme: 'threshold' });
  const screen = settingsScreen(app);
  assert.ok(nodes(screen.node).some(n => n.tag === 'canvas' && n.attrs?.class === 'trace'), 'the trace is on the screen');
  assert.match(textOf(screen.node), /Сожмите\sили\sраскройте\s—\sграфик/);
  for (let t = 0; t <= 3000; t += 16) screen.tick(t); // the canvas stub has no size: nothing is drawn, nothing throws
  app.updateSettings({ scheme: 'gesture' });
  assert.ok(!nodes(settingsScreen(app).node).some(n => n.tag === 'canvas' && n.attrs?.class === 'trace'), 'gestures: no two lines to compare');
});

test('5.32: a calibration whose rest ripples up to the switch-off level offers a higher threshold, and «Сохранить» applies it', () => {
  globalThis.location ??= { protocol: 'https:', search: '' };
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '', sensitivity: 0.22, sensitivityB: 0.22 });
  // The screen opens before the host's first frame, which rebuilds the bridge: until 5.32 the calibration kept the
  // stopped one and said «Нет сигнала» on every step.
  const screen = calibrationScreen(app);
  const button = text => nodes(screen.node).find(n => n.tag === 'button' && n.kids?.some(k => k.textContent === text));
  button('Начать калибровку').on.click();
  const wobble = (i, k) => k * Math.sin(i * 1.7) * Math.cos(i * 0.31);
  for (let i = 0, t = 0; t <= 12500; i++, t += 16) {
    const step = t < 3000 ? 'rest' : t < 6000 ? 'a' : t < 8000 ? 'relax' : 'b';
    window.Synergy.feed({ a: (step === 'a' ? 0.6 : 0.1) + wobble(i, 0.052), b: (step === 'b' ? 0.8 : 0.05) + wobble(i + 5, 0.002) });
    screen.tick(t, 1 / 60);
  }
  assert.match(textOf(screen.node), /Поднять порог по дрожи покоя/);
  assert.match(textOf(screen.node), /A\s—\s\d+\s?%/);
  assert.doesNotMatch(textOf(screen.node), /B\s—\s\d+\s?%\./, 'the quiet channel is not offered');
  app.go = noop; // the screen change itself is the browser's (e2e)
  button('Сохранить').on.click();
  assert.ok(app.settings.sensitivity > 0.22, `A raised to ${app.settings.sensitivity}`);
  assert.equal(app.settings.sensitivityB, 0.22, 'B kept');
});

test('5.32: a ripple the slider cannot clear is not applied and is not called safe', () => {
  globalThis.location ??= { protocol: 'https:', search: '' };
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '', sensitivity: 0.22, sensitivityB: 0.22 });
  const screen = calibrationScreen(app);
  const button = text => nodes(screen.node).find(n => n.tag === 'button' && n.kids?.some(k => k.textContent === text));
  button('Начать калибровку').on.click();
  for (let i = 0, t = 0; t <= 12500; i++, t += 16) {
    const step = t < 3000 ? 'rest' : t < 6000 ? 'a' : t < 8000 ? 'relax' : 'b';
    const restA = [0, 0.16, 0.32][i % 3];
    window.Synergy.feed({ a: step === 'a' ? 1.3 : restA, b: step === 'b' ? 0.9 : 0.05 });
    screen.tick(t, 1 / 60);
  }
  const text = textOf(screen.node);
  assert.match(text, /даже потолок порога 45\s*%/);
  assert.match(text, /покой может включить/);
  assert.doesNotMatch(text, /Поднять порог по дрожи покоя/);
  assert.doesNotMatch(text, /не включит этот канал сам/);
  app.go = noop;
  button('Сохранить').on.click();
  assert.equal(app.settings.sensitivity, 0.22, 'a threshold that cannot clear rest is not saved');
  assert.equal(app.settings.sensitivityB, 0.22);
});

test('5.32: a calibration that cannot be saved keeps its rest-ripple warning; the cap is not called the current threshold', () => {
  globalThis.location ??= { protocol: 'https:', search: '' };
  const run = (feed, settings) => {
    const app = fresh();
    app.updateSettings({ source: 'bridge', wsUrl: '', sensitivity: 0.22, sensitivityB: 0.22, ...settings });
    const screen = calibrationScreen(app);
    nodes(screen.node).find(n => n.tag === 'button' && n.kids?.some(k => k.textContent === 'Начать калибровку')).on.click();
    for (let i = 0, t = 0; t <= 12500; i++, t += 16) {
      window.Synergy.feed(feed(t < 3000 ? 'rest' : t < 6000 ? 'a' : t < 8000 ? 'relax' : 'b', i));
      screen.tick(t, 1 / 60);
    }
    return textOf(screen.node);
  };
  const wobble = (i, k) => k * Math.sin(i * 1.7) * Math.cos(i * 0.31);
  // B never rises (a flat channel): nothing is saved, so nothing is offered — and the ripple of A must still be told.
  const flatB = run((step, i) => ({ a: (step === 'a' ? 0.6 : 0.1) + wobble(i, 0.052), b: 0.05 + wobble(i + 5, 0.002) }));
  assert.match(flatB, /Канал B: напряжение почти не отличается/);
  assert.match(flatB, /Канал A: в покое сигнал дрожит/, 'until now the filter dropped it: no offer was judged at all');
  // A ripple even the slider top cannot clear, with the threshold still at 22 %: the note must not say «already 45 %».
  const capped = run((step, i) => ({ a: step === 'a' ? 1.3 : [0, 0.16, 0.32][i % 3], b: step === 'b' ? 0.9 : 0.05 }));
  assert.doesNotMatch(capped, /порог уже 45/, 'the threshold is 22 %, not 45 %');
  assert.match(capped, /даже потолок порога 45\s*%/);
  assert.match(capped, /покой может включить/);
});

test('5.32: «Первая команда» is written into the four states, not only into its own note', async () => {
  const { settingsScreen } = await import('../src/ui/settings.js');
  globalThis.location ??= { protocol: 'https:', search: '' };
  const app = fresh();
  const screen = settingsScreen(app);
  const times = re => (textOf(screen.node).match(re) || []).length;
  assert.equal(times(/первую команду/g), 0);
  const pick = nodes(screen.node).find(n => n.tag === 'button' && textOf(n).includes('Первая команда'));
  pick.on.click();
  assert.equal(app.settings.bothOn, 'first');
  assert.ok(times(/первую команду/g) >= 2, 'the law note and the four-state line both say it');
});

test('5.30: two prostheses — the leading arm drives the exercise with its own calibration, the run says which arm', async () => {
  const app = fresh();
  const { reportCsv } = await import('../src/services/report.js');
  app.updateSettings({ source: 'bridge', wsUrl: '', prostheses: 'two', side: 'left' });
  assert.equal(app.calibrationKey(), 'bridge-left');
  const left = { rest: [0.1, 0.1], max: [0.5, 0.5], at: '2026-10-22T10:00:00Z' };
  app.state.calibrations['bridge-left'] = left;
  assert.equal(app.calibration(), left, 'the left arm\'s calibration');
  app.updateSettings({ side: 'right' });
  assert.notEqual(app.calibration(), left, 'the right arm has its own');
  window.Synergy.feed({ left: { a: 0.1, b: 0 }, right: { a: 0.7, b: 0 } });
  assert.equal(app.signalSource().sample().a, 0.7, 'the right leads');
  app.updateSettings({ side: 'left' });
  assert.equal(app.signalSource().sample().a, 0.1, 'switch in the settings — the left leads, same source');
  const session = app.createSession({ game: 'grip', level: 1 });
  session.game.done = true;
  const { run } = app.finishSession(session);
  assert.equal(run.side, 'left');
  assert.match(reportCsv(app.state).split('\n')[1], /;left;/, 'the CSV column prosthesis_side');
  app.updateSettings({ prostheses: 'one' });
  assert.equal(app.calibrationKey(), 'bridge', 'one prosthesis: the calibration as before');
  const one = app.createSession({ game: 'grip', level: 1 }); one.game.done = true;
  assert.equal(app.finishSession(one).run.side, undefined, 'one prosthesis: no side in the run');
});

test('5.30: «Две руки» on two prostheses — each arm\'s frames drive its own hand; one arm silent freezes the exercise', () => {
  const app = fresh();
  app.updateSettings({ source: 'bridge', wsUrl: '', prostheses: 'two', side: 'right', scheme: 'gesture' });
  const session = app.createSession({ game: 'duo', level: 1 });
  assert.equal(session.scheme, 'proportional', 'two channels per arm, whatever the person\'s scheme');
  assert.ok(session.runner.sides === undefined && session.runner.hands.left && session.runner.hands.right);
  // The bridge stamps frames with performance.now(): a fake clock moves 1/60 s per step.
  const real = performance.now.bind(performance);
  let clock = real() + 1e6;
  performance.now = () => clock;
  try {
    const step = sides => { window.Synergy.feed(sides); session.runner.step(clock, 1 / 60); clock += 1000 / 60; };
    for (let i = 0; i < 20; i++) step({ left: { a: 0, b: 0 }, right: { a: 0, b: 0 } });
    for (let i = 0; i < 20; i++) step({ left: { a: 0.8, b: 0 }, right: { a: 0, b: 0 } });
    const sides = session.runner.intent.sides;
    assert.equal(sides.left.command, 'close'); assert.equal(sides.right.command, 'rest');
    assert.equal(session.runner.intent.valid, true);
    assert.ok(session.runner.hands.left.closure > 0.3 && session.runner.hands.right.closure === 0, 'each arm moves its own hand');
    // the right arm goes silent: its watchdog trips, the whole exercise waits
    for (let i = 0; i < 30; i++) step({ left: { a: 0.8, b: 0 } });
    assert.equal(session.runner.signalLost, true, 'one arm without signal — the exercise freezes');
  } finally { performance.now = real; }
  session.game.done = true;
  const { run } = app.finishSession(session);
  assert.equal(run.game, 'duo'); assert.equal(run.scheme, 'proportional'); assert.equal(run.side, undefined, 'both arms: no single side');
});

test('5.30: «Тренер качества сигнала» — interference on the external source is shown with a tip, kept in the run, the CSV and the report', async () => {
  const app = fresh();
  const { reportCsv, reportHtml } = await import('../src/services/report.js');
  const { parseState } = await import('../src/core/storage.js');
  app.updateSettings({ source: 'bridge', wsUrl: '' });
  app.state.calibrations.bridge = { rest: [0.2, 0.2], max: [1, 1], at: '2026-10-22T10:00:00Z' };
  const session = app.createSession({ game: 'grip', level: 1 });
  assert.ok(session.runner.quality, 'the external source is watched');
  const real = performance.now.bind(performance);
  let clock = real() + 1e6, seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  performance.now = () => clock;
  try {
    // 8 s of a rest line that does not settle: ±0.15 of the span around the calibrated rest
    for (let i = 0; i < 480; i++) { window.Synergy.feed({ a: 0.2 + 0.24 * (rnd() - 0.5), b: 0.2 + 0.01 * rnd() }) /* never negative: that would be raw EMG */; session.runner.step(clock, 1 / 60); clock += 1000 / 60; }
  } finally { performance.now = real; }
  assert.equal(session.runner.signalLost, false, 'the first fed frame rebuilt the source (hostSource): the exercise reads the new one');
  const verdict = session.runner.quality.verdict;
  assert.equal(verdict.ok, false); assert.equal(verdict.id, 'noise'); assert.match(verdict.tip, /гильз|электрод/);
  session.game.done = true;
  const { run } = app.finishSession(session);
  assert.ok(run.signalIssues?.some(x => x.id === 'noise' && x.seconds >= 3), JSON.stringify(run.signalIssues));
  assert.match(reportCsv(app.state).split('\n')[1], /;noise=\d+$/, 'the CSV column signal_issues');
  const html = reportHtml(app.state);
  assert.match(html, /Качество сигнала с датчиков/); assert.match(html, /Помехи в покое/);
  // a backup keeps known issues only
  const restored = parseState(JSON.stringify({ ...app.state, runs: [{ ...run, signalIssues: [...run.signalIssues, { id: '__proto__', seconds: 1 }, { id: 'spikes', seconds: -1 }, { id: 'stuck', seconds: 4, side: 'up' }] }] }));
  assert.deepEqual(restored.runs[0].signalIssues, run.signalIssues);
  // the emulator is not watched; nor is the demo
  app.updateSettings({ source: 'touch' });
  assert.equal(app.createSession({ game: 'grip', level: 1 }).runner.quality, null);
});
