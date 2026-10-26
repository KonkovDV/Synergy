// Results (knowledge of results + coach advice + rewards) and the rest break between plan items.
import { count, fmtNum, fmtPct, fmtFixed, FORMS, isGamePercent } from '../core/format.js';
import { h, toast } from './dom.js';
import { gameArt, badgeArt, starRow, firebird, evolution, achievementArt, giftArt, skinArt, sectionArt } from './art.js';
import { petStageUp, petState, petName, petReaction, wornItems, PET_ITEM_BY_ID, PET_SLOTS } from '../core/pet.js';
import { missionText } from '../core/missions.js';
import { skillBar, handsFreeText } from './widgets.js';
import { GAME_BY_ID, PLAN_CATALOG } from '../games/registry.js';
import { SKILL_NAME, skillKeys, GESTURE_BY_ID } from '../core/vocabulary.js';
import { ACHIEVEMENTS, SKINS, recordDayNote, dayKey, secondsToday, trainingDays, levelBest, sessionTopUp } from '../core/progress.js';
import { RestMotion, restMotionAllowed } from '../core/restmotion.js';
import { difficultyLabel } from '../core/adaptive.js';
import { adviseStop, EFFORT_LEVELS, checkinLight } from '../core/wellbeing.js';
import { HoldConfirm } from '../core/handsfree.js';
import { coachFeedback, coachMood } from './coach.js';
import { CALIBRATION_ADAPT, HANDS_FREE, PET, SESSION } from '../config.js';
import { QUALITY_TIPS, signalIssuesText } from '../core/signalquality.js';
import { signalMeter, segmented, mioAvatar } from './widgets.js';

/** Hands-free confirm of the primary action (results and rest): the same rule as the game start, a bit longer. */
function muscleConfirm(app, ring, action) {
  const pipeline = app.createPipeline();
  const source = app.liveFrames(); // 5.32: follows a bridge the host's first frame rebuilds
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
  if (demo) return { kind: 'play', label: 'Сыграть самостоятельно', params: same };
  return { kind: 'play', label: 'Ещё раз', params: same };
}

/** Rewards of a run, shown on the screen (5.10): toasts covered the stars and the score and vanished in 3 s. */
function rewardList(report) {
  if (!report) return [];
  const goal = report.mission;
  return [
    ...(goal?.completed ? [{ art: 'trophy', text: `Цель выполнена: ${missionText(goal.mission, PLAN_CATALOG).title} · +${goal.xp} XP` }] : []),
    // 5.16: the medal of that achievement, the gift itself and the hand in the new look (the badge stands in).
    ...report.achievements.map(id => ({ art: 'medal', pic: () => achievementArt(id, true, 32), text: `Достижение: ${ACHIEVEMENTS.find(a => a.id === id)?.name ?? id}` })),
    ...(report.items ?? []).map(id => ({ art: 'gift', pic: () => giftArt(id, 32), text: `Подарок Жар-птице: ${PET_ITEM_BY_ID[id]?.name ?? id}` })),
    ...report.skins.map(id => ({ art: 'palette', pic: () => skinArt(id, 32), text: `Новый облик: ${SKINS.find(sk => sk.id === id)?.name ?? id}` })),
    ...(report.levelUp ? [{ art: 'levelup', text: `Уровень игрока: ${report.level}` }] : []),
    ...(goal && !goal.completed ? [{ art: 'done', text: `Цель: ${goal.done} из ${goal.target}` }] : []),
  ];
}

/**
 * Whether the fatigue and daily-cap advice is computed: a plan with an exercise left, and (5.17) free play too — it
 * was plan-only. Advice, never a lock: «Повторить» stays. A demo and a finished plan («Готово на сегодня») need none.
 */
export const stopAdviceApplies = ({ demo, plan, next }) => !demo && (!!next || !plan);

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };

