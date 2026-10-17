// Wellbeing check-in before the daily plan: pain (NRS categories) and fatigue → normal, light or no
// session today. Two big taps; the answers go to the specialist report. Safety rules, not a diagnosis.
import { h } from './dom.js';
import { topBar, segmented } from './widgets.js';
import { PAIN_LEVELS, FATIGUE_LEVELS, checkInAdvice, CHECKIN_ACTION } from '../core/wellbeing.js';
import { recordDayNote, lightenPlan, dayKey } from '../core/progress.js';

export function checkinScreen(app) {
  const answers = { pain: null, fatigue: null };
  const advice = h('div', { class: 'checkin-advice', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn primary big', disabled: true }, 'Дальше');
  const update = () => {
    const ready = answers.pain !== null && answers.fatigue !== null;
    go.disabled = !ready;
    if (!ready) return;
    const a = checkInAdvice(answers);
    advice.replaceChildren(h('p', { class: `note ${a.action === CHECKIN_ACTION.GO ? '' : 'warn'}` }, a.text));
    go.textContent = a.action === CHECKIN_ACTION.STOP ? 'Понятно, отдыхаю' : a.action === CHECKIN_ACTION.LIGHT ? 'Начать лёгкую тренировку' : 'Начать тренировку';
    app.say(a.text, { interrupt: true });
  };
  go.onclick = () => {
    const a = checkInAdvice(answers), today = dayKey();
    recordDayNote(app.profile, today, { checkin: { ...answers, action: a.action, at: new Date().toISOString() } });
    if (a.action === CHECKIN_ACTION.LIGHT) lightenPlan(app.dailyPlan());
    app.save();
    if (a.action === CHECKIN_ACTION.STOP) app.go('home'); else app.startPlan({ checked: true });
  };
  app.say('Как рука сегодня? Есть ли боль и усталость?', { interrupt: true });
  return {
    node: h('div', { class: 'screen checkin' },
      topBar('Самочувствие', () => app.go('home')),
      h('main', { class: 'scroll' },
        h('p', { class: 'lead' }, 'Как рука сегодня?'),
        h('p', { class: 'note' }, 'Два вопроса перед тренировкой — чтобы нагрузка была безопасной. Ответы видны только вам и специалисту, если вы покажете ему отчёт.'),
        h('section', { class: 'card' }, h('h2', {}, 'Боль в культе или руке'),
          segmented(PAIN_LEVELS.map(p => ({ value: p.id, label: p.label, sub: p.nrs })), null, v => { answers.pain = v; update(); })),
        h('section', { class: 'card' }, h('h2', {}, 'Усталость мышц'),
          segmented(FATIGUE_LEVELS.map(f => ({ value: f.id, label: f.label })), null, v => { answers.fatigue = v; update(); })),
        advice,
        h('div', { class: 'sticky-actions' }, go,
          h('button', { class: 'btn ghost', onclick: () => { recordDayNote(app.profile, dayKey(), { checkin: { skipped: true, at: new Date().toISOString() } }); app.save(); app.startPlan({ checked: true }); } }, 'Пропустить')))),
  };
}
