// App state flows headless (5.10): the composition root with minimal browser stubs — no screen is rendered
// (e2e covers screens), but what the App does to the store, the plan and the signal source is checked here.
import test from 'node:test';
import assert from 'node:assert/strict';

const noop = () => {};
const target = () => ({ addEventListener: noop, removeEventListener: noop });
const store = new Map();
globalThis.window = Object.assign(globalThis, target());
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const el = () => ({ style: { setProperty: noop }, classList: { toggle: noop, add: noop, remove: noop }, addEventListener: noop, setAttribute: noop, append: noop, replaceChildren: noop, dataset: {} });
globalThis.document = { ...target(), documentElement: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, hidden: false, body: el() };
globalThis.requestAnimationFrame = noop;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.history = { state: null, pushState: noop, back: noop };

const { App } = await import('../src/app.js');
const { emptyState } = await import('../src/core/storage.js');
const { dayKey } = await import('../src/core/progress.js');

const fresh = () => { store.clear(); return new App(el()); };

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
