import './pin-set.mjs'; // the channel schemes of earlier releases speak the «Синергия» set (tests/pin-set.mjs)
// Q&A of the organizers (04.11.2026): «В Потоке 1 используются оба канала; частоту их использования сбалансировать, без
// доминирования одного» (answer 5), and among the faults of earlier games — «дисбаланс каналов ЭМГ» (answer 30).
// The frequency of use of a channel is how often its command starts: an entry into «Сжатие» uses A, into «Раскрытие» — B
// (after the hold time, the refractory period and the hysteresis of core/signal.js, so a flicker is not a use).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelUse, channelBalance, cleanUses } from '../src/core/channeluse.js';
import { CHANNEL_BALANCE } from '../src/config.js';
import { createGame } from '../src/games/registry.js';
import { runnerFor } from './helpers.mjs';

const intent = (command, valid = true) => ({ valid, command });

test('ответ № 5: a use is an entry into a command — held, it counts once; seconds are kept per channel', () => {
  const use = new ChannelUse();
  const feed = (command, frames, valid = true) => { for (let i = 0; i < frames; i++) use.add(intent(command, valid), 0.1); };
  feed('rest', 3); feed('close', 10); feed('rest', 2); feed('close', 5); feed('open', 4); feed('switch', 3); feed('open', 2);
  assert.deepEqual(use.summary(), { close: 2, open: 2, switch: 1, closeS: 1.5, openS: 0.6 });
  // A frame without signal is no use and breaks nothing: the same command after it is not a new entry.
  feed('open', 3, false); feed('open', 2);
  assert.equal(use.summary().open, 2, 'the exercise froze, the person did not start again');
  feed('rest', 1); feed('open', 1);
  assert.equal(use.summary().open, 3);
  // «Запястье» of a gesture set and «Покой» are not channel commands.
  feed('wrist', 4);
  assert.deepEqual([use.summary().close, use.summary().open], [2, 3]);
});

test('ответ № 5: balance — the share of A among A and B uses; one channel twice as often as the other dominates', () => {
  assert.equal(CHANNEL_BALANCE.dominance, 2);
  assert.equal(channelBalance({ close: 3, open: 2 }), null, `fewer than ${CHANNEL_BALANCE.minUses} uses: no verdict`);
  assert.deepEqual(channelBalance({ close: 6, open: 6 }), { share: 50, verdict: 'balanced' });
  assert.deepEqual(channelBalance({ close: 8, open: 5 }), { share: 62, verdict: 'balanced' });
  assert.deepEqual(channelBalance({ close: 10, open: 5 }), { share: 67, verdict: 'close' }, '2 : 1 is domination');
  assert.deepEqual(channelBalance({ close: 2, open: 9 }), { share: 18, verdict: 'open' });
  assert.deepEqual(channelBalance({ close: 7, open: 0 }), { share: 100, verdict: 'close' });
  assert.equal(channelBalance(null), null);
});

test('ответ № 5: the results say how often each channel started its command — numbers and the lean, no blame', async () => {
  const { usesText } = await import('../src/ui/results.js');
  assert.equal(usesText(null), '');
  assert.equal(usesText({ close: 0, open: 0, switch: 2 }), '', 'co-activations alone are no use of A or B');
  assert.equal(usesText({ close: 2, open: 1, switch: 0 }), 'Команды каналов: сжатие (A) — 2 раза, раскрытие (B) — 1 раз.', 'too few for a verdict');
  assert.equal(usesText({ close: 6, open: 5, switch: 1 }), 'Команды каналов: сжатие (A) — 6 раз, раскрытие (B) — 5 раз, коактивация — 1 раз. Оба канала работали без перекоса.');
  assert.match(usesText({ close: 7, open: 21, switch: 0 }), /B начинал команду втрое чаще A: игровая цифра, подробнее — в отчёте\.$/);
  assert.match(usesText({ close: 9, open: 0, switch: 0 }), /Работал только A/);
  assert.doesNotMatch(usesText({ close: 7, open: 21, switch: 0 }), /ошиб|плохо|неправильно/i);
});

