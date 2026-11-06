// The findings of the audit of 06.11.2026 (docs/AUDIT.md §57): each one is a test that failed on the code before its fix. Runs on every gesture set (npm run test:ubi4, test:tz): nothing here names a gesture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGNAL } from '../src/config.js';
import { responseMs, latencyNote } from '../src/core/signal.js';
import { PIN_LOCK, pinLockWait, clampPinLock, nextPinLock } from '../src/ui/pin.js';
import { GAME_BY_ID } from '../src/games/registry.js';
import { SCREENS } from '../src/ui/screens.js';
import { artBackground } from '../src/ui/pictures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('audit F2: a lock from a clock that went back (or from a copy) is at most PIN_LOCK.maxS, then it runs out', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const year = 365 * 86400 * 1000;
  // A phone set to 2027 failed the PIN five times, then its clock was corrected: the lock ended a year «later».
  const far = { fails: 9, until: now + year };
  assert.ok(pinLockWait(far, now) <= PIN_LOCK.maxS, `wait ${pinLockWait(far, now)} s`);
  const clamped = clampPinLock(far, now);
  assert.equal(clamped.until, now + PIN_LOCK.maxS * 1000, 'the brake starts again from now, it is not lifted');
  assert.equal(clamped.fails, 9, 'the count of failed tries stays');
  assert.equal(pinLockWait(clamped, now + PIN_LOCK.maxS * 1000), 0, 'and it runs out like any lock');
  // An ordinary lock is not touched: the same object, so nothing is saved.
  const lock = nextPinLock({ fails: PIN_LOCK.freeTries, until: 0 }, false, now);
  assert.equal(clampPinLock(lock, now), lock);
  assert.deepEqual(clampPinLock({ fails: 0, until: 0 }, now), { fails: 0, until: 0 });
  // The gate keeps the clamped lock, so the wait it shows counts down.
  assert.match(read('src/ui/pin.js'), /clampPinLock\(app\.settings\.pinLock\)/);
});

test('audit F3: the response the settings show is measured on the pipeline at the person\'s own parameters', () => {
  // The defaults are the numbers README quotes: 17 ms at 60 frames a second, 33 ms at 30.
  const at60 = responseMs({}, { hz: 60 }), at30 = responseMs({}, { hz: 30 });
  assert.ok(at60 !== null && at60 <= 20, `60 Hz: ${at60} ms`);
  assert.ok(at30 !== null && at30 <= 34, `30 Hz: ${at30} ms`);
  assert.ok(responseMs({ holdMs: SIGNAL.holdMs + 100 }) > at60 + 90, 'the hold time adds up');
  assert.ok(responseMs({ smoothingMs: 150 }) > responseMs({ smoothingMs: 10 }), 'a longer smoothing answers later');
  assert.ok(responseMs({ holdMs: 300 }) > 100, 'the longest hold is over the task\'s 100 ms');
  assert.equal(responseMs({ onThreshold: 0.45 }, { level: 0.3 }), null, 'a contraction under the line is no command at all');
  const ok = latencyNote({});
  assert.equal(ok.over, false);
  assert.match(ok.text, /17 мс при 60 Гц, 33 мс при 30 Гц/);
  assert.match(ok.text, /100 мс/);
  const slow = latencyNote({ holdMs: 200 });
  assert.equal(slow.over, true);
  assert.match(slow.text, /больше 100 мс/);
  assert.match(slow.text, /удержани/);
  // The note follows the sliders: settings.js paints it again on every change, not once when the screen was built.
  const settings = read('src/ui/settings.js');
  assert.doesNotMatch(settings, /сейчас удержание \$\{/, 'the text built once said the hold of the moment the screen opened');
  assert.match(settings, /latencyNote\(/);
  assert.match(settings, /function paintLatency/);
  assert.match(settings, /refreshPreview = \(\) => \{[^\n]*paintLatency\(\)/);
});

test('audit F4: «Полёт» does not promise a bird — the egg and the chick leave the flight to the glider', () => {
  const flight = GAME_BY_ID.flight;
  for (const line of [...flight.how, ...flight.howGesture()]) assert.doesNotMatch(line, /птиц/i, line);
  assert.ok(flight.how.some(l => /выше/.test(l)) && flight.how.some(l => /ниже/.test(l)), 'up and down are still said');
});

test('audit F6: a screen name from Object.prototype is not a screen', () => {
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) assert.equal(SCREENS[name], undefined, name);
  assert.equal(typeof SCREENS.home, 'function');
});

test('audit F7: the nest room is an absolute address — a relative one was read against styles/ in the source build', () => {
  const doc = globalThis.document;
  try {
    globalThis.document = { baseURI: 'http://127.0.0.1:8080/', documentElement: { dataset: {} } };
    assert.equal(artBackground('bg-nest-room'), 'url("http://127.0.0.1:8080/public/art/bg-nest-room.webp")');
    globalThis.document = { baseURI: 'file:///android_asset/www/index.html', documentElement: { dataset: { build: 'dist' } } };
    assert.equal(artBackground('bg-nest-room'), 'url("file:///android_asset/www/art/bg-nest-room.webp")');
    globalThis.SYNERGY_ART = { 'bg-nest-room': 'data:image/webp;base64,AAAA' }; // the one-file build keeps its data URI
    assert.equal(artBackground('bg-nest-room'), 'url("data:image/webp;base64,AAAA")');
  } finally {
    globalThis.document = doc;
    delete globalThis.SYNERGY_ART;
  }
});

test('audit F1: the page decoration covers the whole page, not the first screen of it', () => {
  const css = read('styles/app.css');
  assert.doesNotMatch(css, /html, body \{[^}]*\bheight: 100%/, 'a body one screen tall clipped its fixed gradients when the page scrolled');
  assert.match(css, /body \{ min-height: 100% \}/);
  const layer = css.match(/body \{\n  background:[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(layer, /background-size: 100% 100vh/);
  assert.match(layer, /background-repeat: no-repeat/);
});
