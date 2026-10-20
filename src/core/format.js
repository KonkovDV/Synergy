// Russian number formatting for every screen and the report (5.10): one decimal comma, one plural rule, one percent
// style. Until then «снизился на 22 очков», «последние 1 упражнений», «1.0 с» next to «1,4 бит/с».

/** Plural form for a count: plural(5, ['очко', 'очка', 'очков']) → 'очков'. */
export function plural(n, [one, few, many]) {
  const a = Math.abs(Math.trunc(n)), m10 = a % 10, m100 = a % 100;
  if (!Number.isInteger(n)) return few; // 1,5 очка
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

/** «5 очков», «1 упражнение». */
export const count = (n, forms) => `${fmtNum(n)} ${plural(n, forms)}`;

/** Decimal comma, at most `digits` decimals, no trailing zeros: 1.5 → «1,5», 1 → «1». */
export function fmtNum(v, digits = 1) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits, useGrouping: false });
}

/** Fixed decimals for a ticking value (a countdown must not jump between «3» and «2,9»). */
export const fmtFixed = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '—');

/** Percent with a non-breaking space (Russian typography): 22 → «22 %». */
export const fmtPct = (v, digits = 0) => (Number.isFinite(v) ? `${fmtNum(v, digits)} %` : '—');

/** Seconds: 1.2 → «1,2 с». */
export const fmtSec = (v, digits = 1) => (Number.isFinite(v) ? `${fmtNum(v, digits)} с` : '—');

/** Day of a stored date for tables: «18 окт.». */
export const fmtDay = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

export const FORMS = {
  points: ['очко', 'очка', 'очков'],
  stars: ['звезда', 'звезды', 'звёзд'],
  exercises: ['упражнение', 'упражнения', 'упражнений'],
  minutes: ['минута', 'минуты', 'минут'],
  seconds: ['секунда', 'секунды', 'секунд'],
  days: ['день', 'дня', 'дней'],
  records: ['запись', 'записи', 'записей'],
  ringsOf: ['кольца', 'колец', 'колец'], // after «из»: из 1 кольца, из 2 колец, из 5 колец
};
