// «Азбука протеза» (5.15) — the team's sample has a study mode beside its games (task-svc learning-flashcards: topics,
// a deck of cards to flip, a deck is studied when every card was seen, then a short quiz, results kept). Here the
// topics are what a person learns around the prosthesis: signal and sensors, force and grip, comfort and rest, the
// prosthesis in daily life — the customer's pains «порог и чувствительность непонятны», «дали распечатку — дома не
// поняли». Offline, multiple choice only (the sample grades free answers with an AI — no network, no guessing here),
// no time limit and no score against anyone: a wrong answer shows the right one and why, a check can be taken again.
// Teach-back — checking that the person understood, not that they were told — improved disease-specific knowledge,
// adherence and self-efficacy in the education of adults with chronic diseases (Ha Dinh et al. 2016, JBI Database of
// Systematic Reviews 14(1):210–247; not about prostheses, other outcomes inconsistent): no effect on training is claimed. Reading gives no XP and does not grow the bird (only training days do, core/pet.js);
// passing every check earns one achievement and its gift (core/progress.js, core/pet.js).
// Numbers come from the config and the grips from the vocabulary, so a card never drifts from the rules or from the
// gesture set of 28.10.
import { SESSION, CHILD } from '../config.js';
import { CLOSING_GESTURES } from './vocabulary.js';

const grips = () => CLOSING_GESTURES.map(g => `«${g.name}» — ${g.use.charAt(0).toLowerCase()}${g.use.slice(1)}`).join('; ');

/** The question about grips is built from the gesture set: «what is X for?», X and two others as options. */
function gripQuestion() {
  const [a, b, c] = [CLOSING_GESTURES[1], CLOSING_GESTURES[0], CLOSING_GESTURES[2]].filter(Boolean);
  if (!a || !b || !c) return null;
  return { id: 'grip-use', q: `Для чего хват «${a.name}»?`, options: [b.use, a.use, c.use], answer: 1,
    why: `«${a.name}»: ${a.use.charAt(0).toLowerCase()}${a.use.slice(1)}. Хват выбирают под предмет — это тренирует «Сейф» в режиме жестов.` };
}

/**
 * Decks: `cards` — { id, front, back() }, `check` — { id, q, options, answer (index), why }. Texts are functions where
 * they take numbers from the config. Ids are stored in the profile: keep them when a text changes.
 */
