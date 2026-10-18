// Results (knowledge of results + coach advice + rewards) and the rest break between plan items.
import { count, fmtNum, fmtPct, FORMS } from '../core/format.js';
import { h, starsText, toast } from './dom.js';
import { skillBar, handsFreeText } from './widgets.js';
import { GAME_BY_ID } from '../games/registry.js';
import { SKILL_NAME } from '../core/vocabulary.js';
import { ACHIEVEMENTS, SKINS, recordDayNote, dayKey, secondsToday } from '../core/progress.js';
import { difficultyLabel } from '../core/adaptive.js';
import { adviseStop, EFFORT_LEVELS } from '../core/wellbeing.js';
import { HoldConfirm } from '../core/handsfree.js';
import { coachFeedback, coachMood } from './coach.js';
import { CALIBRATION_ADAPT, HANDS_FREE } from '../config.js';
import { signalMeter, segmented, mioAvatar } from './widgets.js';

/** Hands-free confirm of the primary action (results and rest): the same rule as the game start, a bit longer. */
function muscleConfirm(app, ring, action) {
  const pipeline = app.createPipeline();
  const source = app.signalSource();
  const confirm = new HoldConfirm(app.settings.dwellS + HANDS_FREE.leaveExtraS);
  return (now, dt) => {
    const intent = pipeline.process(source.sample(now), now);
    const fire = confirm.update(intent, dt);
    ring?.style.setProperty('--p', String(confirm.progress));
    if (fire) action();
    return intent;
  };
}

/**
 * What the results lead to (pure, tested): safety first — the plan done or signs of fatigue end the day; a demo
 * inside the plan starts the real exercise (5.10: it offered a 20 s rest before the same game); then the plan's
 * next item, the next level, or the same exercise again.
 * @returns {{ kind: 'home'|'rest'|'play', label: string, params?: object }}
 */
export function resultsAction({ run, plan, demo, next, stopAdvice, restS, titleOf, pose = run.pose }) {
  // The arm pose of the plan's probe travels with the same exercise (5.11: lost on demo → «Начать упражнение»).
  const same = { game: run.game, level: run.level, retention: run.retention, ...(pose ? { pose } : {}) };
  if (plan && demo) return { kind: 'play', label: 'Начать упражнение', params: { ...same, plan: true } };
  if (plan && !next) return { kind: 'home', label: 'Готово на сегодня' };
  if (stopAdvice) return { kind: 'home', label: 'Закончить на сегодня' };
  if (next) return { kind: 'rest', label: `Отдых ${restS} с → ${titleOf(next.game)}`, params: { next } };
  if (run.stars > 0 && run.level < run.levelCount && !demo) return { kind: 'play', label: `Уровень ${run.level + 1}`, params: { game: run.game, level: run.level + 1 } };
  if (demo) return { kind: 'play', label: 'Попробовать самому', params: same };
  return { kind: 'play', label: 'Ещё раз', params: same };
}

/** Rewards of a run, shown on the screen (5.10): toasts covered the stars and the score and vanished in 3 s. */
function rewardList(report) {
  if (!report) return [];
  return [
    ...report.achievements.map(id => `🏅 Достижение: ${ACHIEVEMENTS.find(a => a.id === id)?.name ?? id}`),
    ...report.skins.map(id => `🎨 Новый облик: ${SKINS.find(sk => sk.id === id)?.name ?? id}`),
    ...(report.levelUp ? [`⬆ Уровень игрока: ${report.level}`] : []),
  ];
}

