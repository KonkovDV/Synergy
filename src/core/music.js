// Procedural music for «Ритм» (PLAN 2.13): count-in sticks, kick and snare on the beats, bass and chords in
// the level's key. Pure and deterministic: (bpm, beats, countIn, seed, level) → events in game seconds.
// The beat is a timing reference (rhythmic auditory cueing); the music never moves the notes.
import { createRng } from './rng.js';
import { MUSIC } from '../config.js';

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// Scale degrees (0 = I): I–V–vi–IV, vi–IV–I–V, I–vi–IV–V, I–IV–V–IV — common major-key loops.
const PROGRESSIONS = [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [0, 3, 4, 3]];

export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);

/** Triad on scale degree `d` of the major key with tonic `root` (MIDI): [root, third, fifth]. */
export function triad(root, d) {
  const note = i => root + MAJOR[(d + i) % 7] + 12 * Math.floor((d + i) / 7);
  return [note(0), note(2), note(4)];
}

/**
 * @returns {{t:number, voice:string, gain:number, freq?:number, freqs?:number[], dur?:number}[]} sorted by t
 */
export function musicPattern({ bpm, beats, countIn = 4, seed = 1, level = 1 }) {
  const rng = createRng(seed * 31 + level);
  const beat = 60 / bpm, end = (countIn + beats) * beat, g = MUSIC.gain;
  const root = MUSIC.keys[(level - 1) % MUSIC.keys.length];
  const progression = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)];
  const events = [];
  for (let i = 0; i < countIn; i++) events.push({ t: i * beat, voice: 'stick', gain: i ? g.stick * 0.7 : g.stick });
  for (let bar = 0; (countIn + 4 * bar) * beat < end - 1e-9; bar++) {
    const t0 = (countIn + 4 * bar) * beat;
    const chord = triad(root, progression[bar % progression.length]);
    events.push({ t: t0, voice: 'pad', freqs: chord.map(m => midiToHz(m + 12)), dur: Math.min(4 * beat, end - t0) * 0.95, gain: g.pad });
    for (let b = 0; b < 4 && t0 + b * beat < end - 1e-9; b++) {
      const t = t0 + b * beat;
      events.push({ t, voice: b % 2 ? 'snare' : 'kick', gain: b % 2 ? g.snare : g.kick });
      events.push({ t, voice: 'bass', freq: midiToHz(chord[b === 2 ? 2 : 0] - 12), dur: beat * 0.8, gain: g.bass });
      if (level >= MUSIC.hatsFrom) events.push({ t: t + beat / 2, voice: 'hat', gain: g.hat });
    }
  }
  return events.sort((x, y) => x.t - y.t);
}

/**
 * The device's audio clock with the player's correction (Настройки → «Синхронизация звука», 5.11). `outputLatency`
 * is often missing or optimistic for Bluetooth headphones; rhythm games let the player nudge the sound until it
 * matches the picture. Positive offset = the sound is heard later than the device reports, so it is started earlier.
 */
export function offsetClock(clock, offsetMs = 0) {
  return () => {
    const c = clock();
    return c && { now: c.now, latency: c.latency + (Number.isFinite(offsetMs) ? offsetMs : 0) / 1000 };
  };
}

/** A click on every beat for the sync screen: what is heard is compared with a dot reaching the line. */
export function clickTrack(periodS, count, gain = MUSIC.gain.stick * 2) {
  return Array.from({ length: count }, (_, k) => ({ t: (k + 1) * periodS, voice: 'stick', gain }));
}

/**
 * MusicPlayer — schedules pattern events on the audio clock so that each one is HEARD when the game time
 * reaches it: start = now + (event.t − gameTime) / speed − outputLatency, a lookahead window at a time.
 * Dependencies are injected (clock, play), so the scheduling is tested without WebAudio.
 */
export class MusicPlayer {
  /**
   * @param {object[]} events musicPattern() output
   * @param {{clock: () => ({now:number, latency:number}|null), play: (event, at:number, speed:number) => {stop():void}|null}} audio
   */
  constructor(events, { clock, play }, params = MUSIC) {
    Object.assign(this, { events, clock, play, params });
    this.next = 0; this.sounding = [];
  }

  /** Call every frame. `running` false (intro, pause, finish) silences what is scheduled ahead. */
  update(gameTime, speed = 1, running = true) {
    const clock = this.clock();
    if (!clock) return;
    if (!running) { this.silence(clock.now); return; }
    this.sounding = this.sounding.filter(s => s.at > clock.now - 8);
    while (this.next < this.events.length) {
      const e = this.events[this.next];
      const lead = (e.t - gameTime) / speed - clock.latency;
      if (lead > this.params.lookaheadS) break;
      const index = this.next++;
      if (lead < -this.params.lateS) continue;
      const at = clock.now + Math.max(0, lead);
      const handle = this.play(e, at, speed);
      if (handle) this.sounding.push({ at, handle, index });
    }
  }

  /** Stops everything not yet heard and rewinds to it: on resume it is scheduled again, what has passed is skipped. */
  silence(now) {
    const ahead = this.sounding.filter(s => s.at > now);
    for (const s of ahead) s.handle.stop();
    if (ahead.length) this.next = Math.min(this.next, ...ahead.map(s => s.index));
    this.sounding = this.sounding.filter(s => s.at <= now);
  }
}