export const PRIMER = [
  {
    id: 'signal', title: 'Сигнал и датчики',
    cards: [
      { id: 'emg', front: 'Что «слышит» датчик?', back: () => 'Электрическую активность мышцы под кожей — ЭМГ. Протез не читает мысли: он отвечает на напряжение мышц, которые вы научились включать по команде.' },
      { id: 'rest', front: 'Покой — тоже команда', back: () => 'Покой — когда обе мышцы отпущены. Чем чище покой, тем реже протез срабатывает сам. Поэтому в играх есть паузы покоя, а испытание с датчиками просит менять позу руки.' },
      { id: 'terms', front: 'Порог и чувствительность', back: () => 'Порог — уровень сигнала, выше которого мышца считается включённой. Чувствительность — усиление: выше — включать легче, но чаще случайные срабатывания. В приложении протеза их меняют понемногу и вместе со специалистом.' },
      { id: 'skin', front: 'Кожа под датчиками', back: () => 'Сигнал меняют сухая или влажная кожа, крем, пот и гильза, надетая иначе, чем при калибровке. Протрите кожу и датчики сухой салфеткой.' },
      { id: 'calibrate', front: 'Когда калибровать заново', back: () => 'Когда сигнал стал слабым или «прыгает», гильзу надели по-другому или игра сама просит. Калибровка — на комфортном усилии: максимум не нужен.' },
    ],
    check: () => [
      { id: 'cream', q: 'После крема на коже сигнал «прыгает». Что сделать сначала?',
        options: ['Поставить чувствительность на максимум', 'Протереть кожу и датчики сухой салфеткой и пройти калибровку', 'Сжимать мышцу изо всех сил'], answer: 1,
        why: 'Крем и влага меняют контакт датчика с кожей. Сначала сухая чистая кожа и калибровка; чувствительность меняют понемногу.' },
      { id: 'rest', q: 'Что значит «покой» для протеза?',
        options: ['Обе мышцы отпущены', 'Одна мышца слегка напряжена', 'Рука опущена вниз'], answer: 0,
        why: 'Покой — обе мышцы отпущены. Положение руки тут ни при чём: покой нужен в любой позе.' },
      { id: 'sensitivity', q: 'Чувствительность подняли. Что вероятнее?',
        options: ['Включать станет труднее', 'Ничего не изменится', 'Включать станет легче, но случайных срабатываний может стать больше'], answer: 2,
        why: 'Чувствительность усиливает сигнал: и нужный, и случайный. Поэтому её меняют понемногу.' },
    ],
  },
  {
    id: 'grip', title: 'Сила и хват',
    cards: [
      { id: 'proportional', front: 'Сила — это скорость', back: () => 'В пропорциональном управлении чем сильнее напряжение, тем быстрее закрывается кисть. Хрупкое — медленно и мягко, тяжёлое — увереннее.' },
      { id: 'hold', front: 'Хват держится сам', back: () => 'В «Синергии» и во многих протезах закрытая кисть держит предмет сама: мышцу можно расслабить. Держать её напряжённой не нужно — это лишняя усталость.' },
      { id: 'release', front: 'Отпустить вовремя', back: () => 'Раскрывает кисть вторая мышца (B). Сначала поднесите предмет к месту, потом раскройте — так он не упадёт.' },
      { id: 'switch', front: 'Смена хвата', back: () => 'Протезы меняют хват по-разному. У «Моторики» — повторным раскрытием: кисть раскрыта, и сигнал B держится дольше заданного времени. У других — коактивацией, коротким напряжением обеих мышц. Как у вашего, покажет протезист.' },
      { id: 'grips', front: 'Какой хват для чего', back: () => `${grips()}. Какие хваты есть у вашего протеза и как они включаются, покажет протезист.` },
    ],
    check: () => [
      { id: 'hold', q: 'Вы взяли стакан. Нужно ли держать мышцу напряжённой, чтобы он не выпал?',
        options: ['Да, всё время', 'Нет: хват держится сам, мышцу можно расслабить', 'Нужно напрячь обе мышцы'], answer: 1,
        why: 'Закрытая кисть держит предмет сама — в «Синергии» и во многих протезах. Напряжение без нужды только утомляет.' },
      { id: 'fragile', q: 'Как взять хрупкое?',
        options: ['Резко и сильно', 'Медленно и мягко, до нужной силы', 'Сначала напрячь обе мышцы'], answer: 1,
        why: 'Слабое напряжение — медленное закрытие: проще остановиться на нужной силе. Этому учит «Мастерская».' },
      { id: 'cocontraction', q: 'Что такое коактивация?',
        options: ['Напряжение обеих мышц вместе', 'Очень сильное сжатие одной мышцы', 'Быстрые повторы сжатия'], answer: 0,
        why: 'Коактивация — обе мышцы вместе: многие протезы так меняют хват или блокируются.' },
      gripQuestion(),
    ].filter(Boolean),
  },
  {
    id: 'comfort', title: 'Самочувствие и отдых',
    cards: [
      { id: 'effort', front: 'Комфортное усилие', back: () => 'Максимум не нужен: играм хватает комфортного напряжения. Через боль не тренируйтесь.' },
      { id: 'short', front: 'Коротко и часто', back: () => `Несколько коротких занятий лучше одного длинного. После ${SESSION.dailySoftCapMin} минут в день (у детей — ${CHILD.dailySoftCapMin}) приложение предложит остановиться.` },
      { id: 'pain', front: 'Если болит', back: () => 'Ответ «сильная боль» в опросе превращает день в день отдыха: серия не прерывается. Если боль повторяется — к врачу или протезисту.' },
      { id: 'skin', front: 'Кожа после гильзы', back: () => 'Лёгкое покраснение после снятия гильзы обычно проходит за 20–30 минут. Не проходит, есть сыпь, пузыри или ссадины — перерыв и к протезисту или врачу.' },
    ],
    check: () => [
      { id: 'tired', q: 'Рука устала посреди тренировки. Что лучше?',
        options: ['Доиграть через силу', 'Остановиться и отдохнуть', 'Поднять чувствительность'], answer: 1,
        why: 'Усталость снижает точность, а отдых — часть тренировки. Продолжить можно позже.' },
      { id: 'redness', q: 'Покраснение под датчиками не прошло через час. Что делать?',
        options: ['Продолжать как обычно', 'Сделать перерыв и показать кожу протезисту или врачу', 'Нанести крем и снова надеть гильзу'], answer: 1,
        why: 'Покраснение, которое не проходит, — повод для перерыва и осмотра. В опросе можно отметить кожу — день станет днём без датчиков.' },
      { id: 'streak', q: 'Сегодня сильная боль. Что будет с серией в «Синергии»?',
        options: ['Серия прервётся', 'День станет днём отдыха, серия сохранится', 'Завтра придётся заниматься вдвое больше'], answer: 1,
        why: 'Безопасность важнее серии: день боли — день отдыха, и догонять ничего не нужно.' },
    ],
  },
  {
    id: 'life', title: 'Протез в жизни',
    cards: [
      { id: 'daily', front: 'Каждый день понемногу', back: () => 'Навык переходит в жизнь с практикой. Простое дело протезом каждый день — «дело дня в быту» на главной.' },
      { id: 'bimanual', front: 'Две руки вместе', back: () => 'Протез часто помогает второй руке: держит банку, пока рука открывает крышку. Начинайте с лёгких предметов и без спешки.' },
      { id: 'who', front: 'Кто что настраивает', back: () => 'Гильзу, датчики и настройки протеза меняет протезист. Программу занятий согласуйте с реабилитологом. «Синергия» — тренажёр, а не медицинское изделие.' },
      { id: 'report', front: 'Показать прогресс', back: () => 'Прогресс → «Для специалиста»: отчёт PDF, JSON или таблица CSV. В отчёте есть ответы о самочувствии — отправляйте его только тем, кому доверяете.' },
    ],
    check: () => [
      { id: 'who', q: 'Кто меняет настройки датчиков и гильзы протеза?',
        options: ['Протезист', 'Игра сама', 'Любой член семьи'], answer: 0,
        why: 'Гильзу и настройки протеза меняет протезист. Игра подстраивает только себя.' },
      { id: 'start', q: 'С чего лучше начинать дела протезом дома?',
        options: ['С тяжёлых и хрупких предметов', 'С лёгких предметов, без спешки', 'С дел, где нужна наибольшая сила'], answer: 1,
        why: 'Лёгкие предметы и спокойный темп — так навык из игры безопаснее переходит в жизнь.' },
      { id: 'device', q: '«Синергия» — это…',
        options: ['Медицинское изделие', 'Замена занятий с реабилитологом', 'Игра-тренажёр управления, а не медицинское изделие'], answer: 2,
        why: 'Это тренажёр управления. Лечение и настройку протеза ведут специалисты.' },
    ],
  },
];

