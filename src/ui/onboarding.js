// First run: what this is, safety, and the two choices that matter (control scheme, prosthesis side).
import { h } from './dom.js';
import { segmented } from './widgets.js';
import { SCHEME_INFO, GESTURE_BY_ID } from '../core/vocabulary.js';
import { gestureIcon } from '../input/controls.js';

export function onboardingScreen(app) {
  let step = 0;
  const body = h('div', { class: 'onboarding-body' });
  const dots = h('div', { class: 'dots' });
  const next = h('button', { class: 'btn primary big' });
  const s = app.settings;

  const pages = [
    () => [h('div', { class: 'onb-art' }, gestureIcon(GESTURE_BY_ID.open, 'icon', 110)),
      h('h1', {}, 'Синергия'),
      h('p', { class: 'lead' }, 'Игра-тренажёр управления бионическим протезом.'),
      h('p', {}, 'Четыре игры тренируют то, что нужно протезу каждый день: взять предмет с нужной силой, удержать, отпустить, сменить хват, включиться вовремя.'),
      h('p', { class: 'note' }, '10–15 минут в день, 3–5 дней в неделю — как в исследованиях игровых тренировок.')],
    () => [h('div', { class: 'onb-art big-emoji', 'aria-hidden': 'true' }, '🛡️'),
      h('h1', {}, 'Безопасно'),
      h('ul', { class: 'how' },
        h('li', {}, 'Это тренажёр, а не медицинское изделие.'),
        h('li', {}, 'Напрягайте мышцы комфортно, без боли — максимум не нужен.'),
        h('li', {}, 'Устали — отдохните. Между упражнениями будет пауза.'),
        h('li', {}, 'Программу занятий согласуйте с реабилитологом.')),
      h('p', { class: 'note' }, 'Нет датчиков? Встроенный эмулятор ЭМГ на экране: удерживайте площадки A и B, высота пальца — сила.')],
    () => [h('h1', {}, 'Ваш протез'),
      h('p', {}, 'Как вы управляете протезом?'),
      segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { s.scheme = v; }),
      h('p', { class: 'note' }, 'Не уверены — выберите «Пропорциональный». Режим можно сменить в настройках.'),
      h('p', {}, 'На какой руке протез?'),
      segmented([{ value: 'right', label: 'Правая' }, { value: 'left', label: 'Левая' }], s.side, v => { s.side = v; }),
      h('label', { class: 'row' }, h('span', {}, 'Как к вам обращаться (необязательно)'), h('input', { type: 'text', maxlength: 24, value: s.name, oninput: e => { s.name = e.target.value.trim(); } }))],
  ];

  const render = () => {
    body.replaceChildren(...pages[step]());
    dots.replaceChildren(...pages.map((_, i) => h('i', { class: i === step ? 'on' : '' })));
    next.textContent = step < pages.length - 1 ? 'Дальше' : 'Начать тренировку';
  };
  next.onclick = () => {
    if (step < pages.length - 1) { step++; render(); return; }
    app.profile.onboarded = true; app.save(); app.go('home');
  };
  render();
  return { node: h('div', { class: 'screen onboarding' }, h('main', { class: 'scroll center' }, body), h('div', { class: 'sticky-actions' }, dots, next)) };
}
