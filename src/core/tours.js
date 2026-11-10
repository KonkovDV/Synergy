// Hint tours (5.13) — the onboarding service of the team's sample, offline: a tour is data (a trigger, a version, steps
// that point at named anchors on the screen); a session walks it, skips a step whose anchor is not on this screen,
// resumes where the player left off and ends as «completed» or «dismissed». Changed content is a new version and is
// shown again; an unchanged tour never returns. The screens mark anchors with `data-tour="screen.element"`; a test
// checks that every anchor of every tour exists in the UI code. Pure: the screen asks `hasAnchor`, the app stores state.

export const TOUR_LIMITS = { steps: 6, title: 60, body: 240 };
const ANCHOR = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const TOUR_STATUS = Object.freeze({ IN_PROGRESS: 'in_progress', COMPLETED: 'completed', DISMISSED: 'dismissed' });
const FINAL = [TOUR_STATUS.COMPLETED, TOUR_STATUS.DISMISSED];

/**
 * The tours. Optional only: a hint never blocks a screen (W3C COGA — the player can always skip and look later; the
 * sample's mandatory tours are left out). Each one is short: at most three steps, one thing per step.
 */
export const TOURS = [
  {
    // 5.14 — version 2: the bird got its own section (the nest), so the third step points there.
    key: 'home', version: 2, trigger: { screen: 'home' },
    steps: [
      { anchor: 'home.plan', title: 'Тренировка дня', body: 'Начинайте отсюда: упражнения по самым слабым навыкам и короткое испытание без подсказки. Перед планом — вопрос о самочувствии.' },
      { anchor: 'home.pet', title: 'Жар-птица', body: 'Растёт от дней с тренировкой, а не от очков. Пропуск и отдых ничего не отнимают. Нажмите на птицу — она ответит.' },
      { anchor: 'nav.nest', title: 'Гнездо', body: 'Путь роста птицы, её наряды и подарки за достижения.' },
    ],
  },
  {
    // 5.14 — version 2: outfits moved to the nest; the week-to-week bars came in.
    key: 'progress', version: 2, trigger: { screen: 'progress' },
    steps: [
      { anchor: 'progress.week', title: 'Неделя к неделе', body: 'Эти 7 дней рядом с прошлыми: дни, минуты, упражнения и средний счёт. Сравнение только с собой.' },
      { anchor: 'progress.skills', title: 'Профиль навыков', body: 'Среднее за последние упражнения. Чем шире фигура, тем увереннее управление.' },
      { anchor: 'progress.report', title: 'Для специалиста', body: 'Отчёт с игровой статистикой и дневником самочувствия — для протезиста или реабилитолога.' },
    ],
  },
  {
    key: 'nest', version: 1, trigger: { screen: 'nest' },
    steps: [
      { anchor: 'nest.bird', title: 'Жар-птица', body: 'Нажмите на птицу — она ответит. Свечение вокруг неё — сколько осталось до следующей стадии.' },
      { anchor: 'nest.outfit', title: 'Наряды', body: 'Каждое достижение дарит птице вещь. Выберите, что ей надеть.' },
      { anchor: 'nest.gifts', title: 'Достижения и подарки', body: 'Что уже получено и как получить остальное. Ни монет, ни магазина — только тренировки.' },
    ],
  },
];

/** Whether a tour is for this moment: the screen just opened, or an event just happened. */
export function triggerMatches(trigger, { screen = null, event = null } = {}) {
  if (trigger.screen) return trigger.screen === screen;
  if (trigger.event) return trigger.event === event;
  return false;
}

/** Stored progress of one tour, or null if it is malformed. */
export function validTourState(s) {
  return !!s && typeof s === 'object' && Number.isInteger(s.v) && s.v >= 1 && Object.values(TOUR_STATUS).includes(s.status)
    && Number.isInteger(s.step) && s.step >= 0;
}

