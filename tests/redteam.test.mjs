import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Red Team: untrusted inputs must never lock the user out. A backup file is hostile until proven otherwise:
// every profile field with a wrong type falls back to its default and the screens' domain calls still work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, DEFAULT_SETTINGS } from '../src/core/storage.js';
import { createProfile, buildDailyPlan, recordRun, completePlanItem, unlockAchievements, secondsToday, playerLevel, skillProfile } from '../src/core/progress.js';
import { PLAN_CATALOG } from '../src/games/registry.js';
import { SCHEME_INFO } from '../src/core/vocabulary.js';
import { HANDS_FREE } from '../src/config.js';
import { reminderIcs, reportCsv } from '../src/services/report.js';
import { trustedMessageSource } from '../src/input/bridge.js';

const HOSTILE = [null, 42, 'x', [], {}, true, { __proto__: { polluted: 1 } }];
const today = '2026-10-17';
const run = { id: 'r', at: `${today}T10:00:00Z`, game: 'grip', level: 1, levelCount: 8, scheme: 'proportional', score: 80, stars: 2, skills: { precision: 70 }, details: {}, durationS: 60 };

test('red team: a backup with any profile field of a wrong type still opens every screen', () => {
  for (const key of Object.keys(createProfile())) {
    for (const bad of HOSTILE) {
      const state = parseState(JSON.stringify({ version: 4, profile: { ...createProfile(), [key]: bad }, runs: [] }));
      const p = state.profile;
      assert.doesNotThrow(() => {
        buildDailyPlan(p, state.runs, PLAN_CATALOG, state.settings.scheme, today, { exercises: 3 });
        secondsToday(p, today); playerLevel(p.xp); skillProfile(state.runs);
        recordRun(p, run, { today, weeklyGoal: 4 }); completePlanItem(p, run, today); unlockAchievements(p, null, {}, today);
      }, `profile.${key} = ${JSON.stringify(bad)}`);
    }
  }
  assert.equal({}.polluted, undefined, 'no prototype pollution');
});

test('red team: a JSON «__proto__» key in a backup does not reach Object.prototype', () => {
  const state = parseState('{"version":4,"profile":{"__proto__":{"polluted":1}},"settings":{"__proto__":{"polluted":1}},"runs":[]}');
  assert.equal({}.polluted, undefined);
  assert.equal(state.settings.polluted, undefined);
});

test('logic: switching the scheme after finishing the plan does not pay the plan bonus twice', () => {
  const p = createProfile();
  const plan = buildDailyPlan(p, [], PLAN_CATALOG, 'proportional', today, { exercises: 1 });
  let bonus = 0;
  for (const item of plan.items) bonus += completePlanItem(p, { ...run, game: item.game, retention: item.retention }, today);
  assert.ok(bonus > 0, 'first plan of the day pays');
  const again = buildDailyPlan(p, [], PLAN_CATALOG, 'gesture', today, { exercises: 1 });
  let second = 0;
  for (const item of again.items) second += completePlanItem(p, { ...run, game: item.game, retention: item.retention }, today);
  assert.equal(second, 0, 'the rebuilt plan of the same day pays nothing');
  assert.equal(p.totals.plans, 1);
});

test('red team: a run with an unparseable date is dropped on import', () => {
  const st = parseState(JSON.stringify({ version: 4, runs: [{ ...run, at: 'not-a-date' }, run, { game: 'grip', level: 1, score: 1, stars: 0 }] }));
  assert.equal(st.runs.length, 2);
});