export function resultsScreen(app, { run, report, planBonus = 0, calibrationNote = null, plan = false, demo = false, pose = null }) {
  const g = GAME_BY_ID[run.game];
  const advice = coachFeedback(run.game, run, app.state.runs);
  const next = plan && !demo ? app.nextPlanItem() : null;
  const planDone = plan && !demo && !next;
  const rewards = rewardList(report);
  const ring = h('i', { class: 'confirm-ring' });
  const today = dayKey();
  // Safety first: signs of fatigue or the daily cap turn «next exercise» into «stop for today».
  const stopAdvice = !demo && next ? adviseStop(app.runsToday(), secondsToday(app.profile, today), app.rules.softCapMin, app.state.runs)?.text ?? null : null;
  const action = resultsAction({ run, plan, demo, next, stopAdvice, restS: app.rules.restS, titleOf: id => GAME_BY_ID[id]?.title ?? id, pose: run.pose ?? pose });
  const primary = { label: action.label, go: () => app.go(action.kind, action.params) };
  // The hands-free «дальше» needs sensors: with the on-screen emulator there are no pads on this screen (5.10).
  const handsFree = app.sourceKind() !== 'touch';

  const skills = Object.entries(run.skills).map(([k, v]) => skillBar(SKILL_NAME[k], v));
  const d = run.details ?? {};
  const metric = (label, value) => h('div', {}, h('b', {}, value ?? '—'), h('small', {}, label));
  const assessmentCard = d.assessment ? h('section', { class: 'card' }, h('h2', {}, 'Метрики проверки'),
    h('div', { class: 'stats' },
      metric('выполнено', fmtPct(d.completionRate)), metric('выбор, мс', d.selectionMs), metric('выполнение, мс', d.completionMs), metric('точность', d.accuracy === null ? '—' : fmtPct(d.accuracy)),
      'throughputBps' in d ? metric('ПС, бит/с', fmtNum(d.throughputBps)) : null),
    h('p', { class: 'note' }, `Время выбора — до первого верного сигнала; выполнение — до удержания 1 с${'throughputBps' in d ? ' (уровни силы — 0,5 с). ПС — игровая пропускная способность по мотивам теста Фиттса: чем быстрее и точнее выход на уровень силы, тем она выше' : ''}. Сравнивайте с прошлой неделей на экране «Прогресс». Метрики игровые, не клинический тест.`)) : null;
  const calibrationCard = calibrationNote?.recalibrate
    ? h('div', { class: 'card warn-card', role: 'status' }, h('b', {}, '⚠ Пора перекалибровать'),
      h('p', {}, calibrationNote.stuckChannel !== null
        ? `Канал ${calibrationNote.stuckChannel ? 'B' : 'A'} был включён больше ${CALIBRATION_ADAPT.stuckS} с подряд. Если рука была расслаблена — датчик сместился или контакт изменился.`
        : 'Сигнал покоя заметно ушёл от калибровки — так бывает от пота или смещения датчика.'),
      h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков'))
    : calibrationNote ? h('p', { class: 'note' }, calibrationNote.shiftPct >= 1
      ? `Калибровка подстроилась под датчик: покой сдвинут на ${fmtPct(calibrationNote.shiftPct)} диапазона.`
      : 'Калибровка подстроилась под датчик: покой вернулся к уровню калибровки.') : null;
  const difficulty = !d.assessment && !run.retention && Number.isFinite(d.difficulty) && Math.abs(d.difficulty) > 0.2
    ? h('p', { class: 'note' }, `Сложность подстраивалась под вас: ${difficultyLabel(d.difficulty)}.`) : null;
  const effortCard = planDone && !demo ? h('section', { class: 'card' }, h('h2', {}, 'Насколько тяжело было?'),
    segmented(EFFORT_LEVELS.map(e => ({ value: e.id, label: e.label })), app.profile.days[today]?.effort ?? null,
      v => { recordDayNote(app.profile, today, { effort: v }); app.save(); toast('Записано'); }, 'Насколько тяжело было'),
    h('p', { class: 'note' }, 'Ответ сохранится в дневнике самочувствия и в отчёте, если вы его сохраните.')) : null;
  const node = h('div', { class: 'screen results' },
    h('main', { class: 'scroll center' },
      h('h1', { class: 'sr-only' }, `Итоги: ${g.title}`),
      h('p', { class: 'eyebrow' }, `${g.title} · уровень ${run.level}${run.retention ? ' · без подсказки' : ''}${demo ? ' · демо' : ''}`),
      h('div', { class: `big-stars s${run.stars}`, 'aria-label': `${run.stars} из 3 звёзд` }, starsText(run.stars)),
      h('p', { class: 'big-score' }, run.score, h('small', {}, ' / 100')),
      report ? h('p', { class: 'xp-gain' }, `+${report.xp + planBonus} XP${planBonus ? ' (план дня выполнен!)' : ''}${report.unlockedLevel ? ` · открыт уровень ${report.unlockedLevel} игры` : ''}`)
        : h('p', { class: 'note' }, 'Демо не влияет на прогресс.'),
      rewards.length ? h('ul', { class: 'rewards', 'aria-label': 'Награды' }, ...rewards.map(r => h('li', {}, r))) : null,
      difficulty,
      calibrationCard,
      planDone ? h('div', { class: 'card celebrate' }, h('b', {}, '🎉 Тренировка дня выполнена'), h('p', {}, 'Отличная работа! День отдыха серию не прерывает.')) : null,
      stopAdvice ? h('div', { class: 'card warn-card' }, h('b', {}, '⏸ Пора отдохнуть'), h('p', {}, stopAdvice)) : null,
      effortCard,
      assessmentCard,
      h('section', { class: 'card' }, h('h2', {}, 'Навыки'), ...skills),
      h('section', { class: 'card coach' }, h('div', { class: 'coach-head' }, mioAvatar(coachMood({ stars: run.stars, stopAdvice }), 52), h('b', {}, 'Мио советует')), ...advice.map(t => h('p', {}, t))),
      h('div', { class: 'sticky-actions' },
        h('button', { class: 'btn primary big', onclick: primary.go }, primary.label),
        handsFree ? h('div', { class: 'confirm' }, ring, h('span', {}, `или ${handsFreeText(app.settings.scheme, app.settings.dwellS + HANDS_FREE.leaveExtraS, 'дальше').replace(/^Р/, 'р')}`)) : null,
        h('div', { class: 'row-actions' },
          stopAdvice && next ? h('button', { class: 'btn ghost', onclick: () => app.go('rest', { next }) }, 'Всё равно продолжить') : null,
          action.label === 'Ещё раз' || demo ? null : h('button', { class: 'btn ghost', onclick: () => app.go('play', { game: run.game, level: run.level, retention: run.retention, plan, pose: run.pose ?? pose }) }, 'Повторить'),
          h('button', { class: 'btn ghost', onclick: () => app.go('home') }, 'Домой')))));
  const confirm = handsFree ? muscleConfirm(app, ring, primary.go) : null;
  app.say(`${count(run.stars, FORMS.stars)} из трёх. ${count(run.score, FORMS.points)}. ${rewards.length ? `${rewards.map(r => r.replace(/^\S+ /, '')).join('. ')}. ` : ''}${stopAdvice ?? advice[0] ?? ''} Дальше: ${primary.label}.`, { interrupt: true });
  return { node, tick: confirm };
}

export function restScreen(app, { next }) {
  let left = app.rules.restS;
  const g = GAME_BY_ID[next.game];
  const counter = h('b', { class: 'rest-count' }, left);
  const meter = signalMeter(app);
  // Through the plan flow (5.10): after midnight the new day asks its check-in instead of playing on.
  const go = () => app.startPlan();
  const node = h('div', { class: 'screen rest' },
    h('main', { class: 'scroll center' },
      mioAvatar('rest', 64),
      h('h1', { class: 'eyebrow' }, 'Отдых'),
      h('div', { class: 'breath', 'aria-hidden': 'true' }),
      counter,
      h('p', {}, 'Полностью расслабьте руку. Дышите спокойно: вдох — круг растёт, выдох — сжимается.'),
      h('p', { class: 'note' }, 'Проверка покоя: обе полоски должны быть почти пустыми.'),
      meter.node,
      h('section', { class: 'card' }, h('b', {}, `Дальше: ${g.icon} ${g.title}${next.retention ? ' — без подсказки' : ''}`), h('p', {}, g.tagline)),
      // The pause is the safety rule, not an obstacle (5.11): skipping it is a quiet option, the timer moves on itself.
      h('div', { class: 'sticky-actions' }, h('button', { class: 'btn ghost', onclick: go }, 'Дальше без отдыха'))));
  const pipeline = app.createPipeline(), source = app.signalSource();
  app.say(`Отдых ${count(left, FORMS.seconds)}. Полностью расслабьте руку. Дальше: ${g.title}.`, { interrupt: true });
  return {
    node,
    tick(now, dt) {
      meter.update(pipeline.process(source.sample(now), now));
      left -= dt;
      const shown = Math.max(0, Math.ceil(left));
      if (counter.textContent !== String(shown)) counter.textContent = shown;
      if (left <= 0) { left = Infinity; go(); }
    },
  };
}
