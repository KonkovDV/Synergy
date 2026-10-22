// On-screen and keyboard controls of the EMG emulator (for testing without sensors).
// Two-channel pads: hold = muscle activation, finger height inside the pad = strength,
// both pads (two thumbs) or the «A+B» key = co-contraction. Gesture scheme: 7 gesture keys.
import { fmtPct } from '../core/format.js';
import { GESTURES, ACTIVE_GESTURES } from '../core/vocabulary.js';
import { drawHand } from '../render/draw.js';
import { h, longestWord } from './dom.js';
import { gestureArt } from './art.js';

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
const latchedPads = new Set();
/** Turning the mode off releases latched pads (5.11: a latched pad could not be released any more). */
export function setPadMode({ sticky: on = false } = {}) {
  sticky = !!on;
  if (!sticky) for (const release of [...latchedPads]) release();
}

/** Makes `el` behave like a muscle: pointerdown/move set level, release relaxes (or a second tap, when latched). */
function bindPad(el, onLevel, group = null) {
  const active = new Set();
  let latched = false;
  const update = e => { onLevel(levelFromPointer(el, e)); };
  const release = () => { latched = false; latchedPads.delete(release); el.describe?.(false); el.classList.remove('on'); onLevel(0); };
  el.padRelease = release;
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture?.(e.pointerId); active.add(e.pointerId);
    if (sticky) {
      if (latched) { release(); return; }
      if (group?.current && group.current !== el) group.current.padRelease();
      latched = true; latchedPads.add(release); el.describe?.(true); if (group) group.current = el;
    }
    el.classList.add('on'); update(e);
  });
  el.addEventListener('pointermove', e => { if (active.has(e.pointerId) && (!sticky || latched)) update(e); });
  const end = e => { if (!active.delete(e.pointerId)) return; if (!active.size && !latched) { el.classList.remove('on'); onLevel(0); } };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/**
 * Keyboard and switch strength (5.11, accessibility review): a held key used to ramp 0.3 → 1 in 1.1 s, so a keyboard
 * or switch user could not hold «вполсилы» — the tutorial step never completed and the skill check under-reported.
 * A hold now rises to the chosen strength and stays there; arrows on a focused pad set it (10–100 %, step 10).
 */
const kbStrength = { a: 0.5, b: 0.5 };
const KB_FIXED = { co: 0.75, gesture: 0.8 };
const rampTo = (cap, since) => Math.min(cap, 0.3 + (performance.now() - since) / 1600);
const STRENGTH_KEYS = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 };

/**
 * Keyboard / switch access to a focused pad (5.8): Space or Enter held = the muscle held, at the chosen strength.
 * With «Площадки без удержания» one press latches and the next releases, as a tap does (5.11). A switch interface
 * usually sends exactly these keys.
 */
