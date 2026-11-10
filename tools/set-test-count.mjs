// Writes the current number of tests into the documents the submission gate checks, with the right
// Russian plural («1 тест», «2 теста», «5 тестов»). Usage: node tools/set-test-count.mjs
// The size of the APK is written by tools/evidence.mjs (it reads the built file); both use tools/number-docs.mjs.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NUMBER_DOCS as DOCS, withTestCount } from './number-docs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(root, 'tests', f));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8' });
const n = Number(run.stdout.match(/^# tests (\d+)/m)?.[1]);
if (!n) { console.error('Не удалось посчитать тесты'); process.exit(1); }
for (const doc of DOCS) {
  const path = join(root, doc);
  writeFileSync(path, withTestCount(readFileSync(path, 'utf8'), n));
}
console.log(`Тестов: ${n} → ${DOCS.join(', ')}`);
