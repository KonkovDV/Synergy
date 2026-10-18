// On-screen and keyboard controls of the EMG emulator (for testing without sensors).
// Two-channel pads: hold = muscle activation, finger height inside the pad = strength,
// both pads (two thumbs) or the «A+B» key = co-contraction. Gesture scheme: 7 gesture keys.
import { GESTURES, ACTIVE_GESTURES } from '../core/vocabulary.js';
import { drawHand } from '../render/draw.js';
import { h, longestWord } from './dom.js';

const MIN_LEVEL = 0.12;

function levelFromPointer(el, e) {
  const r = el.getBoundingClientRect();
  return Math.max(MIN_LEVEL, Math.min(1, (r.bottom - e.clientY) / r.height));
}

/**
 * Pads without holding (5.9, Settings → Доступность; Game Accessibility Guidelines: avoid required holds):
 * a tap latches the pad at the level of the touch, a second tap releases it — for tremor or weakness.
 */
let sticky = false;
export function setPadMode({ sticky: on = false } = {}) { sticky = !!on; }

/** Makes `el` behave like a muscle: pointerdown/move set level, release relaxes (or a second tap, when latched). */
function bindPad(el, onLevel, group = null) {
  const active = new Set();
  let latched = false;
  const update = e => { onLevel(levelFromPointer(el, e)); };
  const release = () => { latched = false; el.classList.remove('on'); onLevel(0); };
  el.padRelease = release;
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture?.(e.pointerId); active.add(e.pointerId);
    if (sticky) {
      if (latched) { release(); return; }
      if (group?.current && group.current !== el) group.current.padRelease();
      latched = true; if (group) group.current = el;
    }
    el.classList.add('on'); update(e);
  });
  el.addEventListener('pointermove', e => { if (active.has(e.pointerId) && (!sticky || latched)) update(e); });
  const end = e => { if (!active.delete(e.pointerId)) return; if (!active.size && !latched) { el.classList.remove('on'); onLevel(0); } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/**
 * Keyboard / switch access to a focused pad (5.8): Space or Enter held = the muscle held; the level grows with
 * the hold like the global keys. A switch interface usually sends exactly these keys.
 */
function bindPadKeys(el, onLevel) {
  let start = 0, raf = 0;
  const isPress = e => e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter';
  const tick = () => { onLevel(Math.min(1, 0.3 + (performance.now() - start) / 1600)); raf = requestAnimationFrame(tick); };
  const end = () => { if (!raf) return; cancelAnimationFrame(raf); raf = 0; el.classList.remove('on'); onLevel(0); };
  el.addEventListener('keydown', e => {
    if (!isPress(e)) return;
    e.preventDefault(); e.stopPropagation();
    if (!raf) { start = performance.now(); el.classList.add('on'); tick(); }
  });
  el.addEventListener('keyup', e => { if (isPress(e)) { e.preventDefault(); end(); } });
  el.addEventListener('blur', end);
}

function padView(label, sub, cls, keys) {
  const fill = h('div', { class: 'pad-fill' });
  const value = h('div', { class: 'pad-value' }, '0%');
  const el = h('div', { class: `pad ${cls}`, role: 'button', tabindex: '0', 'aria-keyshortcuts': keys, 'aria-label': `${label}: удерживайте, высота пальца — сила; с клавиатуры — пробел на площадке или ${keys.split(' ')[0]}` },
    fill, h('div', { class: 'pad-ticks' }), h('div', { class: 'pad-label' }, h('b', {}, label), h('span', {}, sub)), value);
  const show = level => { fill.style.height = `${Math.round(level * 100)}%`; value.textContent = `${Math.round(level * 100)}%`; };
  return { el, show };
}

export function createTwoChannelPads(emulator) {
  const state = { a: 0, b: 0, co: 0 };
  const apply = () => emulator.setTarget({ gesture: null, a: Math.max(state.a, state.co), b: Math.max(state.b, state.co) });
  const A = padView('A', 'сжатие', 'pad-a', 'F ArrowLeft');
  const B = padView('B', 'раскрытие', 'pad-b', 'J ArrowRight');
  const co = h('button', { class: 'pad-co', type: 'button', 'aria-keyshortcuts': 'Space', 'aria-label': 'Коактивация: оба канала сразу' }, h('span', {}, 'A+B'));
  const onA = v => { state.a = v; A.show(v); apply(); }, onB = v => { state.b = v; B.show(v); apply(); }, onCo = v => { state.co = v ? 0.75 : 0; apply(); };
  bindPad(A.el, onA); bindPadKeys(A.el, onA);
  bindPad(B.el, onB); bindPadKeys(B.el, onB);
  bindPad(co, onCo); bindPadKeys(co, onCo);
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
  const group = { current: null }; // one latched gesture at a time
  const keys = ACTIVE_GESTURES.map(g => {
    const digit = String(GESTURES.indexOf(g) + 1);
    const el = h('div', { class: 'gkey', role: 'button', tabindex: '0', 'aria-keyshortcuts': digit, 'aria-label': `Жест ${g.name}` }, gestureIcon(g), h('span', {}, g.name));
    const onLevel = v => { emulator.setTarget(v ? { gesture: g.id, effort: v } : { gesture: 'rest', effort: 0 }); };
    bindPad(el, onLevel, group); bindPadKeys(el, onLevel);
    return el;
  });
  emulator.setTarget({ gesture: 'rest', effort: 0 });
  return h('div', { class: 'pads gestures', style: { '--word': longestWord(ACTIVE_GESTURES.map(g => g.name)) } }, ...keys, h('p', { class: 'pads-note' }, 'Удерживайте жест; выше палец — сильнее'));
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
    if (!relevant(e.code) || e.repeat) return;
    // Any screen with pads (play, tutorial, calibration, settings), not only the game (5.8); a focused control
    // keeps its own keys: Space on «Старт» presses it, arrows move a radio group, a pad handles itself.
    const t = e.target, onPad = t.closest?.('.pad, .gkey, .pad-co');
    if (!document.querySelector('.pads') || (onPad ? e.code === 'Space' : t.closest?.('input, select, textarea, button, a, summary, [role=radio], [role=button]'))) return;
    e.preventDefault(); held.set(e.code, performance.now()); if (!raf) tick();
  };
  const up = e => { if (held.delete(e.code)) tick(); };
  const blur = () => { held.clear(); tick(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
}
