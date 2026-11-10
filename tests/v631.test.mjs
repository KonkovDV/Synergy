import './pin-tz.mjs'; // the set of the task — imported FIRST (tests/pin-tz.mjs)
// 6.3.1 — the audit before the second checkpoint (09.11.2026).
// Each test failed on 6.3.0:
//   • the hard contract of the СПППР refused a packet whose Σ dist missed 1 by more than 0.02. A recognizer that rounds
//     every probability and does not fix the sum misses it by up to 7 × half a step: in a simulation of the audit 2.3 %
//     of the packets were refused at 2 decimals and 66 % at 1 — the emulator fixed its own sum, so no test saw it
//     (question 4 of the checkpoint). The sum may now miss 1 by what rounding reaches; a sum no rounding explains is
//     refused as before;
//   • the onboarding told everyone «не уверены — выберите „Пропорциональный“», while the organizers' reference is the
//     threshold EMG of «Инди» and «Манифесто» (question 2);
//   • the report showed the share of timed play only without the rest between exercises — counted in, the reference
//     session of the threshold scheme is 56 %, under the task's 60 % (question 6). Both readings are shown now;
//   • the weekly check called its method Agresti–Caffo but compared the raw difference with the error: with the same
//     skill it said «changed» in 14.6 % of pairs at 6 trials (nominal 5 %). The adjusted difference is compared now.
// (The gate in a folder without .git — tests/submission.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSppprPacket, sppprPacket, roundingDecimals, sumToleranceOf, SppprDecoder, SPPPR_WIRE } from '../src/core/spppr.js';
import { SppprEmulator } from '../src/input/spppr-emulator.js';
import { SPPPR, SESSION } from '../src/config.js';
import { timedShare, timedShareWithRest, referenceSession } from '../src/core/timeshare.js';
import { timeShareOf } from '../src/services/report.js';
import { completionChange } from '../src/core/analytics.js';
import { playStream } from './stream-helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const softmax = z => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };
const dist = p => Object.fromEntries(SPPPR_WIRE.map((key, i) => [key, p[i]]));
const read = (p, ts = 1) => parseSppprPacket({ timestamp_ms: ts, dist: dist(p) });

test('09.11, question 4: a СПППР that rounds its probabilities and does not fix the sum is read, not refused', () => {
  const rnd = mulberry(9);
  const cases = [
    ['2 decimals (or whole percents / 100)', v => Math.round(v * 100) / 100, [1, 2]],
    ['1 decimal', v => Math.round(v * 10) / 10, [1]],
    ['float32, not rounded', v => Math.fround(v), [null]],
  ];
  for (const [name, round, steps] of cases) {
    let refused = 0;
    for (let i = 0; i < 3000; i++) {
      // a held movement or neutral: one class ahead of the others by 1…5 in the logits
      const top = Math.floor(rnd() * SPPPR_WIRE.length);
      const p = softmax(SPPPR_WIRE.map((_, j) => (j === top ? 1 + rnd() * 4 : rnd() * 1.5))).map(round);
      const pk = read(p, i + 1);
      if (!pk.ok) { refused++; continue; }
      assert.ok(Math.abs(pk.p.reduce((s, v) => s + v, 0) - 1) < 1e-9, 'taken values are normalized');
      assert.ok(steps.includes(pk.decimals), `${name}: the step is told — ${pk.decimals}`);
    }
    assert.equal(refused, 0, `${name}: ${refused} of 3000 valid packets refused (6.3.0: 2 decimals ≈ 2 %, 1 decimal ≈ 66 %)`);
  }
  // The example packet of the task is two decimals summing to 1: unchanged.
  assert.equal(read([0.05, 0.65, 0.15, 0.05, 0.05, 0.03, 0.02]).decimals, 2);
});

