// Pre-submission gate: the documents must describe the product that is actually in the archive.
// Usage: npm run check:submission            — strict (before upload to the platform)
//        node tools/check-submission.mjs --draft — CI: AUTHORS.md may still be a draft (warning)
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const draft = process.argv.includes('--draft');
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

// 2. Numbers quoted in the pitch documents match reality.
const tap = execFileSync(process.execPath, ['--test', ...readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(root, 'tests', f))], { encoding: 'utf8' });
const tests = Number(tap.match(/^# tests (\d+)/m)?.[1]), failed = Number(tap.match(/^# fail (\d+)/m)?.[1]);
if (failed) fail(`тесты падают: ${failed}`);
const apkKb = existsSync(apk) ? Math.round(statSync(apk).size / 1024) : null;
for (const doc of ['README.md', 'docs/JURY_STRATEGY.md', 'MEMORY.md']) {
  const text = read(doc);
  for (const m of text.matchAll(/(\d+)\s+(?:авто)?тест(?:а|ов)?\b/g)) if (Number(m[1]) !== tests) fail(`${doc}: «${m[0]}», а тестов ${tests}`);
  for (const m of text.matchAll(/APK[^\n|]{0,24}?(\d+)\s*КБ/g)) if (apkKb !== null && Math.abs(Number(m[1]) - apkKb) > 2) fail(`${doc}: «${m[0]}», а APK ${apkKb} КБ`);
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');

// 3. Wording: no overstated claims in texts the jury or users read (code identifiers like predict() are fine).
const BANNED = [
  [/предсказыва\w* (перенос|управлени)/i, '«предсказывает перенос» — говорить «игровая метрика, которую исследование связывало с переносом»'],
  [/predicts? transfer/i, '«predicts transfer» — «linked to transfer»'],
  [/лучш\w* признак\w* переноса/i, '«лучший признак переноса»'],
  [/(главн|основн)\w* «?клиническ\w*»? индикатор/i, '«клинический индикатор» — у игры нет клинической валидации'],
  [/перенос\w* (на протез )?доказан(?!\?)/i, '«перенос доказан»'],
];
const textFiles = tracked.filter(f => /\.(md|js|mjs|html)$/.test(f) && !/^(legacy|lab)\//.test(f) && !['CHANGELOG.md', 'tools/check-submission.mjs'].includes(f));
for (const f of textFiles) {
  const lines = read(f).split('\n');
  lines.forEach((line, i) => { for (const [re, why] of BANNED) if (re.test(line)) fail(`${f}:${i + 1}: ${why}`); });
}

// 4. Rights and submission hygiene (Правила, п. 5.5, 6.6).
if (/_заполнить_/.test(read('AUTHORS.md'))) (draft ? warn : fail)('AUTHORS.md не заполнен (ФИО и вклад — п. 6.6)');
if (/\b(MIT License|Apache License|GNU General Public|Creative Commons)\b/i.test(read('LICENSE'))) fail('LICENSE открытый — конфликт с отчуждением права (п. 6.6)');
if (tracked.some(f => /\.(keystore|jks)$/.test(f))) fail('ключ подписи в репозитории');
if (tracked.some(f => /customer\/rules\./.test(f))) fail('текст правил организатора в репозитории (п. 5.5) — только ссылка и цитаты в docs/TASK.md');
const firstCommit = execFileSync('git', ['log', '--reverse', '--format=%cs', '--max-parents=0'], { cwd: root, encoding: 'utf8' }).trim().split('\n')[0];
if (firstCommit < '2026-10-28') warn(`первый коммит ${firstCommit} раньше старта разработки 28.10 — раскрыто в docs/TASK.md; ответ организатора на вопрос PLAN 0.3.4 записать в MEMORY.md`);

for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(errors.length ? `Не готово к сдаче: ${errors.length} ошибок`
  : warnings.length ? `Черновик без ошибок, предупреждений: ${warnings.length} (тестов ${tests}, APK ${apkKb} КБ, версия ${version})`
  : `Готово к сдаче (тестов ${tests}, APK ${apkKb} КБ, версия ${version})`);
process.exit(errors.length ? 1 : 0);