/** The words of the flight replay (pure: tests/feel.test.mjs). Outcome only — where the bird passed, not which muscle. */
export function replaySummary(replay) {
  const rings = replay.items.filter(i => i.kind === 'ring'), passed = rings.filter(i => i.ok).length;
  const above = rings.filter(i => i.dir === 'above').length, below = rings.filter(i => i.dir === 'below').length;
  const lean = above > below ? ' Промахи — чаще выше колец.' : below > above ? ' Промахи — чаще ниже колец.' : above ? ' Промахи — и выше, и ниже колец.' : '';
  const trace = replay.items.find(i => i.kind === 'trace' && Number.isFinite(i.inCorridor));
  const wave = replay.items.find(i => i.kind === 'sine' && Number.isFinite(i.inCorridor));
  const follow = wave
    ? ` Слежение за волной: в коридоре ${wave.inCorridor} % времени, ошибка ${fmtNum(wave.nrmse) ?? wave.nrmse} высоты волны.`
    : trace ? ` Слежение: в коридоре ${trace.inCorridor} % времени, ошибка ${fmtNum(trace.nrmse) ?? trace.nrmse} высоты, перерегулирование ${trace.overshoot} %.` : '';
  return `Пройдено ${passed} из ${count(rings.length, FORMS.ringsOf)}.${lean}${follow}`;
}

/**
 * Cleanliness of closing and of opening, apart (the meetup: judge each signal, the other muscle stays quiet).
 * A game metric. Muscles differ by the level of injury, so one number would hide which one leaked.
 */
export function cleanPairText(details) {
  const line = (n, name) => isGamePercent(n) ? `${name}: ${fmtPct(n)}` : null;
  const parts = [line(details?.cleanClose, 'Чистота закрытия'), line(details?.cleanOpen, 'Чистота открытия')].filter(Boolean);
  // 100 % is «the other channel did not rise with the working one», not «no interference» glued to a low number.
  return parts.length ? `${parts.join('. ')}. 100 % — второй канал не поднимался вместе с рабочим. Игровая цифра, не оценка протеза.` : '';
}

/** The isolation line under the skills (pure: tests/v531.test.mjs). */
export function crossingsText(n) {
  // Zero crossings is not «clean»: the other channel can rise under its switch-on line and still lower the percent.
  return n ? `Второй канал включался, пока работал первый: ${count(n, FORMS.times)}. Начните с половины силы — так его легче не задеть.`
    : 'Второй канал ни разу не пересёк линию включения, пока работал первый.';
}

/** Cubes and rings (5.32). A game rate, not a Box and Blocks score. */
export function practiceText(details) {
  if (!Number.isFinite(details?.perMin)) return '';
  return `Предметов за минуту: ${fmtNum(details.perMin)}. По мотивам упражнений у протезиста — это не тест Box and Blocks.`;
}

