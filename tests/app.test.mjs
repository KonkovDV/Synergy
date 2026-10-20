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
const el = tag => Object.assign(new Node(), { tag, attrs: {}, style: { setProperty: noop }, classList: { toggle: noop, add: noop, remove: noop }, addEventListener: noop,
  setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, append(...c) { this.kids.push(...c); }, replaceChildren(...c) { this.kids = [...c]; },
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
