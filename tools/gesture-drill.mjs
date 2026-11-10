// Drill for the day the organizers publish their 7 gestures (PLAN C.3): copy the code to a temp dir,
// replace the gesture «Класс» (thumb) with «Трипод» (tripod) in src/core/vocabulary.js ONLY, run the suite.
// Passes when the only failures are the expected reminders (EXPECTED below) — everything else derives
// from vocabulary.js. Usage: node tools/gesture-drill.mjs
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { writeEvidence } from './evidence.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Tests that name a gesture on purpose: each one is a step of the replacement checklist (docs/INTEGRATION.md).
const EXPECTED = ['vocabulary: bridge synonyms point to existing gestures',
  // 6.0: the generated pictures of the bionic hand are drawn per grip (src/render/bionic.js, 26.10). A grip that leaves the
  // set leaves its picture without a gesture — step 4а of the replacement checklist (docs/dev/PLAN.md C.3), not a second source of names.
  '26.10 grips of the bionic hand: every grip picture is in the catalogue, is a gesture of a set and has its palm light'];
const TRIPOD = "{ id: 'tripod', name: 'Трипод', command: 'close', grip: 'tripod', pose: [0.6, 0.6, 0.6, 0.2, 0.2], introducedAt: 5, cue: 'Сведите большой, указательный и средний пальцы', use: 'Трёхпальцевый хват: ручка, крышка' },";

const tmp = mkdtempSync(join(tmpdir(), 'synergy-drill-'));
try {
  // styles: the design tokens test (5.12); bridge: the reference firmware test (5.27)
  for (const dir of ['src', 'tests', 'public', 'styles', 'bridge']) cpSync(join(root, dir), join(tmp, dir), { recursive: true, filter: src => !src.includes('__pycache__') });
  // Tests of the servers and the build read tools/ and index.html (5.10–5.11); the tool cache (131 MB, a key) stays out.
  cpSync(join(root, 'tools'), join(tmp, 'tools'), { recursive: true, filter: src => !src.includes(`${join('tools', '.cache')}`) });
  // The APK resources the launcher-icon test reads (5.16), without the built APK.
  cpSync(join(root, 'android'), join(tmp, 'android'), { recursive: true, filter: src => !src.includes(`${join('android', 'build')}`) });
  // 5.30: the iPhone shell, which the parity test reads next to the Android one (the generated Xcode project stays out).
  cpSync(join(root, 'ios'), join(tmp, 'ios'), { recursive: true, filter: src => !src.includes('.xcodeproj') });
  cpSync(join(root, '.github'), join(tmp, '.github'), { recursive: true }); // the same test checks how CI fetches XcodeGen
  for (const file of ['package.json', 'index.html']) cpSync(join(root, file), join(tmp, file));
  // The documents the tests read: the rules (checked against the code, 5.13), the host examples (against the contract,
  // 5.15) and the documents they link to — the text documents only, not the screenshots.
  for (const f of readdirSync(join(root, 'docs')).filter(f => f.endsWith('.md'))) cpSync(join(root, 'docs', f), join(tmp, 'docs', f));
  cpSync(join(root, 'docs', 'embed'), join(tmp, 'docs', 'embed'), { recursive: true });
  // 5.31 (M-17): a test reads the jury page of the submission pack; without it the drill failed on every tree since then.
  for (const f of readdirSync(join(root, 'submission')).filter(f => f.endsWith('.md'))) cpSync(join(root, 'submission', f), join(tmp, 'submission', f));
  // esbuild for the bundle test; a junction on Windows (5.16: a directory symlink needs admin rights there).
  if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const file = join(tmp, 'src/core/vocabulary.js');
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/^\s*\{ id: 'thumb'.*$/m, m => m.match(/^\s*/)[0] + TRIPOD);
  if (after === before) throw new Error("vocabulary.js: строка жеста 'thumb' не найдена — обновите скрипт под текущий набор");
  writeFileSync(file, after);
  // submission.test.mjs and supplychain.test.mjs (5.29) check the repository (git, release/, documents, .github, lockfiles),
  // not the code: not in the copy.
  const REPO_TESTS = ['submission.test.mjs', 'supplychain.test.mjs'];
  const tests = readdirSync(join(tmp, 'tests')).filter(f => f.endsWith('.test.mjs') && !REPO_TESTS.includes(f)).map(f => join(tmp, 'tests', f));
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: tmp, encoding: 'utf8' });
  const failed = [...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1].trim());
  const total = Number(run.stdout.match(/^# tests (\d+)/m)?.[1] ?? 0);
  const unexpected = failed.filter(t => !EXPECTED.includes(t));
  writeEvidence('drill', { tests: total, failed: failed.length, unexpected: unexpected.length, ok: !!total && !unexpected.length });
  console.log(`Учебная замена «Класс» → «Трипод»: тестов ${total}, упало ${failed.length}.`);
  for (const t of failed) console.log(`${EXPECTED.includes(t) ? '  ожидаемо ' : '  ✗ ОШИБКА'} ${t}`);
  if (!total || unexpected.length) { console.log('Набор жестов задан не в одном месте — см. упавшие тесты.'); process.exitCode = 1; }
  else console.log('OK: остальной код берёт набор из vocabulary.js.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
