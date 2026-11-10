// Supply chain of the repository (5.29): the rules the team kept by hand since 5.9, now checked.
// Sources: OpenSSF Scorecard checks Pinned-Dependencies, Token-Permissions, Dangerous-Workflow; GitHub's hardening guide
// for Actions; dependency cooldowns (Dependabot `cooldown`, 7 days: most malicious releases of 2024–2025 were live for
// less than a week). The product itself has no runtime dependencies (CONTRIBUTING.md, KISS).
// Usage: node tools/supply-chain.mjs — prints the findings, exit 1 if any. The submission gate calls checkSupplyChain().
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Files the check reads besides .github/workflows/*.yml. */
export const SUPPLY_CHAIN_FILES = ['.github/dependabot.yml', 'package.json', 'package-lock.json', 'lab/requirements.txt', 'tools/build-apk.sh', 'tools/verify-embed.sh'];
/** Minimum Dependabot cooldown, days. */
export const COOLDOWN_DAYS = 7;
const REGISTRY = 'https://registry.npmjs.org/';
const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/** Every finding as a line «file: what is wrong»; an empty list when every rule holds. */
export function checkSupplyChain(root) {
  const out = [];
  const read = f => readFileSync(join(root, f), 'utf8');
  const has = f => existsSync(join(root, f));

  // GitHub Actions workflows
  const wfDir = join(root, '.github/workflows');
  const workflows = existsSync(wfDir) ? readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f)) : [];
  for (const name of workflows) {
    const f = `.github/workflows/${name}`;
    const lines = read(f).split('\n');
    if (!lines.some(l => /^permissions:/.test(l))) out.push(`${f}: нет верхнего permissions — у GITHUB_TOKEN права по умолчанию`);
    lines.forEach((line, i) => {
      const at = `${f}:${i + 1}`;
      const uses = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
      if (uses && !uses[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(uses[1])) out.push(`${at}: действие ${uses[1]} не закреплено SHA коммита`);
      if (uses && /^actions\/checkout@/.test(uses[1]) && !/persist-credentials:\s*false/.test(`${lines[i + 1] ?? ''}${lines[i + 2] ?? ''}`)) out.push(`${at}: checkout без persist-credentials: false — токен остаётся в .git/config`);
      const run = line.replace(/#.*$/, '');
      for (const cmd of run.split(/&&|\|\||[;|]/)) {
        const words = cmd.trim().replace(/^-\s*run:\s*|^run:\s*/, '').split(/\s+/);
        if (words[0] !== 'npm' || !['ci', 'i', 'install'].includes(words[1])) continue;
        if (!words.includes('--ignore-scripts')) out.push(`${at}: npm без --ignore-scripts — скрипты установки в задаче с токеном`);
        for (const spec of words.slice(2).filter(w => w && !w.startsWith('-'))) {
          const [, name, version] = spec.match(/^((?:@[\w.-]+\/)?[^@\s]+)(?:@(.+))?$/) ?? [, spec];
          if (!version || !EXACT.test(version)) out.push(`${at}: пакет ${name} без точной версии`);
        }
      }
      const pip = run.match(/\bpip\s+install\s+(.*)$/);
      if (pip) {
        const file = pip[1].match(/-r\s+(\S+)/)?.[1];
        if (!file) out.push(`${at}: pip ставит пакеты по имени, без файла с hash`);
        else if (has(file) && !requirementsHashed(read(file))) out.push(`${at}: pip -r ${file} — в файле не у всех пакетов hash`);
      }
    });
  }

  // Dependabot: every ecosystem waits before proposing a fresh release (security updates are not delayed).
  if (has('.github/dependabot.yml')) {
    const blocks = read('.github/dependabot.yml').split(/^\s*- package-ecosystem:/m).slice(1);
    if (!blocks.length) out.push('.github/dependabot.yml: нет ни одной экосистемы');
    for (const b of blocks) {
      const eco = b.trim().split(/\s/)[0];
      const days = Number(b.match(/cooldown:[\s\S]*?default-days:\s*(\d+)/)?.[1]);
      if (!(days >= COOLDOWN_DAYS)) out.push(`.github/dependabot.yml: ${eco} — нет cooldown ≥ ${COOLDOWN_DAYS} дней`);
    }
  } else out.push('.github/dependabot.yml: нет файла');

  // npm: no runtime dependencies; exact versions; the lockfile pins every package to the registry with integrity.
  const pkg = JSON.parse(read('package.json'));
  if (Object.keys(pkg.dependencies ?? {}).length) out.push(`package.json: зависимости времени выполнения (${Object.keys(pkg.dependencies).join(', ')}) — продукт без них`);
  for (const [name, v] of Object.entries(pkg.devDependencies ?? {})) if (!EXACT.test(v)) out.push(`package.json: ${name} «${v}» — нужна запись точной версии`);
  if (!has('package-lock.json')) out.push('package-lock.json: нет файла');
  else {
    const lock = JSON.parse(read('package-lock.json'));
    if (!(lock.lockfileVersion >= 3)) out.push(`package-lock.json: lockfileVersion ${lock.lockfileVersion}, нужен 3`);
    for (const [path, p] of Object.entries(lock.packages ?? {})) {
      if (!path || p.link) continue;
      if (!/^sha512-/.test(p.integrity ?? '')) out.push(`package-lock.json: ${path} без integrity sha512`);
      if (!String(p.resolved ?? '').startsWith(REGISTRY)) out.push(`package-lock.json: ${path} не из реестра npm (${p.resolved})`);
    }
  }

  // Python of the lab (CI job «lab»): exact versions with hashes.
  if (has('lab/requirements.txt') && !requirementsHashed(read('lab/requirements.txt'))) out.push('lab/requirements.txt: не у всех пакетов == и --hash=sha256');

  // Shell tools: every download is checked by SHA-256, nothing from the network goes straight into a shell.
  for (const f of ['tools/build-apk.sh', 'tools/verify-embed.sh'].filter(has)) {
    read(f).split('\n').forEach((line, i) => {
      if (/^\s*fetch\s+\S+/.test(line) && !/\s[0-9a-f]{64}\s*$/.test(line)) out.push(`${f}:${i + 1}: загрузка без SHA-256`);
      if (/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/.test(line)) out.push(`${f}:${i + 1}: загрузка передаётся прямо в оболочку`);
      if (/\bnpm\s+(i|install)\b/.test(line) && !line.includes('--ignore-scripts')) out.push(`${f}:${i + 1}: npm без --ignore-scripts`);
    });
  }
  return out;
}

/** Every requirement is `name==version` with at least one --hash=sha256 (pip then installs in hash-checking mode). */
export function requirementsHashed(text) {
  const reqs = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/).map(l => l.replace(/(^|\s)#.*$/, '').trim()).filter(Boolean);
  return reqs.length > 0 && reqs.every(r => /^[A-Za-z0-9_.-]+(\[[\w,]+\])?==[\w.]+\s/.test(`${r} `) && /--hash=sha256:[0-9a-f]{64}/.test(r));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = checkSupplyChain(join(dirname(fileURLToPath(import.meta.url)), '..'));
  for (const m of found) console.log(`✗ ${m}`);
  console.log(found.length ? `Цепочка поставки: ${found.length} нарушений.` : 'Цепочка поставки: правила соблюдены.');
  if (found.length) process.exitCode = 1;
}
