import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// 6.0 — the block of a plan exercise, on the real play screen (a minimal DOM, as tests/app.test.mjs): a short level is
// played again after a 2 s count-in until SESSION.blockS of active play; every round is a run; the plan item is done once;
// the results show the last round and the block. Free play stays one round.
import test from 'node:test';
import assert from 'node:assert/strict';

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
const { toEmulatorTarget } = await import('../src/games/runner.js');
const { SESSION } = await import('../src/config.js');
const { dayKey } = await import('../src/core/progress.js');

const nodes = n => [n, ...(n?.kids ?? []).flatMap(nodes)];
const button = (screen, label) => nodes(screen.node).find(x => x.tag === 'button' && nodes(x).some(k => k.textContent === label));

/** Plays the current play screen with the game's own autopilot driving the on-screen emulator, until it leaves. */
function playThrough(app, maxS = 900) {
  const start = button(app.screen, 'Старт');
  start.on.click();
  let now = 1000;
  const shown = [];
  for (let i = 0; i < maxS * 60 && app.screen.name === 'play'; i++) {
    now += 1000 / 60;
    const session = app.screen.session();
    if (session.runner.intent) app.emulator.setTarget(toEmulatorTarget(session.game.autopilot(session.runner.intent, session.hand)));
    app.screen.tick(now, 1 / 60);
    if (app.screen.name === 'play') { const b = app.screen.blockState(); if (shown.at(-1) !== b.rounds) shown.push(b.rounds); }
  }
  return shown;
}

test('ТЗ блок плана: a short level is played round after round until the block is long enough; one plan item, every round a run', () => {
  store.clear();
  const app = new App(el('main'));
  app.profile.onboarded = true;
  app.updateSettings({ scheme: 'threshold' });
  app.profile.days[dayKey()] = { seconds: 0, runs: 0, checkin: { pain: 0, fatigue: 0, action: 'go' } };
  const plan = app.dailyPlan();
  plan.items = [{ game: 'safe', level: 1, done: false, retention: false }, { game: 'grip', level: 1, done: false, retention: false }];
  app.go('play', { game: 'safe', level: 1, plan: true });
  const rounds = playThrough(app);
  assert.equal(app.screen.name, 'results');
  const runs = app.state.runs.filter(r => r.game === 'safe');
  assert.ok(runs.length >= 3, `«Сейф» L1 is a few seconds a round: ${runs.length} rounds`);
  assert.deepEqual(rounds, Array.from({ length: runs.length }, (_, i) => i + 1));
  const active = runs.reduce((s, r) => s + r.durationS, 0);
  assert.ok(active >= SESSION.blockS || runs.length === SESSION.maxRounds, `${active} s in ${runs.length} rounds`);
  assert.equal(runs.filter(r => r.plan).length, 1, 'the plan item is done by the first round only');
  assert.equal(app.profile.plan.items.filter(i => i.done).length, 1);
  const text = nodes(app.screen.node).map(x => x.textContent ?? '').join(' ');
  assert.match(text, /Блок: \d+ раунд/);
});

test('ТЗ блок плана: free play is one round, a run that already filled the block is not repeated', () => {
  store.clear();
  const app = new App(el('main'));
  app.profile.onboarded = true;
  app.profile.days[dayKey()] = { seconds: 0, runs: 0, checkin: { pain: 0, fatigue: 0, action: 'go' } };
  app.go('play', { game: 'safe', level: 1 });
  assert.deepEqual(playThrough(app), [1]);
  assert.equal(app.state.runs.length, 1);
});

test('ТЗ блок плана (Red Team): «✕» in the middle of round 2 shows the results of the rounds already played, not home', () => {
  store.clear();
  const app = new App(el('main'));
  app.profile.onboarded = true;
  app.updateSettings({ scheme: 'threshold' });
  app.profile.days[dayKey()] = { seconds: 0, runs: 0, checkin: { pain: 0, fatigue: 0, action: 'go' } };
  const plan = app.dailyPlan();
  plan.items = [{ game: 'safe', level: 1, done: false, retention: false }];
  app.go('play', { game: 'safe', level: 1, plan: true });
  button(app.screen, 'Старт').on.click();
  let now = 1000;
  for (let i = 0; i < 300 * 60 && app.screen.name === 'play' && app.screen.blockState().rounds < 2; i++) {
    now += 1000 / 60;
    const session = app.screen.session();
    if (session.runner.intent) app.emulator.setTarget(toEmulatorTarget(session.game.autopilot(session.runner.intent, session.hand)));
    app.screen.tick(now, 1 / 60);
  }
  assert.equal(app.screen.blockState().rounds, 2, 'round 2 started');
  const close = nodes(app.screen.node).find(x => x.tag === 'button' && x.attrs['aria-label'] === 'Выйти');
  close.on.click();
  assert.equal(app.screen.name, 'results', 'the played round is shown');
  assert.equal(app.state.runs.length, 1);
});
