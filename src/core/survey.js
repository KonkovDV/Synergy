// Feedback after testing (6.0; task of 28.10.2026: «возможность собрать обратную связь от пользователей по итогам
// тестирования»). Three standard short instruments, kept on the device and exported by the person (JSON, CSV):
//   SUS — System Usability Scale (Brooke 1996): 10 statements, 1–5, a score 0–100 (≥ 68 is above the usual average);
//   NASA-TLX, raw, four subscales (Hart & Staveland 1988; raw TLX — Hart 2006): mental demand, physical demand, effort,
//   frustration, 0–10 — the task asks the game to lower the cognitive load of control, this is how it is asked;
//   three questions of the game itself (1–5) and a free text. Not a clinical scale and not a diagnosis. Pure.

/** SUS in Russian; odd items are positive, even items negative (the scoring depends on it). */
export const SUS_ITEMS = [
  'Я бы хотел(а) пользоваться этой игрой регулярно',
  'Игра показалась мне излишне сложной',
  'Игрой было легко пользоваться',
  'Чтобы пользоваться игрой, мне нужна помощь специалиста',
  'Части игры хорошо связаны между собой',
  'В игре слишком много несоответствий',
  'Большинство людей, думаю, быстро разберутся в этой игре',
  'Игрой было очень неудобно пользоваться',
  'Я чувствовал(а) себя уверенно, пока играл(а)',
  'Мне пришлось многому научиться, прежде чем начать',
];

/** Raw NASA-TLX, four subscales the task cares about; 0 — very low, 10 — very high. */
export const TLX_ITEMS = [
  { id: 'mental', text: 'Умственная нагрузка: сколько приходилось думать, какую мышцу напрячь' },
  { id: 'physical', text: 'Физическая нагрузка: насколько устали мышцы предплечья' },
  { id: 'effort', text: 'Усилие: насколько тяжело было добиться нужного результата' },
  { id: 'frustration', text: 'Раздражение: насколько мешали ошибки и неудачи' },
];

/** Questions of the game itself, 1 — совсем нет … 5 — полностью да. */
export const GAME_ITEMS = [
  { id: 'clarity', text: 'Понятно, какое сокращение какое действие делает' },
  { id: 'fun', text: 'Играть было интересно' },
  { id: 'useful', text: 'Думаю, это поможет управлять протезом в жизни' },
];

export const SURVEY_TEXT_MAX = 500;
export const SURVEYS_MAX = 30;

const likert = v => Number.isInteger(v) && v >= 1 && v <= 5;
const tenth = v => Number.isInteger(v) && v >= 0 && v <= 10;

/** SUS score 0…100 or null when an answer is missing (a partial SUS is not scored). */
export function susScore(sus) {
  if (!Array.isArray(sus) || sus.length !== SUS_ITEMS.length || !sus.every(likert)) return null;
  return sus.reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
}

/** Raw TLX: the mean of the answered subscales, 0…10, or null. */
export function tlxScore(tlx) {
  const vals = TLX_ITEMS.map(t => tlx?.[t.id]).filter(tenth);
  return vals.length ? Math.round(10 * vals.reduce((s, v) => s + v, 0) / vals.length) / 10 : null;
}

/** A survey as stored or imported, checked: known items only, bounded values and text. Null if nothing is answered. */
export function cleanSurvey(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sus = Array.isArray(raw.sus) && raw.sus.length === SUS_ITEMS.length ? raw.sus.map(v => (likert(v) ? v : null)) : SUS_ITEMS.map(() => null);
  const tlx = Object.fromEntries(TLX_ITEMS.map(t => [t.id, tenth(raw.tlx?.[t.id]) ? raw.tlx[t.id] : null]));
  const game = Object.fromEntries(GAME_ITEMS.map(t => [t.id, likert(raw.game?.[t.id]) ? raw.game[t.id] : null]));
  const text = typeof raw.text === 'string' ? raw.text.slice(0, SURVEY_TEXT_MAX) : '';
  const at = typeof raw.at === 'string' && !Number.isNaN(Date.parse(raw.at)) ? raw.at : null;
  const answered = sus.some(v => v !== null) || Object.values(tlx).some(v => v !== null) || Object.values(game).some(v => v !== null) || text.trim();
  if (!answered || !at) return null;
  const scheme = ['threshold', 'proportional', 'gesture'].includes(raw.scheme) ? raw.scheme : null;
  const version = typeof raw.version === 'string' ? raw.version.slice(0, 16) : null;
  return { at, sus, tlx, game, text, scheme, version };
}

export const cleanSurveys = list => (Array.isArray(list) ? list.map(cleanSurvey).filter(Boolean).slice(-SURVEYS_MAX) : []);

/** One row per survey: the scores and every answer (CSV for the team; the separator and the formula guard are the caller's). */
export function surveyRows(list) {
  const head = ['date', 'scheme', 'version', 'sus_score', ...SUS_ITEMS.map((_, i) => `sus_${i + 1}`), 'tlx_raw', ...TLX_ITEMS.map(t => `tlx_${t.id}`), ...GAME_ITEMS.map(t => `game_${t.id}`), 'text'];
  const rows = list.map(s => [s.at, s.scheme ?? '', s.version ?? '', susScore(s.sus) ?? '', ...s.sus.map(v => v ?? ''), tlxScore(s.tlx) ?? '', ...TLX_ITEMS.map(t => s.tlx[t.id] ?? ''), ...GAME_ITEMS.map(t => s.game[t.id] ?? ''), s.text]);
  return [head, ...rows];
}
