// Results (knowledge of results + coach advice + rewards) and the rest break between plan items.
import { h, starsText, toast } from './dom.js';
import { skillBar } from './widgets.js';
import { GAME_BY_ID } from '../games/registry.js';
import { SKILL_NAME, COMMAND } from '../core/vocabulary.js';
import { ACHIEVEMENTS, SKINS, recordDayNote, dayKey, secondsToday } from '../core/progress.js';
import { difficultyLabel } from '../core/adaptive.js';
import { fatigueSigns, EFFORT_LEVELS } from '../core/wellbeing.js';
import { coachFeedback, coachMood } from './coach.js';
import { CALIBRATION_ADAPT } from '../config.js';
import { signalMeter, segmented, mioAvatar } from './widgets.js';

const plural = (n, [one, few, many]) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };

/** Hands-free confirm: hold A to trigger the primary action (shared by results and rest screens). */
function muscleConfirm(app, ring, action) {
  const pipeline = app.createPipeline();
  const source = app.signalSource();
  const confirmS = app.settings.dwellS + 0.2; // a bit longer than the game start: leaving a screen costs more
  let hold = 0, armed = false;
  return (now, dt) => {
    const intent = pipeline.process(source.sample(now), now);
    if (intent.command === COMMAND.REST) armed = true; // must relax first, so the end of a game does not trigger it
    hold = armed && intent.command === COMMAND.CLOSE ? hold + dt : Math.max(0, hold - dt * 2);
    ring?.style.setProperty('--p', String(Math.min(1, hold / confirmS)));
    if (hold >= confirmS) { hold = -999; action(); }
    return intent;
  };
}

