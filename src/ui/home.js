// Home: who I am today (level, series, weekly goal) → today's plan → free play.
import { fmtPct, count, FORMS } from '../core/format.js';
import { h } from './dom.js';
import { bottomNav, topBar, mioAvatar } from './widgets.js';
import { TRAINING_GAMES, ASSESSMENT, GAME_BY_ID } from '../games/registry.js';
import { trainingDays, playerLevel, weeklyStatus, weekOutlookText, dayKey, gameProgress, recommendedLevel, streakAlive, secondsToday, assessmentStatus, painRestDays, planClosedDays, daysSinceTraining, recordDayNote, quickStart } from '../core/progress.js';
import { SCHEME_INFO, SKILL_NAME } from '../core/vocabulary.js';
import { DAILY_TIPS } from './coach.js';
import { overDailyCap, capAdvice, safetyOutdated } from '../core/wellbeing.js';
import { gameArt, badgeArt, starRow, trails, firebird, sectionArt, dayArt } from './art.js';
import { picture } from './pictures.js';
import { touchableBird } from './petcard.js';
import { petState, petName, wornItems } from '../core/pet.js';
import { everydayTask, validEverydayId } from '../core/everyday.js';
import { missionText, missionXp } from '../core/missions.js';
import { PLAN_CATALOG } from '../games/registry.js';
import { SESSION } from '../config.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function homeScreen(app) {
  if (!app.profile.onboarded) { queueMicrotask(() => app.go('onboarding')); return { node: h('div') }; }
  if (safetyOutdated(app.profile)) { queueMicrotask(() => app.go('onboarding', { safety: true })); return { node: h('div') }; } // 5.15
  const today = dayKey();
  const p = app.profile, s = app.settings;
  const lvl = playerLevel(p.xp);
  const week = weeklyStatus(p, s.weeklyGoal, today);
  const plan = app.dailyPlan();
  const doneCount = plan.items.filter(i => i.done).length;
  const allDone = doneCount === plan.items.length;
  const answer = app.checkin();
  const painRest = answer?.action === 'stop' && answer?.reason !== 'skin';
  const skinDay = answer?.reason === 'skin';
  const resting = painRest;
  const quick = quickStart({ tutorialDone: p.tutorialDone, resting, plan, trainedToday: (p.days[today]?.runs ?? 0) > 0 });
  // Жар-птица (5.12): grows with training days; fed when trained today, asleep on a declared rest day — never sad.
  // 5.13: its line says why (the day's latest event), and it wears what the achievements earned.
  const name = petName(s);
  const pet = petState(trainingDays(p), { trainedToday: (p.days[today]?.runs ?? 0) > 0, restToday: resting, name,
    planDone: !!(p.plan?.day === today && p.plan.rewarded), goalDone: !!p.days[today]?.goal, daysSince: daysSinceTraining(p, today) });
  const worn = wornItems(p, pet.stage.id);
  const streak = streakAlive(p.streak, today, painRestDays(p)) ? p.streak.current : 0;
  const tip = DAILY_TIPS[Math.floor(Date.now() / 86400000) % DAILY_TIPS.length];
  const overCap = overDailyCap(secondsToday(p, today), app.rules.softCapMin);
  const check = assessmentStatus(app.state.runs, s.scheme, today);

  // 5.14 — the XP the bar showed last time fills up to the new value on return from an exercise (a micro celebration,
  // the sample's FloatingReward «+20» next to what changed). «Меньше движения»: the bar is simply at its new width.
  const shown = app.xpShownFor === p && Number.isFinite(app.xpShown) ? app.xpShown : p.xp; // another profile (demo, backup) — no fill
  app.xpShown = p.xp; app.xpShownFor = p;
  const gained = Math.max(0, p.xp - shown);
  const before = playerLevel(shown);
  const startPct = gained ? (before.level === lvl.level ? before.progress : 0) : lvl.progress;
  const xpFill = h('i', { style: { width: `${Math.round(startPct * 100)}%` } });
  if (gained) requestAnimationFrame(() => requestAnimationFrame(() => { xpFill.style.width = `${Math.round(lvl.progress * 100)}%`; }));
  // 5.16: the light waves of bg-hero lie over the brand gradient as a soft texture (the dark text stays on the green).
  const head = h('section', { class: 'hero' }, picture('bg-hero', 600, 'hero-bg', () => trails('light')),
    h('div', { class: 'hero-top' },
      h('div', { class: 'avatar' }, firebird(pet.stage.id, pet.mood, 52, { items: worn })),
      h('div', {},
        h('p', { class: 'eyebrow' }, SCHEME_INFO[s.scheme].short),
        h('h1', {}, s.name ? `Привет, ${s.name}!` : 'Привет!')),
      // 5.17 — a streak only from two days on, and never for a child: a broken «0» punishes a missed day; the count of
      // training days only grows (streak-loss aversion, Duolingo/Headspace practice; ethics in GAME_DESIGN).
      streak >= 2 && s.audience !== 'child'
        ? h('div', { class: 'streak', title: 'Серия тренировочных дней (день отдыха не прерывает)' }, badgeArt('flame', 24), h('b', { 'aria-hidden': 'true' }, streak), h('span', { class: 'sr-only' }, `Серия: ${count(streak, FORMS.days)}`))
        : trainingDays(p) > 0
          ? h('div', { class: 'streak days', title: 'Дни с тренировкой — считаются все, перерывы не обнуляют' }, sectionArt('plan', 24), h('b', { 'aria-hidden': 'true' }, trainingDays(p)), h('span', { class: 'sr-only' }, `Дней с тренировкой: ${trainingDays(p)}`))
          : null),
    h('div', { class: 'xp' },
      h('span', { class: 'xp-level' }, sectionArt('xp', 20), `Уровень ${lvl.level}`),
      h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Опыт до уровня ${lvl.level + 1}`, 'aria-valuenow': Math.round(lvl.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, xpFill),
      h('small', {}, `ещё ${lvl.toNext} XP`),
      gained ? h('span', { class: 'xp-float', 'aria-hidden': 'true' }, before.level < lvl.level ? `Уровень ${lvl.level}!` : `+${gained} XP`) : null),
    h('div', { class: 'week' },
      ...week.days.map((d, i) => h('div', { class: `day ${week.trained[i] ? 'done' : ''} ${i === week.todayIndex ? 'today' : ''}` }, h('i'), h('small', {}, WEEKDAYS[i]),
        h('span', { class: 'sr-only' }, week.trained[i] ? ': занимались' : i === week.todayIndex ? ': сегодня' : ''))),
      h('p', { class: 'week-note' }, `${week.done} из ${week.goal}. ${weekOutlookText(week, { restDays: planClosedDays(p) })}`)));

  // The day's main action comes right under the title (5.8): at the end of the card it sat under the bottom bar
  // on a 390 × 844 phone and was not visible without scrolling. The list below says what is inside.
  const restText = app.checkin()?.reason === 'skin'
    ? 'Сегодня вы отметили раздражение кожи под датчиками — день без датчиков: серия не прерывается. Если покраснение не проходит, покажите кожу протезисту.'
    : 'Сегодня вы отметили сильную боль — день отдыха: серия не прерывается. Если боль повторяется, обратитесь к врачу или протезисту.';
  const planCard = h('section', { class: 'card plan', 'data-tour': 'home.plan' },
    h('div', { class: 'card-head' }, h('h2', { class: 'with-art' }, sectionArt('plan', 32), plan.light ? 'Тренировка дня · лёгкая' : 'Тренировка дня'), h('span', { class: 'pill' }, `${doneCount}/${plan.items.length}`)),
    overCap ? h('p', { class: 'note warn' }, capAdvice(app.rules.softCapMin)) : null,
    resting || skinDay ? h('p', { class: 'note warn' }, restText) : null,
    !resting && !skinDay && pet.reason === 'back' ? h('p', { class: 'note comeback' }, `С возвращением! Догонять ничего не нужно: начните с первого упражнения в спокойном темпе.${app.sourceKind() === 'touch' ? '' : ' С датчиками — сначала короткая калибровка.'}`) : null,
    !resting && !skinDay && pet.reason === 'back' && app.sourceKind() !== 'touch' ? h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, sectionArt('calibration', 24), 'Калибровка датчиков') : null,
    h('button', { class: `btn ${p.tutorialDone ? 'primary' : 'ghost'} big plan-start`, disabled: allDone || resting, onclick: () => app.startPlan() },
      resting ? 'Сегодня — отдых' : skinDay ? (doneCount ? 'Продолжить без датчиков' : 'Начать без датчиков') : allDone ? 'План выполнен' : doneCount ? 'Продолжить' : `Начать · ≈ ${plan.items.length * 2 + 2} мин`),
    resting || skinDay ? h('button', { class: 'btn ghost', onclick: () => app.go('checkin') }, 'Изменить ответ') : null,
    // 5.18 — one tap, one exercise: people drop off by not starting, not by doing less once started (Ramos Muñoz et
    // al. 2022). Free play of the plan's first exercise — the day counts, the plan stays for later.
    quick ? h('button', { class: 'btn ghost quick-start', onclick: () => app.go('play', { game: quick.game, level: quick.level, quick: true }) }, gameArt(quick.game, 24), `Быстро · ≈ 2 мин: ${GAME_BY_ID[quick.game].title}`) : null,
    h('ol', { class: 'plan-list', 'aria-label': 'Упражнения плана' }, ...plan.items.map(item => {
      const g = GAME_BY_ID[item.game];
      return h('li', { class: item.done ? 'done' : '' },
        h('span', { class: `plan-icon g-${g.id}`, 'aria-hidden': 'true' }, item.done ? badgeArt('done', 30) : gameArt(g.id, 34)),
        h('div', {}, h('b', {}, item.retention ? `${g.title}: без подсказки` : g.title),
          h('small', {}, item.done ? 'выполнено' : item.retention ? 'Испытание без живой подсказки' : `Уровень ${item.level} · ${g.skills.map(k => SKILL_NAME[k]).slice(0, 2).join(', ')}`)));
    })));

  const tipCard = h('section', { class: 'card tip' }, h('div', { class: 'coach-head' }, mioAvatar('support', 44), h('b', {}, 'Совет Мио')), h('p', {}, tip),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: () => app.go('faq', { from: 'home' }) }, sectionArt('ask', 24), 'Спросить Мио'),
      // 5.15 — «Азбука протеза» (the sample's flashcards): short cards and a check without time.
      h('button', { class: 'btn ghost', onclick: () => app.go('primer', { from: 'home' }) }, sectionArt('primer', 24), 'Азбука протеза')));
  // 5.14 — «дело дня в быту»: one light two-handed task of daily life with the prosthesis, ticked by the player
  // (transfer of game skill to the prosthesis is weakly shown; daily use starts with practice — core/everyday.js).
  // Not on a rest day; for someone still waiting for the prosthesis — the path to it instead.
  const task = everydayTask(today);
  const ticked = validEverydayId(p.days[today]?.everyday);
  const everydayCard = s.prosthesis === 'waiting'
    ? h('section', { class: 'card waiting-card' }, h('h2', { class: 'with-art' }, sectionArt('waiting', 32), 'Пока протез делают'),
      h('p', {}, 'Учитесь управлению заранее: все игры работают на экранном эмуляторе. Как обычно проходит путь к протезу — у Мио.'),
      h('button', { class: 'btn ghost', onclick: () => app.go('faq', { topic: 'path', from: 'home' }) }, sectionArt('path', 24), 'Путь к протезу'))
    : !p.tutorialDone || resting ? null
      : h('section', { class: `card everyday ${ticked ? 'done' : ''}`, 'data-tour': 'home.everyday' },
        h('div', { class: 'card-head' }, h('h2', { class: 'with-art' }, sectionArt('everyday', 32), 'Дело дня в быту'), ticked ? h('span', { class: 'pill' }, 'отмечено') : null),
        h('div', { class: 'everyday-task' }, dayArt(task.id, 88), h('p', {}, task.text)),
        ticked ? h('p', { class: 'note' }, 'Отмечено. Так навык из игры переходит в жизнь.') : h('p', { class: 'note' }, 'Лёгкие предметы, без спешки. Отметьте, когда получится.'),
        h('button', { class: 'btn ghost', 'aria-pressed': String(ticked), onclick: () => { recordDayNote(p, today, { everyday: ticked ? undefined : task.id }); app.save(); app.go('home'); } },
          ticked ? 'Снять отметку' : 'Получилось'));
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

  // The nest (5.12, the sample's pet): what the bird is now, how many training days to the next stage, its words.
  // 5.13: the bird is a button — a touch makes it answer in its bubble (announced politely) with a small hop; the
  // goal it offers appears after the first exercise (progressive disclosure: a first visit has enough to read).
  const { button: petButton, say } = touchableBird(app, pet, { name, size: 104, items: worn });
  const goal = p.mission ? missionText(p.mission, PLAN_CATALOG) : null;
  const goalRow = !app.state.runs.some(r => !r.demo) ? null : p.mission
    ? h('div', { class: 'pet-goal' },
      h('p', { class: 'eyebrow' }, 'Цель недели'),
      h('b', { class: 'with-art' }, sectionArt('goal', 28), goal.title),
      h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Цель: ${goal.title}`, 'aria-valuenow': p.mission.done, 'aria-valuemin': 0, 'aria-valuemax': p.mission.target, 'aria-valuetext': `${p.mission.done} из ${p.mission.target}` },
        h('i', { style: { width: `${Math.round(100 * p.mission.done / p.mission.target)}%` } })),
      h('small', {}, `${p.mission.done} из ${p.mission.target} · награда +${missionXp(p.mission)} XP`),
      h('button', { class: 'btn ghost', onclick: () => app.go('goals') }, 'Все цели'))
    : h('div', { class: 'pet-goal' }, h('p', {}, `${name} предлагает цели на неделю — по вашим навыкам. Без срока.`),
      h('button', { class: 'btn ghost', onclick: () => app.go('goals') }, 'Выбрать цель'));
  const petCard = h('section', { class: 'card pet-card', 'data-tour': 'home.pet' },
    petButton,
    h('div', { class: 'pet-info' },
      h('p', { class: 'eyebrow' }, pet.stage.name),
      h('h2', {}, name),
      pet.next ? h('div', { class: 'pet-progress' },
        h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Рост до стадии «${pet.next.name}»`, 'aria-valuenow': Math.round(pet.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.round(pet.progress * 100)}%` } })),
        h('small', {}, `${pet.next.name} — через ${count(pet.left, FORMS.days)} с тренировкой`)) : h('small', {}, 'Выросла! Каждая тренировка держит её в силе.'),
      say,
      // 5.14 — the bird's own section (the nest): its path, outfits and gifts.
      h('button', { class: 'btn ghost nest-link', onclick: () => app.go('nest') }, 'Гнездо и наряды')),
    goalRow);
  return { node: h('div', { class: 'screen home' }, h('main', { class: 'scroll' }, head, tutorialCard, planCard, petCard, everydayCard, checkCard, tipCard, games), bottomNav(app, 'home')) };
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
