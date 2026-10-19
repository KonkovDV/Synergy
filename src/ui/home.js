// Home: who I am today (level, series, weekly goal) → today's plan → free play.
import { fmtPct, count, FORMS } from '../core/format.js';
import { h } from './dom.js';
import { bottomNav, topBar, mioAvatar } from './widgets.js';
import { TRAINING_GAMES, ASSESSMENT, GAME_BY_ID } from '../games/registry.js';
import { trainingDays, playerLevel, weeklyStatus, dayKey, gameProgress, recommendedLevel, streakAlive, secondsToday, assessmentStatus, painRestDays } from '../core/progress.js';
import { SCHEME_INFO, SKILL_NAME } from '../core/vocabulary.js';
import { DAILY_TIPS } from './coach.js';
import { overDailyCap, capAdvice } from '../core/wellbeing.js';
import { gameArt, badgeArt, starRow, trails, firebird } from './art.js';
import { petState } from '../core/pet.js';
import { SESSION, PET } from '../config.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function homeScreen(app) {
  if (!app.profile.onboarded) { queueMicrotask(() => app.go('onboarding')); return { node: h('div') }; }
  const today = dayKey();
  const p = app.profile, s = app.settings;
  const lvl = playerLevel(p.xp);
  const week = weeklyStatus(p, s.weeklyGoal, today);
  const plan = app.dailyPlan();
  const doneCount = plan.items.filter(i => i.done).length;
  const allDone = doneCount === plan.items.length;
  const resting = app.checkin()?.action === 'stop';
  // Жар-птица (5.12): grows with training days; fed when trained today, asleep on a declared rest day — never sad.
  const petName = s.petName || PET.defaultName;
  const pet = petState(trainingDays(p), { trainedToday: (p.days[today]?.runs ?? 0) > 0, restToday: resting, name: petName });
  const streak = streakAlive(p.streak, today, painRestDays(p)) ? p.streak.current : 0;
  const tip = DAILY_TIPS[Math.floor(Date.now() / 86400000) % DAILY_TIPS.length];
  const overCap = overDailyCap(secondsToday(p, today), app.rules.softCapMin);
  const check = assessmentStatus(app.state.runs, s.scheme, today);

  const head = h('section', { class: 'hero' }, trails('light'),
    h('div', { class: 'hero-top' },
      h('div', { class: 'avatar' }, firebird(pet.stage.id, pet.mood, 52)),
      h('div', {},
        h('p', { class: 'eyebrow' }, SCHEME_INFO[s.scheme].short),
        h('h1', {}, s.name ? `Привет, ${s.name}!` : 'Привет!')),
      h('div', { class: 'streak', title: 'Серия тренировочных дней (день отдыха не прерывает)' }, badgeArt('flame', 24), h('b', { 'aria-hidden': 'true' }, streak), h('span', { class: 'sr-only' }, `Серия: ${count(streak, FORMS.days)}`))),
    h('div', { class: 'xp' },
      h('span', {}, `Уровень ${lvl.level}`),
      h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Опыт до уровня ${lvl.level + 1}`, 'aria-valuenow': Math.round(lvl.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.round(lvl.progress * 100)}%` } })),
      h('small', {}, `ещё ${lvl.toNext} XP`)),
    h('div', { class: 'week' },
      ...week.days.map((d, i) => h('div', { class: `day ${week.trained[i] ? 'done' : ''} ${i === week.todayIndex ? 'today' : ''}` }, h('i'), h('small', {}, WEEKDAYS[i]),
        h('span', { class: 'sr-only' }, week.trained[i] ? ': занимались' : i === week.todayIndex ? ': сегодня' : ''))),
      h('p', { class: 'week-note' }, `${week.done} из ${week.goal} дней в неделю`)));

  // The day's main action comes right under the title (5.8): at the end of the card it sat under the bottom bar
  // on a 390 × 844 phone and was not visible without scrolling. The list below says what is inside.
  const restText = app.checkin()?.reason === 'skin'
    ? 'Сегодня вы отметили раздражение кожи под датчиками — день без датчиков: серия не прерывается. Если покраснение не проходит, покажите кожу протезисту.'
    : 'Сегодня вы отметили сильную боль — день отдыха: серия не прерывается. Если боль повторяется, обратитесь к врачу или протезисту.';
  const planCard = h('section', { class: 'card plan' },
    h('div', { class: 'card-head' }, h('h2', {}, plan.light ? 'Тренировка дня · лёгкая' : 'Тренировка дня'), h('span', { class: 'pill' }, `${doneCount}/${plan.items.length}`)),
    overCap ? h('p', { class: 'note warn' }, capAdvice(app.rules.softCapMin)) : null,
    resting ? h('p', { class: 'note warn' }, restText) : null,
    // Before the tutorial its card is the one primary action (5.11: three equal glowing buttons on the first run).
    h('button', { class: `btn ${p.tutorialDone ? 'primary' : 'ghost'} big plan-start`, disabled: allDone || resting, onclick: () => app.startPlan() },
      resting ? 'Сегодня — отдых' : allDone ? 'План выполнен' : doneCount ? 'Продолжить' : `Начать · ≈ ${plan.items.length * 2 + 2} мин`),
    resting ? h('button', { class: 'btn ghost', onclick: () => app.go('checkin') }, 'Изменить ответ') : null,
    h('ol', { class: 'plan-list', 'aria-label': 'Упражнения плана' }, ...plan.items.map(item => {
      const g = GAME_BY_ID[item.game];
      return h('li', { class: item.done ? 'done' : '' },
        h('span', { class: `plan-icon g-${g.id}`, 'aria-hidden': 'true' }, item.done ? badgeArt('done', 30) : gameArt(g.id, 34)),
        h('div', {}, h('b', {}, item.retention ? `${g.title}: без подсказки` : g.title),
          h('small', {}, item.done ? 'выполнено' : item.retention ? 'Испытание без живой подсказки' : `Уровень ${item.level} · ${g.skills.map(k => SKILL_NAME[k]).slice(0, 2).join(', ')}`)));
    })));

  const tipCard = h('section', { class: 'card tip' }, h('div', { class: 'coach-head' }, mioAvatar('support', 44), h('b', {}, 'Совет Мио')), h('p', {}, tip));
  const tutorialCard = !p.tutorialDone ? h('section', { class: 'card tutorial-card' },
    h('b', { class: 'with-art' }, gameArt('tutorial', 36), 'Первые шаги · 2 минуты'), h('p', {}, 'Покой, сжатие, раскрытие, сила и коактивация — с живой подсказкой, до первой игры.'),
    h('button', { class: 'btn primary', onclick: () => app.go('tutorial') }, 'Пройти обучение')) : null;
  // The weekly check appears after the first exercise, and is primary only when a week has really passed (5.11).
  const checkCard = !app.state.runs.some(r => !r.demo) ? null : h('section', { class: `card g-check ${check.due ? 'due' : ''}` },
    h('div', { class: 'card-head' }, h('b', { class: 'with-art' }, gameArt(ASSESSMENT.id, 36), ASSESSMENT.title), h('span', { class: 'pill' }, check.last ? fmtPct(check.last.details.completionRate) : 'новое')),
    h('p', { class: 'note' }, check.last ? (check.due ? `Прошло ${check.days} дн. — пора сравнить себя с собой.` : `Последняя: ${check.days ? `${check.days} дн. назад` : 'сегодня'}. Следующая — через ${SESSION.assessmentEveryDays - check.days} дн.`) : ASSESSMENT.tagline),
    h('button', { class: `btn ${check.due && check.last ? 'primary' : 'ghost'}`, onclick: () => app.go('play', { game: ASSESSMENT.id, level: 1 }) }, check.due ? 'Пройти проверку · ≈ 2 мин' : 'Пройти ещё раз'));

  const games = h('section', { class: 'games' }, h('h2', {}, 'Игры'),
    h('div', { class: 'game-grid' }, ...TRAINING_GAMES.map(g => {
      const gp = gameProgress(p, g.id);
      const stars = Object.values(gp.stars).reduce((a, b) => a + b, 0);
      return h('button', { class: `game-card g-${g.id}`, onclick: () => app.go('levels', { game: g.id }) },
        h('span', { class: 'game-icon', 'aria-hidden': 'true' }, gameArt(g.id, 44)),
        h('b', {}, g.title), h('small', {}, g.tagline),
        h('span', { class: 'game-meta' }, badgeArt('star', 16), h('span', {}, `${stars}/${g.Game.levels.length * 3}`, h('span', { class: 'sr-only' }, ' звёзд'), ` · ур. ${gp.unlocked}`)));
    })));

  // The nest (5.12, the sample's pet): what the bird is now, how many training days to the next stage, its mood words.
  const petCard = h('section', { class: 'card pet-card' },
    h('div', { class: 'pet-art', 'aria-hidden': 'true' }, firebird(pet.stage.id, pet.mood, 104)),
    h('div', { class: 'pet-info' },
      h('p', { class: 'eyebrow' }, pet.stage.name),
      h('h2', {}, petName),
      pet.next ? h('div', { class: 'pet-progress' },
        h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Рост до стадии «${pet.next.name}»`, 'aria-valuenow': Math.round(pet.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.round(pet.progress * 100)}%` } })),
        h('small', {}, `${pet.next.name} — через ${count(pet.left, FORMS.days)} с тренировкой`)) : h('small', {}, 'Выросла! Каждая тренировка держит её в силе.'),
      h('p', { class: 'pet-line' }, pet.line)));
  return { node: h('div', { class: 'screen home' }, h('main', { class: 'scroll' }, head, tutorialCard, planCard, petCard, checkCard, tipCard, games), bottomNav(app, 'home')) };
}

