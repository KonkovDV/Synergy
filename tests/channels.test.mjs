import './pin-set.mjs'; // the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Answers of the organizers 04.11.2026, № 5: «в Потоке 1 используются оба канала; частоту их использования
// сбалансировать, без доминирования одного»; № 30: «дисбаланс каналов ЭМГ» — a failing of earlier games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelUsage, channelShares, sumChannels, cleanChannels } from '../src/core/channels.js';
import { parseState, emptyState } from '../src/core/storage.js';
import { reportCsv, reportHtml } from '../src/services/report.js';
import { channelText } from '../src/ui/results.js';

const intent = (aOn, bOn, valid = true) => ({ valid, aOn, bOn });

test('№ 5 баланс каналов: switch-ons and seconds on per channel; a lost signal counts nothing and ends the run of a channel', () => {
  const u = new ChannelUsage();
  assert.equal(u.summary(), null, 'nothing switched on — nothing to show');
  for (let i = 0; i < 30; i++) u.add(intent(true, false), 0.1);   // A held 3 s: one switch-on
  for (let i = 0; i < 5; i++) u.add(intent(false, false), 0.1);
  for (let i = 0; i < 10; i++) u.add(intent(false, true), 0.1);   // B 1 s
  u.add(intent(false, true, false), 0.1);                          // the signal is lost…
  for (let i = 0; i < 10; i++) u.add(intent(false, true), 0.1);   // …and back: a new switch-on of B
  u.add(intent(true, true), 0.1);                                  // both: each channel switched on
  assert.deepEqual(u.summary(), { onA: 2, onB: 2, timeA: 3.1, timeB: 2.1 });
  assert.deepEqual(channelShares(u.summary()), { byOn: 50, byTime: 60 });
});

test('№ 5 баланс каналов: the runner counts only while the exercise runs — not in the intro, the countdown or a pause', async () => {
  const { GameRunner } = await import('../src/games/runner.js');
  let paused = true;
  const runner = new GameRunner({ game: { get paused() { return paused; }, speed: 1, update() {} }, pipeline: { process: () => intent(true, false) }, hand: { update() {} }, source: { sample: () => null } });
  for (let i = 0; i < 10; i++) runner.step(i * 100, 0.1);
  assert.equal(runner.usage.summary(), null, 'the intro and the countdown are not play');
  paused = false;
  for (let i = 10; i < 20; i++) runner.step(i * 100, 0.1);
  assert.deepEqual(runner.usage.summary(), { onA: 1, onB: 0, timeA: 1, timeB: 0 });
});

test('№ 5 баланс каналов: the results line names both measures; a period of runs is added up; a backup keeps only sane numbers', () => {
  const text = channelText({ onA: 12, onB: 11, timeA: 30.5, timeB: 9.1 });
  assert.match(text, /закрытие \(A\) включалось 12 раз, открытие \(B\) — 11 раз/);
  assert.match(text, /по включениям 52 %, по времени 77 %/);
  assert.equal(channelText(null), '');
  assert.deepEqual(sumChannels([{ channels: { onA: 2, onB: 1, timeA: 1.5, timeB: 0.5 } }, {}, { channels: { onA: 1, onB: 3, timeA: 0.5, timeB: 2.25 } }]), { runs: 2, onA: 3, onB: 4, timeA: 2, timeB: 2.8 });
  assert.equal(sumChannels([{}, {}]), null);
  assert.equal(cleanChannels({ onA: -1, onB: 2, timeA: 1, timeB: 1 }), null);
  assert.equal(cleanChannels({ onA: 1, onB: 2, timeA: 'x', timeB: 1 }), null);
  const state = emptyState();
  state.runs.push({ id: 'r1', at: '2026-11-05T10:00:00.000Z', game: 'grip', level: 1, scheme: 'threshold', source: 'touch', score: 70, stars: 2, durationS: 40, skills: {}, channels: { onA: 9, onB: 7, timeA: 20, timeB: 6 } },
    { id: 'r2', at: '2026-11-05T10:05:00.000Z', game: 'flight', level: 1, scheme: 'threshold', source: 'touch', score: 70, stars: 2, durationS: 40, skills: {}, channels: { onA: 1e9, onB: 7, timeA: 20, timeB: 6 } });
  const back = parseState(JSON.stringify(state));
  assert.deepEqual(back.runs.find(r => r.id === 'r1')?.channels, { onA: 9, onB: 7, timeA: 20, timeB: 6 });
  assert.equal(back.runs.find(r => r.id === 'r2')?.channels, undefined, 'an impossible count is dropped, the run stays');
  const csv = reportCsv(back).split('\n');
  const head = csv[0].split(';'), row = csv[1].split(';');
  assert.deepEqual(['channel_on_a', 'channel_on_b', 'channel_time_a_s', 'channel_time_b_s'].map(k => row[head.indexOf(k)]), ['9', '7', '20', '6']);
  const html = reportHtml(back);
  assert.match(html, /Баланс каналов/);
  assert.match(html, /56 %/, 'by switch-ons: 9 of 16');
});
