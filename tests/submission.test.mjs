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

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'synergy-gate-'));
  const files = git(root, 'ls-files', '--cached', '--others', '--exclude-standard').split('\n')
    .filter(f => f && !f.endsWith('.png') && existsSync(join(root, f)) && lstatSync(join(root, f)).isFile()); // no symlinks (node_modules)
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
  const quotedKb = Number(readFileSync(join(root, 'docs/PITCH.md'), 'utf8').match(/APK[^\n|]{0,24}?(\d+)\s*КБ/)?.[1] ?? 0);
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
      ['manifest declares a medical app', () => edit(dir, 'public/manifest.webmanifest', s => s.replace('"games",', '"games", "medical",')), 'категория «medical»'],
      ['PWA locked to portrait', () => edit(dir, 'public/manifest.webmanifest', s => s.replace('"display"', '"orientation": "portrait",\n  "display"')), 'WCAG 1.3.4'],
      ['APK locked to portrait', () => edit(dir, 'android/AndroidManifest.xml', s => s.replace('android:exported="true"', 'android:exported="true"\n            android:screenOrientation="portrait"')), 'AndroidManifest.xml: ориентация'],
      ['gesture set published, docs still say «гипотеза»', () => edit(dir, 'MEMORY.md', s => s.replace(/^Набор жестов организатора:.*$/m, 'Набор жестов организатора: rest, fist, open, pinch, point, key, thumb')), 'назван гипотезой'],
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
