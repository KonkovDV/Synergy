// Reusable UI pieces (DRY): bottom navigation, live signal meter, form rows.
import { h, longestWord } from './dom.js';
import { fmtSec } from '../core/format.js';
import { COMMAND_NAME, GESTURE_BY_ID, twoChannelControls, GESTURE_CLASS_ORDER } from '../core/vocabulary.js';
import { mio } from './art.js';
import { picture } from './pictures.js';

/**
 * Line icons drawn in SVG (5.8): emoji and symbols (⌂ 📈 ⚙ ← ✕ Ⅱ) render differently on every platform —
 * colour emoji on Android, text glyphs elsewhere, missing in some WebView fonts. Stroke = currentColor.
 */
const ICONS = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v10h13V10', 'M10 20v-5h4v5'],
  progress: ['M5 20v-6', 'M12 20V9', 'M19 20V4', 'M3 20h18'],
  // 5.14 — the Firebird's section: a flame-shaped feather.
  bird: ['M12 21c-4.2-2.6-6.3-6.6-4.6-11.4.9 1.8 2.1 2.8 3.6 3-.9-3.2.1-6.3 3.2-9.1-.1 3.9 3.2 6 3.2 10 0 3.9-2.2 6.4-5.4 7.5z', 'M12 21v-7'],
  question: [{ circle: [12, 12, 9] }, 'M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.6v.5', 'M12 17v.01'],
  settings: ['M4 7h8', 'M18 7h2', 'M4 17h2', 'M12 17h8', { circle: [15, 7, 2.5] }, { circle: [9, 17, 2.5] }],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  pause: ['M9 5v14', 'M15 5v14'],
  // Section glyphs of the settings (5.11), drawn on tinted tiles.
  hand: ['M8 13V6a1.5 1.5 0 0 1 3 0v5', 'M11 11V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 11V5.5a1.5 1.5 0 0 1 3 0V12', 'M17 12V9a1.5 1.5 0 0 1 3 0v4.5A7.5 7.5 0 0 1 12.5 21h-1a6.5 6.5 0 0 1-5.2-2.6L3.6 14.8a1.6 1.6 0 0 1 2.5-2L8 15'],
  signal: ['M2 12h3.5l2-5 3.5 10 3-13 2.5 8H22'],
  gauge: ['M4 18a8 8 0 1 1 16 0', 'M12 18l4.5-5.5', { circle: [12, 18, 1.5] }],
  dumbbell: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3.5 9v6', 'M20.5 9v6', 'M6.5 12h11'],
  access: [{ circle: [12, 4.5, 2] }, 'M5 8.5l7 1.5 7-1.5', 'M12 10v4.5', 'M9 21l3-6.5 3 6.5'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20.5a2 2 0 0 0 4 0'],
  data: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  info: [{ circle: [12, 12, 9] }, 'M12 11v6', 'M12 7.5v.01'],
  sound: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4z', 'M15.5 9.5a3.5 3.5 0 0 1 0 5', 'M18 7a7 7 0 0 1 0 10'],
};
const SVG = 'http://www.w3.org/2000/svg';
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', class: `ico ico-${name}`, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': name === 'pause' ? 3 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  for (const part of ICONS[name]) {
    const el = document.createElementNS(SVG, part.circle ? 'circle' : 'path');
    if (part.circle) { const [cx, cy, r] = part.circle; el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r); } else el.setAttribute('d', part);
    svg.append(el);
  }
  return svg;
}

export function bottomNav(app, active) {
  // 5.16: the illustrated icons of the sections (public/art/nav-*); the line icon stands in for a missing picture.
  const item = (id, glyph, label) => h('button', { class: `nav-item ${active === id ? 'active' : ''}`, 'aria-current': active === id ? 'page' : null, 'data-tour': `nav.${id}`, onclick: () => app.go(id) },
    h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, picture(`nav-${glyph}`, 28, 'nav-art', () => icon(glyph))), h('span', { class: 'nav-label' }, label));
  return h('nav', { class: 'bottom-nav', 'aria-label': 'Разделы' }, item('home', 'home', 'Главная'), item('nest', 'bird', 'Жар-птица'), item('progress', 'progress', 'Прогресс'), item('settings', 'settings', 'Настройки'));
}