test('ответ № 5: the specialist sees the balance by game and in all — CSV columns, a report table that explains «Мастерская»', async () => {
  const { balanceByGame } = await import('../src/core/channeluse.js');
  const { emptyState, parseState } = await import('../src/core/storage.js');
  const { reportCsv, reportHtml } = await import('../src/services/report.js');
  const at = n => `2026-11-0${n}T10:00:00.000Z`;
  const run = (game, n, uses) => ({ id: `${game}${n}`, at: at(n), game, level: 1, levelCount: 8, scheme: 'threshold', source: 'touch', score: 70, stars: 2, durationS: 90, skills: {}, details: {}, ...(uses ? { uses } : {}) });
  const runs = [
    run('grip', 1, { close: 7, open: 21, switch: 0, closeS: 30, openS: 20 }),
    run('flight', 2, { close: 9, open: 8, switch: 1, closeS: 12, openS: 11 }),
    run('flight', 3, { close: 3, open: 2, switch: 0, closeS: 4, openS: 3 }),
    run('rhythm', 4, null),
  ];
  const { rows, total } = balanceByGame(runs);
  assert.deepEqual(rows.map(r => [r.game, r.runs, r.close, r.open, r.share, r.timeShare, r.verdict]), [
    ['grip', 1, 7, 21, 25, 60, 'open'], ['flight', 2, 12, 10, 55, 53, 'balanced']]);
  assert.deepEqual([total.runs, total.close, total.open, total.switch, total.verdict], [3, 19, 31, 1, 'balanced'], 'a run without uses is left out');
  const state = emptyState();
  state.runs = runs;
  const clean = parseState(JSON.stringify(state));
  const [head, ...lines] = reportCsv(clean).split('\n');
  const col = name => head.split(';').indexOf(name);
  assert.ok(col('uses_close') > 0 && col('uses_close') < col('signal_issues'));
  assert.deepEqual(lines.map(l => l.split(';').slice(col('uses_close'), col('uses_switch') + 1).join('/')), ['7/21/0', '9/8/1', '3/2/0', '//']);
  const html = reportHtml(clean, id => ({ grip: 'Мастерская', flight: 'Полёт' }[id] ?? id));
  assert.match(html, /<h2>Баланс каналов A и B<\/h2>/);
  assert.match(html, /<td>Мастерская<\/td><td>1<\/td><td>7<\/td><td>21<\/td><td>0<\/td><td>25 %<\/td><td>60 %<\/td><td>в сторону B<\/td>/);
  assert.match(html, /<td>Все игры<\/td><td>3<\/td>/);
  assert.match(html, /смена хвата протеза «Моторики»/, 'the lean of «Мастерская» is explained, not blamed');
  assert.doesNotMatch(reportHtml(parseState(JSON.stringify(emptyState()))), /Баланс каналов/, 'no uses — no section');
});

test('ответ № 5: a backup cannot invent uses — known fields, whole numbers within bounds', () => {
  assert.deepEqual(cleanUses({ close: 4, open: 3, switch: 1, closeS: 12.3, openS: 9.8, extra: 'x' }), { close: 4, open: 3, switch: 1, closeS: 12.3, openS: 9.8 });
  assert.equal(cleanUses({ close: -1, open: 3 }), null);
  assert.equal(cleanUses({ close: 2.5, open: 3 }), null);
  assert.equal(cleanUses({ close: '4', open: 3 }), null);
  assert.equal(cleanUses({ close: 1e9, open: 3 }), null);
  assert.equal(cleanUses('x'), null);
  assert.deepEqual(cleanUses({ close: 4, open: 3 }), { close: 4, open: 3, switch: 0 }, 'seconds are optional, switches default to 0');
});

test('ответ № 5: the runner counts uses only while the exercise runs — not paused, not without signal', () => {
  const game = createGame('flight', { levelNumber: 1, scheme: 'threshold', seed: 3 });
  const runner = runnerFor(game, { scheme: 'threshold', realism: 0, seed: 3, autopilot: true });
  const dt = 1 / 60;
  let t = 0;
  for (; t < 5; t += dt) runner.step(t * 1000, dt);
  const before = runner.uses.summary();
  assert.ok(before.close + before.open > 0, JSON.stringify(before));
  game.paused = true;
  for (; t < 12; t += dt) runner.step(t * 1000, dt);
  assert.deepEqual(runner.uses.summary(), before, 'a paused exercise uses no channel');
});

/** Every level of a game, autopilot, one channel scheme: the uses pooled. */
function pooled(id, scheme) {
  const levels = createGame(id, { levelNumber: 1, scheme, seed: 1 }).constructor.levels.length;
  const sum = { close: 0, open: 0, switch: 0 };
  const per = [];
  for (let L = 1; L <= levels; L++) {
    const game = createGame(id, { levelNumber: L, scheme, seed: 3 });
    const runner = runnerFor(game, { scheme, realism: 0.5, seed: 3, autopilot: true });
    const dt = 1 / 60;
    for (let t = 0; !game.done && t < 300; t += dt) runner.step(t * 1000, dt);
    const u = runner.uses.summary();
    per.push(u);
    for (const k of Object.keys(sum)) sum[k] += u[k];
  }
  return { sum, per, share: sum.close / (sum.close + sum.open) };
}

