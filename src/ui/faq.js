// «Спросить Мио» (5.14): questions as buttons, answers on the spot — no typing, no network (core/faq.js). Native
// <details>: every question is a button for keyboards, switches and screen readers, several can stay open; a topic
// passed by another screen opens and scrolls into view (the calibration warning asks «почему так бывает?»).
import { h } from './dom.js';
import { topBar, mioAvatar } from './widgets.js';
import { FAQ } from '../core/faq.js';

export function faqScreen(app, { topic = null, from = 'home' } = {}) {
  let target = null;
  const groups = FAQ.map(g => h('section', { class: 'card faq-group' }, h('h2', {}, g.title),
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
        h('section', { class: 'card faq-intro' }, mioAvatar('support', 56),
          h('p', {}, 'Ответы работают без интернета. Если вопрос о здоровье — главный совет один: остановиться и спросить врача или протезиста.')),
        ...groups)),
    focus: target?.querySelector('summary') ?? null,
  };
}