/** The arrow is the screen's «back»: the Android button, the browser back gesture and Esc press it too (App.handleBack). */
/** Status words of the external source — one copy for the game and the settings (5.11: two had to be kept in sync). */
export const BRIDGE_STATUS = { idle: 'не подключён', connecting: 'подключение…', waiting: 'подключено, ждём кадры', streaming: 'поток идёт', reconnecting: 'переподключение…', unreachable: 'нет ответа, повторяем…', error: 'ошибка адреса', offline: 'протез не на связи' };

/**
 * The line under the field in external mode. 5.29: a class outside the gesture set (Motorica's Wrist_Flex, say) is rest;
 * the line names it, so the person and whoever set up the emulator see why the hand does nothing.
 */
export const bridgeLine = (bridge, status = bridge?.status ?? 'idle') => `Статус: ${BRIDGE_STATUS[status] ?? status} · кадров: ${bridge?.received ?? 0}`
  + `${bridge?.raw ? ' · сырая ЭМГ → огибающая 150 мс' : ''}${bridge?.unknownLabel ? ` · жест не из набора игры: ${bridge.unknownLabel}` : ''}`
  // 5.30: two prostheses — how many frames each arm sent.
  + (bridge?.receivedBySide && bridge.receivedBySide.left + bridge.receivedBySide.right > 0 ? ` · левый: ${bridge.receivedBySide.left}, правый: ${bridge.receivedBySide.right}` : '');

/** The hint while the signal is lost: the exercise waits and goes on by itself (GameRunner), as Motorica Kart says too. */
export const lostSignalHint = status => (status === 'offline'
  ? 'Протез не на связи — пауза. Продолжим сами, когда связь вернётся'
  : 'Нет сигнала — пауза. Продолжим сами, когда сигнал вернётся');

export function topBar(title, onBack, extra = null) {
  return h('header', { class: 'top-bar' },
    onBack ? h('button', { class: 'icon-btn back-btn', 'aria-label': 'Назад', onclick: onBack }, icon('back')) : h('span'),
    h('h1', {}, title), extra ?? h('span'));
}

/** Live A/B meter with thresholds: the «muscle-level» feedback next to the game («functional» feedback). */
/** «Закрытие ладони 82 % · Флексия 9 % · Покой 4 %»: the three most probable classes, in steps of 5 % (no flicker). */
export function probabilityLine(probs) {
  return GESTURE_CLASS_ORDER.map((id, i) => [id, probs[i]]).filter(([, p]) => p >= 0.025).sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([id, p]) => `${GESTURE_BY_ID[id]?.name ?? id} ${Math.round(p * 20) * 5} %`).join(' · ');
}

export function signalMeter(app) {
  const s = app.settings;
  const bar = cls => {
    const fill = h('i', { class: 'fill' });
    const on = h('b', { class: 'mark on', style: { left: `${s.sensitivity * 100}%` }, title: 'порог' });
    const co = h('b', { class: 'mark co', hidden: !twoChannelControls(s.scheme), style: { left: `${s.coThreshold * 100}%` }, title: 'коактивация' });
    return { node: h('div', { class: `meter-bar ${cls}` }, fill, on, co), fill, on, co };
  };
  const A = bar('a'), B = bar('b');
  const chip = h('div', { class: 'meter-chip' }, 'Покой');
  // 5.29: what a recognizer (СППР) saw — the three most probable classes of its stream, in the gesture scheme only.
  const probs = h('p', { class: 'meter-probs', hidden: true });
  const node = h('div', { class: 'meter', role: 'region', 'aria-label': 'Сигнал датчиков A и B' },
    h('div', { class: 'meter-row' }, h('span', { class: 'meter-label a' }, 'A'), A.node),
    chip,
    h('div', { class: 'meter-row' }, B.node, h('span', { class: 'meter-label b' }, 'B')),
    probs);
  return {
    node,
    /** The marks follow the sliders (5.11: they stayed where the meter was built). */
    setThresholds({ sensitivity = s.sensitivity, coThreshold = s.coThreshold } = {}) {
      for (const bar of [A, B]) { bar.on.style.left = `${sensitivity * 100}%`; bar.co.style.left = `${coThreshold * 100}%`; }
    },
    update(intent) {
      A.fill.style.width = `${Math.round(intent.a * 100)}%`;
      B.fill.style.width = `${Math.round(intent.b * 100)}%`;
      // 5.29: each channel's own switch-on line — the prosthesis's thresholds differ per channel when the host sends them.
      if (Array.isArray(intent.on)) [A, B].forEach((bar, ch) => { const left = `${Math.round(intent.on[ch] * 1000) / 10}%`; if (bar.on.style.left !== left) bar.on.style.left = left; });
      const label = !intent.valid ? 'Нет сигнала'
        : intent.gesture ? `${GESTURE_BY_ID[intent.gesture].name}${intent.uncertain ? '?' : ''}`
        : COMMAND_NAME[intent.command];
      if (chip.textContent !== label) chip.textContent = label;
      const top = intent.valid && intent.probs ? probabilityLine(intent.probs) : '';
      if (probs.textContent !== top) { probs.textContent = top; probs.hidden = !top; }
      const cmd = intent.valid ? intent.command : 'lost';
      if (chip.dataset.cmd !== cmd) chip.dataset.cmd = cmd; // no attribute write per frame (5.11: ~1.6 mutations a frame)
    },
  };
}

