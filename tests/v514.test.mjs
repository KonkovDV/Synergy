// 5.14: the nest and the welcome back, the celebration ladder, week to week, «дело дня», «Спросить Мио», the prosthesis
// lock in «Первые шаги», embedding into the customer's app, the report period — and the SOTA checks taken from the
// team's sample: a content linter (no blaming words), property tests on seeded random input, links between documents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { petState, petStageIndex, petTap, celebrationLevel, CELEBRATION, equipItem, autoEquip, PET_ITEMS } from '../src/core/pet.js';
import { PET, SESSION, CHILD, LOCK, SIGNAL } from '../src/config.js';
import { shiftDay, daysSinceTraining, weekCompare, playerLevel, trainingDays, createProfile, recordDayNote } from '../src/core/progress.js';
import { EVERYDAY, everydayTask, validEverydayId, everydayDays } from '../src/core/everyday.js';
import { FAQ, FAQ_IDS } from '../src/core/faq.js';
import { ELECTRICAL_SAFETY } from '../src/core/wellbeing.js';
import { tutorialSteps, TutorialRun } from '../src/core/tutorial.js';
import { parseLaunch, resultMessage, notifyHost, HOST_MESSAGE } from '../src/services/host.js';
import { periodKeys, periodSummary, buildReport, reportHtml, REPORT_PERIODS } from '../src/services/report.js';
import { emptyState, exportState, parseState, SETTINGS_RULES } from '../src/core/storage.js';
import { count, FORMS } from '../src/core/format.js';
import { TOURS } from '../src/core/tours.js';

