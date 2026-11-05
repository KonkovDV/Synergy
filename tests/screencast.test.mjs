// 6.2 — the storyboard of the screencast (tools/screencast-plan.mjs): the video is recorded by tools/screencast.mjs with a
// browser and ffmpeg, so `npm test` checks what can be checked without them — the length, every scene played by the tool,
// captions that fit and quote no number by hand, a valid .srt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENES, CHAPTERS, evidenceValues, fill, srt, srtTime, chapterList, plannedSeconds } from '../tools/screencast-plan.mjs';

const tool = readFileSync('tools/screencast.mjs', 'utf8');
// The shape of docs/evidence.json (tools/evidence.mjs) — the plan is checked on its own, as the gesture drill copies code.
const ev = { version: '9.9.9', tests: { total: 1234, failed: 0 }, apk: { kb: 4321 }, a11y: { light: 30, dark: 9, violations: 0 }, layout: { combinations: 999, findings: 0 } };

test('screencast: 75–100 s in scenes of 4 s and more, every scene played by the tool, every chapter named', () => {
  assert.ok(plannedSeconds() >= 75 && plannedSeconds() <= 100, `${plannedSeconds()} s`);
  const acts = [...tool.matchAll(/^ {2}(\w+): async/gm)].map(m => m[1]);
  for (const s of SCENES) {
    assert.ok(s.seconds >= 4, `${s.id}: ${s.seconds} s`);
    assert.ok(acts.includes(s.id), `${s.id}: no action in tools/screencast.mjs`);
    assert.ok(CHAPTERS[s.chapter], `${s.id}: chapter ${s.chapter}`);
  }
  assert.equal(new Set(SCENES.map(s => s.id)).size, SCENES.length, 'scene ids are unique');
  assert.deepEqual(acts.filter(a => !SCENES.some(s => s.id === a)), [], 'no action without a scene');
  // the chapters follow the criteria of the task in one pass: a chapter does not come back later
  const order = SCENES.map(s => s.chapter).filter((c, i, all) => all.indexOf(c) === i);
  for (let i = 1; i < SCENES.length; i++) if (SCENES[i].chapter !== SCENES[i - 1].chapter) assert.ok(order.indexOf(SCENES[i].chapter) > order.indexOf(SCENES[i - 1].chapter), SCENES[i].id);
});

test('screencast: captions fit beside the phone and take their numbers from docs/evidence.json', () => {
  const values = evidenceValues(ev);
  assert.equal(values.tests, ev.tests.total);
  assert.equal(values.apkKb, ev.apk.kb);
  for (const s of SCENES) {
    const title = fill(s.title, values), text = fill(s.text, values), chapter = fill(CHAPTERS[s.chapter], values);
    for (const line of [title, text, chapter]) assert.doesNotMatch(line, /\{\w+\}/, `${s.id}: a placeholder left in «${line}»`);
    assert.ok(title.length <= 60, `${s.id}: title ${title.length} characters`);
    assert.ok(text.length <= 170, `${s.id}: text ${text.length} characters`);
    assert.doesNotMatch(text, / —/, `${s.id}: a dash starts a line (no-break space before it)`);
    // numbers of a build are placeholders, never typed: a count of tests, a size, a number of states
    assert.doesNotMatch(`${s.title} ${s.text}`, /\d{3,}\s*(автотест|тест|КБ|МБ|состояни|сочетани)/, `${s.id}: a number of a build typed by hand`);
  }
  assert.equal(fill('{tests} и {nope}', { tests: 5 }), '5 и {nope}');
});

test('screencast: the subtitles are SubRip — numbered cues, times in order, the title and the text', () => {
  assert.equal(srtTime(0), '00:00:00,000');
  assert.equal(srtTime(65.4321), '00:01:05,432');
  assert.equal(srtTime(3725.5), '01:02:05,500');
  const cues = [{ start: 0, end: 5, title: 'А', text: 'Б', chapter: 'intro', chapterName: 'Синергия' }, { start: 5, end: 11.25, title: 'В', text: 'Г', chapter: 'stream1', chapterName: 'Поток 1' }, { start: 11.25, end: 70, title: 'Д', text: 'Е', chapter: 'stream1', chapterName: 'Поток 1' }];
  assert.equal(srt(cues), '1\n00:00:00,000 --> 00:00:05,000\nА\nБ\n\n2\n00:00:05,000 --> 00:00:11,250\nВ\nГ\n\n3\n00:00:11,250 --> 00:01:10,000\nД\nЕ\n');
  assert.equal(chapterList(cues), '0:00 Синергия\n0:05 Поток 1', 'a chapter is listed once, where it begins');
});
