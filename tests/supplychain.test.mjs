// 5.29 — supply chain (OpenSSF Scorecard practices, docs/AUDIT.md §36). The rules were kept by hand since 5.9: actions
// pinned to commit SHAs, no install scripts in jobs with tokens, checkout without stored credentials, exact versions,
// a lockfile from the npm registry, downloads checked by SHA-256. tools/supply-chain.mjs now checks them, and the gate
// calls it. Each rule is proven by a planted mistake in a temp copy of the files it reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSupplyChain, SUPPLY_CHAIN_FILES } from '../tools/supply-chain.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'synergy-supply-'));
  const workflows = readdirSync(join(root, '.github/workflows')).map(f => `.github/workflows/${f}`);
  for (const f of [...SUPPLY_CHAIN_FILES, ...workflows]) { mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(join(root, f), join(dir, f)); }
  return dir;
}
const edit = (dir, f, fn) => { const p = join(dir, f); const before = readFileSync(p, 'utf8'); const after = fn(before); assert.notEqual(after, before, `planted nothing in ${f}`); writeFileSync(p, after); };

test('supply chain: the repository keeps every rule', () => {
  assert.deepEqual(checkSupplyChain(root), []);
});

test('supply chain: every planted mistake is found', () => {
  const cases = [
    ['an action by tag', '.github/workflows/ci.yml', s => s.replace(/@[0-9a-f]{40} # v7/, '@v7'), 'не закреплено'],
    ['a workflow without permissions', '.github/workflows/ci.yml', s => s.replace(/^permissions:.*\n/m, ''), 'permissions'],
    ['checkout keeps the token', '.github/workflows/ci.yml', s => s.replace('persist-credentials: false, ', ''), 'persist-credentials'],
    ['npm ci runs install scripts', '.github/workflows/ci.yml', s => s.replace('npm ci --ignore-scripts', 'npm ci'), 'ignore-scripts'],
    ['a tool installed without a version', '.github/workflows/ci.yml', s => s.replace(/playwright@[\d.]+/, 'playwright'), 'без точной версии'],
    ['pip installs a name, not the hashed file', '.github/workflows/ci.yml', s => s.replace('pip install -r lab/requirements.txt', 'pip install numpy'), 'pip'],
    ['no cooldown', '.github/dependabot.yml', s => s.replace(/^\s+cooldown:.*\n(\s+default-days:.*\n)?/gm, ''), 'cooldown'],
    ['a one-day cooldown', '.github/dependabot.yml', s => s.replace(/default-days: \d+/, 'default-days: 1'), 'cooldown'],
    ['a range in devDependencies', 'package.json', s => s.replace(/"axe-core": "([\d.]+)"/, '"axe-core": "^$1"'), 'точной версии'],
    ['a runtime dependency', 'package.json', s => s.replace('"devDependencies"', '"dependencies": { "left-pad": "1.3.0" },\n  "devDependencies"'), 'зависимост'],
    ['a lockfile entry without integrity', 'package-lock.json', s => s.replace(/"integrity": "sha512-[^"]+",?/, ''), 'integrity'],
    ['a lockfile entry from another registry', 'package-lock.json', s => s.replace('https://registry.npmjs.org/', 'https://registry.example.com/'), 'реестр'],
    ['a Python package without hashes', 'lab/requirements.txt', s => s.replace(/^(numpy==[\d.]+)[^\n]*(\n\s+--hash=[^\n]*)*/m, '$1'), 'hash'],
    ['a download without its SHA-256', 'tools/verify-embed.sh', s => s.replace(/(kotlin-compiler-[\d.]+\.zip) ([0-9a-f]{64})/, '$1 deadbeef'), 'SHA-256'],
    ['a script piped into a shell', 'tools/build-apk.sh', s => `${s}\ncurl -sSL https://example.com/x.sh | sh\n`, 'в оболочку'],
  ];
  for (const [name, file, plant, message] of cases) {
    const dir = copy();
    try {
      assert.deepEqual(checkSupplyChain(dir), [], 'the copy is clean');
      edit(dir, file, plant);
      const found = checkSupplyChain(dir);
      assert.ok(found.some(m => m.includes(message)), `${name}: «${message}» in ${JSON.stringify(found)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