const OUTCOME_WORD = { crush: 'Раздавлено', drop: 'Выскользнуло', spill: 'Расплескали', release: 'Не отпустили', timeout: 'Не успели' };
const listed = names => Object.entries(names.reduce((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {})).map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ');

/**
 * The words of the workshop replay (pure: tests/feel.test.mjs). What happened to each object and where the force sat
 * in the window when it was lifted — the outcome, never which muscle to tense.
 */
export function gripReplaySummary(replay) {
  const items = replay.items, ok = items.filter(i => i.outcome === 'ok');
  const parts = [`Доставлено ${ok.length} из ${items.length}.`];
  for (const outcome of Object.keys(OUTCOME_WORD)) {
    const names = items.filter(i => i.outcome === outcome).map(i => i.name.toLowerCase());
    if (names.length) parts.push(`${OUTCOME_WORD[outcome]}: ${listed(names)}.`);
  }
  if (ok.length >= 2) {
    const place = ok.map(i => (i.force - i.min) / Math.max(1e-6, i.max - i.min));
    const high = place.filter(p => p > 2 / 3).length, low = place.filter(p => p < 1 / 3).length;
    parts.push(high > ok.length / 2 ? 'Сила при подъёме — чаще у верхнего края окна.' : low > ok.length / 2 ? 'Сила при подъёме — чаще у нижнего края окна.' : 'Сила при подъёме — около середины окна.');
  }
  return parts.join(' ');
}

/**
 * 5.18 — «Как прошла Мастерская»: a column per object — its green window, the crushing zone above it and a dot where
 * the force was at the outcome (games/grip.js replay). The summary under it says the same in words.
 */
function gripReplayCard(replay) {
  if (!replay?.items?.length) return null;
  const W = 320, H = 112, pad = 8, n = replay.items.length, cw = (W - 2 * pad) / n;
  const y = f => (pad + (1 - f) * (H - 2 * pad)).toFixed(1);
  const cols = replay.items.flatMap((it, i) => {
    const cx = pad + cw * (i + 0.5), bw = Math.min(18, cw * 0.5), x = (cx - bw / 2).toFixed(1);
    return [
      svgEl('rect', { x, width: bw.toFixed(1), y: y(1), height: (H - 2 * pad).toFixed(1), rx: 4, class: 'track' }),
      it.breakAt === null ? null : svgEl('rect', { x, width: bw.toFixed(1), y: y(1), height: (y(it.breakAt) - y(1)).toFixed(1), rx: 4, class: 'break' }),
      svgEl('rect', { x, width: bw.toFixed(1), y: y(it.max), height: (y(it.min) - y(it.max)).toFixed(1), rx: 3, class: 'window' }),
      it.force === null ? null : svgEl('circle', { cx: cx.toFixed(1), cy: y(it.force), r: 5, class: it.outcome === 'ok' ? 'force ok' : 'force miss' }),
    ].filter(Boolean);
  });
  const pic = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'replay-plot grip-plot', 'aria-hidden': 'true', focusable: 'false' }, ...cols);
  return h('section', { class: 'card replay' }, h('h2', { class: 'with-art' }, gameArt('grip', 32), 'Как прошла Мастерская'), pic,
    h('p', { class: 'note' }, `${gripReplaySummary(replay)} Столбики — предметы по порядку: зелёное — окно силы, красное — где ломается; точка — сила в конце попытки.`));
}

/**
 * The words of the safe replay (pure: tests/v518.test.mjs): how many digits opened, which took longest, and what the
 * prosthesis saw instead of the wanted gesture — the pair worth practising.
 */
export function safeReplaySummary(replay, nameOf = id => id) {
  const skipped = replay.digits.filter(d => d.rest);
  const asked = replay.digits.filter(d => !d.rest);
  const opened = asked.filter(d => d.ok);
  const parts = asked.length ? [`Открыто ${opened.length} из ${asked.length}.`] : ['Ни одна цифра не началась: покой не получился.'];
  if (skipped.length && asked.length) parts.push(`Покой не получился — ${count(skipped.length, ['цифра не началась', 'цифры не начались', 'цифр не начались'])}.`);
  const slow = opened.length >= 2 ? opened.reduce((a, b) => (b.seconds > a.seconds ? b : a)) : null;
  if (slow) parts.push(`Дольше всего — «${slow.name}»: ${fmtFixed(slow.seconds)} с.`);
  if (replay.top) parts.push(`Вместо «${nameOf(replay.top.wanted)}» протез чаще видел «${nameOf(replay.top.seen)}» (${fmtFixed(replay.top.seconds)} с) — эту пару стоит потренировать.`);
  return parts.join(' ');
}

/** 5.18 — «Как прошёл Сейф»: the code lamps again, green opened and amber missed, and the summary in words. */
function safeReplayCard(replay) {
  if (!replay?.digits?.length) return null;
  const W = 320, H = 40, n = replay.digits.length, step = Math.min(34, (W - 16) / n);
  const lamps = replay.digits.map((d, i) => svgEl('circle', { cx: (W / 2 - (n - 1) * step / 2 + i * step).toFixed(1), cy: H / 2, r: (step * 0.32).toFixed(1), class: d.ok ? 'lamp ok' : 'lamp miss' }));
  const pic = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'replay-plot safe-plot', 'aria-hidden': 'true', focusable: 'false' }, ...lamps);
  return h('section', { class: 'card replay' }, h('h2', { class: 'with-art' }, gameArt('safe', 32), 'Как прошёл Сейф'), pic,
    h('p', { class: 'note' }, `${safeReplaySummary(replay, id => GESTURE_BY_ID[id]?.name ?? id)} Огоньки — цифры кода по порядку: зелёные открыты, жёлтые — нет.`));
}

