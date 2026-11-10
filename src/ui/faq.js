// «Спросить Мио» (5.14): questions as buttons, answers on the spot — no typing, no network (core/faq.js). Native
// <details>: every question is a button for keyboards, switches and screen readers, several can stay open; a topic
// passed by another screen opens and scrolls into view (the calibration warning asks «почему так бывает?»).
import { h } from './dom.js';
import { topBar, mioAvatar } from './widgets.js';
import { sectionArt } from './art.js';
import { FAQ } from '../core/faq.js';

/** 5.16: the illustrated icon of each group of questions (public/art/ico-*). */
const GROUP_PICTURE = { 'Датчики и сигнал': 'sensor', 'Самочувствие и кожа': 'checkin', 'Как заниматься': 'plan', 'Протеза ещё нет': 'path', 'Жар-птица и награды': 'gifts', 'Специалист и данные': 'report' };

export function faqScreen(app, { topic = null, from = 'home' } = {}) {
  let target = null;
  const groups = FAQ.map(g => h('section', { class: 'card faq-group' }, h('h2', { class: 'with-art' }, sectionArt(GROUP_PICTURE[g.title], 32), g.title),
    ...g.items.map(item => {
      const el = h('details', { class: 'faq-item', id: `faq-${item.id}`, open: item.id === topic ? true : null },
        h('summary', {}, item.q), ...item.a().map(p => h('p', {}, p)));
      if (item.id === topic) target = el;
      return el;
    })));
  if (target) queueMicrotask(() => target.scrollIntoView({ block: 'start' }));
  return {
    node: h('div', { class: 'screen faq' },
      topBar('Вопросы к Мио', () => app.go(from)),
      h('main', { class: 'scroll' },
        h('section', { class: 'card faq-intro' }, mioAvatar('hello', 56), // 5.16: Мио greets the one who asks
          h('p', {}, 'Ответы работают без интернета. Если вопрос о здоровье — главный совет один: остановиться и спросить врача или протезиста.')),
        // 5.15 — the same knowledge as cards to read in order, with a check: «Азбука протеза».
        h('button', { class: 'btn ghost', onclick: () => app.go('primer', { from: 'faq' }) }, 'Азбука протеза: карточки и проверка'),
        ...groups)),
    focus: target?.querySelector('summary') ?? null,
  };
}
