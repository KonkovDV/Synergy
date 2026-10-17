// On-screen and keyboard controls of the EMG emulator (for testing without sensors).
// Two-channel pads: hold = muscle activation, finger height inside the pad = strength,
// both pads (two thumbs) or the «A+B» key = co-contraction. Gesture scheme: 7 gesture keys.
import { GESTURES, ACTIVE_GESTURES } from '../core/vocabulary.js';
import { drawHand } from '../render/draw.js';
import { h } from '../ui/dom.js';

const MIN_LEVEL = 0.12;

function levelFromPointer(el, e) {
  const r = el.getBoundingClientRect();
  return Math.max(MIN_LEVEL, Math.min(1, (r.bottom - e.clientY) / r.height));
}

/** Makes `el` behave like a muscle: pointerdown/move set level, release relaxes. */
function bindPad(el, onLevel) {
  const active = new Set();
  const update = e => { onLevel(levelFromPointer(el, e)); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); active.add(e.pointerId); el.classList.add('on'); update(e); });
  el.addEventListener('pointermove', e => { if (active.has(e.pointerId)) update(e); });
  const end = e => { if (!active.delete(e.pointerId)) return; if (!active.size) { el.classList.remove('on'); onLevel(0); } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function padView(label, sub, cls) {
  const fill = h('div', { class: 'pad-fill' });
  const value = h('div', { class: 'pad-value' }, '0%');
  const el = h('div', { class: `pad ${cls}`, role: 'button', 'aria-label': `${label}: удерживайте, высота пальца — сила` },
    fill, h('div', { class: 'pad-ticks' }), h('div', { class: 'pad-label' }, h('b', {}, label), h('span', {}, sub)), value);
  const show = level => { fill.style.height = `${Math.round(level * 100)}%`; value.textContent = `${Math.round(level * 100)}%`; };
  return { el, show };
}

export function createTwoChannelPads(emulator) {
  const state = { a: 0, b: 0, co: 0 };
  const apply = () => emulator.setTarget({ gesture: null, a: Math.max(state.a, state.co), b: Math.max(state.b, state.co) });
  const A = padView('A', 'сжатие', 'pad-a');
  const B = padView('B', 'раскрытие', 'pad-b');
  const co = h('button', { class: 'pad-co', type: 'button', 'aria-label': 'Коактивация: оба канала сразу' }, 'A+B');
  bindPad(A.el, v => { state.a = v; A.show(v); apply(); });
  bindPad(B.el, v => { state.b = v; B.show(v); apply(); });
  bindPad(co, v => { state.co = v ? 0.75 : 0; apply(); });
  return h('div', { class: 'pads two' }, A.el, co, B.el);
}

export function gestureIcon(gesture, skin = 'icon', size = 44) {
  const canvas = h('canvas', { width: size * 2, height: size * 2, class: 'gesture-icon', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  drawHand(ctx, { x: size / 2, y: size * 0.95, size: size * 0.42, pose: gesture.pose, skin, sleeve: false });
  return canvas;
}

export function createGesturePads(emulator, skin) {
  const keys = ACTIVE_GESTURES.map(g => {
    const el = h('div', { class: 'gkey', role: 'button', 'aria-label': `Жест ${g.name}` }, gestureIcon(g), h('span', {}, g.name));
    bindPad(el, v => { emulator.setTarget(v ? { gesture: g.id, effort: v } : { gesture: 'rest', effort: 0 }); });
    return el;
  });
  emulator.setTarget({ gesture: 'rest', effort: 0 });
  return h('div', { class: 'pads gestures' }, ...keys, h('p', { class: 'pads-note' }, 'Удерживайте жест; выше палец — сильнее'));
}

/** Keyboard: F/← = A, J/→ = B, Space = A+B; hold longer = stronger; digits = gestures in GESTURES order (1 = rest). */
export function bindKeyboard(emulator, getScheme) {
  const held = new Map();
  let raf = 0;
  const tick = () => {
    const now = performance.now();
    const level = key => (held.has(key) ? Math.min(1, 0.3 + (now - held.get(key)) / 1600) : 0);
    if (getScheme() === 'gesture') {
      const g = [...held.keys()].find(k => /^Digit[1-9]$/.test(k));
      const gesture = (g && GESTURES[Number(g.slice(5)) - 1]?.id) || 'rest';
      emulator.setTarget({ gesture, effort: g ? level(g) : 0 });
    } else {
      const co = level('Space') ? 0.75 : 0;
      emulator.setTarget({ gesture: null, a: Math.max(co, level('KeyF'), level('ArrowLeft')), b: Math.max(co, level('KeyJ'), level('ArrowRight')) });
    }
    raf = held.size ? requestAnimationFrame(tick) : 0;
  };
  const relevant = code => /^(KeyF|KeyJ|ArrowLeft|ArrowRight|Space|Digit[1-9])$/.test(code);
  const down = e => {
    if (!relevant(e.code) || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (!document.querySelector('.play-screen')) return;
    e.preventDefault(); held.set(e.code, performance.now()); if (!raf) tick();
  };
  const up = e => { if (held.delete(e.code)) tick(); };
  const blur = () => { held.clear(); tick(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
}
