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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

/** The release files are built, not tracked (5.17): the copy gets them the way the archive does (tools/pack.sh). */
function copyRelease(dir) {
  mkdirSync(join(dir, 'release'), { recursive: true });
  for (const f of readdirSync(join(root, 'release')).filter(f => /\.(apk|html)$/.test(f))) copyFileSync(join(root, 'release', f), join(dir, 'release', f));
}

// Built from parts: the gate lints every tracked file, this one included.
const OVERSTATED = ['Перенос', 'на протез', 'доказан.'].join(' ');
const UNVERIFIED = ['Попытки без живой', 'подсказки были', 'связаны с протезом.'].join(' ');
const UP_TO_44 = ['Отказов', 'до', '44 %.'].join(' ');
const FITTS_LAW = ['Пропускная способность', 'по закону', 'Фиттса.'].join(' ');
const WCAG_CLAIM = ['Приложение', 'соответствует', 'WCAG 2.2.'].join(' ');
const gate = dir => spawnSync(process.execPath, ['tools/check-submission.mjs', '--draft', '--no-tests'], { cwd: dir, encoding: 'utf8' });
const edit = (dir, f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));

test('submission gate: a clean copy passes, every planted mistake fails it', () => {
  const dir = copyRepo();
  try {
    const clean = gate(dir);
    assert.equal(clean.status, 0, clean.stdout);
    const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    const cases = [
      ['no APK', () => rmSync(join(dir, 'release', `Synergy-${version}.apk`)), `нет release/Synergy-${version}.apk`],
      ['unsigned APK', () => writeFileSync(join(dir, 'release', `Synergy-${version}.apk`), Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)])), 'не подписан'],
      ['release APK tracked in git', () => git(dir, 'add', '-f', `release/Synergy-${version}.apk`), 'артефакты сборки в git'],
      ['README table edited by hand', () => edit(dir, 'README.md', s => s.replace('каждая пара цветов', 'почти каждая пара цветов')), 'расходится с docs/evidence.json'],
      ['version mismatch', () => edit(dir, 'src/config.js', s => s.replace(`version: '${version}'`, "version: '0.0.1'")), 'версия src/config.js'],
      ['unverified claim (fact-check)', () => edit(dir, 'README.md', s => `${s}\n${UNVERIFIED}\n`), 'README.md:'],
      ['«up to 44 %»', () => edit(dir, 'README.md', s => `${s}\n${UP_TO_44}\n`), 'README.md:'],
      ['«Fitts\' law measured»', () => edit(dir, 'README.md', s => `${s}\n${FITTS_LAW}\n`), 'по мотивам теста Фиттса'],
      ['«complies with WCAG»', () => edit(dir, 'README.md', s => `${s}\n${WCAG_CLAIM}\n`), 'соответствует WCAG'],
      ['stale APK name in README', () => edit(dir, 'README.md', s => `${s}\nrelease/Synergy-0.0.1.apk\n`), 'Synergy-0.0.1.apk'],
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

test('APK signer: the release APK of a draft carries the local debug key — the strict gate refuses it (Red Team C-1)', async () => {
  const { apkSigner } = await import('../tools/apk-signer.mjs');
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const sig = apkSigner(`release/Synergy-${version}.apk`);
  assert.equal(sig.signed, true);
  assert.equal(sig.debug, true, 'built by tools/build-apk.sh with the debug key; the team key comes from release.yml');
});
