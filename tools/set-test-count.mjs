// Writes the current number of tests into the documents the submission gate checks, with the right
// Russian plural («1 тест», «2 теста», «5 тестов»). Usage: node tools/set-test-count.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = ['README.md', 'docs/JURY_STRATEGY.md', 'docs/AI_USAGE.md', 'MEMORY.md']; // same list as tools/check-submission.mjs
const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(root, 'tests', f));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8' });
const n = Number(run.stdout.match(/^# tests (\d+)/m)?.[1]);
if (!n) { console.error('Не удалось посчитать тесты'); process.exit(1); }
const word = n % 10 === 1 && n % 100 !== 11 ? 'тест' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'теста' : 'тестов';
for (const doc of DOCS) {
  const path = join(root, doc), text = readFileSync(path, 'utf8');
  writeFileSync(path, text.replace(/\b\d+(\s+)(авто)?тест(?:а|ов)?(?![а-яёa-z])/gi, (_, space, auto) => `${n}${space}${auto ?? ''}${word}`));
}
console.log(`Тестов: ${n} → ${DOCS.join(', ')}`);
