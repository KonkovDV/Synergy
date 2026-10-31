// Reusable UI pieces (DRY): bottom navigation, live signal meter, form rows.
import { h, longestWord } from './dom.js';
import { fmtSec } from '../core/format.js';
import { COMMAND_NAME, GESTURE_BY_ID, twoChannelControls, GESTURE_CLASS_ORDER } from '../core/vocabulary.js';
import { mio } from './art.js';
import { SignalTrace, traceSummary } from '../core/signaltrace.js';
import { SIGNAL_TRACE } from '../config.js';
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
  const bar = (cls, threshold) => {
    const fill = h('i', { class: 'fill' });
    const on = h('b', { class: 'mark on', style: { left: `${threshold * 100}%` }, title: 'порог' });
    const co = h('b', { class: 'mark co', hidden: !twoChannelControls(s.scheme), style: { left: `${s.coThreshold * 100}%` }, title: 'коактивация' });
    return { node: h('div', { class: `meter-bar ${cls}` }, fill, on, co), fill, on, co };
  };
  const A = bar('a', s.sensitivity), B = bar('b', s.sensitivityB ?? s.sensitivity);
  const chip = h('div', { class: 'meter-chip' }, 'Покой');
  // 5.29: what a recognizer (СППР) saw — the three most probable classes of its stream, in the gesture scheme only.
  const probs = h('p', { class: 'meter-probs', hidden: true });
  // 6.0 — the joystick of the task's СПППР: x = flexion − extension (A to the left, as the bar of A), y = pronation −
  // supination, z = abduction − adduction under it; and the stream in one line (rate, jitter, forgiven noise, a pause).
  const dot = h('b', { class: 'stick-dot' }), zFill = h('b');
  const stick = h('div', { class: 'meter-stick', hidden: true },
    h('div', { class: 'stick', 'aria-hidden': 'true', title: 'Джойстик СПППР: сгибание − разгибание, пронация − супинация' }, dot),
    h('div', { class: 'stick-z', 'aria-hidden': 'true', title: 'Отведение − приведение' }, zFill));
  const stream = h('p', { class: 'meter-stream', hidden: true });
  let streamAt = 0, streamBad = false;
  const node = h('div', { class: 'meter', role: 'region', 'aria-label': 'Сигнал датчиков A и B' },
    h('div', { class: 'meter-row' }, h('span', { class: 'meter-label a' }, 'A'), A.node),
    chip,
    h('div', { class: 'meter-row' }, B.node, h('span', { class: 'meter-label b' }, 'B')),
    probs, stick, stream);
  return {
    node,
    /** The marks follow the sliders (5.11: they stayed where the meter was built). */
    setThresholds({ sensitivity = s.sensitivity, sensitivityB = s.sensitivityB ?? sensitivity, coThreshold = s.coThreshold } = {}) {
      A.on.style.left = `${sensitivity * 100}%`;
      B.on.style.left = `${sensitivityB * 100}%`;
      for (const bar of [A, B]) bar.co.style.left = `${coThreshold * 100}%`;
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
      const axes = intent.valid ? intent.axes : null;
      if (stick.hidden !== !axes) stick.hidden = !axes;
      if (axes) {
        dot.style.transform = `translate(${Math.round(-axes.x * 20)}px, ${Math.round(-axes.y * 20)}px)`;
        dot.classList.toggle('on', intent.command !== 'rest');
        zFill.style.left = axes.z < 0 ? `${50 + axes.z * 50}%` : '50%';
        zFill.style.width = `${Math.abs(axes.z) * 50}%`;
      }
      const now = performance.now();
      const bad = intent.link === 'inertia';
      if (now - streamAt > 500 || bad !== streamBad) {
        streamAt = now; streamBad = bad;
        const line = streamLine(app.sppprDecoder?.(), intent);
        if (stream.textContent !== line) { stream.textContent = line; stream.hidden = !line; }
        stream.classList.toggle('bad', bad);
      }
    },
  };
}

/**
 * 6.0 — the СПППР stream in one line: packets a second, the jitter, the forgiven noise, refused packets; while no packet
 * comes for more than 200 ms — that the speed fades (the task's inertia), not that the person stopped.
 */