/** The replay of the game that has one («Полёт», «Мастерская», «Сейф»), or nothing. */
const replayCard = replay => (replay?.kind === 'grip' ? gripReplayCard(replay) : replay?.kind === 'flight' ? flightReplayCard(replay)
  : replay?.kind === 'safe' ? safeReplayCard(replay) : null);

/**
 * 5.17 — «Как прошёл полёт»: the altitude line over the rings after the run (delayed feedback, games/flight.js replay).
 * A picture with a text twin: the summary under it says the same for a screen reader.
 */
function flightReplayCard(replay) {
  if (!replay?.path?.length || !replay.items?.length) return null;
  const W = 320, H = 112, pad = 8;
  const x = t => (pad + (t / replay.total) * (W - 2 * pad)).toFixed(1), y = a => (pad + (1 - a) * (H - 2 * pad)).toFixed(1);
  const drawn = replay.items.filter(it => it.kind === 'ring' || it.kind === 'stream');
  const marks = drawn.map(it => (it.kind === 'ring'
    ? svgEl('line', { x1: x(it.at), x2: x(it.at), y1: y(Math.min(1, it.alt + replay.tol)), y2: y(Math.max(0, it.alt - replay.tol)), class: it.ok ? 'ok' : 'miss' })
    : svgEl('rect', { x: x(it.at), width: (x(it.end) - x(it.at)).toFixed(1), y: y(Math.min(1, it.alt + replay.tol)), height: (y(Math.max(0, it.alt - replay.tol)) - y(Math.min(1, it.alt + replay.tol))).toFixed(1), rx: 4, class: it.ok ? 'ok' : 'miss' })));
  const d = replay.path.map(([t, a], i) => `${i ? 'L' : 'M'}${x(t)} ${y(a)}`).join(' ');
  const pic = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'replay-plot', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('line', { x1: pad, x2: W - pad, y1: y(0.5), y2: y(0.5), class: 'mid' }), ...marks, svgEl('path', { d, class: 'flight-line' }));
  return h('section', { class: 'card replay' }, h('h2', { class: 'with-art' }, gameArt('flight', 32), 'Как прошёл полёт'), pic,
    h('p', { class: 'note' }, `${replaySummary(replay)} Линия — высота птицы; отрезки — кольца: зелёные пройдены, жёлтые — мимо.`));
}