/** The further-along of two records of the same tour (the sample's merge): a newer version, then finished over in progress. */
export function mergeTourState(a, b) {
  if (!validTourState(a)) return validTourState(b) ? b : null;
  if (!validTourState(b)) return a;
  if (a.v !== b.v) return a.v > b.v ? a : b;
  const rank = { [TOUR_STATUS.IN_PROGRESS]: 0, [TOUR_STATUS.DISMISSED]: 1, [TOUR_STATUS.COMPLETED]: 2 };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] > rank[b.status] ? a : b;
  return { ...a, step: Math.max(a.step, b.step) };
}

/** Merges two stored tour maps key by key (the demo profile's hints flow back into the real settings). */
export function mergeTours(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const m = mergeTourState(a?.[key], b?.[key]);
    if (m) out[key] = m;
  }
  return out;
}

/** The tour to show now, with the step to resume from; a finished version never returns, a new version does. */
export function pendingTour(state = {}, context = {}, tours = TOURS) {
  for (const tour of tours) {
    if (!triggerMatches(tour.trigger, context)) continue;
    const s = Object.hasOwn(state, tour.key) && validTourState(state[tour.key]) ? state[tour.key] : null;
    if (s && s.v === tour.version && FINAL.includes(s.status)) continue;
    return { tour, resume: s && s.v === tour.version ? Math.min(s.step, tour.steps.length - 1) : 0 };
  }
  return null;
}

/**
 * Walks one tour. Steps whose anchor is not on the screen are skipped (positions stay as in the tour); if none is
 * left the tour is not showable and must not be shown. `state()` is what to store after each move.
 */
export class TourSession {
  constructor(tour, hasAnchor, resume = 0) {
    this.tour = tour;
    this.steps = tour.steps.map((s, position) => ({ ...s, position })).filter(s => s.position >= resume && hasAnchor(s.anchor));
    this.index = 0;
    this.status = TOUR_STATUS.IN_PROGRESS;
  }

  get showable() { return this.steps.length > 0; }
  get current() { return this.status === TOUR_STATUS.IN_PROGRESS ? this.steps[this.index] ?? null : null; }
  get isLast() { return this.index === this.steps.length - 1; }
  get finished() { return this.status !== TOUR_STATUS.IN_PROGRESS; }

  /** «Дальше» / «Понятно»: the next step, or the tour is completed after the last one. */
  next() {
    if (!this.current) return;
    if (this.isLast) this.status = TOUR_STATUS.COMPLETED; else this.index++;
  }

  /** «Пропустить подсказки»: the whole tour is dismissed and never shown again in this version. */
  skip() { if (this.current) this.status = TOUR_STATUS.DISMISSED; }

  /** What to store: the version, the status and the tour position of the current (or last) step. */
  state() {
    const step = (this.steps[Math.min(this.index, this.steps.length - 1)] ?? { position: 0 }).position;
    return { v: this.tour.version, status: this.status, step };
  }
}

/** Why these tours cannot ship: anchors in the `screen.element` form, short texts, unique keys, a known trigger. */
export function tourProblems(tours = TOURS) {
  const problems = [];
  const keys = new Set();
  for (const t of tours) {
    if (keys.has(t.key)) problems.push(`${t.key}: повтор ключа`); keys.add(t.key);
    if (!Number.isInteger(t.version) || t.version < 1) problems.push(`${t.key}: версия`);
    if (!t.trigger || (!t.trigger.screen === !t.trigger.event)) problems.push(`${t.key}: триггер — экран или событие`);
    if (!t.steps?.length || t.steps.length > TOUR_LIMITS.steps) problems.push(`${t.key}: 1–${TOUR_LIMITS.steps} шагов`);
    t.steps?.forEach((s, i) => {
      if (!ANCHOR.test(s.anchor ?? '')) problems.push(`${t.key}[${i}]: якорь «${s.anchor}»`);
      if (!s.title?.trim() || s.title.length > TOUR_LIMITS.title) problems.push(`${t.key}[${i}]: заголовок`);
      if (!s.body?.trim() || s.body.length > TOUR_LIMITS.body) problems.push(`${t.key}[${i}]: текст`);
    });
  }
  return problems;
}