test('09.11: the contract stays hard — a sum no rounding explains is refused, full precision keeps ±0.02', () => {
  assert.equal(roundingDecimals([0.7, 0.1, 0.2]), 1);
  assert.equal(roundingDecimals([0.65, 0.05, 0.3]), 2);
  assert.equal(roundingDecimals([0.07, 0.93]), 2, 'floating-point noise is not a decimal');
  assert.equal(roundingDecimals([1, 0, 0]), 1, 'a one-hot packet');
  assert.equal(roundingDecimals([0.123, 0.877]), null, 'three decimals count as full precision');
  assert.equal(roundingDecimals([0.333333, 0.666667]), null);
  const near = (x, y) => Math.abs(x - y) < 1e-6;
  assert.ok(near(sumToleranceOf([0.65, 0.05, 0.05, 0.05, 0.1, 0.05, 0.05]), 0.035), '7 keys at 0.01: 7 × 0.005');
  assert.ok(near(sumToleranceOf([0.6, 0.1, 0.1, 0.1, 0.1, 0, 0]), 0.35), '7 keys at 0.1: 7 × 0.05');
  assert.ok(near(sumToleranceOf([0.3, 0.6, 0.2]), 0.15), '«2 жеста + нейтраль» of three keys at 0.1');
  assert.equal(sumToleranceOf([0.512345, 0.487655]), SPPPR.sumTolerance, 'full precision');
  assert.equal(sumToleranceOf([0.65, 0.35], { ...SPPPR, roundedDecimals: 0 }), SPPPR.sumTolerance, 'rounding allowance off');
  const refused = [
    [[0.512345, 0.3, 0.1, 0.01, 0.01, 0.01, 0.01], 'full precision, Σ 0.952'],
    [[0.5, 0.2, 0.1, 0.05, 0.03, 0.01, 0.01], '2 decimals, Σ 0.90 — more than 7 × 0.005 away'],
    [[0.5, 0.5, 0.5, 0, 0, 0, 0], '1 decimal, Σ 1.5'],
    [[0.7, 0.3, 0.1, 0.1, 0.1, 0.1, 0], '1 decimal, Σ 1.4 — past 7 × 0.05'],
    [[0, 0, 0, 0, 0, 0, 0], 'nothing'],
  ];
  for (const [p, why] of refused) assert.equal(read(p).error, 'sum', why);
  assert.equal(read([0.7, 0.3, 0.1, 0.1, 0.1, 0, 0]).ok, true, '1 decimal, Σ 1.3: rounding can reach it');
  assert.equal(parseSppprPacket({ timestamp_ms: 2, dist: { neutral: 0.3, flexion: 0.6, extension: 0.2 } }).ok, true, 'three keys at 0.1, Σ 1.1');
  assert.equal(read([1.2, 0, 0, 0, 0, 0, 0]).error, 'value', 'a value outside 0…1 is still refused before the sum');
});

test('09.11: a rounding emulator — every packet taken, the step on the counters, the game plays to ≥ 2★', () => {
  for (const decimals of [1, 2]) {
    const emu = new SppprEmulator({ seed: 5, decimals, rateHz: 10 });
    const dec = new SppprDecoder();
    for (let t = 0, k = 0; t <= 12000; t += 5) {
      if (t % 1500 === 0) emu.setTarget({ gesture: ['flexion', 'rest', 'extension', 'rest', 'pronation', 'rest', 'abduction', 'rest'][k++ % 8], effort: 0.7 });
      for (const { text, at } of emu.pump(t)) {
        const values = Object.values(JSON.parse(text).dist);
        assert.ok(values.every(v => Math.abs(v * 10 ** decimals - Math.round(v * 10 ** decimals)) < 1e-6), `rounded to ${decimals}`);
        dec.push(text, at);
      }
    }
    assert.ok(dec.stats.accepted > 100);
    assert.equal(dec.stats.rejected, 0, `${decimals} decimals: ${JSON.stringify(dec.stats.errors)}`);
    assert.ok(dec.stats.decimals !== null && dec.stats.decimals <= decimals, 'the decoder tells the step');
    const { result, stream } = playStream('grip', { scheme: 'gesture', levelNumber: 3, decimals });
    assert.ok(result.stars >= 2, `grip L3 at ${decimals} decimals: ${result.stars}★ ${result.score}`);
    assert.equal(stream.rejected, 0);
  }
  // By default the emulator is the careful sender of 6.3.0: 0.001 and Σ exactly 1.
  const careful = new SppprEmulator({ seed: 5 });
  careful.setTarget({ gesture: 'flexion', effort: 0.7 });
  const out = [];
  for (let t = 0; t <= 2000; t += 5) for (const { text } of careful.pump(t)) out.push(JSON.parse(text).dist);
  assert.ok(out.length > 10);
  assert.ok(out.every(d => Math.abs(Object.values(d).reduce((s, v) => s + v, 0) - 1) < 1e-9), 'Σ exactly 1 by default');
  // The broken packet of the CLI (--malformed) stays broken past any rounding.
  assert.equal(parseSppprPacket(sppprPacket(1, [0.5, 0.5, 0.5, 0, 0, 0, 0])).error, 'sum');
});

