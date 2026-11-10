// «Дело дня в быту» (5.14): one simple two-handed task of daily life per day, done with the prosthesis and ticked by
// the player. Why: games train control, but the transfer of game skill to the prosthesis is weakly shown (Garske et al.
// 2021; Li et al. 2024 — «use daily-life tasks»), and with one hand intact people use the prosthesis in only 24 % of
// one-handed and 38 % of two-handed tasks (UEFS-P, 2023). The customer says the same: «один носит протез каждый день,
// другой оставляет его на полке — начинается это с тренировки». Light, safe objects only: no hot liquids, no knives,
// nothing heavy or fragile. It is a self-report: the report says «отмечено», never «измерено».

export const EVERYDAY = [
  { id: 'paper', text: 'Придержите протезом лист бумаги, пока пишете или рисуете другой рукой.' },
  { id: 'zip', text: 'Откройте молнию на сумке или куртке: протез держит, другая рука тянет.' },
  { id: 'apple', text: 'Возьмите протезом яблоко и положите его на стол — мягко, без лишней силы.' },
  { id: 'tooth', text: 'Подержите протезом зубную щётку, пока выдавливаете пасту.' },
  { id: 'box', text: 'Придержите протезом коробку или пакет, пока открываете его другой рукой.' },
  { id: 'pegs', text: 'Переложите протезом пять лёгких предметов — прищепки, крышки, кубики — из одной миски в другую.' },
  { id: 'towel', text: 'Сложите полотенце пополам: углы держат обе руки.' },
  { id: 'bottle', text: 'Возьмите протезом закрытую бутылку воды и передайте её другой руке.' },
  { id: 'cup', text: 'Подержите протезом пустую чашку, пока кладёте в неё ложку.' },
  { id: 'bag', text: 'Повесьте лёгкую сумку на руку с протезом и пройдите по комнате.' },
];
export const EVERYDAY_BY_ID = Object.assign(Object.create(null), Object.fromEntries(EVERYDAY.map(t => [t.id, t])));
export const validEverydayId = id => typeof id === 'string' && Object.hasOwn(EVERYDAY_BY_ID, id);

/** Today's task: the same all day, a different one tomorrow (by the calendar day, not random — testable). */
export function everydayTask(today) {
  const [y, m, d] = today.split('-').map(Number);
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return EVERYDAY[((n % EVERYDAY.length) + EVERYDAY.length) % EVERYDAY.length];
}

/** Days with the task ticked within the given day keys (for the report: a count of self-reports). */
export const everydayDays = (profile, keys) => keys.filter(k => validEverydayId(profile.days?.[k]?.everyday)).length;
