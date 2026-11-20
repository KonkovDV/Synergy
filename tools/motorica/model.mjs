// Модель экономического эффекта для «Моторики» — иллюстрация масштаба, а не прогноз выручки компании.
// База — IR-брошюра «Моторики» за 2025 год; допущения A1–A6 — в приложении П1 колоды и в Excel-модели.
// Те же формулы считает Excel-книга (tools/motorica-model.py), а `--check` сверяет её итоги с motorica/slides.json.
// Калькулятор сайта (motorica/app.js) повторяет calc() ниже; проверка check:motorica-page сверяет его с этим модулем.

export const BASE = {
  revenue: 7115, ulShare: 0.68, ulUnits: 2600, margin: 0.26, payroll: 2000, heads: 777, sales: 3600,
  repeat: 0.55, period: 3, loyalty: 0.8, premium: 1.0, hoursPerFte: 1800,
  // Операционные и денежные рычаги L4–L7: база — открытые цифры «Моторики», остальное — допущения (уточняются на этапе 0–2)
  reqPerUser: 0.5,      // обращений в сервис на активного пользователя в год — допущение
  visitHours: 3,        // часов специалиста на визит, которого удалось избежать — допущение
  visitLogistics: 0.005,// млн ₽ логистики и подменного протеза на визит — допущение
  docReturn: 0.15,      // доля комплектов документов, которые возвращают на доработку — допущение
  docHours: 6,          // часов на одну доработку комплекта — допущение
  newSpecialists: 15,   // новых протезистов и специалистов в год (78 сейчас, + 2 центра к 2031) — допущение
  costOfMoney: 0.15,    // стоимость денег, годовых — допущение (ключевая ставка 2026 выше 10 %)
};
export const YEARS = ['2027', '2028', '2029', '2030', '2031'];
export const RAMP = [0.2, 0.4, 0.6, 0.8, 1.0];
export const SCEN = {
  cons: { name: 'Консервативный', reach: 0.3, drop: 0.05, mix: 0.01, hours: 1, preVisit: 0.10, docFix: 0.30, onboard: 0.5, pathDays: 7, pathShare: 0.3 },
  base: { name: 'Базовый', reach: 0.5, drop: 0.10, mix: 0.02, hours: 2, preVisit: 0.20, docFix: 0.50, onboard: 1, pathDays: 14, pathShare: 0.5 },
  opt: { name: 'Оптимистичный', reach: 0.7, drop: 0.15, mix: 0.04, hours: 3, preVisit: 0.30, docFix: 0.70, onboard: 1.5, pathDays: 28, pathShare: 0.7 },
};

/** Один сценарий при заданных параметрах базы. p — база (BASE с правками), s — сценарий. */
export function calc(p, s) {
  const ul = p.revenue * p.ulShare;
  const asp = ul / p.ulUnits;
  const newUsers = p.ulUnits * (1 - p.repeat);
  const fteCost = p.payroll / p.heads;
  const perUserYear = asp * p.loyalty / p.period;
  const retained = newUsers * s.reach * s.drop;
  const l1 = RAMP.map((_, i) => (i + 1) * retained * perUserYear);
  const l2 = RAMP.map((r) => r * s.mix * p.ulUnits * p.premium);
  const total = l1.map((x, i) => x + l2[i]);
  const cum = total.reduce((a, b) => a + b, 0);
  const fte = p.sales * s.hours / p.hoursPerFte;
  const saving = fte * fteCost;
  const ebitda5 = total[4] * p.margin + saving;
  // L4 · сервис: визиты, которых не будет, — активная база × обращения × доля решённых до визита
  const activeBase = p.ulUnits * p.period;
  const visits = activeBase * p.reqPerUser * s.preVisit;
  const hourCost = fteCost / p.hoursPerFte;
  const l4 = visits * (p.visitHours * hourCost + p.visitLogistics);
  // L5 · документы: часы на доработку комплектов, которые не вернут
  const docHoursSaved = p.sales * p.docReturn * s.docFix * p.docHours;
  const l5 = docHoursSaved * hourCost;
  // L6 · онбординг: месяцы до самостоятельной работы нового специалиста
  const onboardFte = p.newSpecialists * s.onboard / 12;
  const l6 = onboardFte * fteCost;
  // L7 · путь пациента: выручка приходит раньше на pathDays у доли пациентов — разовое высвобождение оборотного капитала и годовая экономия
  const cashPulled = ul * s.pathShare * s.pathDays / 365;
  const l7 = cashPulled * p.costOfMoney;
  const ops = saving + l4 + l5 + l6 + l7;            // рычаги затрат и денег, млн ₽ в год при полном охвате
  const ebitdaFull = RAMP.map((r, i) => total[i] * p.margin + r * ops);
  const ebitdaFullCum = ebitdaFull.reduce((a, b) => a + b, 0);
  return { ...s, retained, l1, l2, total, cum, fte, saving, ebitda5, asp, newUsers, perUserYear, fteCost, ul,
    activeBase, visits, hourCost, l4, docHoursSaved, l5, onboardFte, l6, cashPulled, l7, ops, ebitdaFull, ebitdaFullCum,
    specialistHours: p.sales * s.hours };
}

