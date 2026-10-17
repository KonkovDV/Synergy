// The submission gate is itself tested (PLAN B.8): a temp copy of the repository passes, then each planted
// mistake — missing APK, version mismatch, overstated claim, gesture set out of sync — makes it exit 1.
// The copy runs the gate with --no-tests (the gate runs this suite, this test runs the gate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@test', ...args], { cwd, encoding: 'utf8' });

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'synergy-gate-'));
  const files = git(root, 'ls-files', '--cached', '--others', '--exclude-standard').split('\n')
    .filter(f => f && !f.endsWith('.png') && existsSync(join(root, f)));
  for (const f of files) { mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(join(root, f), join(dir, f)); }
  git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'copy');
  return dir;
}

// Built from parts: the gate lints every tracked file, this one included.
const OVERSTATED = ['Перенос', 'на протез', 'доказан.'].join(' ');
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
      ['version mismatch', () => edit(dir, 'src/config.js', s => s.replace(`version: '${version}'`, "version: '0.0.1'")), 'версия src/config.js'],
      ['overstated claim', () => edit(dir, 'README.md', s => `${s}\n${OVERSTATED}\n`), 'README.md:'], // the wording lint names the file and line
      ['gesture set published, docs still say «гипотеза»', () => edit(dir, 'MEMORY.md', s => s.replace(/^Набор жестов организатора:.*$/m, 'Набор жестов организатора: rest, fist, open, pinch, point, key, thumb')), 'назван гипотезой'],
    ];
    for (const [name, plant, message] of cases) {
      plant();
      const r = gate(dir);
      assert.equal(r.status, 1, `${name}: exit code\n${r.stdout}`);
      assert.ok(r.stdout.includes(message), `${name}: «${message}» in\n${r.stdout}`);
      git(dir, 'checkout', '-q', '--', '.'); git(dir, 'clean', '-qfd'); // back to the clean copy
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
