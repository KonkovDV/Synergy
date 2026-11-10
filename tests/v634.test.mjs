import './pin-tz.mjs'; // the set of the published task — the product's default: this file runs on it whatever the runner chose
// 6.3.4 — the audit before the upload of 11.11: what a person or the jury reads must say what the build does after the
// experts' answers of 07.11 and 09.11. Found by watching the screencast frame by frame and by reading the documents the
// README links against the code:
//   • the settings still explained the stream by the rule of 6.3.1 («жест подтверждает следующий пакет, через 100 мс»)
//     beside a stream line that counts rollbacks — since 6.3.2 the command comes with the first packet (answer 5);
//   • LIMITS.md still called the proportional scheme the default and waited for answers that came on 10.11;
//   • the caption of the screencast named skills the results of «Мастерская» do not show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPPPR } from '../src/config.js';
import { streamRateNote } from '../src/core/spppr.js';
import { DEFAULT_SETTINGS } from '../src/core/storage.js';
import { SCHEME_INFO, SKILL_NAME } from '../src/core/vocabulary.js';
import { GAME_BY_ID } from '../src/games/registry.js';
import { SCENES } from '../tools/screencast-plan.mjs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('6.3.4 answer 5: the settings explain the stream by the decoder\'s own rule — the first packet, a rollback', () => {
  assert.equal(SPPPR.dwellMs, 0, 'the command on the first packet (answer 5 of the experts, 09.11)');
  const now = streamRateNote();
  assert.match(now, /с первым же пакетом/);
  assert.match(now, /откат/, 'the word of the stream line («откатов N»)');
  assert.doesNotMatch(now, /подтверждает следующий пакет|не становится командой/, 'the rule of 6.3.1');
  // a decoder set to a dwell says the dwell: the words follow the parameter, they are not typed twice
  assert.match(streamRateNote({ ...SPPPR, dwellMs: 50 }), /держится 50 мс/);
  const settings = read('src/ui/settings.js');
  assert.match(settings, /streamRateNote\(\)/);
  assert.doesNotMatch(settings, /жест подтверждает следующий пакет/);
});

test('6.3.4: the documents the README links do not wait for answers that have come, and name the default scheme of the build', () => {
  const current = ['README.md', 'LIMITS.md', 'docs/TZ_COMPLIANCE.md', 'docs/INTEGRATION.md', 'ios/README.md', 'submission/README.md', 'submission/TECH_DOCS.md'];
  for (const doc of current) {
    const text = read(doc);
    assert.doesNotMatch(text, /вопрос\s+\d+\s+чек-пойнта\s+09\.11|до ответа имя поля/, `${doc}: an open question of the checkpoint of 09.11 — the answers came on 10.11 (docs/TASK.md)`);
  }
  const limits = read('LIMITS.md');
  const scheme = SCHEME_INFO[DEFAULT_SETTINGS.scheme].name.toLowerCase().replace(/ый$/, 'ая');
  assert.match(limits, new RegExp(`Схема по умолчанию — ${scheme}`), `LIMITS.md names the default scheme of src/core/storage.js (${DEFAULT_SETTINGS.scheme})`);
  for (const other of Object.keys(SCHEME_INFO).filter(id => id !== DEFAULT_SETTINGS.scheme && id !== 'gesture')) {
    assert.doesNotMatch(limits, new RegExp(`Схема по умолчанию — ${SCHEME_INFO[other].name.toLowerCase().replace(/ый$/, 'ая')}\\.`), 'no second default');
  }
  // the compliance table: the stream's command and the rest advice as the build has them since 6.3.2
  const tz = read('docs/TZ_COMPLIANCE.md');
  assert.doesNotMatch(tz, /одиночный пакет никогда не становится командой/, 'answer 5: the command comes with the first packet');
  assert.doesNotMatch(tz, /с пиком на 25 % ниже первых двух[^|]*— признак усталости: «Пора отдохнуть»/, 'answer 7в: no rest advice from a falling peak');
});

test('6.3.4 screencast: the caption of the results names the skills the played game shows', () => {
  const results = SCENES.find(s => s.id === 'results');
  const shown = GAME_BY_ID.grip.skills.map(id => SKILL_NAME[id].toLowerCase());
  const named = Object.values(SKILL_NAME).map(n => n.toLowerCase()).filter(n => results.text.toLowerCase().includes(n));
  assert.ok(named.length >= 3, `the caption names skills: ${named}`);
  for (const n of named) assert.ok(shown.includes(n), `«${n}» is not a skill of «Мастерская» (${shown.join(', ')})`);
});
