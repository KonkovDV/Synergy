// Procedural music of «Ритм» (PLAN 2.13): deterministic, in key, on the beat, quieter than the effects;
// the player schedules each event to be HEARD at its game time (lookahead, output latency, pause/resume).
import test from 'node:test';
import assert from 'node:assert/strict';
import { musicPattern, MusicPlayer, MAJOR, triad, midiToHz, offsetClock, clickTrack } from '../src/core/music.js';
import { MUSIC } from '../src/config.js';
import { createGame } from '../src/games/registry.js';

const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
const args = { bpm: 80, beats: 32, countIn: 4, seed: 7, level: 3 };

test('music: deterministic, inside the song, kick on every bar, beats at 60/bpm', () => {
  const ev = musicPattern(args);
  assert.deepEqual(ev, musicPattern(args));
  const beat = 60 / args.bpm, end = (args.countIn + args.beats) * beat;
  assert.ok(ev.every(e => e.t >= 0 && e.t < end + 1e-9));
  assert.equal(ev.filter(e => e.voice === 'stick').length, args.countIn, 'count-in');
  const drums = ev.filter(e => e.voice === 'kick' || e.voice === 'snare').map(e => e.t);
  assert.equal(drums.length, args.beats);
  drums.forEach((t, i) => assert.ok(Math.abs(t - (args.countIn + i) * beat) < 1e-9, `beat ${i}`));
  for (let bar = 0; bar < args.beats / 4; bar++) assert.ok(ev.some(e => e.voice === 'kick' && Math.abs(e.t - (args.countIn + 4 * bar) * beat) < 1e-9), `kick on bar ${bar}`);
  assert.ok(ev.some(e => e.voice === 'hat') && !musicPattern({ ...args, level: 1 }).some(e => e.voice === 'hat'), 'hi-hats from level 3');
});

test('music: every pitch is in the key of the level; music is quieter than the hit sound', () => {
  for (let level = 1; level <= 8; level++) {
    const root = MUSIC.keys[level - 1];
    for (const e of musicPattern({ ...args, level })) {
      for (const f of e.freqs ?? (e.freq ? [e.freq] : [])) {
        const step = ((Math.round(hzToMidi(f)) - root) % 12 + 12) % 12;
        assert.ok(MAJOR.includes(step), `level ${level}: ${f.toFixed(1)} Hz`);
      }
      assert.ok(e.gain * MUSIC.busGain <= 0.15, `${e.voice} under the effects`);
    }
  }
  assert.deepEqual(triad(60, 0), [60, 64, 67]);
  assert.ok(Math.abs(midiToHz(69) - 440) < 1e-9);
});

test('music: «Ритм» exposes its song, aligned with the chart', () => {
  const game = createGame('rhythm', { levelNumber: 2, scheme: 'proportional', seed: 3 });
  const ev = game.music();
  const firstNote = Math.min(...game.notes.map(n => n.at));
  assert.ok(ev.some(e => e.voice === 'kick' && Math.abs(e.t - firstNote) < 1e-9), 'the first note falls on a kick');
  assert.equal(createGame('grip', { levelNumber: 1, scheme: 'proportional', seed: 3 }).music(), null, 'other games are silent');
});

/** Fake audio clock: `now` and `latency` are set by the test; play() records what was scheduled. */
function fakeAudio(latency = 0.1) {
  const audio = { now: 10, latency, played: [], stopped: 0 };
  audio.clock = () => ({ now: audio.now, latency: audio.latency });
  audio.play = (e, at) => { const h = { e, at, stop: () => { audio.stopped++; h.stoppedAt = audio.now; } }; audio.played.push(h); return h; };
  return audio;
}

test('music player: each event is scheduled to be heard at its game time, once', () => {
  const a = fakeAudio(0.1), events = musicPattern(args);
  const player = new MusicPlayer(events, a);
  for (let gt = 0; gt < 3; gt += 1 / 60) { a.now = 10 + gt; player.update(gt, 1, true); }
  assert.ok(a.played.length > 0);
  for (const h of a.played) {
    const heard = h.at + a.latency, due = 10 + h.e.t;
    assert.ok(Math.abs(heard - due) < 1 / 60 + 1e-9, `${h.e.voice} at ${h.e.t}: heard ${heard.toFixed(3)} vs due ${due.toFixed(3)}`);
  }
  assert.equal(new Set(a.played.map(h => h.e)).size, a.played.length, 'never twice');
  assert.ok(a.played.every(h => h.at - a.now <= MUSIC.lookaheadS + 1), 'only a lookahead window ahead');
});

test('music player: slowed game time stretches the schedule; pause silences and resume replays what was stopped', () => {
  const a = fakeAudio(0), events = musicPattern(args);
  const slow = new MusicPlayer(events, a);
  for (let rt = 0; rt < 2; rt += 1 / 60) { a.now = 10 + rt; slow.update(rt * 0.6, 0.6, true); }
  for (const h of a.played) assert.ok(Math.abs(h.at - (10 + h.e.t / 0.6)) < 1 / 60 + 1e-9, 'game time at 60 %');

  const b = fakeAudio(0.05), player = new MusicPlayer(events, b);
  // Count-in sticks every 0.75 s: pause 0.1 s before the stick at 2.25 s, when it is already scheduled.
  let gt = 0;
  for (; gt < 2.15; gt += 1 / 60) { b.now = 10 + gt; player.update(gt, 1, true); }
  const before = b.played.length;
  player.update(gt, 1, false); // pause
  assert.ok(b.stopped > 0, 'scheduled-ahead events are stopped');
  b.now += 5; // paused for 5 s, game time stays
  player.update(gt, 1, true);
  const replayed = b.played.slice(before);
  assert.ok(replayed.length > 0 && replayed.every(h => h.e.t >= gt - MUSIC.lateS), 'resume replays the stopped events, not the past');
});

test('music: the player\'s sync offset moves when a click is started, not when it is heard (B.2, 5.11)', () => {
  const late = fakeAudio(0.02), on = fakeAudio(0.02);
  const track = clickTrack(0.75, 8);
  assert.deepEqual(track.slice(0, 2).map(e => e.t), [0.75, 1.5]);
  const shifted = new MusicPlayer(track, { clock: offsetClock(late.clock, 180), play: late.play });
  const plain = new MusicPlayer(track, { clock: offsetClock(on.clock, 0), play: on.play });
  for (let gt = 0; gt < 7; gt += 1 / 60) { late.now = on.now = 10 + gt; shifted.update(gt, 1, true); plain.update(gt, 1, true); }
  // Headphones that add 180 ms unreported: started 180 ms earlier, so heard (device latency + 180 ms later) on the beat.
  for (const h of late.played) assert.ok(Math.abs(h.at + 0.02 + 0.18 - (10 + h.e.t)) < 1 / 60 + 1e-9, `click at ${h.e.t}`);
  assert.equal(late.played.length, 8, 'every click once'); assert.equal(on.played.length, 8);
  assert.equal(offsetClock(() => null, 100)(), null, 'no audio — no clock');
  assert.equal(offsetClock(on.clock, NaN)().latency, on.latency, 'a damaged offset is ignored');
});
