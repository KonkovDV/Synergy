// First run: what this is, safety, and the two choices that matter (control scheme, prosthesis side).
import { h } from './dom.js';
import { segmented } from './widgets.js';
import { SCHEME_INFO } from '../core/vocabulary.js';
import { mio, badgeArt, trails, coverScene } from './art.js';
import { PET } from '../config.js';
import { SAFETY_RULES, SAFETY_VERSION } from '../core/wellbeing.js';

export function onboardingScreen(app, { safety = false } = {}) {
  // 5.15 — the safety rules changed since this person read them (core/wellbeing.js SAFETY_VERSION): only that page,
  // once, then home. The sample asks for its consent again when the text changes.
  if (safety) return safetyUpdate(app);
  let step = 0, shownAt = 0;
  const body = h('div', { class: 'onboarding-body' });
  const dots = h('div', { class: 'dots' });
  const next = h('button', { class: 'btn primary big' });
  // A draft, saved once through updateSettings (5.10: fields were written into the live settings one by one).
  const s = { scheme: app.settings.scheme, side: app.settings.side, audience: app.settings.audience, name: app.settings.name, petName: app.settings.petName };

  const pages = [
    // Each page opens with a cover (the sample's onboarding, the brand's dark cover with light trails): Мио, the title, one line.
    () => [h('div', { class: 'onb-hero' }, trails(), h('div', { class: 'onb-art scene' }, coverScene(230)),
      h('h1', {}, 'Синергия'),
      h('p', { class: 'lead' }, 'Игра-тренажёр управления бионическим протезом.')),
      h('p', { class: 'lead pet-promise' }, 'Тренировки согревают яйцо Жар-птицы: вырастите её от птенца до огненной птицы.'),
      h('p', {}, 'Четыре игры тренируют то, что нужно протезу каждый день: взять предмет с нужной силой, удержать, отпустить, сменить хват, включиться вовремя.'),
      h('p', { class: 'note' }, 'Короткие игры по 10–15 минут. Сколько дней в неделю заниматься, лучше решить с реабилитологом или протезистом; цель недели меняется в настройках.')],
    () => [h('div', { class: 'onb-hero' }, trails(), h('div', { class: 'onb-art small' }, badgeArt('shield', 84)),
      h('h1', {}, 'Безопасно'),
      h('p', { class: 'lead' }, 'Комфорт и самочувствие важнее очков.')),
      safetyList(),
      h('p', { class: 'note' }, 'Нет датчиков? Встроенный эмулятор ЭМГ на экране: удерживайте площадки A и B, высота пальца — сила.')],
    () => [h('div', { class: 'onb-hero' }, trails(), h('div', { class: 'onb-art small' }, mio('focus', 84)),
      h('h1', {}, 'Ваш протез'),
      h('p', { class: 'lead' }, 'Несколько вопросов — и можно начинать.')),
      h('p', {}, 'Как вы управляете протезом?'),
      segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { s.scheme = v; }, 'Схема управления'),
      h('p', { class: 'note' }, 'Не уверены — выберите «Пропорциональный». Режим можно сменить в настройках.'),
      h('p', {}, 'На какой руке протез?'),
      segmented([{ value: 'right', label: 'Правая' }, { value: 'left', label: 'Левая' }], s.side, v => { s.side = v; }, 'Рука с протезом'),
      h('p', {}, 'Протез уже есть?'),
      segmented([{ value: 'yes', label: 'Есть' }, { value: 'waiting', label: 'Жду протез', sub: 'учусь заранее' }], s.prosthesis, v => { s.prosthesis = v; }, 'Протез уже есть?'),
      h('p', {}, 'Кто будет заниматься?'),
      segmented([{ value: 'adult', label: 'Взрослый' }, { value: 'child', label: 'Ребёнок', sub: 'с родителем' }], s.audience, v => { s.audience = v; }, 'Кто занимается'),
      h('label', { class: 'row' }, h('span', {}, 'Как к вам обращаться (необязательно)'), h('input', { type: 'text', maxlength: 24, value: s.name, oninput: e => { s.name = e.target.value.trim(); } })),
      // 5.13 (the sample's naming screen): a name of one's own makes the bird one's own; the field is optional.
      h('label', { class: 'row' }, h('span', {}, 'Имя Жар-птицы (необязательно)'), h('input', { type: 'text', maxlength: 16, value: s.petName, placeholder: PET.defaultName, oninput: e => { s.petName = e.target.value.trim(); } }))],
  ];

  const render = () => {
    body.replaceChildren(...pages[step]());
    dots.replaceChildren(...pages.map((_, i) => h('i', { class: i === step ? 'on' : '' })));
    next.textContent = step < pages.length - 1 ? 'Дальше' : 'Первые шаги · 2 мин';
    skip.hidden = step < pages.length - 1;
    shownAt = performance.now();
  };
  const done = target => { app.profile.onboarded = true; app.profile.safetySeen = SAFETY_VERSION; app.updateSettings({ ...s }); app.go(target, { from: 'home' }); };
  next.onclick = () => {
    // A double tap must not skip «Безопасно» (5.10): the second tap of the same gesture is ignored.
    if (performance.now() - shownAt < 300) return;
    // The new page is announced by its heading (5.11: focus stayed on «Дальше» and «Безопасно» passed unheard).
    if (step < pages.length - 1) { step++; render(); const h1 = body.querySelector('h1'); h1?.setAttribute('tabindex', '-1'); h1?.focus({ preventScroll: true }); return; }
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

/** The safety rules (one list: core/wellbeing.js) — the onboarding page and the re-read after a change. */
function safetyList() {
  return h('ul', { class: 'how card onb-card' }, ...SAFETY_RULES.map(rule => h('li', {}, rule)));
}

function safetyUpdate(app) {
  const ok = h('button', { class: 'btn primary big', onclick: () => { app.profile.safetySeen = SAFETY_VERSION; app.save(); app.go('home'); } }, 'Понятно');
  return {
    node: h('div', { class: 'screen onboarding' },
      h('main', { class: 'scroll center' }, h('div', { class: 'onboarding-body' },
        h('div', { class: 'onb-hero' }, trails(), h('div', { class: 'onb-art small' }, badgeArt('shield', 84)),
          h('h1', {}, 'Безопасно'),
          h('p', { class: 'lead' }, 'Правила безопасности обновились — прочитайте, пожалуйста.')),
        safetyList())),
      h('div', { class: 'sticky-actions' }, ok)),
    focus: ok,
    onBack: () => 'exit', // not skipped by back: the app may close, the page comes back on the next start
  };
}
