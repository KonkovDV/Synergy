import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// The submission gate is itself tested (PLAN B.8): a temp copy of the repository passes, then each planted
// mistake — missing APK, version mismatch, overstated claim, gesture set out of sync — makes it exit 1.
// The copy runs the gate with --no-tests (the gate runs this suite, this test runs the gate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { apkSigner } from '../tools/apk-signer.mjs';
import { APK_SIZE, TEST_COUNT, withApkSize, withTestCount } from '../tools/number-docs.mjs';
import { withEvidenceNumbers } from '../tools/evidence.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const builtApk = join(root, 'release', `Synergy-${VERSION}.apk`);

/**
 * A zip of stored (uncompressed) entries — enough for tools/apk-signer.mjs, which reads the central directory.
 * 5.27: the release files are built, not tracked, so a fresh clone (and the CI jobs, which run `npm test` before
 * tools/build-apk.sh, or never build an APK at all — Windows) had none and three tests of this file failed.
 */
function storedZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30 + n.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(10, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
    const central = Buffer.alloc(46 + n.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(10, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42); n.copy(central, 46);
    locals.push(local, data); centrals.push(central);
    offset += local.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** An APK-shaped zip signed by `subject` and padded to `bytes`, so the size quoted in the documents still matches. */
function fakeApk(subject, bytes = 0) {
  const cert = Buffer.from(`fake PKCS#7 block, CN=${subject}`);
  const head = storedZip([['META-INF/CERT.RSA', cert]]).length + 46 + 30 + 2 * 'assets/pad.bin'.length;
  return storedZip([['META-INF/CERT.RSA', cert], ['assets/pad.bin', Buffer.alloc(Math.max(0, bytes - head))]]);
}
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@test', ...args], { cwd, encoding: 'utf8' });

/**
 * The files of the repository: what git tracks and what it would track. 09.11 — a copy without .git (an archive unpacked
 * by hand, not tools/pack.sh) failed five tests of this file on «not a git repository»; it is listed by its .gitignore
 * through a throwaway git directory, as the gate does (tools/check-submission.mjs `trackedFiles`).
 */
function repoFiles() {
  try {
    // the prefix is empty exactly at the root of the work tree (no path comparison: Windows spells paths its own way)
    const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (prefix === '') return git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0');
  } catch { /* not a work tree: below */ }
  const scratch = mkdtempSync(join(tmpdir(), 'synergy-files-'));
  try {
    git(scratch, 'init', '-q');
    return execFileSync('git', ['--git-dir', join(scratch, '.git'), '--work-tree', root, 'ls-files', '-z', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'synergy-gate-'));
  const files = repoFiles()
    .filter(f => f && !/\.(png|pptx|mp4)$/.test(f) && existsSync(join(root, f)) && lstatSync(join(root, f)).isFile()); // no symlinks (node_modules)
  for (const f of files) { mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(join(root, f), join(dir, f)); }
  copyRelease(dir);
  git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'copy');
  return dir;
}

/**
 * The release files are built, not tracked (5.17): the copy gets them the way the archive does (tools/pack.sh). When
 * this version is not built here (a fresh clone, CI before tools/build-apk.sh, Windows CI), the copy gets stand-ins of
 * the size docs/evidence.json records: a debug-signed APK and a page. The gate then sees «another build» (5.27: a
 * warning in a draft, an error in the strict gate — CI cannot rebuild the team's binary byte for byte).
 */
function copyRelease(dir) {
  mkdirSync(join(dir, 'release'), { recursive: true });
  if (existsSync(builtApk)) {
    for (const f of readdirSync(join(root, 'release')).filter(f => /\.(apk|html)$/.test(f))) copyFileSync(join(root, 'release', f), join(dir, 'release', f));
    return;
  }
  const ev = JSON.parse(readFileSync(join(root, 'docs/evidence.json'), 'utf8'));
  // No APK of this version recorded anywhere yet (the toolchain could not be fetched): the size the pitch quotes.
  const quotedKb = Number([...readFileSync(join(root, 'docs/PITCH.md'), 'utf8').matchAll(APK_SIZE)][0]?.[1] ?? 0);
  writeFileSync(join(dir, 'release', `Synergy-${VERSION}.apk`), fakeApk('Synergy Debug', ev.apk?.bytes ?? quotedKb * 1024));
  writeFileSync(join(dir, 'release', 'synergy-standalone.html'), '<!doctype html><title>stand-in</title>');
}

// Built from parts: the gate lints every tracked file, this one included.
const OVERSTATED = ['Перенос', 'на протез', 'доказан.'].join(' ');
const UNVERIFIED = ['Попытки без живой', 'подсказки были', 'связаны с протезом.'].join(' ');
const UP_TO_44 = ['Отказов', 'до', '44 %.'].join(' ');
const FITTS_LAW = ['Пропускная способность', 'по закону', 'Фиттса.'].join(' ');
const WCAG_CLAIM = ['Приложение', 'соответствует', 'WCAG 2.2.'].join(' ');
const SOTA_CLAIM = `Синергия — ${['SOTA', 'решение'].join('-')} для тренировки.`;
const READY_CLAIM = `Игра ${['production', 'ready'].join('-')}.`;
const UNIQUE_CLAIM = ['Аналогов', 'нет.'].join(' ');
const gate = dir => spawnSync(process.execPath, ['tools/check-submission.mjs', '--draft', '--no-tests'], { cwd: dir, encoding: 'utf8' });
const edit = (dir, f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));

test('submission gate: a clean copy passes, every planted mistake fails it', () => {
  const dir = copyRepo();
  try {
    const clean = gate(dir);
    assert.equal(clean.status, 0, clean.stdout);
    if (!existsSync(builtApk)) {
      // A stand-in APK is «another build»: the draft (CI) warns, the strict gate before the upload refuses it.
      assert.ok(clean.stdout.includes('APK другой сборки'), clean.stdout);
      const strict = spawnSync(process.execPath, ['tools/check-submission.mjs', '--no-tests'], { cwd: dir, encoding: 'utf8' });
      assert.equal(strict.status, 1, strict.stdout);
      assert.match(strict.stdout, /APK другой сборки/);
    }
    const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    const cases = [
      ['no APK', () => rmSync(join(dir, 'release', `Synergy-${version}.apk`)), `нет release/Synergy-${version}.apk`],
      ['unsigned APK', () => writeFileSync(join(dir, 'release', `Synergy-${version}.apk`), Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)])), 'не подписан'],
      ['release APK tracked in git', () => git(dir, 'add', '-f', `release/Synergy-${version}.apk`), 'артефакты сборки в git'],
      ['README table edited by hand', () => edit(dir, 'README.md', s => s.replace('каждая пара цветов', 'почти каждая пара цветов')), 'расходится с docs/evidence.json'],
      ['an old axe count in the pitch', () => edit(dir, 'docs/PITCH.md', s => `${s}\nНоль нарушений на 28 состояниях экранов светлой темы и 10 тёмной.\n`), 'а axe —'],
      ['an old layout run in the jury strategy', () => edit(dir, 'docs/JURY_STRATEGY.md', s => `${s}\nЛинтер: 37 состояний × 7 экранов.\n`), 'а линтер раскладки —'],
      ['version mismatch', () => edit(dir, 'src/config.js', s => s.replace(`version: '${version}'`, "version: '0.0.1'")), 'версия src/config.js'],
      ['stale citation metadata', () => edit(dir, 'CITATION.cff', s => s.replace(/^version: .*$/m, 'version: 5.11.0')), 'версия CITATION.cff'],
      ['stale iPhone version', () => edit(dir, 'ios/project.yml', s => s.replace(/MARKETING_VERSION: "[^"]+"/, 'MARKETING_VERSION: "5.11.0"')), 'версия ios/project.yml'],
      // 5.29 — the supply-chain rules (tools/supply-chain.mjs, its own planted cases in tests/supplychain.test.mjs).
      ['an action pinned by tag', () => edit(dir, '.github/workflows/ci.yml', s => s.replace(/@[0-9a-f]{40} # v7/, '@v7')), 'цепочка поставки'],
      ['unverified claim (fact-check)', () => edit(dir, 'README.md', s => `${s}\n${UNVERIFIED}\n`), 'README.md:'],
      ['«up to 44 %»', () => edit(dir, 'README.md', s => `${s}\n${UP_TO_44}\n`), 'README.md:'],
      ['«Fitts\' law measured»', () => edit(dir, 'README.md', s => `${s}\n${FITTS_LAW}\n`), 'по мотивам теста Фиттса'],
      ['«complies with WCAG»', () => edit(dir, 'README.md', s => `${s}\n${WCAG_CLAIM}\n`), 'соответствует WCAG'],
      // 5.19 — a grade of one's own product only beside a measured report (the team's MicroPhoenix rule).
      ['a state-of-the-art grade of ourselves', () => edit(dir, 'docs/PITCH.md', s => `${s}\n${SOTA_CLAIM}\n`), 'о себе — назвать измеренное'],
      ['a readiness grade', () => edit(dir, 'README.md', s => `${s}\n${READY_CLAIM}\n`), 'прототип геймджема'],
      ['«no competitors» on a slide', () => edit(dir, 'tools/build-deck.py', s => `${s}\n# ${UNIQUE_CLAIM}\n`), 'есть свои игры'],
      ['a field result without its session', () => edit(dir, 'docs/USABILITY_RESULTS.md', s => s.replace('|---|---|---|---|---|---|---|---|\n', '|---|---|---|---|---|---|---|---|\n| в среднем | | | | 90 % | 81 | нет | |\n')), 'строка без ссылки на сессию'],
      ['stale APK name in README', () => edit(dir, 'README.md', s => `${s}\nrelease/Synergy-0.0.1.apk\n`), 'Synergy-0.0.1.apk'],
      ['stale version in the LIMITS title', () => edit(dir, 'LIMITS.md', s => s.replace(/^# Границы «Синергии» \S+/m, '# Границы «Синергии» 0.0.1')), '«Синергии» 0.0.1'],
      ['overstated claim', () => edit(dir, 'README.md', s => `${s}\n${OVERSTATED}\n`), 'README.md:'], // the wording lint names the file and line
      ['a claim in a file with a Cyrillic name', () => { writeFileSync(join(dir, 'docs', 'заметка.md'), `${OVERSTATED}\n`); git(dir, 'add', 'docs/заметка.md'); }, 'docs/заметка.md:'],
      ['manifest declares a medical app', () => edit(dir, 'public/manifest.webmanifest', s => s.replace('"games",', '"games", "medical",')), 'категория «medical»'],
      ['PWA locked to portrait', () => edit(dir, 'public/manifest.webmanifest', s => s.replace('"display"', '"orientation": "portrait",\n  "display"')), 'WCAG 1.3.4'],
      ['APK locked to portrait', () => edit(dir, 'android/AndroidManifest.xml', s => s.replace('android:exported="true"', 'android:exported="true"\n            android:screenOrientation="portrait"')), 'AndroidManifest.xml: ориентация'],
      // 6.0 — the set of the task is published (MEMORY.md): a document that still calls the set a hypothesis, or a
      // published line that differs from vocabulary.js, fails the gate.
      ['gesture set published, docs still say «гипотеза»', () => edit(dir, 'docs/TASK.md', s => `${s}\n| «7 жестов» | состав — гипотеза команды |\n`), 'назван гипотезой'],
      ['published set differs from vocabulary.js', () => edit(dir, 'MEMORY.md', s => s.replace(/^Набор жестов организатора:.*$/m, 'Набор жестов организатора: rest, fist, open, pinch, point, key, thumb')), 'набор организатора в MEMORY.md'],
    ];
    for (const [name, plant, message] of cases) {
      plant();
      const r = gate(dir);
      assert.equal(r.status, 1, `${name}: exit code\n${r.stdout}`);
      assert.ok(r.stdout.includes(message), `${name}: «${message}» in\n${r.stdout}`);
      git(dir, 'reset', '-q'); git(dir, 'checkout', '-q', '--', '.'); git(dir, 'clean', '-qfd'); copyRelease(dir); // back to the clean copy (git does not restore the ignored release files)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('submission gate: a published set must equal vocabulary.js', () => {
  const dir = copyRepo();
  try {
    edit(dir, 'MEMORY.md', s => s.replace(/^Набор жестов организатора:.*$/m, 'Набор жестов организатора: rest, fist, open, pinch, point, key, tripod'));
    for (const f of ['docs/JURY_STRATEGY.md', 'docs/TASK.md']) edit(dir, f, s => s.replace(/состав/gi, 'набор'));
    const r = gate(dir);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stdout.includes('≠ набор организатора'), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('submission gate (5.31): the organizer\'s deck in git is named; tools/pack.sh leaves it out of the archive and its history', () => {
  const dir = copyRepo();
  try {
    writeFileSync(join(dir, 'docs', 'Презентация.pptx'), Buffer.from('PK'));
    git(dir, 'add', '-f', 'docs/Презентация.pptx');
    const r = gate(dir);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /материалы не для продукта в git: 1 \(напр\. docs\/Презентация\.pptx\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const pack = readFileSync(join(root, 'tools/pack.sh'), 'utf8');
  assert.match(pack, /--filter=blob:limit=10m/, 'no big blob in the history of the archive');
  assert.match(pack, /'!\*\.pptx' '!\*\.mp4'/, 'no deck or video in its working tree');
  assert.match(pack, /-name '\*\.pptx'.*-size \+10M/, 'and the unpacked archive is checked for them');
});

test('submission numbers (04.11): the writers set exactly the numbers the gate reads', () => {
  // CI of PR #12 went red: new pictures made the APK 5093 КБ while four documents still said 3668 by hand.
  const text = [
    'Тесты: 486 тестов, 486 автотестов; тестовый стенд не число.',
    'Офлайн: APK 3668 КБ, и ещё раз APK собран: 3668 КБ.',
    'История: APK 5.30.0 собран на машине команды 22.10.2026: 2123 КБ.', // farther than 24 characters: not a quote
    '| Офлайн | APK 3668 КБ | `release/` |',
  ].join('\n');
  const quoted = (s, re) => [...s.matchAll(re)].map(m => Number(m[1]));
  assert.deepEqual(quoted(text, APK_SIZE), [3668, 3668, 3668]);
  const written = withTestCount(withApkSize(text, 5093), 487);
  assert.deepEqual(quoted(written, APK_SIZE), [5093, 5093, 5093]);
  assert.deepEqual(quoted(written, TEST_COUNT), [487, 487]);
  assert.match(written, /487 тестов, 487 автотестов; тестовый стенд/);
  assert.match(written, /APK собран: 5093 КБ/);
  assert.match(written, /22\.10\.2026: 2123 КБ/, 'a size farther from «APK» is history, not a quote');
  for (const [n, word] of [[1, 'тест'], [2, 'теста'], [5, 'тестов'], [11, 'тестов'], [21, 'тест'], [104, 'теста'], [112, 'тестов']]) {
    assert.equal(withTestCount('всего 486 тестов', n), `всего ${n} ${word}`);
  }
  // evidence.mjs writes only what it measured: no APK built, no test run — the documents keep their numbers.
  assert.equal(withEvidenceNumbers(text, { apk: null, tests: null }), text);
  assert.equal(withEvidenceNumbers(text, { apk: { kb: 5093 }, tests: { total: 487 } }), written);
});

test('submission gate (audit 06.11, F5): a shallow clone says its history is cut, not a wrong first-commit date', () => {
  const dir = copyRepo(), cut = mkdtempSync(join(tmpdir(), 'synergy-shallow-'));
  try {
    // Two commits with old dates, then a clone of the last one only: its oldest commit is the cut (2026-10-27), not 17.10.
    const dated = date => ({ ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    execFileSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@test', 'commit', '-q', '--amend', '--no-edit'], { cwd: dir, env: dated('2026-10-17T12:00:00Z') });
    writeFileSync(join(dir, 'NOTE.md'), 'x\n'); git(dir, 'add', 'NOTE.md');
    execFileSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@test', 'commit', '-q', '-m', 'later'], { cwd: dir, env: dated('2026-10-27T12:00:00Z') });
    rmSync(cut, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir.replaceAll('\\', '/')}`, cut]);
    copyRelease(cut);
    const shallow = gate(cut);
    assert.equal(shallow.status, 0, shallow.stdout);
    assert.match(shallow.stdout, /история git неполная/);
    assert.doesNotMatch(shallow.stdout, /первый коммит 2026-10-27/, 'the cut is not the first commit');
    // The full copy still names its real first commit.
    assert.match(gate(dir).stdout, /первый коммит 2026-10-17/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cut, { recursive: true, force: true });
  }
});

test('submission gate (09.11): a folder without .git is checked by its .gitignore, and the unchecked history is named', () => {
  const dir = copyRepo();
  try {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    const r = gate(dir);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /нет истории git/);
    assert.doesNotMatch(r.stdout, /первый коммит/, 'no history — no date of a first commit');
    // The checks of the files still run there: a planted overstated claim fails the gate.
    edit(dir, 'README.md', s => `${s}\n${OVERSTATED}\n`);
    const planted = gate(dir);
    assert.equal(planted.status, 1, planted.stdout);
    assert.ok(planted.stdout.includes('README.md:'), planted.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('APK signer: a debug key, the team key and no signature are told apart (Red Team C-1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'synergy-apk-'));
  try {
    const at = (name, buf) => { const f = join(dir, name); writeFileSync(f, buf); return f; };
    assert.deepEqual(apkSigner(at('debug.apk', fakeApk('Synergy Debug'))), { signed: true, debug: true });
    assert.deepEqual(apkSigner(at('team.apk', fakeApk('Synergy Team'))), { signed: true, debug: false });
    assert.deepEqual(apkSigner(at('none.apk', storedZip([['AndroidManifest.xml', Buffer.from('<manifest/>')]]))), { signed: false, debug: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('APK signer: the release APK of a draft carries the local debug key — the strict gate refuses it (Red Team C-1)', t => {
  if (!existsSync(builtApk)) { t.skip(`release/Synergy-${VERSION}.apk is not built here: sh tools/build-apk.sh`); return; }
  const sig = apkSigner(builtApk);
  assert.equal(sig.signed, true);
  assert.equal(sig.debug, true, 'built by tools/build-apk.sh with the debug key; the team key comes from release.yml');
});

test('submission gate (5.29): the axe and layout runs must have run on this code', async () => {
  const { sourceFingerprint } = await import('../tools/evidence.mjs');
  const dir = copyRepo();
  try {
    const strict = () => spawnSync(process.execPath, ['tools/check-submission.mjs', '--no-tests'], { cwd: dir, encoding: 'utf8' });
    // The copy's evidence names the copy's code: no word about the runs.
    edit(dir, 'docs/evidence.json', s => { const e = JSON.parse(s); for (const k of ['a11y', 'layout']) if (e[k]) e[k].source = sourceFingerprint(dir); return `${JSON.stringify(e, null, 1)}\n`; });
    const same = strict();
    assert.doesNotMatch(same.stdout, /снят на другом коде|нет отпечатка кода/, same.stdout);
    // A screen changed after the e2e: the draft (CI) warns, the strict gate before the upload refuses it.
    edit(dir, 'src/ui/home.js', s => `${s}\n// changed after the e2e\n`);
    const draft = gate(dir);
    assert.match(draft.stdout, /⚠ docs\/evidence\.json: «a11y» снят на другом коде/);
    assert.match(draft.stdout, /⚠ docs\/evidence\.json: «layout» снят на другом коде/);
    const after = strict();
    assert.equal(after.status, 1, after.stdout);
    assert.match(after.stdout, /✗ docs\/evidence\.json: «a11y» снят на другом коде/);
    // A record without a fingerprint (before 5.29) is named, not trusted.
    edit(dir, 'docs/evidence.json', s => { const e = JSON.parse(s); delete e.a11y.source; return `${JSON.stringify(e, null, 1)}\n`; });
    assert.match(gate(dir).stdout, /у «a11y» нет отпечатка кода/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('evidence (5.29): the fingerprint follows the code of src/, styles/ and index.html, nothing else', async () => {
  const { sourceFingerprint } = await import('../tools/evidence.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'synergy-fp-'));
  try {
    mkdirSync(join(dir, 'src', 'ui'), { recursive: true }); mkdirSync(join(dir, 'styles')); mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'src', 'ui', 'a.js'), 'a'); writeFileSync(join(dir, 'styles', 'app.css'), 'b'); writeFileSync(join(dir, 'index.html'), 'c');
    const first = sourceFingerprint(dir);
    assert.match(first, /^[0-9a-f]{16}$/);
    writeFileSync(join(dir, 'docs', 'note.md'), 'a document is not the code');
    assert.equal(sourceFingerprint(dir), first);
    writeFileSync(join(dir, 'styles', 'app.css'), 'b2');
    assert.notEqual(sourceFingerprint(dir), first);
    writeFileSync(join(dir, 'styles', 'app.css'), 'b');
    writeFileSync(join(dir, 'src', 'ui', 'b.js'), '');
    assert.notEqual(sourceFingerprint(dir), first, 'a new empty file is a change');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
