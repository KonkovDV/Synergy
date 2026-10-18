// Reusable UI pieces (DRY): bottom navigation, live signal meter, form rows.
import { h } from './dom.js';
import { COMMAND_NAME, GESTURE_BY_ID } from '../core/vocabulary.js';
import { drawMio } from '../render/draw.js';

export function bottomNav(app, active) {
  const item = (id, icon, label) => h('button', { class: `nav-item ${active === id ? 'active' : ''}`, 'aria-current': active === id ? 'page' : null, onclick: () => app.go(id) }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), label);
  return h('nav', { class: 'bottom-nav' }, item('home', '⌂', 'Главная'), item('progress', '📈', 'Прогресс'), item('settings', '⚙', 'Настройки'));
}

export function topBar(title, onBack, extra = null) {
  return h('header', { class: 'top-bar' },
    onBack ? h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: onBack }, '←') : h('span'),
    h('h1', {}, title), extra ?? h('span'));
}

/** Live A/B meter with thresholds: the «muscle-level» feedback next to the game («functional» feedback). */
export function signalMeter(app) {
  const s = app.settings;
  const bar = cls => {
    const fill = h('i', { class: 'fill' });
    const on = h('b', { class: 'mark on', style: { left: `${s.sensitivity * 100}%` }, title: 'порог' });
    const co = h('b', { class: 'mark co', style: { left: `${s.coThreshold * 100}%` }, title: 'коактивация' });
    return { node: h('div', { class: `meter-bar ${cls}` }, fill, on, co), fill };
  };
  const A = bar('a'), B = bar('b');
  const chip = h('div', { class: 'meter-chip' }, 'Покой');
  const node = h('div', { class: 'meter', role: 'region', 'aria-label': 'Сигнал датчиков A и B' },
    h('div', { class: 'meter-row' }, h('span', { class: 'meter-label a' }, 'A'), A.node),
    chip,
    h('div', { class: 'meter-row' }, B.node, h('span', { class: 'meter-label b' }, 'B')));
  return {
    node,
    update(intent) {
      A.fill.style.width = `${Math.round(intent.a * 100)}%`;
      B.fill.style.width = `${Math.round(intent.b * 100)}%`;
      const label = !intent.valid ? 'Нет сигнала'
        : intent.gesture ? `${GESTURE_BY_ID[intent.gesture].name}${intent.uncertain ? '?' : ''}`
        : COMMAND_NAME[intent.command];
      if (chip.textContent !== label) chip.textContent = label;
      chip.dataset.cmd = intent.valid ? intent.command : 'lost';
    },
  };
}

/**
 * Radio group (WAI-ARIA APG «Radio Group»): named by `label`, one tab stop, arrow keys move and select.
 * Screen-reader and switch users hear the question, not just «radio group».
 */
export function segmented(options, value, onChange, label = null) {
  const node = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
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
    }, h('b', {}, o.label), o.sub ? h('small', {}, o.sub) : null)));
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
  const canvas = h('canvas', { width: size * 2, height: size * 2, class: `mio mio-${mood}`, 'aria-hidden': 'true', style: { width: `${size}px`, height: `${size}px` } });
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  drawMio(ctx, { x: size / 2, y: size * 0.58, size: size * 0.72, mood });
  return canvas;
}