// RT-9 (5.7): settings were checked by type only — `scheme: "x"` passed and the home screen threw on every launch.
test('red team: settings out of their range or enum fall back to the default (RT-9)', () => {
  const OUT = ['x', '', -5, 0, 1e9, 30, 2.5, null, true, [], {}, 'javascript:alert(1)', '99:99', 'a'.repeat(5000)];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    for (const bad of OUT) {
      const s = parseState(JSON.stringify({ version: 4, settings: { ...DEFAULT_SETTINGS, [key]: bad } })).settings;
      const why = `settings.${key} = ${JSON.stringify(bad).slice(0, 40)}`;
      assert.ok(SCHEME_INFO[s.scheme], why);
      assert.ok(['touch', 'bridge', 'demo'].includes(s.source) && ['right', 'left'].includes(s.side) && ['adult', 'child'].includes(s.audience), why);
      assert.ok([1, 1.15, 1.3].includes(s.textScale), why);
      assert.ok(s.gameSpeed >= 0.6 && s.gameSpeed <= 1 && s.dwellS >= HANDS_FREE.minS && s.dwellS <= HANDS_FREE.maxS, why);
      assert.ok(s.sensitivity >= 0.1 && s.sensitivity <= 0.45 && s.coThreshold >= 0.25 && s.coThreshold <= 0.7 && s.realism >= 0 && s.realism <= 1, why);
      assert.ok(Number.isInteger(s.weeklyGoal) && s.weeklyGoal >= 2 && s.weeklyGoal <= 7, why);
      assert.match(s.reminder, /^\d\d:\d\d$/, why);
      assert.ok(s.name.length <= 24 && s.wsUrl.length <= 200 && !/^javascript:/i.test(s.wsUrl), why);
      assert.ok(Number.isFinite(s.pinLock.fails) && Number.isFinite(s.pinLock.until), why);
      assert.ok(!reminderIcs(s.reminder).includes('NaN'), why);
    }
  }
  const kept = parseState(JSON.stringify({ version: 4, settings: { scheme: 'gesture', textScale: 1.3, gameSpeed: 0.75, name: 'Аня', reminder: '07:30', wsUrl: 'ws://192.168.0.10:8765' } })).settings;
  assert.deepEqual([kept.scheme, kept.textScale, kept.gameSpeed, kept.name, kept.reminder, kept.wsUrl], ['gesture', 1.3, 0.75, 'Аня', '07:30', 'ws://192.168.0.10:8765'], 'valid values survive');
});

test('red team: a hostile plan, skin or day record in a backup falls back to a safe shape (RT-10)', () => {
  for (const plan of [{ day: today, scheme: 'proportional', items: null }, { day: today, scheme: 'proportional', items: [null, 5] }, { day: 5, items: [] }]) {
    const st = parseState(JSON.stringify({ version: 4, profile: { ...createProfile(), plan } }));
    const p = buildDailyPlan(st.profile, [], PLAN_CATALOG, 'proportional', today, { exercises: 3 });
    assert.ok(Array.isArray(p.items) && p.items.every(i => typeof i.game === 'string'), JSON.stringify(plan));
  }
  const st = parseState(JSON.stringify({ version: 4, profile: { ...createProfile(), skin: 'evil', days: { [today]: { seconds: 'abc', runs: null, checkin: 7 }, 'not-a-day': { seconds: 5 } } } }));
  assert.equal(st.profile.skin, 'graphite');
  assert.deepEqual(Object.keys(st.profile.days), [today]);
  assert.equal(secondsToday(st.profile, today), 0);
  assert.equal(st.profile.days[today].checkin, undefined);
});

test('red team: CSV formula guard also catches «-2+3+cmd|…», tabs and CR; plain numbers stay numbers (RT-11)', () => {
  const st = parseState(JSON.stringify({ version: 4 }));
  for (const game of ["-2+3+cmd|' /C calc'!A0", '\tcmd', '\r=1+1', '+1+1', '@SUM(A1)']) {
    st.runs = [{ ...run, game }];
    const cell = reportCsv(st).split('\n')[1].split(';')[1];
    assert.ok(cell.startsWith("'") || cell.startsWith(`"'`), `${JSON.stringify(game)} → ${cell}`);
  }
  st.runs = [{ ...run, score: 12.5, details: { difficulty: -0.25 } }];
  const row = reportCsv(st).split('\n')[1].split(';');
  assert.ok(row.includes('12.5') && row.includes('-0.25'), row.join(';'));
});

test('red team: postMessage frames only from the embedding parent or a native host (RT-7)', () => {
  const win = { parent: null }; win.parent = win; // top-level window
  assert.ok(trustedMessageSource({ source: null }, win), 'native WebMessage (no source window)');
  assert.ok(trustedMessageSource({ source: win }, win), 'the page itself');
  assert.ok(!trustedMessageSource({ source: { other: true } }, win), 'an opener or a child frame');
  const parent = {}, framed = { parent };
  assert.ok(trustedMessageSource({ source: parent }, framed), 'the embedding page');
  assert.ok(!trustedMessageSource({ source: {} }, framed));
});