test('09.11: the CLI emulator takes --decimals and says the step in --stats; a wrong value is refused', () => {
  const run = args => spawnSync(process.execPath, [join(root, 'tools/spppr-emulator.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const ok = run(['--fast', '--seconds', '4', '--seed', '3', '--decimals', '2', '--stats']);
  assert.equal(ok.status, 0, ok.stderr);
  const lines = ok.stdout.trim().split('\n').map(l => JSON.parse(l));
  assert.ok(lines.length > 20);
  assert.ok(lines.every(pk => Object.values(pk.dist).every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)));
  assert.match(ok.stderr, /отклонено 0 /);
  assert.match(ok.stderr, /округление до (1 знака|2 знаков)/);
  const bad = run(['--fast', '--seconds', '1', '--decimals', '5']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--decimals: 5/);
});

test('09.11, question 2: the onboarding starts a beginner with the threshold scheme (the experts\' answer) and keeps their own', () => {
  const src = readFileSync(join(root, 'src/ui/onboarding.js'), 'utf8');
  assert.doesNotMatch(src, /Не уверены — выберите «Пропорциональный»/);
  // 6.3.2 — answer 2 of the experts: a beginner starts with the threshold scheme; proportional only on prototypes
  assert.match(src, /начинать с пороговой схемы/);
  assert.match(src, /Если у вашего протеза другая схема, выберите её/);
});

test('09.11, audit: the change of the weekly check is the Agresti–Caffo interval — the false «it changed» stays near 5 %', () => {
  // Exact type I error: both checks of the same skill p, every pair of binomial outcomes weighed by its probability.
  // 6.3.0 compared the raw difference: 14.6 % at 6 trials (p = 0.5), 8.2 % at 8 — the method of the paper keeps ≤ 6.4 %.
  const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  const pmf = (n, k, p) => C(n, k) * p ** k * (1 - p) ** (n - k);
  for (const n of [6, 8, 12]) for (const p of [0.3, 0.5, 0.7, 0.8, 0.9]) {
    let falseChange = 0;
    for (let x1 = 0; x1 <= n; x1++) for (let x2 = 0; x2 <= n; x2++) {
      const change = completionChange({ completionRate: 100 * x1 / n, trials: n }, { completionRate: 100 * x2 / n, trials: n });
      if (change.real) falseChange += pmf(n, x1, p) * pmf(n, x2, p);
    }
    assert.ok(falseChange <= 0.065, `${n} trials, p = ${p}: «it changed» in ${(100 * falseChange).toFixed(1)} % of pairs of one skill`);
  }
  // The examples of the rules: 4 of 8 → 8 of 8 is a change, 5 of 8 → 8 of 8 is not yet.
  assert.equal(completionChange({ completionRate: 50, trials: 8 }, { completionRate: 100, trials: 8 }).real, true);
  assert.equal(completionChange({ completionRate: 63, trials: 8 }, { completionRate: 100, trials: 8 }).real, false);
});

test('09.11, question 6: the share of timed play is shown with and without the rest between exercises', () => {
  const day = { timedS: 300, otherS: 120, restS: 60 };
  assert.equal(Math.round(100 * timedShare(day)), 71);
  assert.equal(Math.round(100 * timedShareWithRest(day)), 63);
  assert.equal(timedShareWithRest({ timedS: 20, otherS: 10, restS: 10 }), null, 'under a minute — nothing to say');
  const t = timeShareOf({ days: { '2026-11-09': day } }, ['2026-11-09']);
  assert.equal(t.share, 71);
  assert.equal(t.shareWithRest, 63);
  // The reference session of the plan (tests/quests.test.mjs): the rest is counted apart, so both numbers come out.
  const ref = referenceSession([75, 75, 75, 75], { restS: SESSION.restBetweenExercisesS });
  assert.ok(ref.shareWithRest < ref.share);
  assert.equal(ref.restS, 3 * SESSION.restBetweenExercisesS);
  const report = readFileSync(join(root, 'src/services/report.js'), 'utf8');
  assert.match(report, /Доля, если считать отдых/);
});
