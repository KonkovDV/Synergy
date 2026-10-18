// Pre-submission gate: the documents must describe the product that is actually in the archive.
// Usage: npm run check:submission            — strict (before upload to the platform)
//        node tools/check-submission.mjs --draft — CI: AUTHORS.md may still be a draft (warning)
//        --no-tests — skip running the suite (only for the gate's own test: tests/submission.test.mjs)
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { NUMBER_DOCS } from './number-docs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const draft = process.argv.includes('--draft');
const runTests = !process.argv.includes('--no-tests');
const read = f => readFileSync(join(root, f), 'utf8');
const errors = [], warnings = [];
const fail = m => errors.push(m), warn = m => warnings.push(m);

// 1. Versions agree everywhere.
const version = JSON.parse(read('package.json')).version;
const appVersion = read('src/config.js').match(/version: '([^']+)'/)?.[1];
const apkVersion = read('android/AndroidManifest.xml').match(/versionName="([^"]+)"/)?.[1];
const changelog = read('CHANGELOG.md').match(/^## (\S+)/m)?.[1];
for (const [name, v] of [['src/config.js', appVersion], ['AndroidManifest.xml', apkVersion], ['CHANGELOG.md', changelog]]) if (v !== version) fail(`версия ${name} = ${v}, package.json = ${version}`);
const apk = join(root, 'release', `Synergy-${version}.apk`);
if (!existsSync(apk)) fail(`нет release/Synergy-${version}.apk`);
if (!existsSync(join(root, 'release/synergy-standalone.html'))) fail('нет release/synergy-standalone.html');
const stale = readdirSync(join(root, 'release')).filter(f => f.endsWith('.apk') && f !== `Synergy-${version}.apk`);
if (stale.length) fail(`старые APK в release/: ${stale.join(', ')}`);

// 2. Numbers quoted in the pitch documents match reality (no \b after Cyrillic: it is ASCII-only, PLAN C.1.1).
let tests = null;
if (runTests) {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(root, 'tests', f))], { cwd: root, encoding: 'utf8' });
  tests = Number(run.stdout.match(/^# tests (\d+)/m)?.[1] ?? 0);
  const failed = Number(run.stdout.match(/^# fail (\d+)/m)?.[1] ?? 0);
  if (failed || run.status !== 0) fail(`тесты падают: ${failed || 'см. npm test'}`);
}
const apkKb = existsSync(apk) ? Math.round(statSync(apk).size / 1024) : null;
for (const doc of NUMBER_DOCS) {
  const text = read(doc);
  if (tests !== null) for (const m of text.matchAll(/(\d+)\s+(?:авто)?тест(?:а|ов)?(?![а-яёa-z])/gi)) if (Number(m[1]) !== tests) fail(`${doc}: «${m[0]}», а тестов ${tests}`);
  for (const m of text.matchAll(/APK[^\n|]{0,24}?(\d+)\s*КБ/g)) if (apkKb !== null && Math.abs(Number(m[1]) - apkKb) > 2) fail(`${doc}: «${m[0]}», а APK ${apkKb} КБ`);
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
// Build outputs must not be tracked: the archive excludes them and the receiver rebuilds (dist/ hole of 5.1.0).
const builds = tracked.filter(f => /^(dist|android\/build|node_modules|tools\/\.cache)\//.test(f));
if (builds.length) fail(`артефакты сборки в git (${builds.length}, напр. ${builds[0]}): git rm -r --cached`);
const missing = tracked.filter(f => !existsSync(join(root, f)));
if (missing.length) warn(`в git, но нет на диске: ${missing.length} (напр. ${missing[0]})`);

// 3. Wording: no overstated claims in texts the jury or users read (code identifiers like predict() are fine).
// Cyrillic needs explicit classes: \w in JS regexes is ASCII-only.
const W = '[а-яёa-z]*';
const BANNED = [
  [new RegExp(`предсказыва${W} (перенос|управлени)|перенос${W}[^.\\n]{0,60}предсказыва`, 'i'), '«предсказывает перенос» — говорить «игровая метрика, которую исследование связывало с переносом»'],
  [/predicts? transfer/i, '«predicts transfer» — «linked to transfer»'],
  [new RegExp(`лучш${W} признак${W} переноса`, 'i'), '«лучший признак переноса»'],
  [new RegExp(`(главн|основн)${W} «?клиническ${W}»? индикатор`, 'i'), '«клинический индикатор» — у игры нет клинической валидации'],
  [new RegExp(`перенос${W} (на протез )?доказан(?!\\?)`, 'i'), '«перенос доказан»'],
  // Fact-check 17.10.2026: the abstracts do not say this (Dupan 2025 — delayed feedback, transfer after training).
  [new RegExp(`без живой (обратной связи|подсказки) был${W} связан${W}`, 'i'), '«попытки без подсказки были связаны с протезом» — не подтверждено: «метрика удержания»'],
  [/до 44\s*%/i, '«до 44 %» — у Salminger ровно 44 % в выборке из 25 ответивших'],
  // External audit 18.10.2026: a game metric is not «Fitts' law measured»; automated checks are not «compliance».
  [new RegExp(`(пропускн${W} способност${W} по закону Фиттса|измерил${W} закон${W} Фиттса)`, 'i'), '«по закону Фиттса» — говорить «игровая пропускная способность по мотивам теста Фиттса»'],
  [new RegExp(`(приложени${W}|игра|продукт|Синерги${W})»? (полностью )?соответству${W} WCAG`, 'i'), '«соответствует WCAG» — без ручной проверки со скринридером говорить «ориентир WCAG 2.2, автоматические проверки»'],
];
// Everything the jury or a user may read, except the frozen v3 snapshot and this file (it quotes the patterns).
const textFiles = tracked.filter(f => /\.(md|js|mjs|html|py)$/.test(f) && !/^legacy\//.test(f) && f !== 'tools/check-submission.mjs' && existsSync(join(root, f)));
for (const f of textFiles) {
  const lines = read(f).split('\n');
  lines.forEach((line, i) => { for (const [re, why] of BANNED) if (re.test(line)) fail(`${f}:${i + 1}: ${why}`); });
}

const { GESTURE_IDS } = await import(pathToFileURL(join(root, 'src/core/vocabulary.js')).href);
// Python cannot import vocabulary.js: its class lists (order = class index) must mirror it (PLAN C.3, step 6).
for (const f of ['lab/lab7.py', 'bridge/ws_bridge.py'].filter(f => existsSync(join(root, f)))) {
  const list = read(f).match(/^GESTURES\s*=\s*[[(]([^\])]*)[\])]/m)?.[1];
  const ids = list ? [...list.matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
  if (ids.join() !== GESTURE_IDS.join()) fail(`${f}: GESTURES (${ids.join(', ')}) ≠ vocabulary.js (${GESTURE_IDS.join(', ')}) — порядок = индексы классов`);
}

// 3a. The gesture set: «состав — гипотеза» in the documents until the organizers publish their 7 gestures,
// then the published set is recorded in MEMORY.md and must be exactly the set in vocabulary.js (PLAN C.3).
const gestureLine = read('MEMORY.md').match(/^Набор жестов организатора:\s*(.+)$/m)?.[1]?.trim();
const hypothesis = new RegExp(`состав${W}[^.\n]{0,120}гипотез`, 'i');
const hypothesisDocs = ['docs/JURY_STRATEGY.md', 'docs/TASK.md'].filter(f => existsSync(join(root, f)) && hypothesis.test(read(f)));
if (!gestureLine) warn('MEMORY.md: нет строки «Набор жестов организатора: …» (до 28.10 — «не опубликован»)');
else if (/^не опубликован/i.test(gestureLine)) {
  if (!hypothesisDocs.includes('docs/JURY_STRATEGY.md')) fail('набор жестов не опубликован, а docs/JURY_STRATEGY.md не называет состав гипотезой');
} else {
  for (const f of hypothesisDocs) fail(`${f}: состав 7 жестов назван гипотезой, а набор организатора уже записан в MEMORY.md`);
  const published = gestureLine.split(/[\s,;]+/).filter(Boolean);
  if ([...published].sort().join() !== [...GESTURE_IDS].sort().join()) fail(`vocabulary.js (${GESTURE_IDS.join(', ')}) ≠ набор организатора в MEMORY.md (${published.join(', ')})`);
}

// 3b. Documents name the current release (README kept «Synergy-5.0.0.apk» and a 5.0.0 badge through 5.2.0).
for (const f of textFiles.filter(f => f.endsWith('.md') && f !== 'CHANGELOG.md')) {
  for (const m of read(f).matchAll(/Synergy-(\d+\.\d+\.\d+)\.apk|версия-(\d+\.\d+\.\d+)/g)) if ((m[1] ?? m[2]) !== version) fail(`${f}: «${m[0]}», а версия ${version}`);
}

// 3c. Promises the product makes in its own metadata (5.7): the intended purpose is a training game, not a medical
// device (323-ФЗ ст. 38 — the manufacturer's labelling counts), and the screen is not locked to one orientation
// (WCAG 2.1 AA, 1.3.4 — a phone fixed on a wheelchair mount may be landscape).
const manifest = JSON.parse(read('public/manifest.webmanifest'));
if ((manifest.categories ?? []).includes('medical')) fail('public/manifest.webmanifest: категория «medical» противоречит позиционированию «не медицинское изделие» (docs/LEGAL.md)');
if (manifest.orientation && !/^(any|natural)$/.test(manifest.orientation)) fail(`public/manifest.webmanifest: ориентация «${manifest.orientation}» заблокирована (WCAG 1.3.4)`);
if (/android:screenOrientation="(portrait|landscape|sensorPortrait|sensorLandscape|userPortrait|userLandscape)"/.test(read('android/AndroidManifest.xml'))) fail('android/AndroidManifest.xml: ориентация заблокирована (WCAG 1.3.4)');

// 4. Rights and submission hygiene (Правила, п. 5.5, 6.6).
if (/_заполнить_/.test(read('AUTHORS.md'))) (draft ? warn : fail)('AUTHORS.md не заполнен (ФИО и вклад — п. 6.6)');
if (/\b(MIT License|Apache License|GNU General Public|Creative Commons)\b/i.test(read('LICENSE'))) fail('LICENSE открытый — конфликт с отчуждением права (п. 6.6)');
if (tracked.some(f => /\.(keystore|jks)$/.test(f))) fail('ключ подписи в репозитории');
if (tracked.some(f => /customer\/rules\./.test(f))) fail('текст правил организатора в репозитории (п. 5.5) — только ссылка и цитаты в docs/TASK.md');
const firstCommit = execFileSync('git', ['log', '--reverse', '--format=%cs', '--max-parents=0'], { cwd: root, encoding: 'utf8' }).trim().split('\n')[0];
if (firstCommit < '2026-10-28') warn(`первый коммит ${firstCommit} раньше старта разработки 28.10 — раскрыто в docs/TASK.md; ответ организатора на вопрос PLAN 0.6 записать в MEMORY.md`);

for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
const errorsWord = n => (n % 10 === 1 && n % 100 !== 11 ? 'ошибка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'ошибки' : 'ошибок');
console.log(errors.length ? `Не готово к сдаче: ${errors.length} ${errorsWord(errors.length)}`
  : warnings.length ? `Черновик без ошибок, предупреждений: ${warnings.length} (тестов ${tests ?? '—'}, APK ${apkKb} КБ, версия ${version})`
  : `Готово к сдаче (тестов ${tests ?? '—'}, APK ${apkKb} КБ, версия ${version})`);
process.exit(errors.length ? 1 : 0);