export const PRIMER_BY_ID = Object.assign(Object.create(null), Object.fromEntries(PRIMER.map(d => [d.id, d])));

/** A deck's progress in the profile: cards whose back was seen, the best check result and its day. */
export function deckProgress(profile, deckId) {
  const d = PRIMER_BY_ID[deckId];
  const p = profile?.primer?.[deckId];
  const seen = d ? d.cards.filter(c => p?.seen?.includes(c.id)).map(c => c.id) : [];
  const total = d ? d.check().length : 0;
  return { seen, studied: !!d && seen.length === d.cards.length, best: Number.isInteger(p?.best) ? Math.min(p.best, total) : null, total, at: p?.at ?? null };
}

/** The first card not seen yet (to resume where the person left off), else the first. */
export function resumeIndex(profile, deckId) {
  const d = PRIMER_BY_ID[deckId];
  const { seen } = deckProgress(profile, deckId);
  const i = d.cards.findIndex(c => !seen.includes(c.id));
  return i < 0 ? 0 : i;
}

/** Marks a card seen (its back shown). Returns true when this made the deck studied. */
export function markSeen(profile, deckId, cardId) {
  const d = PRIMER_BY_ID[deckId];
  if (!d || !d.cards.some(c => c.id === cardId)) return false;
  const before = deckProgress(profile, deckId).studied;
  const p = profile.primer[deckId] ?? (profile.primer[deckId] = { seen: [] });
  if (!p.seen.includes(cardId)) p.seen = [...p.seen, cardId];
  return !before && deckProgress(profile, deckId).studied;
}

/** The check opens once every card of the deck was seen (the sample's rule: study first, then the quiz). */
export const checkOpen = (profile, deckId) => deckProgress(profile, deckId).studied;

/**
 * Records a finished check: `answers` — the chosen option per question. Keeps the best result (a retake never
 * lowers it). Returns { correct, total, perQuestion: [bool] }.
 */
export function recordCheck(profile, deckId, answers, today) {
  const d = PRIMER_BY_ID[deckId];
  const qs = d.check();
  const perQuestion = qs.map((q, i) => answers[i] === q.answer);
  const correct = perQuestion.filter(Boolean).length;
  const p = profile.primer[deckId] ?? (profile.primer[deckId] = { seen: [] });
  if (!Number.isInteger(p.best) || correct >= p.best) { p.best = correct; p.at = today; }
  return { correct, total: qs.length, perQuestion };
}

/** Every deck checked with every answer right at least once (the achievement «Знаток протеза»). */
export const primerMastered = profile => PRIMER.every(d => { const g = deckProgress(profile, d.id); return g.total > 0 && g.best === g.total; });

/** A stored «Азбука» from a backup (untrusted): known decks and cards only, a bounded best result, a real date. */
export function cleanPrimer(primer) {
  if (!primer || typeof primer !== 'object' || Array.isArray(primer)) return {};
  const out = {};
  for (const d of PRIMER) {
    const p = Object.hasOwn(primer, d.id) ? primer[d.id] : null;
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const seen = Array.isArray(p.seen) ? d.cards.map(c => c.id).filter(id => p.seen.includes(id)) : [];
    const total = d.check().length;
    const best = Number.isInteger(p.best) && p.best >= 0 && p.best <= total ? p.best : undefined;
    const at = typeof p.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.at) ? p.at : undefined;
    out[d.id] = { seen, ...(best !== undefined ? { best } : {}), ...(best !== undefined && at ? { at } : {}) };
  }
  return out;
}