// The design itself must not lean on one channel (answer 5): the autopilot plays what the tasks ask for, every level.
// «Мастерская» follows the prosthesis's law: a grip change is B twice (open, then open again for 1 s — Motorica Start),
// and releasing is B too, so its levels with grip changes lean on the extensors; it keeps the looser 1 : 3.
const BANDS = { grip: [1 / 4, 3 / 4] };
for (const id of ['grip', 'flight', 'rhythm', 'safe', 'duo', 'check']) {
  for (const scheme of ['threshold', 'proportional']) {
    test(`ответ № 5: «${id}», ${scheme} — the tasks of all levels use A and B without 2 : 1 domination`, () => {
      const { sum, share } = pooled(id, scheme);
      const [lo, hi] = BANDS[id] ?? [1 / 3, 2 / 3];
      assert.ok(share >= lo && share <= hi, `${id} ${scheme}: A ${sum.close}, B ${sum.open} → ${Math.round(share * 100)} %`);
    });
  }
}

// A day of the four games: no 2 : 1 at any level. Not tighter: from level 4 «Мастерская» changes grips the Motorica way (B
// twice a change), and in the proportional scheme its B uses outnumber the rest of the day's A at levels 5–6 (34–38 %).
test('ответ № 5: a day of the four main games never leans 2 : 1 on one channel, at any level, in either channel scheme', () => {
  for (const scheme of ['threshold', 'proportional']) {
    const games = ['grip', 'flight', 'rhythm', 'safe'].map(id => pooled(id, scheme));
    const levels = Math.min(...games.map(g => g.per.length));
    for (let L = 0; L < levels; L++) {
      const close = games.reduce((s, g) => s + g.per[L].close, 0), open = games.reduce((s, g) => s + g.per[L].open, 0);
      const share = close / (close + open);
      assert.ok(share >= 1 / 3 && share <= 2 / 3, `${scheme} L${L + 1}: A ${close}, B ${open} → ${Math.round(share * 100)} %`);
    }
  }
});

test('ответ № 5: «Сейф» in the channel schemes deals a balanced code — closing and opening digits differ by one at most', () => {
  for (const scheme of ['threshold', 'proportional']) {
    for (let L = 1; L <= 8; L++) for (let seed = 1; seed <= 60; seed++) {
      const code = createGame('safe', { levelNumber: L, scheme, seed }).code;
      const close = code.filter(d => d.command === 'close').length, open = code.filter(d => d.command === 'open').length;
      assert.ok(Math.abs(close - open) <= 1, `${scheme} L${L} seed ${seed}: ${code.map(d => d.id).join(' ')}`);
      for (let i = 1; i < code.length; i++) assert.notEqual(code[i].id, code[i - 1].id, 'no digit repeats the one before it');
    }
  }
});

test('ответ № 5: the gesture scheme of «Сейф» keeps the deal of 6.0.0 — the codes its levels were balanced and tested on', async () => {
  const { PROMPTS, SafeGame } = await import('../src/games/safe.js');
  const { createRng } = await import('../src/core/rng.js');
  for (let L = 1; L <= SafeGame.levels.length; L++) for (let seed = 1; seed <= 5; seed++) {
    // The algorithm of 6.0.0, verbatim, on the same generator: any gesture set, any level.
    const rng = createRng(seed), pool = PROMPTS.gesture.filter(p => p.from <= L), want = [];
    for (let i = 0; i < SafeGame.levels[L - 1].code; i++) { let p; do { p = rng.pick(pool); } while (pool.length > 1 && p.id === want[i - 1]); want.push(p.id); }
    assert.deepEqual(createGame('safe', { levelNumber: L, scheme: 'gesture', seed }).code.map(d => d.id), want, `L${L} seed ${seed}`);
  }
});

test('ответ № 5: «Полёт» — side rings alternate strictly; the follow segment takes either side, both over the seeds', async () => {
  const { TRACE, SINE } = await import('../src/games/flight.js');
  for (let L = 1; L <= 8; L++) for (let seed = 1; seed <= 20; seed++) {
    const rings = createGame('flight', { levelNumber: L, scheme: 'proportional', seed }).track.filter(i => i.kind === 'ring' && i.side !== 0);
    for (let i = 1; i < rings.length; i++) assert.equal(rings[i].side, -rings[i - 1].side, `L${L} seed ${seed}: side rings alternate`);
  }
  const sides = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const track = createGame('flight', { levelNumber: 3, scheme: 'proportional', seed }).track;
    const trace = track.find(i => i.kind === 'trace');
    sides.add(trace.side);
    assert.equal(trace.goal, trace.side > 0 ? TRACE.goal : 1 - TRACE.goal, 'a B-side ramp is the mirror of the A-side one');
    const sine = createGame('flight', { levelNumber: 6, scheme: 'proportional', seed }).track.find(i => i.kind === 'sine');
    assert.equal(sine.center, sine.side > 0 ? SINE.center : 1 - SINE.center);
  }
  assert.deepEqual([...sides].sort(), [-1, 1], 'both muscles get the ramp');
});