/** Seeded PRNG (mulberry32): property tests are random but reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('pet: after a break of PET.comebackDays the bird greets the player back — growth kept, no reproach', () => {
  const base = { name: 'Искра' };
  assert.equal(petState(12, { ...base, daysSince: PET.comebackDays }).reason, 'back');
  assert.match(petState(12, { ...base, daysSince: 9 }).line, /рада вас видеть/);
  assert.equal(petState(12, { ...base, daysSince: PET.comebackDays - 1 }).reason, 'waiting');
  assert.equal(petState(12, { ...base, daysSince: 9, trainedToday: true }).reason, 'fed', 'trained today — the day speaks');
  assert.equal(petState(12, { ...base, daysSince: 9, restToday: true }).reason, 'rest', 'a declared rest day outranks it');
  assert.equal(petState(0, { ...base, daysSince: null }).reason, 'egg', 'an egg never «returns»');
  assert.equal(petState(5, { ...base, daysSince: null }).reason, 'waiting');
});

test('pet: one event, one level of celebration; only a new stage is the macro moment', () => {
  assert.deepEqual(Object.entries(CELEBRATION).filter(([, v]) => v === 'macro').map(([k]) => k), ['stage']);
  for (const v of Object.values(CELEBRATION)) assert.ok(['micro', 'medium', 'macro'].includes(v));
  assert.equal(celebrationLevel('tap'), 'micro');
  assert.equal(celebrationLevel('__proto__'), null);
  for (const s of PET.stages) assert.ok(s.character && s.character.length <= 90, `${s.id}: a character line`);
});

test('progress: calendar shift, days since the last training day, this week against the last', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  const p = { days: { '2026-10-19': { runs: 2, seconds: 300 }, '2026-10-15': { runs: 1, seconds: 120 }, '2026-10-10': { runs: 3, seconds: 600 }, '2026-10-12': { runs: 0, seconds: 0, checkin: { action: 'stop' } } } };
  assert.equal(daysSinceTraining(p, '2026-10-19'), 4, 'today does not count');
  assert.equal(daysSinceTraining({ days: {} }, '2026-10-19'), null);
  const runs = [{ at: '2026-10-19T09:00:00', score: 80 }, { at: '2026-10-15T09:00:00', score: 60 }, { at: '2026-10-10T09:00:00', score: 50 }, { at: '2026-10-19T10:00:00', score: 0, demo: true }];
  const w = weekCompare(p, runs, '2026-10-19');
  assert.deepEqual(w.now, { days: 2, minutes: 7, exercises: 3, score: 70 });
  assert.deepEqual(w.before, { days: 1, minutes: 10, exercises: 3, score: 50 });
  assert.deepEqual(weekCompare({ days: {} }, [], '2026-10-19').now, { days: 0, minutes: 0, exercises: 0, score: null }, 'an empty week is zeros, no score');
});

test('everyday: one task a day, the same all day, all ten in ten days; storage keeps only a known task', () => {
  assert.equal(everydayTask('2026-10-19').id, everydayTask('2026-10-19').id);
  const ten = new Set(Array.from({ length: EVERYDAY.length }, (_, i) => everydayTask(shiftDay('2026-10-19', i)).id));
  assert.equal(ten.size, EVERYDAY.length);
  assert.ok(validEverydayId('apple') && !validEverydayId('constructor') && !validEverydayId(42));
  for (const t of EVERYDAY) assert.ok(!/горяч|нож|кипят|тяжёл|стекл/i.test(t.text), `${t.id}: light, safe objects only`);
  const st = emptyState();
  st.profile.days = { '2026-10-19': { runs: 0, seconds: 0, everyday: 'apple' }, '2026-10-18': { runs: 1, seconds: 60, everyday: '<img onerror=1>' } };
  const back = parseState(exportState(st)).profile.days;
  assert.equal(back['2026-10-19'].everyday, 'apple');
  assert.equal('everyday' in back['2026-10-18'], false, 'junk from a backup is dropped');
  assert.equal(everydayDays(st.profile, ['2026-10-19', '2026-10-18']), 1);
  const p = createProfile();
  recordDayNote(p, '2026-10-19', { everyday: 'apple' });
  assert.equal(trainingDays(p), 0, 'a self-report is not a training day: it does not grow the bird');
});

test('faq: questions are unique, answers are not empty, numbers come from the config', () => {
  assert.equal(new Set(FAQ_IDS).size, FAQ_IDS.length);
  for (const id of ['weak', 'false', 'terms', 'pain', 'skin', 'waiting', 'path', 'transfer', 'grow', 'nopressure', 'names']) assert.ok(FAQ_IDS.includes(id), id);
  const text = id => FAQ.flatMap(g => g.items).find(i => i.id === id).a().join(' ');
  assert.match(text('terms'), /не записываются/);
  assert.match(text('terms'), /экрана на самой кисти/);
  assert.match(text('names'), /большой и указательный/);
  assert.match(text('names'), /не записывает|не меняет/);
  assert.match(text('pain'), /Стало больно/);
  assert.match(text('skin'), /выключает датчики/);
  assert.match(text('dropout'), new RegExp(`${SIGNAL.frameTimeoutMs} мс`));
  assert.match(text('dropout'), /не повторяется/);
  assert.equal(text('supply'), ELECTRICAL_SAFETY);
  assert.match(text('report'), /7, 30 или 90/);
  for (const g of FAQ) for (const i of g.items) assert.ok(i.a().length && i.a().every(p => p.length > 20), i.id);
  assert.match(text('howmuch'), new RegExp(`${SESSION.dailySoftCapMin} минут`));
  assert.match(text('howmuch'), new RegExp(`у детей — ${CHILD.dailySoftCapMin}`));
  for (const s of PET.stages.filter(s => s.from > 0)) assert.match(text('grow'), new RegExp(`с ${s.from}-го дня`));
  assert.match(text('transfer'), /подтверждён слабо/, 'honest about transfer');
  assert.match(text('waiting'), /не доказана/, 'no promise of a medical effect');
});

test('tutorial: the prosthesis lock — hold A+B as long as the person\'s prosthesis asks, then unlock', () => {
  for (const scheme of ['threshold', 'proportional']) {
    const steps = tutorialSteps(scheme, { lockHoldS: 1.5 });
    const lock = steps.find(s => s.id === 'lock'), unlock = steps.find(s => s.id === 'unlock');
    assert.ok(lock && unlock && steps.indexOf(lock) < steps.indexOf(unlock), scheme);
    assert.equal(lock.holdS, 1.5); assert.equal(lock.lock, 'on'); assert.equal(unlock.lock, 'off');
    assert.match(lock.text, /1,5 с/);
  }
  assert.ok(tutorialSteps('gesture').every(s => !s.lock), 'the gesture scheme has no lock step');
  const run = new TutorialRun('threshold', { lockHoldS: 1 });
  while (run.step.id !== 'lock') run.skipStep();
  const both = { valid: true, aOn: true, bOn: true, command: 'switch' };
  for (let i = 0; i < 8; i++) run.update(both, 0.1); // 0.8 s — a short co-contraction (a grip switch) does not lock
  assert.equal(run.step.id, 'lock');
  for (let i = 0; i < 3; i++) run.update(both, 0.1);
  assert.notEqual(run.step.id, 'lock', 'held for the set time — locked');
  assert.ok(SETTINGS_RULES.lockHoldS(LOCK.minS) && SETTINGS_RULES.lockHoldS(LOCK.maxS) && !SETTINGS_RULES.lockHoldS(10) && !SETTINGS_RULES.lockHoldS(0));
});

test('host: launch parameters are validated; results go only to a host that asked, without health notes', () => {
  const info = id => ({ grip: { levels: 8 }, check: { levels: 1 } }[id] ?? null);
  assert.deepEqual(parseLaunch('?game=grip&level=3', info), { game: 'grip', level: 3, hostOrigin: null, embed: false });
  assert.equal(parseLaunch('?game=grip&level=99', info).level, 1, 'a level out of range starts at 1');
  assert.equal(parseLaunch('?game=__proto__', info).game, null);
  assert.equal(parseLaunch('?game=nope', info).game, null);
  assert.equal(parseLaunch('?host=https://app.example', info).hostOrigin, 'https://app.example');
  for (const bad of ['javascript:alert(1)', 'https://app.example/path', '*', 'file:///etc', 'not a url']) assert.equal(parseLaunch(`?host=${encodeURIComponent(bad)}`, info).hostOrigin, null, bad);
  const run = { at: '2026-10-19T09:00:00.000Z', game: 'grip', level: 2, scheme: 'proportional', score: 84, stars: 2, durationS: 61, skills: { precision: 81, x: NaN }, details: { wellbeing: 'secret' }, name: 'Иван' };
  const msg = resultMessage(run, '5.14.0');
  assert.equal(msg.type, HOST_MESSAGE);
  assert.deepEqual(msg.skills, { precision: 81 });
  assert.ok(!JSON.stringify(msg).includes('secret') && !JSON.stringify(msg).includes('Иван'), 'no wellbeing, no name');
  const calls = [];
  const parent = { postMessage: (m, origin) => calls.push(['post', origin]) };
  const win = { SynergyHost: { onResult: json => { calls.push(['native', JSON.parse(json).game]); throw new Error('host bug'); } }, parent, document: null };
  notifyHost(msg, { hostOrigin: null, win });
  assert.deepEqual(calls, [['native', 'grip']], 'no origin named — nothing is posted; a throwing host is contained');
  notifyHost(msg, { hostOrigin: 'https://app.example', win });
  assert.deepEqual(calls.at(-1), ['post', 'https://app.example'], 'posted only to the named origin, never «*»');
});

test('report: a period with its completeness; the self-reports are named as such', () => {
  const st = emptyState();
  st.profile.days = { '2026-10-19': { runs: 1, seconds: 60, everyday: 'apple' }, '2026-10-17': { runs: 0, seconds: 0, checkin: { action: 'stop', pain: 'strong' } }, '2026-09-01': { runs: 2, seconds: 120 } };
  st.runs = [{ at: '2026-10-19T09:00:00', game: 'grip', level: 1, score: 70, stars: 2, skills: {} }, { at: '2026-09-01T09:00:00', game: 'grip', level: 1, score: 50, stars: 1, skills: {} }];
  assert.equal(periodKeys(st.profile, 7, '2026-10-19').length, 7);
  assert.equal(periodKeys(st.profile, null, '2026-10-19').length, 49, 'everything — from the first day on record');
  assert.deepEqual(periodSummary(st.profile, periodKeys(st.profile, 7, '2026-10-19')), { days: 7, trained: 1, rest: 1, empty: 5, everyday: 1, minutes: 1 }); // 5.27: the period's own minutes
  assert.equal(buildReport(st, { periodDays: 7, today: '2026-10-19' }).runs.length, 1);
  assert.equal(buildReport(st, { today: '2026-10-19' }).runs.length, 2);
  const html = reportHtml(st, id => id, { periodDays: 30, today: '2026-10-19' });
  assert.match(html, /Полнота периода/); assert.match(html, /самоотчёт/);
  assert.deepEqual(REPORT_PERIODS, [7, 30, 90, null]);
});

test('tours: the nest has its own tour; every tour step stays short', () => {
  assert.ok(TOURS.some(t => t.key === 'nest'));
  for (const t of TOURS) { assert.ok(t.steps.length <= 3, t.key); for (const s of t.steps) assert.ok(s.body.length <= 240, s.anchor); }
});

// ===== SOTA checks from the team's sample =====

/** User-facing strings of the interface and the pet: Cyrillic string literals, comments stripped. */
function uiStrings() {
  const files = [...readdirSync('src/ui').map(f => join('src/ui', f)), 'src/core/pet.js', 'src/core/faq.js', 'src/core/everyday.js', 'src/core/missions.js', 'src/core/tours.js', 'src/core/wellbeing.js']
    .filter(f => f.endsWith('.js'));
  return files.flatMap(f => {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[^:]\/\/ .*$/gm, '');
    return [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*?[А-Яа-яЁё](?:\\.|(?!\1)[^\\])*?)\1/g)].map(m => ({ file: f, text: m[2] }));
  });
}