test('RT-13 (5.27): a host that named itself in ?host= is the only embedding origin the game listens to', () => {
  const parent = {}, framed = { parent };
  const host = 'https://app.example';
  assert.ok(trustedMessageSource({ source: parent, origin: host }, framed, host), 'the declared host');
  assert.ok(!trustedMessageSource({ source: parent, origin: 'https://evil.example' }, framed, host), 'another site framing the game with someone else’s ?host=');
  assert.ok(!trustedMessageSource({ source: parent, origin: 'null' }, framed, host), 'a sandboxed frame is not the declared host');
  assert.ok(trustedMessageSource({ source: null, origin: '' }, framed, host), 'a native WebMessage has no window and no web origin');
  assert.ok(trustedMessageSource({ source: framed, origin: 'https://game.example' }, framed, host), 'the page itself');
  assert.ok(trustedMessageSource({ source: parent, origin: 'https://any.example' }, framed), 'no ?host= — any embedding page, as before');
  const top = { parent: null }; top.parent = top;
  assert.ok(!trustedMessageSource({ source: {}, origin: host }, top, host), 'an opener tab, even from the host’s origin');
});

test('RT-13 (5.27): BridgeSource takes posted frames only from the declared host', async () => {
  const { BridgeSource } = await import('../src/input/bridge.js');
  const parent = {}, win = { parent, addEventListener() {}, removeEventListener() {} };
  const saved = globalThis.window;
  globalThis.window = win;
  try {
    const bridge = new BridgeSource({ hostOrigin: 'https://app.example', clock: () => 1000 });
    bridge.onMessage({ source: parent, origin: 'https://evil.example', data: { type: 'synergy-frame', a: 0.9, b: 0 } });
    assert.equal(bridge.sample(), null, 'a frame from another origin is dropped');
    bridge.onMessage({ source: parent, origin: 'https://app.example', data: { type: 'synergy-frame', a: 0.9, b: 0 } });
    assert.equal(bridge.sample()?.a, 0.9, 'the declared host is heard');
  } finally {
    globalThis.window = saved;
  }
});

test('RT-12 (5.10): a crafted backup cannot freeze or blank the app — nested progress is checked against the game catalog', async () => {
  const { importState, emptyState } = await import('../src/core/storage.js');
  const { playerLevel } = await import('../src/core/progress.js');
  const { confusionMatrix } = await import('../src/core/analytics.js');
  const catalog = { grip: 8, flight: 8, rhythm: 8, safe: 8, check: 1 };
  const base = emptyState();
  const evil = JSON.parse(JSON.stringify(base));
  evil.profile.xp = 1e308;
  evil.profile.games = { grip: { stars: 5, best: null, unlocked: 99, lastStars: { 1: [3, 'x'] } }, nope: { unlocked: 1 } };
  evil.profile.plan = { day: '2026-10-18', scheme: 'proportional', items: [{ game: 'nope', level: 1 }, { game: 'grip', level: 42 }] };
  evil.profile.streak = { current: 'x', best: -3, lastDay: 'yesterday' };
  evil.runs = [{ id: 'r', game: 'safe', level: 1, score: 50, stars: 1, scheme: 'gesture', details: { confusion: JSON.parse('{"__proto__": {"assessment": 1}, "fist": {"pinch": 2, "__proto__": 5}}') } }];
  const s = importState(JSON.stringify(evil), catalog);
  const t0 = Date.now(); playerLevel(s.profile.xp); playerLevel(1e308);
  assert.ok(Date.now() - t0 < 50, 'level of a huge XP is computed at once (the loop froze the tab on every launch)');
  assert.ok(s.profile.xp <= 1e9);
  assert.deepEqual(Object.keys(s.profile.games), ['grip'], 'unknown game dropped');
  assert.equal(s.profile.games.grip.unlocked, 8, 'unlocked clamped to the game');
  assert.deepEqual(s.profile.games.grip.stars, {});
  assert.deepEqual(s.profile.plan.items.map(i => [i.game, i.level]), [['grip', 8]], 'plan item of an unknown game dropped, level clamped');
  assert.deepEqual(s.profile.streak, { current: 0, best: 0, lastDay: null });
  confusionMatrix(s.runs);
  assert.equal(({}).assessment, undefined, 'no prototype pollution from an own __proto__ key');
  assert.deepEqual(s.runs[0].details.confusion, { fist: { pinch: 2 } });
});

