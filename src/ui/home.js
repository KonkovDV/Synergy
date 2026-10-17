// Home: who I am today (level, series, weekly goal) → today's plan → free play.
import { h, starsText } from './dom.js';
import { bottomNav, topBar } from './widgets.js';
import { GAMES, GAME_BY_ID } from '../games/registry.js';
import { playerLevel, weeklyStatus, dayKey, gameProgress, recommendedLevel, streakAlive, secondsToday } from '../core/progress.js';
import { SCHEME_INFO, SKILL_NAME } from '../core/vocabulary.js';
import { DAILY_TIPS } from './coach.js';
import { gestureIcon } from '../input/controls.js';
import { GESTURE_BY_ID } from '../core/vocabulary.js';
import { SESSION } from '../config.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function homeScreen(app) {
  if (!app.profile.onboarded) { queueMicrotask(() => app.go('onboarding')); return { node: h('div') }; }
  const today = dayKey();
  const p = app.profile, s = app.settings;
  const lvl = playerLevel(p.xp);
  const week = weeklyStatus(p, s.weeklyGoal, today);
  const plan = app.dailyPlan();
  const doneCount = plan.items.filter(i => i.done).length;
  const streak = streakAlive(p.streak, today) ? p.streak.current : 0;
  const tip = DAILY_TIPS[Math.floor(Date.now() / 86400000) % DAILY_TIPS.length];
  const overCap = secondsToday(p, today) / 60 >= SESSION.dailySoftCapMin;

  const head = h('section', { class: 'hero' },
    h('div', { class: 'hero-top' },
      h('div', { class: 'avatar' }, gestureIcon(GESTURE_BY_ID.thumb, 'icon', 40)),
      h('div', {},
        h('p', { class: 'eyebrow' }, SCHEME_INFO[s.scheme].short),
        h('h1', {}, s.name ? `Привет, ${s.name}!` : 'Привет!')),
      h('div', { class: 'streak', title: 'Серия тренировочных дней (день отдыха не прерывает)' }, h('span', { 'aria-hidden': 'true' }, '🔥'), h('b', {}, streak))),
    h('div', { class: 'xp' },
      h('span', {}, `Уровень ${lvl.level}`),
      h('div', { class: 'xp-track', role: 'progressbar', 'aria-valuenow': Math.round(lvl.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.round(lvl.progress * 100)}%` } })),
      h('small', {}, `ещё ${lvl.toNext} XP`)),
    h('div', { class: 'week' },
      ...week.days.map((d, i) => h('div', { class: `day ${week.trained[i] ? 'done' : ''} ${i === week.todayIndex ? 'today' : ''}` }, h('i'), h('small', {}, WEEKDAYS[i]))),
      h('p', { class: 'week-note' }, `${week.done} из ${week.goal} дней в неделю`)));

  const planCard = h('section', { class: 'card plan' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Тренировка дня'), h('span', { class: 'pill' }, `${doneCount}/${plan.items.length}`)),
    h('ol', { class: 'plan-list' }, ...plan.items.map(item => {
      const g = GAME_BY_ID[item.game];
      return h('li', { class: item.done ? 'done' : '' },
        h('span', { class: 'plan-icon', 'aria-hidden': 'true' }, item.done ? '✓' : g.icon),
        h('div', {}, h('b', {}, item.retention ? `${g.title}: без подсказки` : g.title),
          h('small', {}, item.retention ? 'Проверка: навык без живой подсказки' : `Уровень ${item.level} · ${g.skills.map(k => SKILL_NAME[k]).slice(0, 2).join(', ')}`)));
    })),
    overCap ? h('p', { class: 'note warn' }, 'Сегодня уже больше 30 минут. Мышцам нужен отдых — продолжим завтра.') : null,
    h('button', { class: 'btn primary big', disabled: doneCount === plan.items.length, onclick: () => startPlan(app) },
      doneCount === plan.items.length ? 'План выполнен ✓' : doneCount ? 'Продолжить' : `Начать · ≈ ${plan.items.length * 2 + 2} мин`));

  const tipCard = h('section', { class: 'card tip' }, h('b', {}, 'Совет Мио'), h('p', {}, tip));

  const games = h('section', { class: 'games' }, h('h2', {}, 'Игры'),
    h('div', { class: 'game-grid' }, ...GAMES.map(g => {
      const gp = gameProgress(p, g.id);
      const stars = Object.values(gp.stars).reduce((a, b) => a + b, 0);
      return h('button', { class: `game-card g-${g.id}`, onclick: () => app.go('levels', { game: g.id }) },
        h('span', { class: 'game-icon', 'aria-hidden': 'true' }, g.icon),
        h('b', {}, g.title), h('small', {}, g.tagline),
        h('span', { class: 'game-meta' }, `★ ${stars}/${g.Game.levels.length * 3} · ур. ${gp.unlocked}`));
    })));

  return { node: h('div', { class: 'screen home' }, h('main', { class: 'scroll' }, head, planCard, tipCard, games), bottomNav(app, 'home')) };
}

export function startPlan(app) {
  const item = app.nextPlanItem();
  if (!item) return;
  app.plan = { active: true };
  app.go('play', { game: item.game, level: item.level, retention: item.retention, plan: true });
}

export function levelsScreen(app, { game }) {
  const g = GAME_BY_ID[game];
  const gp = gameProgress(app.profile, game);
  const rec = recommendedLevel(app.profile, game);
  const list = h('div', { class: 'level-grid' }, ...g.Game.levels.map((_, i) => {
    const n = i + 1, locked = n > gp.unlocked;
    return h('button', { class: `level ${locked ? 'locked' : ''} ${n === rec ? 'rec' : ''}`, disabled: locked, 'aria-label': `Уровень ${n}${locked ? ', закрыт' : ''}`,
      onclick: () => app.go('play', { game, level: n }) },
      h('b', {}, locked ? '🔒' : n), h('small', {}, locked ? '' : starsText(gp.stars[n] ?? 0)));
  }));
  return {
    node: h('div', { class: 'screen levels' },
      topBar(g.title, () => app.go('home')),
      h('main', { class: 'scroll' },
        h('section', { class: 'card' }, h('p', { class: 'game-hero', 'aria-hidden': 'true' }, g.icon), h('p', {}, g.teaches),
          h('ul', { class: 'how' }, ...g.how.map(x => h('li', {}, x)))),
        h('h2', {}, 'Уровни'), list,
        h('div', { class: 'sticky-actions' },
          h('button', { class: 'btn primary big', onclick: () => app.go('play', { game, level: rec }) }, `Играть · уровень ${rec}`),
          h('button', { class: 'btn ghost', onclick: () => app.go('play', { game, level: rec, retention: true }) }, 'Испытание без подсказки')))),
  };
}