export function levelsScreen(app, { game }) {
  const g = GAME_BY_ID[game];
  const gp = gameProgress(app.profile, game);
  const rec = recommendedLevel(app.profile, game);
  const list = h('div', { class: 'level-grid' }, ...g.Game.levels.map((_, i) => {
    const n = i + 1, locked = n > gp.unlocked;
    return h('button', { class: `level ${locked ? 'locked' : ''} ${n === rec ? 'rec' : ''}`, disabled: locked, 'aria-label': `Уровень ${n}${locked ? ', закрыт' : `, ${count(gp.stars[n] ?? 0, FORMS.stars)} из 3`}`,
      onclick: () => app.go('play', { game, level: n }) },
      locked ? badgeArt('lock', 28) : h('b', {}, n), locked ? null : starRow(gp.stars[n] ?? 0, 3, 16));
  }));
  return {
    node: h('div', { class: 'screen levels' },
      topBar(g.title, () => app.go('home')),
      h('main', { class: 'scroll' },
        h('section', { class: 'card' }, h('div', { class: `game-hero g-${g.id}`, 'aria-hidden': 'true' }, gameArt(g.id, 76)), h('p', {}, g.teaches),
          h('ul', { class: 'how' }, ...g.how.map(x => h('li', {}, x)))),
        h('h2', {}, 'Уровни'), list,
        h('div', { class: 'sticky-actions' },
          h('button', { class: 'btn primary big', onclick: () => app.go('play', { game, level: rec }) }, g.assessment ? 'Начать проверку' : `Играть · уровень ${rec}`),
          g.assessment ? null : h('button', { class: 'btn ghost', onclick: () => app.go('play', { game, level: rec, retention: true }) }, 'Испытание без подсказки')))),
  };
}
