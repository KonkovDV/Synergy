// Results (knowledge of results + coach advice + rewards) and the rest break between plan items.
import { h, starsText, toast } from './dom.js';
import { skillBar } from './widgets.js';
import { GAME_BY_ID } from '../games/registry.js';
import { SKILL_NAME, COMMAND } from '../core/vocabulary.js';
import { ACHIEVEMENTS, SKINS } from '../core/progress.js';
import { coachFeedback } from './coach.js';
import { SESSION } from '../config.js';
import { signalMeter } from './widgets.js';

const CONFIRM_S = 1.2;

/** Hands-free confirm: hold A to trigger the primary action (shared by results and rest screens). */
function muscleConfirm(app, ring, action) {
  const pipeline = app.createPipeline();
  const source = app.signalSource();
  let hold = 0, armed = false;
  return (now, dt) => {
    const intent = pipeline.process(source.sample(now), now);
    if (intent.command === COMMAND.REST) armed = true; // must relax first, so the end of a game does not trigger it
    hold = armed && intent.command === COMMAND.CLOSE ? hold + dt : Math.max(0, hold - dt * 2);
    ring?.style.setProperty('--p', String(Math.min(1, hold / CONFIRM_S)));
    if (hold >= CONFIRM_S) { hold = -999; action(); }
    return intent;
  };
}

export function resultsScreen(app, { run, report, planBonus = 0, plan = false, demo = false }) {
  const g = GAME_BY_ID[run.game];
  const advice = coachFeedback(run.game, run, app.state.runs);
  const next = plan ? app.nextPlanItem() : null;
  const planDone = plan && !next;
  if (report) {
    report.achievements.forEach(id => toast(`🏅 ${ACHIEVEMENTS.find(a => a.id === id).name}`, 'good'));
    report.skins.forEach(id => toast(`🎨 Новый облик: ${SKINS.find(sk => sk.id === id).name}`, 'good'));
    if (report.levelUp) toast(`⬆ Уровень ${report.level}!`, 'good');
  }
  const ring = h('i', { class: 'confirm-ring' });
  const primary = planDone ? { label: 'Готово на сегодня', go: () => app.go('home') }
    : next ? { label: `Отдых ${SESSION.restBetweenExercisesS} с → ${GAME_BY_ID[next.game].title}`, go: () => app.go('rest', { next }) }
    : run.stars > 0 && run.level < run.levelCount && !demo ? { label: `Уровень ${run.level + 1}`, go: () => app.go('play', { game: run.game, level: run.level + 1 }) }
    : { label: 'Ещё раз', go: () => app.go('play', { game: run.game, level: run.level, retention: run.retention }) };

  const skills = Object.entries(run.skills).map(([k, v]) => skillBar(SKILL_NAME[k], v));
  const node = h('div', { class: 'screen results' },
    h('main', { class: 'scroll center' },
      h('p', { class: 'eyebrow' }, `${g.title} · уровень ${run.level}${run.retention ? ' · без подсказки' : ''}${demo ? ' · демо' : ''}`),
      h('div', { class: `big-stars s${run.stars}`, 'aria-label': `${run.stars} из 3 звёзд` }, starsText(run.stars)),
      h('p', { class: 'big-score' }, run.score, h('small', {}, ' / 100')),
      report ? h('p', { class: 'xp-gain' }, `+${report.xp + planBonus} XP${planBonus ? ' (план дня выполнен!)' : ''}${report.unlockedLevel ? ` · открыт уровень ${report.unlockedLevel}` : ''}`)
        : h('p', { class: 'note' }, 'Демо не влияет на прогресс.'),
      planDone ? h('div', { class: 'card celebrate' }, h('b', {}, '🎉 Тренировка дня выполнена'), h('p', {}, 'Отличная работа. Короткие ежедневные занятия — лучший путь к уверенному управлению.')) : null,
      h('section', { class: 'card' }, h('h2', {}, 'Навыки'), ...skills),
      h('section', { class: 'card coach' }, h('b', {}, 'Мио советует'), ...advice.map(t => h('p', {}, t))),
      h('div', { class: 'sticky-actions' },
        h('button', { class: 'btn primary big', onclick: primary.go }, primary.label),
        h('div', { class: 'confirm' }, ring, h('span', {}, 'или удерживайте A — без касания')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn ghost', onclick: () => app.go('play', { game: run.game, level: run.level, retention: run.retention, plan }) }, 'Повторить'),
          h('button', { class: 'btn ghost', onclick: () => app.go('home') }, 'Домой')))));
  const confirm = muscleConfirm(app, ring, primary.go);
  return { node, tick: confirm };
}

export function restScreen(app, { next }) {
  let left = SESSION.restBetweenExercisesS;
  const g = GAME_BY_ID[next.game];
  const count = h('b', { class: 'rest-count' }, left);
  const meter = signalMeter(app);
  const go = () => app.go('play', { game: next.game, level: next.level, retention: next.retention, plan: true });
  const node = h('div', { class: 'screen rest' },
    h('main', { class: 'scroll center' },
      h('p', { class: 'eyebrow' }, 'Отдых'),
      h('div', { class: 'breath', 'aria-hidden': 'true' }),
      count,
      h('p', {}, 'Полностью расслабьте руку. Дышите спокойно: вдох — круг растёт, выдох — сжимается.'),
      h('p', { class: 'note' }, 'Проверка покоя: обе полоски должны быть почти пустыми.'),
      meter.node,
      h('section', { class: 'card' }, h('b', {}, `Дальше: ${g.icon} ${g.title}${next.retention ? ' — без подсказки' : ''}`), h('p', {}, g.tagline)),
      h('div', { class: 'sticky-actions' }, h('button', { class: 'btn primary big', onclick: go }, 'Пропустить отдых'))));
  const pipeline = app.createPipeline(), source = app.signalSource();
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