/**
 * Radio group (WAI-ARIA APG «Radio Group»): named by `label`, one tab stop, arrow keys move and select.
 * Screen-reader and switch users hear the question, not just «radio group».
 */
export function segmented(options, value, onChange, label = null) {
  const node = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label, style: { '--word': longestWord(options.map(o => o.label)) } });
  const pick = (o, focus = false) => { render(o.value); onChange(o.value); if (focus) node.querySelector('[aria-checked="true"]')?.focus(); };
  const render = current => {
    const tabStop = options.some(o => o.value === current) ? current : options[0].value;
    node.replaceChildren(...options.map((o, i) => h('button', {
      class: `seg ${o.value === current ? 'active' : ''}`, role: 'radio', 'aria-checked': String(o.value === current),
      tabindex: o.value === tabStop ? '0' : '-1',
      onclick: () => pick(o),
      onkeydown: e => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        pick(options[(i + step + options.length) % options.length], true);
      },
    }, o.art ? o.art() : null, h('b', {}, o.label), o.sub ? h('small', {}, o.sub) : null)));
  };
  render(value);
  return node;
}

export function sliderRow(label, { min, max, step, value, format = v => v, onInput }) {
  const out = h('output', {}, format(value));
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: e => { const v = Number(e.target.value); out.textContent = format(v); onInput(v); } });
  return h('label', { class: 'row slider' }, h('span', {}, label, out), input);
}

export function toggleRow(label, value, onChange, sub = '') {
  const input = h('input', { type: 'checkbox', role: 'switch', onchange: e => onChange(e.target.checked) });
  input.checked = value;
  return h('label', { class: 'row toggle' }, h('span', {}, label, sub ? h('small', {}, sub) : null), input);
}

export function skillBar(name, value) {
  return h('div', { class: 'skill' }, h('span', {}, name), h('div', { class: 'skill-track' }, h('i', { style: { width: `${value ?? 0}%` } })), h('b', {}, value ?? '—'));
}

/** Coach «Мио» as a small decorative picture (the advice itself is always text next to it). */
export function mioAvatar(mood = 'support', size = 48) {
  return mio(mood, size);
}

/**
 * The hands-free hint (start, «дальше»): what to hold depends on the scheme — there is no «A» in the gesture scheme,
 * where any closing grip counts (5.10). `spoken` — the voice version.
 */
export function handsFreeText(scheme, seconds, action, { spoken = false } = {}) {
  const what = scheme === 'gesture' ? 'любой хват' : 'сжатие (A)';
  return spoken ? `Чтобы ${action === 'старт' ? 'начать' : 'продолжить'} без касания, расслабьтесь, затем удерживайте ${scheme === 'gesture' ? 'любой хват' : 'сжатие'}.`
    : `Расслабьтесь, затем удерживайте ${what} ${fmtSec(seconds)} — ${action} без касания`;
}
