// Procedural sound effects and music voices (WebAudio): no audio files, works offline, starts on first user gesture.
import { MUSIC } from '../config.js';

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { audio(); }

/** One oscillator note. `at` — absolute audio time (scheduled music), else now + delay. Returns the node. */
function tone(freq, dur, { type = 'sine', gain = 0.15, slide = 0, delay = 0, attack = 0, at, out } = {}) {
  const ac = audio(); if (!ac) return null;
  const t0 = at ?? ac.currentTime + delay;
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  if (attack) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); } else g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.01));
  osc.connect(g).connect(out ?? ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
  return osc;
}

function noise(dur, gain = 0.2, filter = 1200, { type = 'lowpass', at, out } = {}) {
  const ac = audio(); if (!ac) return null;
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = type; f.frequency.value = filter;
  src.buffer = buffer; g.gain.value = gain;
  src.connect(f).connect(g).connect(out ?? ac.destination); src.start(at ?? ac.currentTime);
  return src;
}

/** Audio clock for scheduled music: what is started at T is heard at T + latency (outputLatency + baseLatency). */
export function audioClock() {
  const ac = audio();
  if (!ac || ac.state !== 'running') return null;
  return { now: ac.currentTime, latency: Math.min(0.5, Math.max(0, (ac.outputLatency || 0) + (ac.baseLatency || 0))) };
}

// Voices of the procedural music (events from core/music.js); k stretches durations when the game is slowed.
const VOICES = {
  stick: (e, at, out) => [tone(1800, 0.03, { type: 'square', gain: e.gain, at, out })],
  kick: (e, at, out, k) => [tone(110, 0.16 * k, { type: 'sine', gain: e.gain, slide: -70, at, out })],
  snare: (e, at, out) => [noise(0.12, e.gain, 2500, { at, out }), tone(190, 0.08, { type: 'triangle', gain: e.gain * 0.5, at, out })],
  hat: (e, at, out) => [noise(0.03, e.gain, 8000, { type: 'highpass', at, out })],
  bass: (e, at, out, k) => [tone(e.freq, e.dur * k, { type: 'triangle', gain: e.gain, attack: 0.01, at, out })],
  pad: (e, at, out, k) => e.freqs.map(f => tone(f, e.dur * k, { type: 'sine', gain: e.gain, attack: 0.08, at, out })),
};
let musicBus = null;

/** Plays one music event at audio time `at`; the handle stops it if it has not been heard yet. */
export function playMusic(event, at, speed = 1) {
  const ac = audio(); if (!ac || !VOICES[event.voice]) return null;
  if (!musicBus) { musicBus = ac.createGain(); musicBus.gain.value = MUSIC.busGain; musicBus.connect(ac.destination); }
  const nodes = VOICES[event.voice](event, at, musicBus, 1 / speed).filter(Boolean);
  return { stop: () => nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }) };
}

const SOUNDS = {
  click: () => tone(660, 0.05, { type: 'triangle', gain: 0.08 }),
  tick: () => tone(1200, 0.03, { type: 'square', gain: 0.03 }),
  ring: () => { tone(880, 0.12, { type: 'triangle' }); tone(1320, 0.12, { type: 'triangle', delay: 0.06 }); },
  perfect: () => { [880, 1108, 1320].forEach((f, i) => tone(f, 0.14, { type: 'triangle', delay: i * 0.05 })); },
  hit: () => tone(740, 0.08, { type: 'triangle', gain: 0.12 }),
  soft: () => tone(520, 0.12, { type: 'sine' }),
  miss: () => tone(220, 0.18, { type: 'sawtooth', gain: 0.06, slide: -80 }),
  lift: () => tone(440, 0.15, { type: 'sine', slide: 220 }),
  switch: () => { tone(500, 0.06, { type: 'square', gain: 0.05 }); tone(750, 0.06, { type: 'square', gain: 0.05, delay: 0.07 }); },
  success: () => { [660, 880, 1100].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.07 })); },
  crush: () => noise(0.3, 0.25, 900),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.09 })); },
  lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'sine', delay: i * 0.1 })); },
  levelup: () => { [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', delay: i * 0.08 })); },
  beat: ({ strong } = {}) => { tone(strong ? 90 : 70, 0.12, { type: 'sine', gain: strong ? 0.35 : 0.22, slide: -40 }); if (!strong) noise(0.03, 0.04, 6000); },
};

export function play(name, extra) { SOUNDS[name]?.(extra); }
