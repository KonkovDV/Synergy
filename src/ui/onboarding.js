// First run: what this is, safety, and the two choices that matter (control scheme, prosthesis side).
import { h } from './dom.js';
import { segmented } from './widgets.js';
import { SCHEME_INFO, OPENING_GESTURE } from '../core/vocabulary.js';
import { gestureIcon } from './controls.js';

export function onboardingScreen(app) {
  let step = 0, shownAt = 0;
  const body = h('div', { class: 'onboarding-body' });
  const dots = h('div', { class: 'dots' });
  const next = h('button', { class: 'btn primary big' });
  // A draft, saved once through updateSettings (5.10: fields were written into the live settings one by one).
  const s = { scheme: app.settings.scheme, side: app.settings.side, audience: app.settings.audience, name: app.settings.name };

  const pages = [
    () => [h('div', { class: 'onb-art' }, gestureIcon(OPENING_GESTURE, 'icon', 110)),
      h('h1', {}, 'Синергия'),
      h('p', { class: 'lead' }, 'Игра-тренажёр управления бионическим протезом.'),
      h('p', {}, 'Четыре игры тренируют то, что нужно протезу каждый день: взять предмет с нужной силой, удержать, отпустить, сменить хват, включиться вовремя.'),
      h('p', { class: 'note' }, 'Короткие занятия: 10–15 минут, 3–5 дней в неделю — по образцу протоколов игровых тренировок из исследований. Это не медицинская рекомендация.')],
    () => [h('div', { class: 'onb-art big-emoji', 'aria-hidden': 'true' }, '🛡️'),
      h('h1', {}, 'Безопасно'),
      h('ul', { class: 'how' },
        h('li', {}, 'Это тренажёр, а не медицинское изделие.'),
        h('li', {}, 'Напрягайте мышцы комфортно, без боли — максимум не нужен.'),
        h('li', {}, 'Устали — отдохните. Между упражнениями будет пауза.'),
        h('li', {}, 'Программу занятий согласуйте с реабилитологом. После операции — начинайте, когда разрешит лечащий врач.'),
        h('li', {}, 'Датчики — только на здоровую кожу. Покраснение, которое не проходит, или усиление фантомной боли — повод остановиться и сказать специалисту.')),
      h('p', { class: 'note' }, 'Нет датчиков? Встроенный эмулятор ЭМГ на экране: удерживайте площадки A и B, высота пальца — сила.')],
    () => [h('h1', {}, 'Ваш протез'),
      h('p', {}, 'Как вы управляете протезом?'),
      segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { s.scheme = v; }, 'Схема управления'),
      h('p', { class: 'note' }, 'Не уверены — выберите «Пропорциональный». Режим можно сменить в настройках.'),
      h('p', {}, 'На какой руке протез?'),
      segmented([{ value: 'right', label: 'Правая' }, { value: 'left', label: 'Левая' }], s.side, v => { s.side = v; }, 'Рука с протезом'),
      h('p', {}, 'Кто будет заниматься?'),
      segmented([{ value: 'adult', label: 'Взрослый' }, { value: 'child', label: 'Ребёнок', sub: 'с родителем' }], s.audience, v => { s.audience = v; }, 'Кто занимается'),
      h('label', { class: 'row' }, h('span', {}, 'Как к вам обращаться (необязательно)'), h('input', { type: 'text', maxlength: 24, value: s.name, oninput: e => { s.name = e.target.value.trim(); } }))],
  ];

  const render = () => {
    body.replaceChildren(...pages[step]());
    dots.replaceChildren(...pages.map((_, i) => h('i', { class: i === step ? 'on' : '' })));
    next.textContent = step < pages.length - 1 ? 'Дальше' : 'Первые шаги · 2 мин';
    skip.hidden = step < pages.length - 1;
    shownAt = performance.now();
  };
  const done = target => { app.profile.onboarded = true; app.updateSettings({ ...s }); app.go(target, { from: 'home' }); };
  next.onclick = () => {
    // A double tap must not skip «Безопасно» (5.10): the second tap of the same gesture is ignored.
    if (performance.now() - shownAt < 300) return;
    if (step < pages.length - 1) { step++; render(); return; }
    done('tutorial');
  };
  const skip = h('button', { class: 'btn ghost', onclick: () => done('home') }, 'Пропустить обучение');
  render();
  return {
    node: h('div', { class: 'screen onboarding' }, h('main', { class: 'scroll center' }, body), h('div', { class: 'sticky-actions' }, dots, next, skip)),
    // Back goes to the previous page; on the first page the app may close (5.10: back restarted the onboarding
    // forever, so the APK could not be closed with back on the first launch).
    onBack() { if (step === 0) return 'exit'; step--; render(); return true; },
  };
}
