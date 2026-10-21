// 5.27 — the role-by-role audit of 21.10.2026 (docs/AUDIT.md §33): an offline launch by a host's address, the
// calibration judged against rest noise, the electrical safety of home-made sensors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { CalibrationRecorder, robustSd } from '../src/core/calibration.js';
import { SignalPipeline, offThreshold } from '../src/core/signal.js';
import { CALIBRATION_QUALITY, SIGNAL } from '../src/config.js';
import { ELECTRICAL_SAFETY, PAIN_STOP_TEXT, painStopDuring, electrodesOff, checkInAdvice, checkinLight, freePlayCaution } from '../src/core/wellbeing.js';
import { decisionOf, periodSummary, periodKeys, protocolMetrics, protocolRows, reportHtml, buildReport } from '../src/services/report.js';
import { emptyState } from '../src/core/storage.js';
import { GAMES, createGame } from '../src/games/registry.js';
import { GameRunner } from '../src/games/runner.js';
import { EmgEmulator } from '../src/input/emulator.js';
import { BionicHand } from '../src/core/hand.js';
import { acquireDistLock } from '../tools/dist-lock.mjs';

// Held for the whole file: the second test reads the worker the first one built, and another file must not wipe dist/.
const releaseDist = acquireDistLock();
process.on('exit', releaseDist);

