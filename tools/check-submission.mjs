// Pre-submission gate: the documents must describe the product that is actually in the archive.
// Usage: npm run check:submission            — strict (before upload to the platform)
//        node tools/check-submission.mjs --draft — CI: AUTHORS.md may still be a draft (warning)
//        --no-tests — skip running the suite (only for the gate's own test: tests/submission.test.mjs)
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { NUMBER_DOCS, RUN_DOCS } from './number-docs.mjs';
import { apkSigner } from './apk-signer.mjs';
import { checkSupplyChain } from './supply-chain.mjs';

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
// 5.29: CITATION.cff still said 5.11.0 (18.10) at 5.28.0 — the citation metadata names the release too.
const citation = read('CITATION.cff').match(/^version:\s*["']?([^\s"']+)/m)?.[1];
// 5.30: the iPhone app carries the version and the build number of the APK.
const iosVersion = existsSync(join(root, 'ios/project.yml')) ? read('ios/project.yml').match(/MARKETING_VERSION: "([^"]+)"/)?.[1] : version;
for (const [name, v] of [['src/config.js', appVersion], ['AndroidManifest.xml', apkVersion], ['CHANGELOG.md', changelog], ['CITATION.cff', citation], ['ios/project.yml', iosVersion]]) if (v !== version) fail(`версия ${name} = ${v}, package.json = ${version}`);
const iosBuild = existsSync(join(root, 'ios/project.yml')) ? read('ios/project.yml').match(/CURRENT_PROJECT_VERSION: "(\d+)"/)?.[1] : null;
const apkBuild = read('android/AndroidManifest.xml').match(/versionCode="(\d+)"/)?.[1];
if (iosBuild && iosBuild !== apkBuild) fail(`номер сборки ios/project.yml = ${iosBuild}, versionCode APK = ${apkBuild}`);
const apk = join(root, 'release', `Synergy-${version}.apk`);
if (!existsSync(apk)) fail(`нет release/Synergy-${version}.apk`);
if (!existsSync(join(root, 'release/synergy-standalone.html'))) fail('нет release/synergy-standalone.html');
// The APK users install must carry the team's key: the debug key's password is in tools/build-apk.sh, so anyone
// could sign an «update» that inherits the app's data (5.10, Red Team C-1). A draft may still carry it.
if (existsSync(apk)) {
  const sig = apkSigner(apk);
  if (!sig.signed) fail(`release/Synergy-${version}.apk не подписан`);
  else if (sig.debug) (draft ? warn : fail)(`APK подписан отладочным ключом — для раздачи соберите релиз с ключом команды (release.yml, секреты KEYSTORE_*)`);
}
// 5.27: a fresh clone has no release/ at all — report the missing files above, do not crash on reading the folder.
const stale = existsSync(join(root, 'release')) ? readdirSync(join(root, 'release')).filter(f => f.endsWith('.apk') && f !== `Synergy-${version}.apk`) : [];
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

// 2a. docs/evidence.json (5.17) — one source for the numbers of the README table: this version, this APK, these tests.
{
  const { renderTable, readmeBlock } = await import(pathToFileURL(join(root, 'tools/evidence.mjs')).href);
  const ev = existsSync(join(root, 'docs/evidence.json')) ? JSON.parse(read('docs/evidence.json')) : null;
  if (!ev) fail('нет docs/evidence.json — node tools/evidence.mjs');
  else {
    if (ev.version !== version) fail(`docs/evidence.json: версия ${ev.version}, а ${version} — node tools/evidence.mjs`);
    if (tests !== null && ev.tests?.total !== tests) fail(`docs/evidence.json: тестов ${ev.tests?.total}, а ${tests} — node tools/evidence.mjs`);
    // 5.27: CI rebuilds the APK with its own throwaway debug key, so its bytes never equal the team's build the
    // evidence names — in a draft (CI) that is a warning; the strict gate before the upload still refuses it.
    if (existsSync(apk) && ev.apk?.sha256 !== createHash('sha256').update(readFileSync(apk)).digest('hex')) (draft ? warn : fail)('docs/evidence.json: APK другой сборки — node tools/evidence.mjs');
    // 5.29 — the browser checks must have run on this code: 5.28.0 quoted the axe run of 5.27 while its own e2e stopped.
    const { sourceFingerprint } = await import(pathToFileURL(join(root, 'tools/evidence.mjs')).href);
    const code = sourceFingerprint(root);
    for (const [key, how] of [['a11y', 'npm run e2e:a11y'], ['layout', 'npm run audit:layout']]) {
      if (!ev[key]) continue;
      if (!ev[key].source) warn(`docs/evidence.json: у «${key}» нет отпечатка кода — повторите ${how}, затем node tools/evidence.mjs`);
      else if (ev[key].source !== code) (draft ? warn : fail)(`docs/evidence.json: «${key}» снят на другом коде — повторите ${how}, затем node tools/evidence.mjs`);
    }
    const block = readmeBlock(read('README.md'));
    if (block === null) fail('README.md: нет таблицы <!-- evidence:begin --> … <!-- evidence:end -->');
    else if (block !== renderTable(ev).trim()) fail('README.md: таблица «Главное» расходится с docs/evidence.json — node tools/evidence.mjs');
    // 5.20 — the pitch and the jury strategy quoted 28 light states and a layout run of 5.11 while the table said 31
    // and 62: the counts of the axe and layout runs come from the same evidence wherever they are quoted.
    for (const doc of RUN_DOCS) {
      const text = read(doc);
      if (ev.a11y) for (const m of text.matchAll(/(\d+)\s+(?:состояни[а-яё]*\s+экранов\s+светлой\s+темы|светл[а-яё]*)\s+и\s+(\d+)\s+тёмн/gi)) {
        if (Number(m[1]) !== ev.a11y.light || Number(m[2]) !== ev.a11y.dark) fail(`${doc}: «${m[0]}», а axe — ${ev.a11y.light} светлых и ${ev.a11y.dark} тёмных (docs/evidence.json)`);
      }
      if (ev.layout) for (const m of text.matchAll(/(\d+)\s+состояни[а-яё]*\s+×\s+(\d+)\s+экран/g)) {
        if (Number(m[1]) !== ev.layout.states || Number(m[2]) !== ev.layout.viewports) fail(`${doc}: «${m[0]}», а линтер раскладки — ${ev.layout.states} × ${ev.layout.viewports} (docs/evidence.json)`);
      }
    }
  }
}

// -z: without it git quotes names outside ASCII («"docs/\320…md"»), and such a file escaped every check below.
// -t: «S» marks a file the sparse checkout of the archive left out on purpose (tools/pack.sh) — it is not missing.
const tracked = execFileSync('git', ['ls-files', '-z', '-t'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter(e => !e.startsWith('S ')).map(e => e.slice(2));
// Build outputs must not be tracked: the archive excludes them and the receiver rebuilds (dist/ hole of 5.1.0).
// 5.17: the release APK and HTML too — built by tools/build-apk.sh, carried by the archive, ≈ 4 MB of history a release.
const builds = tracked.filter(f => /^(dist|android\/build|node_modules|tools\/\.cache)\//.test(f) || /^release\/.*\.(apk|html)$/.test(f));
if (builds.length) fail(`артефакты сборки в git (${builds.length}, напр. ${builds[0]}): git rm -r --cached`);
const missing = tracked.filter(f => !existsSync(join(root, f)));
if (missing.length) warn(`в git, но нет на диске: ${missing.length} (напр. ${missing[0]})`);
// 5.31 — the organizer's materials (the meetup deck: logos, photos and video of people) are not part of the product.
const foreign = tracked.filter(f => /\.(pptx|mp4|mov)$/i.test(f));
if (foreign.length) warn(`материалы не для продукта в git: ${foreign.length} (напр. ${foreign[0]}) — tools/pack.sh не берёт их в архив; перед сдачей решите, оставить ли их в репозитории (п. 5.5)`);

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
  // 5.19 — the rule of the team's MicroPhoenix plan: a grade of one's own product only beside a measured report.
  // «SOTA» as the state of research («SOTA на октябрь 2026») stays; «SOTA-решение» about ourselves does not.
  [new RegExp(`SOTA-(решени|продукт|игр|приложени|уровн)|(решени${W}|продукт${W}|игр${W}|приложени${W}) уровня SOTA`, 'i'), '«SOTA-решение» о себе — назвать измеренное: тесты, axe, линтер (docs/evidence.json)'],
  // «10/10» as a count of checks («встраивание — 10/10») is a measurement; as a grade it is not.
  [new RegExp(`production[- ]ready|(оценк${W}|качеств${W}|уровн${W})[^.\\n]{0,15}\\b10\\s*/\\s*10\\b`, 'i'), '«production-ready», «качество 10/10» — у нас прототип геймджема; оценки — только из измеренных отчётов'],
  [new RegExp(`лучш${W} в мире|не име${W} аналогов|аналогов нет`, 'i'), '«лучший в мире», «аналогов нет» — у «Моторики» и Coapt есть свои игры (docs/RESEARCH.md §9, §11)'],
  [new RegExp(`клинически (доказан|подтвержд|проверен)${W}`, 'i'), '«клинически доказано» — клинической проверки не было (LIMITS.md)'],
];
// Everything the jury or a user may read, except the frozen v3 snapshot and this file (it quotes the patterns).
const textFiles = tracked.filter(f => /\.(md|js|mjs|html|py)$/.test(f) && !/^legacy\//.test(f) && f !== 'tools/check-submission.mjs' && existsSync(join(root, f)));
for (const f of textFiles) {
  const lines = read(f).split('\n');
  lines.forEach((line, i) => { for (const [re, why] of BANNED) if (re.test(line)) fail(`${f}:${i + 1}: ${why}`); });
}

// 3b (5.19). Field results come from sessions only (docs/USABILITY_PROTOCOL.md §6): every row of a results table
// names its session (S1…), participant (P1…) or hypothesis (H1…) — a number without one is an invented number.
if (existsSync(join(root, 'docs/USABILITY_RESULTS.md'))) {
  read('docs/USABILITY_RESULTS.md').split('\n').forEach((line, i) => {
    const cells = line.trim().startsWith('|') ? line.split('|').slice(1, -1).map(c => c.trim()) : null;
    if (!cells || cells.every(c => /^:?-{3,}:?$/.test(c)) || ['Сессия', 'Участник', 'Гипотеза'].includes(cells[0])) return;
    if (!/^[SPH]\d+\b/.test(cells[0])) fail(`docs/USABILITY_RESULTS.md:${i + 1}: строка без ссылки на сессию, участника или гипотезу (S1, P1, H1)`);
  });
}

// 5.29: two gesture sets; the submitted product starts in the default one, so the lists are checked against it — whatever
// SYNERGY_GESTURE_SET the shell has (the suite runs once per set).
const { GESTURE_SETS } = await import(pathToFileURL(join(root, 'src/core/vocabulary.js')).href);
const { DEFAULT_GESTURE_SET } = await import(pathToFileURL(join(root, 'src/core/gesture-set.js')).href);
const GESTURE_IDS = GESTURE_SETS[DEFAULT_GESTURE_SET].gestures.map(g => g.id);
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
  // 5.21: «Границы «Синергии» 5.20.0» stayed in the title of LIMITS.md one release after it changed.
  for (const m of read(f).matchAll(/Synergy-(\d+\.\d+\.\d+)\.apk|версия-(\d+\.\d+\.\d+)|«Синерги[ия]» (\d+\.\d+\.\d+)/g)) if ((m[1] ?? m[2] ?? m[3]) !== version) fail(`${f}: «${m[0]}», а версия ${version}`);
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
// 5.29 — supply chain: actions by SHA, no install scripts, cooldown, exact versions, hashes (tools/supply-chain.mjs).
for (const m of checkSupplyChain(root)) fail(`цепочка поставки: ${m}`);
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