test('content: no words that blame, shame or label the person (the sample\'s forbidden stems, for people after an amputation)', () => {
  const FORBIDDEN = /ленив|лентя|провал|неудачник|позор|стыд|винова|калек|ущербн|слабак|бездар|обязан|инвалид/i;
  const found = uiStrings().filter(s => FORBIDDEN.test(s.text)).map(s => `${s.file}: «${s.text.slice(0, 60)}»`);
  assert.deepEqual(found, []);
  assert.ok(uiStrings().length > 300, 'the scan sees the interface');
});

test('content: Russian plural forms of days are right for every ending', () => {
  const want = { 1: '1 день', 2: '2 дня', 4: '4 дня', 5: '5 дней', 11: '11 дней', 12: '12 дней', 14: '14 дней', 21: '21 день', 22: '22 дня', 25: '25 дней', 101: '101 день', 111: '111 дней' };
  for (const [n, s] of Object.entries(want)) assert.equal(count(Number(n), FORMS.days).replace(/\s/g, ' '), s);
});

test('property: on random days and events the bird only grows, never saddens, and its words stay kind', () => {
  const r = rng(514);
  let last = 0;
  for (let days = 0; days < 200; days++) {
    const i = petStageIndex(days);
    assert.ok(i >= last, 'growth never goes back'); last = i;
    const s = petState(days, { trainedToday: r() < 0.5, restToday: r() < 0.2, planDone: r() < 0.3, goalDone: r() < 0.2, daysSince: r() < 0.3 ? null : Math.floor(r() * 30), name: 'Искра' });
    assert.ok(['fed', 'rest', 'waiting'].includes(s.mood));
    assert.ok(s.progress >= 0 && s.progress <= 1);
    assert.ok(!/груст|плач|голод|болеет|уйд/i.test(s.line), s.line);
    assert.ok(!/груст|плач|голод|болеет|уйд/i.test(petTap(s, Math.floor(r() * 50)).line));
  }
});