function bindPadKeys(el, onLevel, channel = null, fixed = KB_FIXED.gesture) {
  let start = 0, raf = 0, latched = false;
  const isPress = e => e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter';
  const cap = () => (channel ? kbStrength[channel] : fixed);
  const tick = () => { onLevel(rampTo(cap(), start)); raf = requestAnimationFrame(tick); };
  const on = () => { if (!raf) { start = performance.now(); el.classList.add('on'); tick(); } };
  const end = () => { latchedPads.delete(end); latched = false; el.describe?.(false); if (!raf) return; cancelAnimationFrame(raf); raf = 0; el.classList.remove('on'); onLevel(0); };
  el.addEventListener('keydown', e => {
    if (channel && (e.key in STRENGTH_KEYS || e.key === 'Home' || e.key === 'End')) {
      e.preventDefault(); e.stopPropagation();
      const v = e.key === 'Home' ? 0.1 : e.key === 'End' ? 1 : kbStrength[channel] + STRENGTH_KEYS[e.key];
      kbStrength[channel] = Math.round(10 * Math.min(1, Math.max(0.1, v))) / 10;
      el.describe?.(latched);
      return;
    }
    if (!isPress(e)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (sticky) { if (latched) end(); else { latched = true; latchedPads.add(end); el.describe?.(true); on(); } return; }
    on();
  });
  el.addEventListener('keyup', e => { if (isPress(e) && !latched) { e.preventDefault(); end(); } });
  el.addEventListener('blur', () => { if (!latched) end(); });
}

function padView(label, sub, cls, keys, channel) {
  const fill = h('div', { class: 'pad-fill' });
  const value = h('div', { class: 'pad-value' }, '0%');
  // A slider for assistive tech (5.11): its value is the keyboard strength, Space holds the muscle at it.
  const el = h('div', { class: `pad ${cls}`, role: 'slider', tabindex: '0', 'aria-orientation': 'vertical', 'aria-valuemin': 10, 'aria-valuemax': 100, 'aria-keyshortcuts': keys,
    'aria-label': `${label}, ${sub}: касание — высота пальца задаёт силу; клавиатура — пробел держит, стрелки меняют силу, ${keys.split(' ')[0]} — тоже` },
    fill, h('div', { class: 'pad-ticks' }), h('div', { class: 'pad-label' }, h('b', {}, label), h('span', {}, sub)), value);
  el.describe = (latched = el.classList.contains('latched')) => {
    const pct = Math.round(kbStrength[channel] * 100);
    el.classList.toggle('latched', latched);
    el.setAttribute('aria-valuenow', String(pct));
    el.setAttribute('aria-valuetext', `сила ${pct} %${latched ? ', включено' : ''}`);
  };
  el.describe(false);
  const show = level => { fill.style.height = `${Math.round(level * 100)}%`; value.textContent = fmtPct(Math.round(level * 100)); };
  return { el, show };
}

export function createTwoChannelPads(emulator) {
  const state = { a: 0, b: 0, co: 0 };
  const apply = () => emulator.setTarget({ gesture: null, a: Math.max(state.a, state.co), b: Math.max(state.b, state.co) });
  const A = padView('A', 'сжатие', 'pad-a', 'F ArrowLeft', 'a');
  const B = padView('B', 'раскрытие', 'pad-b', 'J ArrowRight', 'b');
  const co = h('button', { class: 'pad-co', type: 'button', 'aria-keyshortcuts': 'Space', 'aria-label': 'A+B — коактивация: оба канала сразу' }, h('span', {}, 'A+B')); // 5.29: the name starts with the visible label (WCAG 2.5.3, axe 4.14)
  const onA = v => { state.a = v; A.show(v); apply(); }, onB = v => { state.b = v; B.show(v); apply(); }, onCo = v => { state.co = v ? 0.75 : 0; apply(); };
  bindPad(A.el, onA); bindPadKeys(A.el, onA, 'a');
  bindPad(B.el, onB); bindPadKeys(B.el, onB, 'b');
  bindPad(co, onCo); bindPadKeys(co, onCo, null, KB_FIXED.co);
  return h('div', { class: 'pads two' }, A.el, co, B.el);
}

export function gestureIcon(gesture, skin = 'icon', size = 44) {
  // 5.16: the bionic hand of the illustrations showing this gesture; a gesture without a picture (a new set on
  // 28.10) is drawn on a canvas as before.
  const pic = skin === 'icon' ? gestureArt(gesture.id, size) : null;
  if (pic) { pic.classList.add('gesture-icon'); return pic; }
  const canvas = h('canvas', { width: size * 2, height: size * 2, class: 'gesture-icon', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  drawHand(ctx, { x: size / 2, y: size * 0.95, size: size * 0.42, pose: gesture.pose, skin, sleeve: false });
  return canvas;
}

export function createGesturePads(emulator) {
  const group = { current: null }; // one latched gesture at a time
  const keys = ACTIVE_GESTURES.map(g => {
    const digit = String(GESTURES.indexOf(g) + 1);
    const el = h('div', { class: 'gkey', role: 'button', tabindex: '0', 'aria-keyshortcuts': digit, 'aria-label': `Жест ${g.name}` }, gestureIcon(g), h('span', {}, g.name));
    el.describe = latched => { el.classList.toggle('latched', latched); if (sticky) el.setAttribute('aria-pressed', String(latched)); else el.removeAttribute('aria-pressed'); };
    el.describe(false);
    const onLevel = v => { emulator.setTarget(v ? { gesture: g.id, effort: v } : { gesture: 'rest', effort: 0 }); };
    bindPad(el, onLevel, group); bindPadKeys(el, onLevel);
    return el;
  });
  emulator.setTarget({ gesture: 'rest', effort: 0 });
  return h('div', { class: 'pads gestures', style: { '--word': longestWord(ACTIVE_GESTURES.map(g => g.name)) } }, ...keys, h('p', { class: 'pads-note' }, 'Удерживайте жест; выше палец — сильнее'));
}

/**
 * Keyboard: F/← = A, J/→ = B, Space = A+B; a hold rises to the strength set on the pads (5.11); digits = gestures in
 * GESTURES order (1 = rest). With «Площадки без удержания» a press latches and the next press releases.
 */
const capOf = code => (/^(KeyF|ArrowLeft)$/.test(code) ? kbStrength.a : /^(KeyJ|ArrowRight)$/.test(code) ? kbStrength.b : code === 'Space' ? KB_FIXED.co : KB_FIXED.gesture);
export function bindKeyboard(emulator, getScheme) {
  const held = new Map();
  let raf = 0;
  const tick = () => {
    const level = key => (held.has(key) ? rampTo(capOf(key), held.get(key)) : 0);
    if (getScheme() === 'gesture') {
      const g = [...held.keys()].find(k => /^Digit[1-9]$/.test(k));
      const gesture = (g && GESTURES[Number(g.slice(5)) - 1]?.id) || 'rest';
      emulator.setTarget({ gesture, effort: g ? level(g) : 0 });
    } else {
      const co = level('Space') ? KB_FIXED.co : 0;
      emulator.setTarget({ gesture: null, a: Math.max(co, level('KeyF'), level('ArrowLeft')), b: Math.max(co, level('KeyJ'), level('ArrowRight')) });
    }
    raf = held.size ? requestAnimationFrame(tick) : 0;
  };
  const relevant = code => /^(KeyF|KeyJ|ArrowLeft|ArrowRight|Space|Digit[1-9]|Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(code);
  const releaseKeys = () => { latchedPads.delete(releaseKeys); held.clear(); tick(); };
  const down = e => {
    if (!relevant(e.code) || e.repeat) return;
    // Any screen with pads (play, tutorial, calibration, settings), not only the game (5.8); a focused control
    // keeps its own keys: Space on «Старт» presses it, arrows move a radio group, a pad handles itself.
    // Only the keys the focused control uses are left to it (5.11: F/J did nothing once «Старт» moved focus to
    // «Пауза» — keyboard and switch play stopped after the first tap).
    const t = e.target;
    const typing = t.closest?.('input, select, textarea, [contenteditable]');
    const owns = e.code === 'Space' ? t.closest?.('button, a, summary, [role=button], [role=radio], [role=slider], [role=switch]')
      : /^Arrow/.test(e.code) ? t.closest?.('[role=radio], [role=slider], [role=switch]') : null;
    if (!document.querySelector('.pads') || typing || owns) return;
    e.preventDefault();
    if (/^(Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(e.code)) { // strength of both channels without focusing a pad
      const d = /Equal|Add/.test(e.code) ? 0.1 : -0.1;
      for (const ch of ['a', 'b']) kbStrength[ch] = Math.round(10 * Math.min(1, Math.max(0.1, kbStrength[ch] + d))) / 10;
      document.querySelectorAll('.pad[role=slider]').forEach(p => p.describe?.());
      return;
    }
    if (sticky) {
      if (held.has(e.code)) held.delete(e.code); else { held.set(e.code, performance.now()); latchedPads.add(releaseKeys); }
      tick(); return;
    }
    held.set(e.code, performance.now()); if (!raf) tick();
  };
  const up = e => { if (!sticky && held.delete(e.code)) tick(); };
  const blur = () => { held.clear(); tick(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
}