test('RT-12b: the confusion table itself ignores unknown keys (defence in depth, without the storage check)', async () => {
  const { confusionMatrix } = await import('../src/core/analytics.js');
  const m = confusionMatrix([{ scheme: 'gesture', details: { confusion: JSON.parse('{"__proto__": {"polluted": 1}, "constructor": {"fist": 3}}') } }]);
  assert.equal(({}).polluted, undefined);
  assert.equal(m.total, 0);
});

test('RT-13 (5.10): the local server never serves dotfiles or the tool cache (the debug keystore lives there)', async () => {
  const { startServer } = await import('../tools/static-server.mjs');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { url, close } = await startServer({ root });
  try {
    const base = url.replace('/index.html', '');
    assert.equal((await fetch(`${base}/.git/config`)).status, 404);
    assert.equal((await fetch(`${base}/tools/.cache/debug.keystore`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/etc/passwd`)).status === 200, false, 'no traversal');
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
  } finally { await close(); }
});

test('settings ranges have one source: every slider value the screen offers is accepted from a backup, nothing outside', async () => {
  const { SETTINGS_RANGES, TEXT_SCALES } = await import('../src/config.js');
  const { SETTINGS_RULES } = await import('../src/core/storage.js');
  for (const [key, { min, max, step }] of Object.entries(SETTINGS_RANGES)) {
    for (let v = min; v <= max + 1e-9; v += step) assert.ok(SETTINGS_RULES[key](Math.round(v / step) * step), `${key} ${v}`);
    assert.ok(!SETTINGS_RULES[key](max + step * 1.5) && !SETTINGS_RULES[key](min - step * 1.5), `${key} outside`);
  }
  for (const v of TEXT_SCALES) assert.ok(SETTINGS_RULES.textScale(v));
});

test('RT-17 (5.11): built-in object keys are not «known games»; a dead calibration and deep nesting are refused', async () => {
  const { parseState, emptyState } = await import('../src/core/storage.js');
  const { GAME_BY_ID } = await import('../src/games/registry.js');
  const catalog = Object.fromEntries(Object.keys(GAME_BY_ID).map(id => [id, GAME_BY_ID[id].Game.levels.length]));
  const s = emptyState();
  s.profile.plan = { day: '2026-10-18', scheme: 'proportional', items: ['constructor', 'toString', '__proto__', 'grip'].map(game => ({ game, level: 1, done: false, retention: false })) };
  s.profile.games = { constructor: { unlocked: 1 }, hasOwnProperty: { unlocked: 1 }, grip: { unlocked: 2 } };
  s.calibrations.touch = { rest: [5, 5], max: [6, 6] };
  s.calibrations.bridge = { rest: [0.3, 0.2], max: [0.2, 0.9] };
  const clean = parseState(JSON.stringify(s), catalog);
  assert.deepEqual(clean.profile.plan.items.map(i => i.game), ['grip']);
  assert.deepEqual(Object.keys(clean.profile.games), ['grip']);
  assert.deepEqual(clean.calibrations.touch.rest, [0, 0], 'a touch calibration outside 0..1 is not kept');
  assert.deepEqual(clean.calibrations.bridge.rest, [0, 0], 'rest above max is not kept');
  assert.equal(GAME_BY_ID.constructor, undefined, 'lookup maps have no prototype');
  let deep = []; for (let i = 0; i < 1000; i++) deep = [deep];
  assert.throws(() => parseState(JSON.stringify({ ...emptyState(), junk: deep })), 'nesting deeper than any real state');
  const big = emptyState(); big.runs = []; assert.doesNotThrow(() => parseState(JSON.stringify(big)));
});

test('RT-18 (5.11): CSV cells stay one cell under either separator — no formula after a comma', async () => {
  const { reportCsv } = await import('../src/services/report.js');
  const { emptyState } = await import('../src/core/storage.js');
  const s = emptyState();
  s.runs = [{ id: 'x', at: '2026-10-18T10:00:00Z', game: "grip,=cmd|' /C calc'!A0,", level: 1, levelCount: 8, scheme: 'x,+HYPERLINK(B1),', score: 50, stars: 1, skills: {}, details: {}, durationS: 60 }];
  // A minimal CSV reader that honours quotes, for both separators.
  const cells = (text, sep) => text.split('\n').flatMap(line => { const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) { const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; }
    out.push(cur); return out; });
  for (const sep of [';', ',']) for (const cell of cells(reportCsv(s), sep)) assert.ok(!/^[=+\-@\t\r]/.test(cell) || /^-?\d+(\.\d+)?$/.test(cell), `${sep}: «${cell}»`);
});