export function resultsScreen(app, { run, report, planBonus = 0, calibrationNote = null, plan = false, demo = false, pose = null, replay = null }) {
  const g = GAME_BY_ID[run.game];
  const advice = coachFeedback(run.game, run, app.state.runs);
  const next = plan && !demo ? app.nextPlanItem() : null;
  const planDone = plan && !demo && !next;
  const name = petName(app.settings);
  const rewards = rewardList(report);
  const best = report && !demo ? levelBest(app.state.runs, run) : null;
  // Жар-птица (5.12): the first run of a day is a training day — it may move the bird to its next stage.
  const grown = report && !demo ? petStageUp(trainingDays(app.profile), app.runsToday().length === 1) : null;
  // 5.13: the bird reacts to what this run did (the sample's animations): a new stage — it grows before your eyes;
  // a goal, a gift or a good result — a little celebration. Shown only for those moments, wearing its things.
  const moment = report && !demo && (grown || report.items?.length || report.mission?.completed);
  const petCard = moment ? (() => {
    const pet = petState(trainingDays(app.profile), { trainedToday: true, name });
    const play = petReaction({ grown, stars: run.stars, planDone, goalDone: !!report.mission?.completed, items: report.items?.length ?? 0 });
    const words = grown ? (grown.id === 'chick' ? `${name} вылупилась из яйца!` : `${name} растёт: ${grown.name}!`)
      : report.items?.length ? `${name} примеряет подарок. Выбрать наряд — в разделе «Жар-птица».` : `${name} радуется выполненной цели.`;
    const items = wornItems(app.profile, pet.stage.id);
    // 5.14 — a new stage is the one «macro» moment (core/pet.js CELEBRATION): the growth ceremony, the stage's
    // character, and the place for things it opens. Everything else stays a small reaction of the bird.
    const from = grown ? PET.stages[PET.stages.findIndex(st => st.id === grown.id) - 1] : null;
    const opened = grown ? PET_SLOTS.find(sl => sl.from === grown.id) : null;
    return h('section', { class: `card pet-moment${grown ? ' grown' : ''}`, role: 'status' },
      // 5.16: a goal reached — the grown bird holds up its star (the pose gives way to what it wears on the head).
      grown && from ? evolution(from.id, grown.id, 112, { items })
        : h('span', { class: 'pet-art', 'aria-hidden': 'true' }, firebird(pet.stage.id, 'fed', 96, { items, play, pose: report.mission?.completed ? 'star' : null })),
      h('div', {}, h('p', {}, h('b', {}, words)),
        grown ? h('p', { class: 'nest-character' }, grown.character) : null,
        opened ? h('p', { class: 'note' }, `Открылось место для наряда: «${opened.name}».`) : null));
  })() : null;
  const ring = h('i', { class: 'confirm-ring' });
  const today = dayKey();
  // Safety first: signs of fatigue or the daily cap turn «next exercise» into «stop for today».
  const stopAdvice = stopAdviceApplies({ demo, plan, next }) ? adviseStop(app.runsToday(), secondsToday(app.profile, today), app.rules.softCapMin, app.state.runs)?.text ?? null : null;
  // 5.30 — under 5 minutes of active play today: one more exercise is offered after the plan (core/progress.js).
  const topUp = planDone ? sessionTopUp({ plan: app.dailyPlan(), secondsToday: secondsToday(app.profile, today), stopAdvice: adviseStop(app.runsToday(), secondsToday(app.profile, today), app.rules.softCapMin, app.state.runs)?.text ?? null, light: checkinLight(app.checkin()) }) : null;
  const action = resultsAction({ run, plan, demo, next, stopAdvice, restS: app.rules.restS, titleOf: id => GAME_BY_ID[id]?.title ?? id, pose: run.pose ?? pose });
  const primary = { label: action.label, go: () => app.go(action.kind, action.params) };
  // The hands-free «дальше» needs sensors: with the on-screen emulator there are no pads on this screen (5.10).
  const handsFree = app.liveSource() !== 'touch';

  const order = skillKeys(run.scheme).filter(k => Object.hasOwn(run.skills, k));
  const skills = order.map(k => skillBar(SKILL_NAME[k], run.skills[k]));
  const d = run.details ?? {};
  const metric = (label, value) => h('div', {}, h('b', {}, value ?? '—'), h('small', {}, label));
  const assessmentCard = d.assessment ? h('section', { class: 'card' }, h('h2', {}, 'Метрики проверки'),
    h('div', { class: 'stats' },
      metric('выполнено', fmtPct(d.completionRate)), metric('выбор, мс', d.selectionMs), metric('выполнение, мс', d.completionMs), metric('точность', d.accuracy === null ? '—' : fmtPct(d.accuracy)),
      'throughputBps' in d ? metric('ПС, бит/с', fmtNum(d.throughputBps)) : null),
    h('p', { class: 'note' }, `Время выбора — до первого верного сигнала; выполнение — до удержания 1 с${'throughputBps' in d ? ' (уровни силы — 0,5 с). ПС — игровая пропускная способность по мотивам теста Фиттса: чем быстрее и точнее выход на уровень силы, тем она выше' : ''}. Сравнивайте с прошлой неделей на экране «Прогресс». Метрики игровые, не клинический тест.`),
    d.restMissed ? h('p', { class: 'note' }, `Покой не получился — ${count(d.restMissed, ['попытка не началась', 'попытки не начались', 'попыток не начались'])}. В выбор жеста это не вошло.${d.restMissed >= 2 && run.source === 'bridge' ? ' Если рука была расслаблена — проверьте, как сидят электроды, и сделайте калибровку.' : ''}`) : null,
    d.restMissed >= 2 && run.source === 'bridge' ? h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков') : null) : null;
  const calibrationCard = calibrationNote?.recalibrate
    ? h('div', { class: 'card warn-card', role: 'status' }, h('b', { class: 'with-art' }, badgeArt('warning', 28), 'Пора перекалибровать'),
      h('p', {}, calibrationNote.stuckChannel !== null
        ? `Канал ${calibrationNote.stuckChannel ? 'B' : 'A'} был включён больше ${CALIBRATION_ADAPT.stuckS} с подряд. Если рука была расслаблена — датчик сместился или контакт изменился.`
        : 'Сигнал покоя заметно ушёл от калибровки — так бывает от пота или смещения датчика.'),
      h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков'))
    : calibrationNote ? h('p', { class: 'note' }, calibrationNote.shiftPct >= 1
      ? `Калибровка подстроилась под датчик: покой сдвинут на ${fmtPct(calibrationNote.shiftPct)} диапазона.`
      : 'Калибровка подстроилась под датчик: покой вернулся к уровню калибровки.') : null;
  // 5.30 — «Тренер качества сигнала»: what got in the way, the first thing to do about it; not the player's fault.
  const issues = run.signalIssues ?? [];
  const signalCard = issues.length ? h('div', { class: 'card warn-card signal-card', role: 'status' },
    h('b', { class: 'with-art' }, badgeArt('warning', 28), 'Мешал сигнал, а не вы'),
    h('p', {}, `За упражнение: ${signalIssuesText(issues)}. ${QUALITY_TIPS[issues[0].id].tip}.`),
    h('p', { class: 'note' }, 'Это отметится в отчёте специалисту. Если повторяется — покажите отчёт протезисту.')) : null;
  // 5.31 — isolation in the words of the meetup of 21.10: how often the passive channel came on while the other worked.
  const crossNote = Number.isInteger(d.crossings) ? h('p', { class: 'note' }, crossingsText(d.crossings)) : null;
  const cleanLine = cleanPairText(d);
  const cleanNote = cleanLine ? h('p', { class: 'note' }, cleanLine) : null;
  const practiceNote = practiceText(d) ? h('p', { class: 'note' }, practiceText(d)) : null;
  const difficulty = !demo && !d.assessment && !run.retention && Number.isFinite(d.difficulty) && Math.abs(d.difficulty) > 0.2
    ? h('p', { class: 'note' }, `Сложность подстраивалась под вас: ${difficultyLabel(d.difficulty)}.`) : null;
  const effortCard = planDone && !demo ? h('section', { class: 'card' }, h('h2', { class: 'with-art' }, sectionArt('effort', 32), 'Насколько тяжело было?'),
    segmented(EFFORT_LEVELS.map(e => ({ value: e.id, label: e.label })), app.profile.days[today]?.effort ?? null,
      v => { recordDayNote(app.profile, today, { effort: v }); app.save(); toast('Записано'); }, 'Насколько тяжело было'),
    h('p', { class: 'note' }, 'Ответ сохранится в дневнике самочувствия и в отчёте, если вы его сохраните.')) : null;
  const node = h('div', { class: 'screen results' },
    h('main', { class: 'scroll center' },
      h('h1', { class: 'sr-only' }, `Итоги: ${g.title}`),
      h('p', { class: 'eyebrow' }, `${g.title}${g.assessment ? '' : ` · уровень ${run.level}`}${run.retention ? ' · без подсказки' : ''}${demo ? ' · демо' : ''}`),
      h('div', { class: `big-stars s${run.stars}`, role: 'img', 'aria-label': `${count(run.stars, FORMS.stars)} из 3` }, starRow(run.stars, 3, 72)),
      h('p', { class: 'big-score' }, run.score, h('small', {}, ' / 100')),
      // 5.17 — a new best of this level, compared with oneself; a weaker run is not compared at all.
      best?.record ? h('p', { class: 'record' }, badgeArt('star', 20), `Лучший результат уровня · было ${best.previous}`) : null,
      report ? h('p', { class: 'xp-gain' }, `+${report.xp + planBonus + (report.mission?.xp ?? 0)} XP${planBonus ? ' (план дня выполнен!)' : ''}${report.unlockedLevel ? ` · открыт уровень ${report.unlockedLevel} игры` : ''}`)
        : h('p', { class: 'note' }, 'Так играет автопилот. Демо не влияет на прогресс.'),
      petCard,
      rewards.length ? h('ul', { class: 'rewards', 'aria-label': 'Награды' }, ...rewards.map(r => h('li', {}, r.pic?.() ?? badgeArt(r.art, 24), r.text))) : null,
      difficulty,
      signalCard,
      calibrationCard,
      planDone ? h('div', { class: 'card celebrate tinted' }, h('b', { class: 'with-art' }, badgeArt('trophy', 30), 'Тренировка дня выполнена'), h('p', {}, 'Отличная работа! День отдыха серию не прерывает.'),
        topUp ? h('p', { class: 'note' }, `Сегодня активной игры — ${topUp.minutes ? count(topUp.minutes, FORMS.minutes) : 'меньше минуты'}. Обычно хватает ${SESSION.activeMin[0]}–${SESSION.activeMin[1]} минут в день: если рука не устала, можно ещё одно упражнение.`) : null,
        topUp ? h('button', { class: 'btn ghost', onclick: () => app.go('play', { game: topUp.game, level: topUp.level }) }, `Ещё одно: ${GAME_BY_ID[topUp.game]?.title ?? topUp.game}`) : null) : null,
      stopAdvice ? h('div', { class: 'card warn-card' }, h('b', { class: 'with-art' }, badgeArt('moon', 28), 'Пора отдохнуть'), h('p', {}, stopAdvice)) : null,
      effortCard,
      assessmentCard,
      replayCard(replay),
      h('section', { class: 'card' }, h('h2', {}, 'Навыки'), ...skills, crossNote, cleanNote, practiceNote),
      h('section', { class: 'card coach' }, h('div', { class: 'coach-head' }, mioAvatar(coachMood({ stars: run.stars, stopAdvice }), 52), h('b', {}, 'Мио советует')), ...advice.map(t => h('p', {}, t))),
      h('div', { class: 'sticky-actions' },
        h('button', { class: 'btn primary big', onclick: primary.go }, primary.label),
        handsFree ? h('div', { class: 'confirm' }, ring, h('span', {}, `или ${handsFreeText(app.settings.scheme, app.settings.dwellS + HANDS_FREE.leaveExtraS, 'дальше').replace(/^Р/, 'р')}`)) : null,
        h('div', { class: 'row-actions' },
          stopAdvice && next ? h('button', { class: 'btn ghost', onclick: () => app.go('rest', { next }) }, 'Всё равно продолжить') : null,
          action.label === 'Ещё раз' || demo ? null : h('button', { class: 'btn ghost', onclick: () => app.go('play', { game: run.game, level: run.level, retention: run.retention, plan, pose: run.pose ?? pose }) }, 'Повторить'),
          // 5.15 — embedded in the customer's app: hand control back to it (synergy:close, docs/embed/README.md).
          app.embedded && !demo ? h('button', { class: 'btn ghost', onclick: () => { app.closeToHost('done'); app.go('home'); } }, 'Вернуться в приложение') : null,
          h('button', { class: 'btn ghost', onclick: () => app.go('home') }, 'Домой')))));
  const confirm = handsFree ? muscleConfirm(app, ring, primary.go) : null;
  app.say(`${count(run.stars, FORMS.stars)} из трёх. ${count(run.score, FORMS.points)}. ${rewards.length ? `${rewards.map(r => r.text).join('. ')}. ` : ''}${stopAdvice ?? advice[0] ?? ''} Дальше: ${primary.label}.`, { interrupt: true });
  return { node, tick: confirm };
}

export function restScreen(app, { next }) {
  let left = app.rules.restS;
  const g = GAME_BY_ID[next.game];
  const counter = h('b', { class: 'rest-count' }, left);
  const meter = signalMeter(app);
  // Through the plan flow (5.10): after midnight the new day asks its check-in instead of playing on.
  const go = () => app.startPlan();
  // 5.17 — the timer of the pause can be extended (XAG 116: a UI timer offers more time), and with «Меньше движения»
  // the still circle gets words instead: «Вдох…» / «Выдох…» every 4 s.
  const still = !!app.reduceMotion;
  const breathWord = h('p', { class: 'breath-word', 'aria-hidden': 'true' }, still ? 'Вдох…' : '');
  const more = h('button', { class: 'btn ghost', onclick: () => { left = Math.min(left + app.rules.restS, app.rules.restS * 10); counter.textContent = Math.ceil(left); } }, `Отдохнуть ещё ${app.rules.restS} с`);
  let breathT = 0;
  // 5.20 — with real sensors the rest can also be «покой в движении». Who is asked: restMotionAllowed (an adult,
  // an ordinary check-in, a pause long enough for every prompt).
  const motion = restMotionAllowed({ source: app.sourceKind(), audience: app.settings.audience, restS: app.rules.restS, checkinAction: app.checkin()?.action }) ? new RestMotion() : null;
  const motionLine = motion ? h('p', { class: 'note' }, motion.prompt.text) : null;
  let motionSaved = false;
  const node = h('div', { class: 'screen rest' },
    h('main', { class: 'scroll center' },
      mioAvatar('rest', 88),
      h('h1', { class: 'eyebrow' }, 'Отдых'),
      h('div', { class: 'breath', 'aria-hidden': 'true' }),
      breathWord,
      counter,
      h('p', {}, still ? 'Полностью расслабьте руку. Дышите спокойно: вдох — четыре счёта, выдох — четыре.' : 'Полностью расслабьте руку. Дышите спокойно: вдох — круг растёт, выдох — сжимается.'),
      h('p', { class: 'note' }, 'Проверка покоя: обе полоски должны быть почти пустыми.'),
      motionLine,
      meter.node,
      h('section', { class: `card tinted g-${g.id}` }, h('b', { class: 'with-art' }, gameArt(g.id, 36), `Дальше: ${g.title}${next.retention ? ' — без подсказки' : ''}`), h('p', {}, g.tagline)),
      // The pause is the safety rule, not an obstacle (5.11): skipping it is a quiet option, the timer moves on itself.
      h('div', { class: 'sticky-actions' }, more, h('button', { class: 'btn ghost', onclick: go }, 'Дальше без отдыха'))));
  const pipeline = app.createPipeline(), source = app.liveFrames();
  app.say(`Отдых ${count(left, FORMS.seconds)}. Полностью расслабьте руку. Дальше: ${g.title}.`, { interrupt: true });
  return {
    node,
    tick(now, dt) {
      const frame = pipeline.process(source.sample(now), now);
      meter.update(frame);
      if (motion) {
        motion.step(dt, !!frame?.relaxed);
        const text = motion.done ? `Покой держался ${Math.round(motion.summary().quiet * 100)} % времени.` : motion.prompt.text;
        if (motionLine.textContent !== text) motionLine.textContent = text;
        if (motion.done && !motionSaved) { motionSaved = true; recordDayNote(app.profile, dayKey(), { restMotion: motion.summary() }); app.save(); }
      }
      left -= dt;
      if (still) { breathT += dt; const word = Math.floor(breathT / 4) % 2 ? 'Выдох…' : 'Вдох…'; if (breathWord.textContent !== word) breathWord.textContent = word; }
      const shown = Math.max(0, Math.ceil(left));
      if (counter.textContent !== String(shown)) counter.textContent = shown;
      if (left <= 0) { left = Infinity; go(); }
    },
  };
}
