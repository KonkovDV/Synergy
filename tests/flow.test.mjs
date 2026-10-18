// Flow rules of the screens as pure functions (5.10): where the results lead, and the hands-free hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resultsAction } from '../src/ui/results.js';
import { HoldConfirm } from '../src/core/handsfree.js';
import { restIntent } from '../src/core/signal.js';

const run = (extra = {}) => ({ game: 'grip', level: 2, levelCount: 8, stars: 2, retention: false, ...extra });
const base = { restS: 20, titleOf: id => ({ flight: 'Полёт' })[id] ?? id, next: null, stopAdvice: null, plan: false, demo: false };

test('results lead: safety first, then the plan, then the next level', () => {
  const next = { game: 'flight', level: 1, retention: false };
  assert.deepEqual(resultsAction({ ...base, run: run(), plan: true, next, stopAdvice: 'усталость' }), { kind: 'home', label: 'Закончить на сегодня' });
  assert.equal(resultsAction({ ...base, run: run(), plan: true }).label, 'Готово на сегодня');
  assert.deepEqual(resultsAction({ ...base, run: run(), plan: true, next }), { kind: 'rest', label: 'Отдых 20 с → Полёт', params: { next } });
  assert.equal(resultsAction({ ...base, run: run() }).label, 'Уровень 3');
  assert.equal(resultsAction({ ...base, run: run({ stars: 0 }) }).label, 'Ещё раз');
  assert.equal(resultsAction({ ...base, run: run({ level: 8 }) }).label, 'Ещё раз', 'the last level repeats');
});

test('results lead after a demo: the real exercise, not a rest before the same game (B-15)', () => {
  const a = resultsAction({ ...base, run: run(), plan: true, demo: true, next: { game: 'grip', level: 2 } });
  assert.deepEqual(a, { kind: 'play', label: 'Начать упражнение', params: { game: 'grip', level: 2, retention: false, plan: true } });
  const free = resultsAction({ ...base, run: run(), demo: true });
  assert.equal(free.label, 'Попробовать самому');
  assert.equal(free.params.demo, undefined, 'the player plays, not the bot');
});

test('hands-free hold: armed only after a relaxation, fires once, a slip costs twice its time', () => {
  const rest = restIntent('proportional', true), close = { ...rest, command: 'close', relaxed: false, aOn: true };
  const lost = restIntent('proportional', false);
  const c = new HoldConfirm(1);
  for (let i = 0; i < 90; i++) assert.equal(c.update(close, 1 / 60), false, 'a hold carried over from the previous screen does not count');
  for (let i = 0; i < 30; i++) c.update(lost, 1 / 60);
  for (let i = 0; i < 90; i++) c.update(close, 1 / 60);
  assert.equal(c.fired, false, '«no signal» is not a relaxation (the old results copy armed on it)');
  c.update(rest, 1 / 60);
  let fired = 0;
  for (let i = 0; i < 30; i++) fired += c.update(close, 1 / 60);
  for (let i = 0; i < 6; i++) c.update(rest, 1 / 60); // 0.1 s slip costs 0.2 s
  for (let i = 0; i < 60; i++) fired += c.update(close, 1 / 60);
  assert.equal(fired, 1, 'fires exactly once');
});
