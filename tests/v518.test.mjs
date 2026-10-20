// 5.18 — a start in one tap, a check that knows its error, the workshop replay (its outcome: tests/feel.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickStart } from '../src/core/progress.js';
import { completionChange, assessmentHistory } from '../src/core/analytics.js';
import { errorText } from '../src/ui/progress.js';
import { safeReplaySummary } from '../src/ui/results.js';
import { createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { SignalPipeline } from '../src/core/signal.js';
import { BionicHand } from '../src/core/hand.js';
import { GESTURE_BY_ID } from '../src/core/vocabulary.js';
import { assessmentTrials } from '../src/games/assess.js';
import { buildShowcaseState } from '../src/core/showcase.js';
import { PLAN_CATALOG } from '../src/games/registry.js';

test('quick start: the plan’s first exercise before the day’s first training — not before the tutorial, not on a rest day', () => {
  const plan = { items: [{ game: 'flight', level: 2, done: false, retention: false }, { game: 'rhythm', level: 1, done: false }, { game: 'flight', level: 2, retention: true, done: false }] };
  const base = { tutorialDone: true, resting: false, plan, trainedToday: false };
  assert.deepEqual(quickStart(base), { game: 'flight', level: 2 });
  assert.equal(quickStart({ ...base, tutorialDone: false }), null, '«Первые шаги» first');
  assert.equal(quickStart({ ...base, resting: true }), null, 'a declared rest day is rest');
  assert.equal(quickStart({ ...base, trainedToday: true }), null, 'the day has started — the plan goes on');
  assert.deepEqual(quickStart({ ...base, plan: { items: [{ ...plan.items[0], done: true }, ...plan.items.slice(1)] } }), { game: 'rhythm', level: 1 });
  assert.equal(quickStart({ ...base, plan: { items: [plan.items[2]] } }), null, 'the retention probe is not a warm-up');
  assert.match(readFileSync('src/ui/home.js', 'utf8'), /Быстро · ≈ 2 мин/);
});

test('skill check: a change counts only when it is larger than the error of n pass/fail trials', () => {
  const check = (completionRate, trials) => ({ completionRate, trials });
  const small = completionChange(check(50, 8), check(75, 8));
  assert.equal(small.delta, 25);
  assert.ok(small.mdc >= 38 && small.mdc <= 46, `8 trials: ±${small.mdc} points`);
  assert.equal(small.real, false, '4 of 8 → 6 of 8 can be chance');
  assert.equal(completionChange(check(25, 8), check(100, 8)).real, true, '2 of 8 → 8 of 8 is not');
  const gestures = completionChange(check(50, 12), check(75, 12));
  assert.ok(gestures.mdc < small.mdc, 'more trials — a smaller error');
  const perfect = completionChange(check(100, 8), check(100, 8));
  assert.ok(perfect.mdc > 0 && perfect.real === false, '100 % → 100 % still carries an error (Agresti–Caffo)');
  assert.equal(completionChange(check(50, null), check(75, 8)), null, 'an old check without the trial count says nothing');
  assert.equal(completionChange(check(80, 8), check(20, 8)).real, true);
  assert.equal(completionChange(check(80, 8), check(20, 8)).delta, -60);
});

test('skill check: the words of the error — no praise for noise, a fall points at the sensors and the day, not the person', () => {
  assert.equal(errorText(null), '');
  assert.match(errorText({ delta: 25, mdc: 42, real: false }), /в пределах погрешности проверки \(±42 п\. п\.\): пока нельзя сказать, что навык изменился/);
  assert.match(errorText({ delta: 75, mdc: 40, real: true }), /Рост выполненных больше погрешности проверки \(±40 п\. п\.\)/);
  assert.match(errorText({ delta: -60, mdc: 40, real: true }), /проверьте датчики и самочувствие/);
});

test('«Сейф»: the replay — every digit of the code, the slowest one, the pair the prosthesis mixed up', () => {
  for (const scheme of ['gesture', 'proportional']) {
    const game = createGame('safe', { levelNumber: 3, scheme, seed: 5 });
    const emulator = new EmgEmulator({ realism: 0.7, seed: 5 });
    const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand: new BionicHand(), source: emulator, emulator, autopilot: true });
    for (let t = 0; !game.done && t < 120000; t += 1000 / 60) runner.step(t, 1 / 60);
    const r = game.replay();
    assert.equal(r.kind, 'safe');
    assert.equal(r.digits.length, game.code.length);
    assert.equal(r.digits.filter(d => d.ok).length, game.details().solved, `${scheme}: agrees with the score`);
    assert.ok(r.digits.every(d => (d.ok ? d.seconds > 0 : d.seconds === null)));
    if (r.top) assert.ok(GESTURE_BY_ID[r.top.wanted] && GESTURE_BY_ID[r.top.seen] && r.top.wanted !== r.top.seen, 'a real pair of gestures');
    if (scheme !== 'gesture') assert.equal(r.top, null, 'no gesture confusion with two channels');
  }
  const names = { fist: 'Кулак', pinch: 'Щипок' };
  const text = safeReplaySummary({ digits: [{ name: 'Кулак', ok: true, seconds: 1.2 }, { name: 'Щипок', ok: true, seconds: 2.4 }, { name: 'Кулак', ok: false, seconds: null }], top: { wanted: 'fist', seen: 'pinch', seconds: 1.3 } }, id => names[id]);
  assert.equal(text, 'Открыто 2 из 3. Дольше всего — «Щипок»: 2,4 с. Вместо «Кулак» протез чаще видел «Щипок» (1,3 с) — эту пару стоит потренировать.');
  assert.equal(safeReplaySummary({ digits: [{ name: 'Сжатие', ok: false, seconds: null }], top: null }), 'Открыто 0 из 1.');
});

test('the demo profile’s checks are whole trials of the scheme and carry their count — the error shows in the pitch too', () => {
  const trials = assessmentTrials('proportional').length;
  const st = buildShowcaseState(undefined, '2026-10-20', PLAN_CATALOG, { checkTrials: trials });
  const checks = assessmentHistory(st.runs, 'proportional');
  assert.ok(checks.length >= 2);
  for (const c of checks) {
    assert.equal(c.trials, trials);
    const done = c.completionRate * trials / 100; // a rounded percent of whole trials: 88 % of 8 → 7.04
    assert.ok(Math.abs(done - Math.round(done)) < 0.07, `${c.completionRate} % of ${trials}`);
  }
  assert.notEqual(errorText(completionChange(checks[0], checks.at(-1))), '', 'the trend states the error');
  const old = buildShowcaseState(undefined, '2026-10-20', PLAN_CATALOG);
  assert.ok(assessmentHistory(old.runs).every(c => c.trials === null), 'without the count — as before');
});

test('skill check history carries the trial count; a stored count that is not a positive integer is dropped', () => {
  const run = (trialsTotal, at = '2026-10-20T10:00:00') => ({ at, demo: false, scheme: 'proportional', score: 70, details: { assessment: true, completionRate: 75, trialsTotal } });
  assert.deepEqual(assessmentHistory([run(8), run(0), run('8'), run(-3), run(8.5)]).map(c => c.trials), [8, null, null, null, null]);
});