export const MODEL = (() => {
  const base = BASE;
  const scen = {};
  for (const [k, s] of Object.entries(SCEN)) {
    const r = calc(base, s);
    scen[k] = { name: s.name, reach: s.reach, drop: s.drop, mix: s.mix, hours: s.hours, retained: r.retained, l1: r.l1, l2: r.l2,
      total: r.total, cum: r.cum, fte: r.fte, saving: r.saving, ebitda5: r.ebitda5,
      preVisit: s.preVisit, docFix: s.docFix, onboard: s.onboard, pathDays: s.pathDays, pathShare: s.pathShare,
      visits: r.visits, l4: r.l4, docHoursSaved: r.docHoursSaved, l5: r.l5, onboardFte: r.onboardFte, l6: r.l6, cashPulled: r.cashPulled, l7: r.l7,
      ops: r.ops, ebitdaFull: r.ebitdaFull, ebitdaFullCum: r.ebitdaFullCum, specialistHours: r.specialistHours };
  }
  const b = calc(base, SCEN.base);
  const cycleRevenue = b.asp * base.loyalty;
  const cycleEbitda = cycleRevenue * base.margin;
  // Чувствительность L1 в 2031 году базового сценария к одному параметру при прочих равных
  const l1At = (o) => {
    const p = { ...base, ...(o.base || {}) };
    const s = { ...SCEN.base, ...(o.scen || {}) };
    return calc(p, s).l1[4];
  };
  const sens = [
    ['Снижение отказов', '5 п.п.', '15 п.п.', l1At({ scen: { drop: 0.05 } }), l1At({ scen: { drop: 0.15 } })],
    ['Охват тренажёром', '30 %', '70 %', l1At({ scen: { reach: 0.3 } }), l1At({ scen: { reach: 0.7 } })],
    ['Срок замены', '3 года', '2 года', l1At({ base: { period: 3 } }), l1At({ base: { period: 2 } })],
    ['Возврат при замене', '60 %', '90 %', l1At({ base: { loyalty: 0.6 } }), l1At({ base: { loyalty: 0.9 } })],
    ['Доля повторных продаж', '87 %', '45 %', l1At({ base: { repeat: 0.87 } }), l1At({ base: { repeat: 0.45 } })],
  ];
  return {
    base, years: YEARS, scen, asp: b.asp, newUsers: b.newUsers, fteCost: b.fteCost, perUserYear: b.perUserYear,
    ul: base.revenue * base.ulShare, cycleRevenue, cycleEbitda, sens, l1Base: b.l1[4], activeBase: b.activeBase, hourCost: b.hourCost,
    breakEvenRevenue: 10 / cycleRevenue, breakEvenEbitda: 10 / cycleEbitda,
  };
})();

// Числа по-русски: пробел между разрядами неразрывный, дробная часть — через запятую.
export const r0 = (x) => Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' ');
export const r1 = (x) => (Math.round(x * 10) / 10).toLocaleString('ru-RU');
export const r2 = (x) => (Math.round(x * 100) / 100).toLocaleString('ru-RU');
export const bn = (x) => (Math.round(x / 100) / 10).toLocaleString('ru-RU'); // млн → млрд с одним знаком