test('property: the player level only grows with XP and its progress stays within [0, 1)', () => {
  const r = rng(7);
  let xp = 0, prev = playerLevel(0);
  for (let k = 0; k < 500; k++) {
    xp += Math.floor(r() * 200);
    const l = playerLevel(xp);
    assert.ok(l.level >= prev.level && l.progress >= 0 && l.progress < 1 && l.toNext > 0);
    prev = l;
  }
});

test('property: actions outside training (outfits, touches, the self-report) never change XP, days or the stage', () => {
  const r = rng(42);
  const p = createProfile();
  p.xp = 777; p.days = { '2026-10-10': { runs: 1, seconds: 60 }, '2026-10-11': { runs: 2, seconds: 90 } };
  p.achievements = Object.fromEntries(PET_ITEMS.map(i => [i.achievement, '2026-10-10']));
  const before = { xp: p.xp, days: trainingDays(p) };
  for (let k = 0; k < 300; k++) {
    const item = PET_ITEMS[Math.floor(r() * PET_ITEMS.length)];
    const pick = r();
    if (pick < 0.4) equipItem(p, item.slot, r() < 0.2 ? null : item.id);
    else if (pick < 0.6) autoEquip(p, [item]);
    else if (pick < 0.8) petTap(petState(before.days), Math.floor(r() * 9));
    else recordDayNote(p, `2026-10-${String(12 + Math.floor(r() * 7)).padStart(2, '0')}`, { everyday: EVERYDAY[Math.floor(r() * EVERYDAY.length)].id });
  }
  assert.deepEqual({ xp: p.xp, days: trainingDays(p) }, before);
});

test('property: restoring a backup is idempotent on random, partly broken data', () => {
  const r = rng(99);
  const junk = () => [null, -1, 1e12, 'x', {}, [], true, '2026-10-19', 0.5][Math.floor(r() * 9)];
  for (let k = 0; k < 60; k++) {
    const st = emptyState();
    for (const key of Object.keys(st.settings)) if (r() < 0.3) st.settings[key] = junk();
    st.profile.xp = junk(); st.profile.pet = junk();
    st.profile.days = { '2026-10-19': { runs: junk(), seconds: junk(), everyday: junk(), checkin: junk() }, bad: { runs: 1 } };
    const once = parseState(exportState(st));
    const twice = parseState(exportState(once));
    assert.deepEqual(twice, once);
  }
});

test('docs: relative links between the documents point to files that exist', () => {
  const files = [...readdirSync('.').filter(f => f.endsWith('.md')), ...['docs', 'docs/embed'].flatMap(d => readdirSync(d).filter(f => f.endsWith('.md')).map(f => join(d, f)))];
  const broken = [];
  for (const f of files) {
    for (const [, target] of readFileSync(f, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target) || target.includes('../../actions')) continue;
      const path = decodeURIComponent(target.split('#')[0]);
      if (path && !existsSync(resolve(dirname(f), path))) broken.push(`${f} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