export function resultsScreen(app, { run, report, planBonus = 0, calibrationNote = null, plan = false, demo = false }) {
  const g = GAME_BY_ID[run.game];
  const advice = coachFeedback(run.game, run, app.state.runs);
  const next = plan ? app.nextPlanItem() : null;
  const planDone = plan && !next;
  if (report) {
    report.achievements.forEach(id => toast(`🏅 ${ACHIEVEMENTS.find(a => a.id === id).name}`, 'good'));
    report.skins.forEach(id => toast(`🎨 Новый облик: ${SKINS.find(sk => sk.id === id).name}`, 'good'));
    if (report.levelUp) toast(`⬆ Уровень ${report.level}!`, 'good');
  }
  if (calibrationNote?.recalibrate) toast('Пора перекалибровать датчики', 'bad');
  const ring = h('i', { class: 'confirm-ring' });
  const today = dayKey();
  // Safety first: signs of fatigue or the daily cap turn «next exercise» into «stop for today».
  const fatigue = !demo && next ? fatigueSigns(app.runsToday()) : null;
  const overCap = !demo && next && secondsToday(app.profile, today) / 60 >= app.rules.softCapMin;
  const stopAdvice = fatigue ? `Результат снизился на ${fatigue.drop} очков за ${fatigue.minutes} мин — похоже на усталость мышц. Лучше закончить на сегодня.`
    : overCap ? `Сегодня уже больше ${app.rules.softCapMin} минут. Мышцам нужен отдых — продолжим завтра.` : null;
  const primary = planDone ? { label: 'Готово на сегодня', go: () => app.go('home') }
    : stopAdvice ? { label: 'Закончить на сегодня', go: () => app.go('home') }
    : next ? { label: `Отдых ${app.rules.restS} с → ${GAME_BY_ID[next.game].title}`, go: () => app.go('rest', { next }) }
    : run.stars > 0 && run.level < run.levelCount && !demo ? { label: `Уровень ${run.level + 1}`, go: () => app.go('play', { game: run.game, level: run.level + 1 }) }
    : { label: 'Ещё раз', go: () => app.go('play', { game: run.game, level: run.level, retention: run.retention }) };

  const skills = Object.entries(run.skills).map(([k, v]) => skillBar(SKILL_NAME[k], v));
  const d = run.details ?? {};
  const metric = (label, value) => h('div', {}, h('b', {}, value ?? '—'), h('small', {}, label));
  const assessmentCard = d.assessment ? h('section', { class: 'card' }, h('h2', {}, 'Метрики проверки'),
    h('div', { class: 'stats' },
      metric('выполнено', `${d.completionRate}%`), metric('выбор, мс', d.selectionMs), metric('выполнение, мс', d.completionMs), metric('точность', d.accuracy === null ? '—' : `${d.accuracy}%`),
      'throughputBps' in d ? metric('ПС, бит/с', d.throughputBps?.toLocaleString('ru-RU', { maximumFractionDigits: 1 })) : null),
    h('p', { class: 'note' }, `Время выбора — до первого верного сигнала; выполнение — до удержания 1 с${'throughputBps' in d ? ' (уровни силы — 0,5 с). ПС — пропускная способность по закону Фиттса: чем быстрее и точнее выход на уровень силы, тем она выше' : ''}. Сравнивайте с прошлой неделей на экране «Прогресс». Метрики игровые, не клинический тест.`)) : null;
  const calibrationCard = calibrationNote?.recalibrate
    ? h('div', { class: 'card warn-card', role: 'status' }, h('b', {}, '⚠ Пора перекалибровать'),
      h('p', {}, calibrationNote.stuckChannel !== null
        ? `Канал ${calibrationNote.stuckChannel ? 'B' : 'A'} был включён больше ${CALIBRATION_ADAPT.stuckS} с подряд. Если рука была расслаблена — датчик сместился или контакт изменился.`
        : 'Сигнал покоя заметно ушёл от калибровки — так бывает от пота или смещения датчика.'),
      h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков'))
    : calibrationNote ? h('p', { class: 'note' }, `Калибровка подстроилась под датчик: покой сдвинут на ${calibrationNote.shiftPct} % диапазона.`) : null;
  const difficulty = !d.assessment && !run.retention && Number.isFinite(d.difficulty) && Math.abs(d.difficulty) > 0.2
    ? h('p', { class: 'note' }, `Сложность подстраивалась под вас: ${difficultyLabel(d.difficulty)}.`) : null;
  const effortCard = planDone && !demo ? h('section', { class: 'card' }, h('h2', {}, 'Насколько тяжело было?'),
    segmented(EFFORT_LEVELS.map(e => ({ value: e.id, label: e.label })), app.profile.days[today]?.effort ?? null,
      v => { recordDayNote(app.profile, today, { effort: v }); app.save(); toast('Записано — это увидит специалист в отчёте'); }),
    h('p', { class: 'note' }, 'Ответ попадёт в отчёт для специалиста: так видно, подходит ли нагрузка.')) : null;
  const node = h('div', { class: 'screen results' },
    h('main', { class: 'scroll center' },
      h('h1', { class: 'sr-only' }, `Итоги: ${g.title}`),
      h('p', { class: 'eyebrow' }, `${g.title} · уровень ${run.level}${run.retention ? ' · без подсказки' : ''}${demo ? ' · демо' : ''}`),
      h('div', { class: `big-stars s${run.stars}`, 'aria-label': `${run.stars} из 3 звёзд` }, starsText(run.stars)),
      h('p', { class: 'big-score' }, run.score, h('small', {}, ' / 100')),
      report ? h('p', { class: 'xp-gain' }, `+${report.xp + planBonus} XP${planBonus ? ' (план дня выполнен!)' : ''}${report.unlockedLevel ? ` · открыт уровень ${report.unlockedLevel}` : ''}`)
        : h('p', { class: 'note' }, 'Демо не влияет на прогресс.'),
      difficulty,
      calibrationCard,
      planDone ? h('div', { class: 'card celebrate' }, h('b', {}, '🎉 Тренировка дня выполнена'), h('p', {}, 'Отличная работа. Короткие ежедневные занятия — лучший путь к уверенному управлению.')) : null,
      stopAdvice ? h('div', { class: 'card warn-card' }, h('b', {}, '⏸ Пора отдохнуть'), h('p', {}, stopAdvice)) : null,
      effortCard,
      assessmentCard,
      h('section', { class: 'card' }, h('h2', {}, 'Навыки'), ...skills),
      h('section', { class: 'card coach' }, h('div', { class: 'coach-head' }, mioAvatar(coachMood({ stars: run.stars, stopAdvice }), 52), h('b', {}, 'Мио советует')), ...advice.map(t => h('p', {}, t))),
      h('div', { class: 'sticky-actions' },
        h('button', { class: 'btn primary big', onclick: primary.go }, primary.label),
        h('div', { class: 'confirm' }, ring, h('span', {}, 'или удерживайте A — без касания')),
        h('div', { class: 'row-actions' },
          stopAdvice && next ? h('button', { class: 'btn ghost', onclick: () => app.go('rest', { next }) }, 'Всё равно продолжить') : null,
          h('button', { class: 'btn ghost', onclick: () => app.go('play', { game: run.game, level: run.level, retention: run.retention, plan }) }, 'Повторить'),
          h('button', { class: 'btn ghost', onclick: () => app.go('home') }, 'Домой')))));
  const confirm = muscleConfirm(app, ring, primary.go);
  app.say(`${run.stars} ${plural(run.stars, ['звезда', 'звезды', 'звёзд'])} из трёх. ${run.score} ${plural(run.score, ['очко', 'очка', 'очков'])}. ${stopAdvice ?? advice[0] ?? ''} Дальше: ${primary.label}.`, { interrupt: true });
  return { node, tick: confirm };
}

export function restScreen(app, { next }) {
  let left = app.rules.restS;
  const g = GAME_BY_ID[next.game];
  const count = h('b', { class: 'rest-count' }, left);
  const meter = signalMeter(app);
  const go = () => app.go('play', { game: next.game, level: next.level, retention: next.retention, plan: true });
  const node = h('div', { class: 'screen rest' },
    h('main', { class: 'scroll center' },
      mioAvatar('rest', 64),
      h('h1', { class: 'eyebrow' }, 'Отдых'),
      h('div', { class: 'breath', 'aria-hidden': 'true' }),
      count,
      h('p', {}, 'Полностью расслабьте руку. Дышите спокойно: вдох — круг растёт, выдох — сжимается.'),
      h('p', { class: 'note' }, 'Проверка покоя: обе полоски должны быть почти пустыми.'),
      meter.node,
      h('section', { class: 'card' }, h('b', {}, `Дальше: ${g.icon} ${g.title}${next.retention ? ' — без подсказки' : ''}`), h('p', {}, g.tagline)),
      h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary big', onclick: go }, 'Пропустить отдых'))));
  const pipeline = app.createPipeline(), source = app.signalSource();
  app.say(`Отдых ${left} секунд. Полностью расслабьте руку. Дальше: ${g.title}.`, { interrupt: true });
  return {
    node,
    tick(now, dt) {
      meter.update(pipeline.process(source.sample(now), now));
      left -= dt;
      const shown = Math.max(0, Math.ceil(left));
      if (count.textContent !== String(shown)) count.textContent = shown;
      if (left <= 0) { left = Infinity; go(); }
    },
  };
}