/** Runs dist/sw.js in a sandbox with an in-memory Cache Storage and a network that is either up or down. */
function serviceWorker({ online }) {
  const scope = 'https://team.example/synergy/';
  const store = new Map();
  const bare = url => url.split('?')[0];
  const cache = {
    addAll: async reqs => { for (const r of reqs) store.set(r.url, `body of ${bare(r.url)}`); },
    match: async (req, { ignoreSearch = false } = {}) => {
      if (store.has(req.url)) return store.get(req.url);
      if (!ignoreSearch) return undefined;
      for (const [url, body] of store) if (bare(url) === bare(req.url)) return body;
      return undefined;
    },
    put: async (req, res) => { store.set(req.url, res.body); },
  };
  const listeners = {};
  const ctx = {
    self: { registration: { scope }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    Request: class { constructor(u) { this.url = new URL(u, scope).href; this.method = 'GET'; } },
    URL,
    fetch: async req => { if (!online) throw new TypeError('offline'); return { ok: true, body: `network ${req.url}`, clone() { return this; } }; },
  };
  ctx.self.caches = ctx.caches;
  vm.runInNewContext(readFileSync('dist/sw.js', 'utf8'), ctx);
  const install = async () => { let p; listeners.install({ waitUntil: x => { p = x; } }); await p; };
  const get = async (path, mode = 'no-cors') => {
    let answer = null;
    listeners.fetch({ request: { method: 'GET', url: new URL(path, scope).href, mode }, respondWith: p => { answer = p; } });
    return answer;
  };
  return { install, get, store };
}

test('5.27 service worker: a host may open the app offline with a query (?game=…&host=…)', async () => {
  execFileSync(process.execPath, ['tools/build.mjs'], { stdio: 'pipe', env: { ...process.env, SYNERGY_DIST_OWNER: String(process.pid) } });
  const sw = serviceWorker({ online: false });
  await sw.install();
  const launch = await sw.get('index.html?game=grip&level=2&host=https%3A%2F%2Fapp.example', 'navigate');
  assert.equal(await launch, 'body of https://team.example/synergy/index.html', 'the cached page answers whatever the query');
  assert.equal(await sw.get('?embed=1', 'navigate'), 'body of https://team.example/synergy/', 'the folder address too');
  await assert.rejects(sw.get('app.js?v=other'), 'a script with an unknown query is not passed off as the cached one');
});

test('5.27 service worker: a page with a query is not stored again under each query', async () => {
  const sw = serviceWorker({ online: true });
  const before = sw.store.size;
  assert.match((await sw.get('index.html?game=flight&level=1', 'navigate')).body, /^network /, 'online and not cached yet — from the network');
  assert.equal(sw.store.size, before, 'no copy of the page per launch address');
  await sw.get('art/new.webp');
  assert.equal(sw.store.size, before + 1, 'a file of the app is still cached on the way');
});

/** Records the calibration wizard from a source function (step id → [a, b]) at 60 frames per second. */
function calibrate(source) {
  const rec = new CalibrationRecorder();
  for (let i = 0; i < 700; i++) rec.push({ t: i * 16, ...source(rec.step?.id, i) }, 1 / 60);
  return rec.result();
}
const wobble = (i, k) => k * Math.sin(i * 1.7) * Math.cos(i * 0.31);

test('5.27 calibration: a source with an offset calibrates — 1.00 V at rest, 1.20 V squeezed', () => {
  const r = calibrate((step, i) => ({ a: (step === 'a' ? 1.2 : 1.0) + wobble(i, 0.003), b: (step === 'b' ? 1.2 : 1.0) + wobble(i + 9, 0.003) }));
  assert.equal(r.usable, true, r.issues.join(' | ')); // until 5.27: «напряжение почти не отличается от покоя» on both channels
  assert.deepEqual(r.issues, []);
  const p = new SignalPipeline({ calibration: r.calibration });
  let i;
  for (let t = 0; t <= 400; t += 20) i = p.process({ t, a: 1.2, b: 1.0 }, t);
  assert.equal(i.command, 'close', 'a squeeze of the offset source closes the hand');
});

test('5.27 calibration: a squeeze lost in the rest noise is flat even when it is well above zero', () => {
  // Zero-based envelope: rest ≈ 0.30 with a ripple of ±0.08; the «squeeze» is only 0.36 — 1.2 × rest, a 1.6 dB contrast.
  const r = calibrate((step, i) => ({ a: (step === 'a' ? 0.36 : 0.3) + wobble(i, 0.08), b: (step === 'b' ? 0.9 : 0.05) + wobble(i + 3, 0.004) }));
  assert.equal(r.usable, false, 'until 5.27 a squeeze above 1.33 × rest passed whatever the noise');
  assert.ok(r.issues.some(s => /Канал A: напряжение почти не отличается/.test(s)), r.issues.join(' | '));
});

test('5.27 calibration: rest that ripples up to the switch-off level is a warning, not a refusal', () => {
  const span = 0.5, ripple = (offThreshold(SIGNAL.onThreshold) * span) / CALIBRATION_QUALITY.restPeakNoise * 1.3;
  const r = calibrate((step, i) => ({ a: (step === 'a' ? 0.1 + span : 0.1) + wobble(i, ripple * 1.6), b: (step === 'b' ? 0.8 : 0.05) + wobble(i + 5, 0.002) }));
  assert.equal(r.usable, true, 'the person may still lower the sensitivity');
  assert.ok(r.issues.some(s => /Канал A: в покое сигнал дрожит/.test(s)), r.issues.join(' | '));
  assert.ok(!r.issues.some(s => /Канал B/.test(s)), 'a quiet channel gets no warning');
});

test('5.27 calibration: the robust SD ignores a single twitch and is zero for a constant', () => {
  const quiet = Array.from({ length: 200 }, (_, i) => 0.1 + 0.01 * Math.sin(i));
  const twitch = [...quiet.slice(0, 199), 5];
  assert.ok(Math.abs(robustSd(twitch) - robustSd(quiet)) < 0.002, `${robustSd(twitch)} vs ${robustSd(quiet)}`);
  assert.equal(robustSd(new Array(50).fill(0.05)), 0);
});

test('5.27 electrical safety: the external source names battery power for home-made sensors', () => {
  assert.match(ELECTRICAL_SAFETY, /только от батареи/);
  assert.match(ELECTRICAL_SAFETY, /без зарядного устройства/);
  assert.match(ELECTRICAL_SAFETY, /по инструкции производителя/, 'a certified device is not second-guessed');
  assert.ok(readFileSync('src/ui/settings.js', 'utf8').includes('ELECTRICAL_SAFETY'), 'shown in Настройки → Источник сигнала');
  assert.ok(readFileSync('docs/INTEGRATION.md', 'utf8').includes('Электробезопасность самодельных датчиков'));
  const firmware = readFileSync('bridge/firmware/esp32_emg_ble/esp32_emg_ble.ino', 'utf8');
  assert.match(firmware, /battery power only/);
  assert.match(firmware, /now - last < PERIOD_MS/, 'the timer survives the millis() wrap');
});

// ── Second pass of the 5.27 audit (docs/AUDIT.md §33): prosthetist, medic, rehabilitation specialist ──────────────────

test('5.27 signal: after a dropout the gesture starts from rest — the gesture before the loss is not replayed', () => {
  const p = new SignalPipeline({ scheme: 'gesture' });
  let i;
  for (let t = 0; t <= 400; t += 20) i = p.process({ t, a: 0.6, b: 0, gesture: 'fist', confidence: 1 }, t);
  assert.equal(i.command, 'close');
  assert.equal(p.process(null, 900).valid, false, 'the watchdog tripped');
  const seen = [];
  for (let t = 1000; t <= 1200; t += 20) seen.push(p.process({ t, a: 0, b: 0.6, gesture: 'open', confidence: 1 }, t).command);
  // Until 5.27 the first 90 ms after the loss closed the hand: «Ладонь» shown, «Кулак» executed.
  assert.ok(!seen.includes('close'), seen.join(' '));
  assert.equal(seen.at(-1), 'open', 'the new gesture is taken once it holds');
});

test('5.27 pain during an exercise: today closes like severe pain, the morning answers stay, a short day is not kept', () => {
  const at = '2026-10-21T10:00:00.000Z';
  const morning = { pain: 1, fatigue: 2, skin: 0, action: 'light', reason: 'fatigue', light: true, at: '2026-10-21T08:00:00.000Z' };
  assert.deepEqual(painStopDuring(morning, at), { pain: 1, fatigue: 2, skin: 0, action: 'stop', reason: 'pain', during: true, at });
  assert.deepEqual(painStopDuring({ skipped: true, at: 'x' }, at), { action: 'stop', reason: 'pain', during: true, at }, 'a skipped check-in has no answers to keep');
  assert.deepEqual(painStopDuring(undefined, at), { action: 'stop', reason: 'pain', during: true, at });
  assert.ok(!checkinLight(painStopDuring(morning, at)), 'a closed day is not a short day');
  assert.match(freePlayCaution({ checkin: painStopDuring(morning, at), secondsToday: 0, softCapMin: 30 }), /остановили занятие из-за боли/);
  assert.match(PAIN_STOP_TEXT, /врачу или протезисту/);
  assert.equal(decisionOf(painStopDuring(morning, at)), 'остановлено: боль во время занятия');
});

test('5.27 electrodes: irritated skin turns them off whatever else was answered', () => {
  assert.equal(electrodesOff(checkInAdvice({ skin: 1 })), true);
  const severe = { pain: 3, skin: 1, ...checkInAdvice({ pain: 3, skin: 1 }) };
  assert.equal(severe.reason, 'pain', 'severe pain is checked first');
  assert.equal(electrodesOff(severe), true, 'until 5.27 the skin answer of a severe-pain day was lost');
  assert.match(freePlayCaution({ checkin: severe, secondsToday: 0, softCapMin: 30 }), /Датчики сегодня выключены/);
  assert.equal(electrodesOff({ pain: 3, skin: 0, ...checkInAdvice({ pain: 3 }) }), false);
  assert.equal(electrodesOff(undefined), false);
});

test('5.27 report: the period shows its own minutes, and pain that stopped an exercise has its own row', () => {
  const state = emptyState();
  const today = '2026-10-21';
  state.profile.days = {
    '2026-10-21': { seconds: 600, runs: 2, checkin: painStopDuring({ pain: 0, fatigue: 0, action: 'go' }, `${today}T10:00:00.000Z`) },
    '2026-10-18': { seconds: 300, runs: 1, checkin: { pain: 3, fatigue: 0, action: 'stop', reason: 'pain' } },
    '2026-09-01': { seconds: 1200, runs: 3 },
  };
  state.profile.totals.seconds = 2100;
  assert.equal(periodSummary(state.profile, periodKeys(state.profile, 7, today)).minutes, 15, 'two days of the week');
  const m = protocolMetrics(state, today);
  assert.equal(m.painDays, 1, 'the morning answer of severe pain');
  assert.equal(m.painDuringDays, 1, 'the stop during an exercise — not counted twice');
  assert.ok(protocolRows(m).some(([k, v]) => k === 'H5. Дни, когда боль остановила занятие' && v === '1'));
  const html = reportHtml(state, id => id, { periodDays: 7, today });
  assert.match(html, /<th>Минут за период<\/th><th>Минут \(всего\)<\/th>/);
  assert.match(html, /<td>15<\/td><td>35<\/td>/, 'the week and all time side by side');
  assert.match(html, /остановлено: боль во время занятия/);
  assert.equal(buildReport(state, { periodDays: 7, today }).period.minutes, 15);
});

// ── A frame of every game is drawn in the unit tests (5.27, found by the smoke e2e) ────────────────────────────────────
// «Сейф» called fmtFixed without importing it: every frame of a digit card threw, the app loop logged the error and
// stopped the screen — the game froze for every player. No unit test ever called render(), so it passed 329 tests.

/** A canvas that accepts every call and every property, like a real 2D context (no pixels). */
function nullCanvas() {
  return new Proxy({ fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '' }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('5.27 render: every game, scheme, first and last level, with and without hints — each frame of a run draws without throwing', () => {
  const ctx = nullCanvas();
  for (const entry of GAMES) {
    const levels = [1, entry.Game.levels.length];
    for (const scheme of ['threshold', 'proportional', 'gesture']) {
      for (const levelNumber of [...new Set(levels)]) {
        for (const retention of entry.id === 'check' ? [false] : [false, true]) {
          const game = createGame(entry.id, { levelNumber, scheme, seed: 5, retention });
          const emulator = new EmgEmulator({ realism: 0.5, seed: 5 });
          const hand = new BionicHand();
          const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme }), hand, source: emulator, emulator, autopilot: true });
          const dt = 1 / 60;
          let frames = 0;
          for (let t = 0; !game.done && t < 240000; t += dt * 1000) {
            const intent = runner.step(t, dt);
            if (frames++ % 6 === 0) {
              for (const view of [{ w: 360, h: 600 }, { w: 568, h: 280 }]) {
                assert.doesNotThrow(() => game.render(ctx, view, hand, intent), `${entry.id} L${levelNumber} ${scheme}${retention ? ' без подсказки' : ''}, ${view.w}×${view.h}, ${game.time.toFixed(1)} с`);
              }
            }
          }
          assert.doesNotThrow(() => game.render(ctx, { w: 360, h: 600 }, hand, runner.intent), `${entry.id}: the final frame`);
        }
      }
    }
  }
});

test('5.29 dist lock: a lock file still empty (being created) is not taken over, a dead owner\'s is', async () => {
  const { writeFileSync: write, utimesSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // A lock file of its own: the real one is held by this file, and bundle/v516 tests wait on it in parallel.
  const dir = mkdtempSync(join(tmpdir(), 'synergy-lock-')), lock = join(dir, 'dist.lock');
  const probe = `import { acquireDistLock } from './tools/dist-lock.mjs'; const t = Date.now(); const release = acquireDistLock(); console.log(Date.now() - t); release();`;
  const child = () => Number(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', timeout: 20000, env: { ...process.env, SYNERGY_DIST_LOCK: lock } }).trim());
  try {
    write(lock, ''); // fresh and empty: another process between open and write
    const waited = child();
    assert.ok(waited >= 1500, `an empty lock younger than 2 s was taken over after ${waited} ms`);
    write(lock, '999999999'); // a pid that does not run
    assert.ok(child() < 1000, 'a dead owner\'s lock is taken at once');
    write(lock, '');
    const old = new Date(Date.now() - 5000); utimesSync(lock, old, old);
    assert.ok(child() < 1000, 'empty for 5 s — a crash between open and write');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