export function streamLine(decoder, intent = null) {
  if (!decoder || !decoder.stats.accepted) return '';
  if (intent?.link === 'inertia') return `Пакеты не приходят ${intent.ageMs ?? ''} мс — скорость гаснет плавно`;
  const { rateHz, jitterMs } = decoder.timing();
  const st = decoder.stats;
  return [`СПППР ${rateHz ?? '—'} пак/с`, `джиттер ${jitterMs ?? '—'} мс`, `прощено шумов ${st.forgiven}`, st.rejected ? `отклонено ${st.rejected}` : null].filter(Boolean).join(' · ');
}

/**
 * 5.32 — the last 5 s of A and B with each channel's switch-on line, like the sensor graph of the prosthesis app. Where
 * both channels are on, the strip is tinted: that is the counter-signal the meetup asked to train away. The line under
 * it says the same in words once a second (no live region: a screen reader reads it when asked, not 60 times a second).
 */
export function signalTraceView(app) {
  const trace = new SignalTrace();
  const canvas = h('canvas', { class: 'trace', role: 'img', 'aria-label': `График сигнала A и B за последние ${SIGNAL_TRACE.windowS} секунд с линиями порогов` });
  const summary = h('p', { class: 'note trace-sum' }, traceSummary({ close: null, open: null }));
  const node = h('div', { class: 'trace-box' }, canvas, summary);
  let colors = null, lastText = -Infinity, lastDraw = -Infinity;
  const palette = () => {
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null;
    const v = (name, fallback) => css?.getPropertyValue(name).trim() || fallback;
    return { a: v('--a', '#ff7a45'), b: v('--b', '#3b82f6'), co: v('--violet', '#6d4ef0') };
  };
  function draw(now, on) {
    const ctx = canvas.getContext?.('2d');
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!ctx || !w || !hgt) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const span = SIGNAL_TRACE.windowS * 1000, x = t => w - ((now - t) / span) * w, y = v => hgt - 2 - Math.min(1, v) * (hgt - 4);
    // Both on: the counter-signal, a tinted strip behind the lines.
    ctx.globalAlpha = 0.22; ctx.fillStyle = colors.co;
    let runFrom = null, prevX = null; // one rectangle per run: thin per-frame strips left seams in the dark theme
    trace.forEach(now, (t, a, b, aOn, bOn) => {
      const px = x(t);
      if (aOn && bOn) runFrom ??= prevX ?? px;
      else if (runFrom !== null) { ctx.fillRect(runFrom, 0, Math.max(1, px - runFrom), hgt); runFrom = null; }
      prevX = px;
    });
    if (runFrom !== null) ctx.fillRect(runFrom, 0, Math.max(1, w - runFrom), hgt);
    ctx.globalAlpha = 1;
    // Each channel's switch-on line, dashed, in its own colour.
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    [[on[0], colors.a], [on[1], colors.b]].forEach(([level, color]) => { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(0, y(level)); ctx.lineTo(w, y(level)); ctx.stroke(); });
    ctx.setLineDash([]); ctx.lineWidth = 2;
    for (const [key, color] of [['a', colors.a], ['b', colors.b]]) {
      ctx.strokeStyle = color; ctx.beginPath();
      let first = true, prevT = null;
      trace.forEach(now, (t, a, b) => {
        const px = x(t), py = y(key === 'a' ? a : b);
        if (first || t - prevT > 400) ctx.moveTo(px, py); else ctx.lineTo(px, py); // a lost signal is a break, not a line
        first = false; prevT = t;
      });
      ctx.stroke();
    }
  }
  return {
    node,
    update(intent, now) {
      trace.push(intent, now);
      if (now - lastText >= SIGNAL_TRACE.textEveryS * 1000 || now < lastText) {
        lastText = now; colors = palette(); // the theme may change while the screen is open
        const text = traceSummary(trace.cleanliness(now));
        if (summary.textContent !== text) summary.textContent = text;
      }
      if (app.reduceMotion && now - lastDraw < 1000 / SIGNAL_TRACE.reducedMotionFps && now >= lastDraw) return;
      lastDraw = now;
      const s = app.settings;
      const on = Array.isArray(intent?.on) ? intent.on : [s.sensitivity, s.sensitivityB ?? s.sensitivity];
      draw(now, on);
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

export function sliderRow(label, { min, max, step, value, format = v => v, onInput, pending = null }) {
  const out = h('output', {}, pending ?? format(value));
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, ...(pending != null ? { 'aria-valuetext': pending } : {}), oninput: e => {
    const v = Number(e.target.value);
    out.textContent = format(v);
    input.removeAttribute('aria-valuetext');
    onInput(v);
  } });
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
