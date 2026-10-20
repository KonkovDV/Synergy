// docs/evidence.json — the numbers of a build in one place (5.17, the practice of the team's repositories: Mandat
// build_evidence.py, RepairFlow attest.py). The e2e scripts leave their summaries in tools/.cache/evidence/; this
// script adds the tests, the release files and the pictures, writes docs/evidence.json and the README table between
// <!-- evidence:begin --> and <!-- evidence:end -->. The submission gate checks that the three agree.
// Usage: node tools/evidence.mjs [--no-tests]   (after tools/build-apk.sh, npm run e2e:a11y, npm run audit:layout)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { release, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'tools', '.cache', 'evidence');
const where = () => ({ at: new Date().toISOString(), platform: `${platform()} ${release()}`, node: process.version });

/** A check run leaves its numbers here (tests/e2e/v5.mjs, tests/e2e/layout.mjs). */
export function writeEvidence(name, data) {
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, `${name}.json`), `${JSON.stringify({ ...data, ...where() }, null, 1)}\n`);
}

const plural = (n, [one, few, many]) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);
const day = iso => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
const mb = bytes => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1).replace('.', ',');

/** The README table «Главное · Цифра · Где проверить» from docs/evidence.json (the gate compares it). */
export function renderTable(e) {
  const t = e.tests, a = e.a11y, l = e.layout;
  const rows = [
    ['Тесты', t ? `${t.total} ${plural(t.total, ['тест', 'теста', 'тестов'])}, ${t.failed} ${plural(t.failed, ['упал', 'упали', 'упали'])}` : 'не измерено', '`npm test`'],
    ['Доступность', a ? `${a.violations} ${plural(a.violations, ['нарушение', 'нарушения', 'нарушений'])} axe: светлая тема — ${a.light} ${plural(a.light, ['состояние', 'состояния', 'состояний'])}, тёмная — ${a.dark} (${day(a.at)})` : 'не измерено', '`npm run e2e:a11y`'],
    ['Раскладка', l ? `${l.states} ${plural(l.states, ['состояние', 'состояния', 'состояний'])} × ${l.viewports} ${plural(l.viewports, ['экран', 'экрана', 'экранов'])} × текст 100/130/200 % = ${l.combinations} — ${l.findings} ${plural(l.findings, ['находка', 'находки', 'находок'])} (${day(l.at)})` : 'не измерено', '`npm run audit:layout`'],
    ['Контраст', 'каждая пара цветов ≥ 4,5:1 в трёх темах', '`tests/design.test.mjs`'],
    ['Графика', e.art ? `${e.art.pictures} иллюстраций, ${mb(e.art.bytes)} МБ, у каждой есть место на экране` : '—', '`docs/ART.md`, `tests/v516.test.mjs`'],
    ['Офлайн', e.apk && e.html ? `APK ${e.apk.kb} КБ, HTML ${mb(e.html.bytes)} МБ, без сети и аккаунта` : 'нет файлов выпуска', '`release/`, `docs/evidence.json`'],
  ];
  return ['| Главное | Цифра | Где проверить |', '|---|---|---|', ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

const file = f => {
  const buf = readFileSync(f);
  return { file: f.slice(root.length + 1).replaceAll('\\', '/'), bytes: buf.length, kb: Math.round(buf.length / 1024), sha256: createHash('sha256').update(buf).digest('hex') };
};

export function collect({ runTests = true } = {}) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  let tests = null;
  if (runTests) {
    const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join(root, 'tests', f));
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8' });
    tests = { total: Number(run.stdout.match(/^# tests (\d+)/m)?.[1] ?? 0), failed: Number(run.stdout.match(/^# fail (\d+)/m)?.[1] ?? 0), ...where() };
  } else if (existsSync(join(root, 'docs', 'evidence.json'))) {
    tests = JSON.parse(readFileSync(join(root, 'docs', 'evidence.json'), 'utf8')).tests ?? null;
  }
  const read = name => (existsSync(join(cache, `${name}.json`)) ? JSON.parse(readFileSync(join(cache, `${name}.json`), 'utf8')) : null);
  const apk = join(root, 'release', `Synergy-${version}.apk`), html = join(root, 'release', 'synergy-standalone.html');
  const art = JSON.parse(readFileSync(join(root, 'public', 'art', 'manifest.json'), 'utf8'));
  return {
    version, generated: new Date().toISOString(), tests, a11y: read('e2e-a11y'), layout: read('layout'),
    apk: existsSync(apk) ? file(apk) : null, html: existsSync(html) ? file(html) : null,
    art: { pictures: Object.keys(art.items).length, bytes: art.total_bytes },
  };
}

export const README_MARKERS = ['<!-- evidence:begin -->', '<!-- evidence:end -->'];

/** The text between the README markers, or null. */
export function readmeBlock(text) {
  const [b, e] = README_MARKERS, i = text.indexOf(b), j = text.indexOf(e);
  return i >= 0 && j > i ? text.slice(i + b.length, j).trim() : null;
}

/** Writes docs/evidence.json and the README table between the markers. */
function publish(evidence) {
  writeFileSync(join(root, 'docs', 'evidence.json'), `${JSON.stringify(evidence, null, 1)}\n`);
  const readme = join(root, 'README.md');
  const text = readFileSync(readme, 'utf8');
  const [b, e] = README_MARKERS;
  if (readmeBlock(text) === null) throw new Error(`README.md: нет маркеров ${b} … ${e}`);
  writeFileSync(readme, text.replace(new RegExp(`${b}[\\s\\S]*?${e}`), `${b}\n${renderTable(evidence)}\n${e}`));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Two passes: the suite contains the gate, which checks this file — it must already name this version and APK.
  publish(collect({ runTests: false }));
  const evidence = process.argv.includes('--no-tests') ? collect({ runTests: false }) : collect({ runTests: true });
  publish(evidence);
  console.log(renderTable(evidence));
  for (const [k, v] of Object.entries({ tests: evidence.tests, a11y: evidence.a11y, layout: evidence.layout, apk: evidence.apk })) if (!v) console.log(`⚠ нет данных: ${k}`);
}
