// Wellbeing check-in before the daily plan: pain (NRS categories), fatigue and — with real sensors — the skin
// under the electrodes → normal, light or no session today. Big taps; the answers go to the specialist report.
// Safety rules, not a diagnosis.
import { h } from './dom.js';
import { topBar, segmented, mioAvatar } from './widgets.js';
import { PAIN_LEVELS, FATIGUE_LEVELS, SKIN_LEVELS, checkInAdvice, checkinSkippable, CHECKIN_ACTION } from '../core/wellbeing.js';
import { recordDayNote, lightenPlan, dayKey } from '../core/progress.js';

export function checkinScreen(app) {
  const sensors = app.sourceKind() === 'bridge'; // the on-screen emulator touches no skin
  const answers = { pain: null, fatigue: null, ...(sensors ? { skin: null } : {}) };
  const advice = h('div', { class: 'checkin-advice', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn primary big', disabled: true }, 'Дальше');
  const skip = h('button', { class: 'btn ghost', onclick: () => {
    if (!checkinSkippable(answers, app.checkin())) return; // a stored answer is never overwritten by a skip
    recordDayNote(app.profile, dayKey(), { checkin: { skipped: true, at: new Date().toISOString() } }); app.save(); app.startPlan({ checked: true });
  } }, 'Пропустить');
  const update = () => {
    skip.hidden = !checkinSkippable(answers, app.checkin());
    const ready = Object.values(answers).every(v => v !== null);
    go.disabled = !ready;
    if (!ready) return;
    const a = checkInAdvice(answers);
    advice.replaceChildren(h('p', { class: `note ${a.action === CHECKIN_ACTION.GO ? '' : 'warn'}` }, a.text));
    go.textContent = a.action === CHECKIN_ACTION.STOP ? 'Понятно, отдыхаю' : a.action === CHECKIN_ACTION.LIGHT ? 'Начать короткий план' : 'Начать тренировку';
    app.say(a.text, { interrupt: true });
  };
  go.onclick = () => {
    const a = checkInAdvice(answers), today = dayKey();
    recordDayNote(app.profile, today, { checkin: { ...answers, action: a.action, reason: a.reason, at: new Date().toISOString() } });
    if (a.action === CHECKIN_ACTION.LIGHT) lightenPlan(app.dailyPlan());
    app.save();
    if (a.action === CHECKIN_ACTION.STOP) app.go('home'); else app.startPlan({ checked: true });
  };
  skip.hidden = !checkinSkippable(answers, app.checkin());
  const question = (title, levels, key) => h('section', { class: 'card' }, h('h2', {}, title),
    segmented(levels.map(l => ({ value: l.id, label: l.label, sub: l.nrs })), null, v => { answers[key] = v; update(); }, title));
  app.say(sensors ? 'Как рука сегодня? Есть ли боль, усталость, раздражение кожи под датчиками?' : 'Как рука сегодня? Есть ли боль и усталость?', { interrupt: true });
  return {
    node: h('div', { class: 'screen checkin' },
      topBar('Самочувствие', () => app.go('home')),
      h('main', { class: 'scroll' },
        h('div', { class: 'checkin-hero' }, mioAvatar('support', 64), h('p', { class: 'lead' }, 'Как рука сегодня?')),
        h('p', { class: 'note' }, `${sensors ? 'Три вопроса' : 'Два вопроса'} перед тренировкой — чтобы вовремя остановиться или сделать день лёгким. Ответы хранятся на этом устройстве и попадают в копию и отчёт, которые вы сохраняете сами.`),
        question('Боль в культе или руке', PAIN_LEVELS, 'pain'),
        question('Усталость мышц', FATIGUE_LEVELS, 'fatigue'),
        sensors ? question('Кожа под датчиками', SKIN_LEVELS, 'skin') : null,
        advice,
        h('div', { class: 'sticky-actions' }, go, skip))),
  };
}
