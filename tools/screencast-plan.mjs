// 6.2 — the storyboard of the screencast (task of 28.10: «обязательные файлы: исходный код, скринкаст, документация»;
// Q&A of 04.11, answer 33: a demonstration of the current version with the questions of a checkpoint). Words and timings
// only — tools/screencast.mjs plays each scene in the real game and burns the caption beside the phone. One source for
// the captions on the video and for the .srt next to it. The numbers come from docs/evidence.json at record time
// ({tests}, {apkKb}, {a11yLight}, {a11yDark}, {layout}, {version}), so the video never quotes a number of another build.
// Wording rules — LIMITS.md: what is in the game, measured on the emulator, no promise of an effect on a prosthesis.

/** Chapters in the order of the task's criteria and their weights (docs/TASK.md, «ТЗ 28.10»). */
export const CHAPTERS = Object.freeze({
  intro: 'Синергия {version}',
  tutorial: 'Обучающий режим',
  stream1: 'Поток 1 · два канала ЭМГ',
  stream2: 'Поток 2 · СПППР',
  training: 'Обучение',
  motivation: 'Мотивация и удержание',
  specialist: 'Для специалиста',
  access: 'Доступность',
  outro: 'Проверить самому',
});

/** The scenes: what the caption says while the phone shows it. `seconds` — how long the scene stays at least. */
export const SCENES = Object.freeze([
  { id: 'cover', chapter: 'intro', seconds: 5,
    title: 'Игра-тренажёр управления бионическим протезом',
    text: 'Устанавливаемый APK, офлайн, без аккаунта. Оба потока управления из ТЗ: два канала ЭМГ и поток СПППР.' },
  { id: 'start', chapter: 'intro', seconds: 6,
    title: 'От знакомства до плана дня — три касания',
    text: 'Правила безопасности, затем главная: план дня на 5–10 минут, миссии сессии, Жар-птица.' },
  // 6.3.3 — the organizers, 10.11: the video shows the training mode and at least one level played with the emulator in
  // the frame next to the game, with comments. The tutorial here; a whole level of «Мастерская» in «Обучение».
  { id: 'tutorial', chapter: 'tutorial', seconds: 13,
    title: '«Первые шаги»: каждый навык — с живой подсказкой',
    text: 'Покой, сжатие (A), снова покой, раскрытие (B), сила, смена хвата, блокировка. Клавиши F и J — площадки A и B эмулятора внизу экрана.' },
  { id: 'stream1', chapter: 'stream1', seconds: 10,
    title: 'Сгибатели закрывают кисть, разгибатели раскрывают',
    text: 'У каждого канала свой порог; время удержания, подавление ложных срабатываний, мёртвая зона. A + B — отдельная команда.' },
  { id: 'stream2', chapter: 'stream2', seconds: 12,
    title: 'Пакет {"timestamp_ms", "dist"} по жёсткому контракту',
    text: '10 Гц, как назвали организаторы. Время — по часам микроконтроллера, команда — с первого пакета, ошибочный пакет откатывается. «2 жеста» — любая пара.' },
  { id: 'rhythm', chapter: 'training', seconds: 12,
    title: '«Ритм» на потоке 10 Гц',
    text: 'Удар судится по пакету, в котором началось движение, — одинаково на 10 и 50 Гц. Играет демо-автопилот тем же путём сигнала.' },
  { id: 'grip', chapter: 'training', seconds: 26,
    title: '«Мастерская», уровень 1 — целиком, на эмуляторе',
    text: 'Пороговая схема, как у серийных протезов. Автопилот нажимает площадки A и B: сжать до зелёной зоны, перенести, раскрыть над корзиной.' },
  { id: 'results', chapter: 'training', seconds: 10,
    title: 'Итоги уровня: навыки и команды каждого канала',
    text: 'Разделение, точность, плавность и сколько команд дал канал A и канал B. Это игровые метрики, а не клинический тест.' },
  { id: 'motivation', chapter: 'motivation', seconds: 9,
    title: 'Жар-птица растёт от дней с тренировкой',
    text: 'Без валюты и наказаний: подарки за достижения, цели недели. Отдых не рвёт серию. Взрослым — режим «Только цифры» без питомца.' },
  { id: 'specialist', chapter: 'specialist', seconds: 8,
    title: 'Неделя к неделе и отчёт',
    text: 'Проверка навыка раз в неделю; отчёт для печати, PDF, CSV и JSON. Данные хранятся только на устройстве.' },
  { id: 'access', chapter: 'access', seconds: 7,
    title: 'Высокий контраст, крупный текст, без касания',
    text: 'Кнопки под здоровую руку, озвучивание. axe: 0 нарушений в {a11yLight} состояниях светлой темы и {a11yDark} тёмной.' },
  { id: 'outro', chapter: 'outro', seconds: 6,
    title: 'Код, тесты и документы — в репозитории',
    text: '{tests} автотестов, раскладка проверена на {layout} сочетаниях экрана и текста, APK {apkKb} КБ. Каждое требование ТЗ — docs/TZ_COMPLIANCE.md.' },
]);

/** The placeholders of the captions, from docs/evidence.json (the numbers of this very build). */
export function evidenceValues(ev) {
  return {
    version: ev?.version ?? '—',
    tests: ev?.tests?.total ?? '—',
    apkKb: ev?.apk?.kb ?? '—',
    a11yLight: ev?.a11y?.light ?? '—',
    a11yDark: ev?.a11y?.dark ?? '—',
    layout: ev?.layout?.combinations ?? '—',
  };
}

/**
 * A caption with its placeholders filled; an unknown placeholder stays visible (the test catches it). A dash never
 * starts a line: the space before «—» is non-breaking, as in the game (ui/dom.js).
 */
export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)).replace(/ —/g, '\u00a0—');

/** «00:01:02,345» — the time format of SubRip. */
export function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** cues: [{ start, end, title, text }] in seconds of the video → the text of an .srt file (title and text, two lines). */
export function srt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.title}\n${c.text}\n`).join('\n');
}

/** The chapters of the video for a description or a player: «0:05 Поток 1 · два канала ЭМГ», one line each. */
export function chapterList(cues) {
  const out = [];
  for (const c of cues) if (!out.length || out[out.length - 1].chapter !== c.chapter) out.push(c);
  const t = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return out.map(c => `${t(c.start)} ${c.chapterName}`).join('\n');
}

/** The planned length of the video, s. */
export const plannedSeconds = () => SCENES.reduce((s, x) => s + x.seconds, 0);
