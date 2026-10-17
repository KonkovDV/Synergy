// Procedural sound effects (WebAudio): no audio files, works offline, starts on first user gesture.
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

function tone(freq, dur, { type = 'sine', gain = 0.15, slide = 0, delay = 0 } = {}) {
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise(dur, gain = 0.2, filter = 1200) {
  const ac = audio(); if (!ac) return;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = filter;
  src.buffer = buffer; g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination); src.start();
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
