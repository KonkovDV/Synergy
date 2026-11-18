// The requirements checklist of the pitch page, made from docs/TZ_COMPLIANCE.md. Every row of its tables — a requirement
// of the task of 28.10 or an answer of the organizers → what is done → where in the code → what checks it — becomes a
// line of the page, with the criteria of the task on top. The page cannot drift from the table: check:pitch runs this
// script with --check.
//   node tools/pitch-tz.mjs           writes the block between <!-- tz:begin --> and <!-- tz:end --> of pitch/index.html
//   node tools/pitch-tz.mjs --check   exits 1 if the block is not what the table gives
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'docs/TZ_COMPLIANCE.md', PAGE = 'pitch/index.html';
const BLOB = 'https://github.com/KonkovDV/Synergy/blob/main/', TREE = 'https://github.com/KonkovDV/Synergy/tree/main/';

// The sections of the table, in the order of the page, and the criteria of the task they answer.
const GROUPS = [
  { id: 's1', heading: 'Поток 1:', title: 'Поток 1 · два канала ЭМГ', short: 'Поток 1 · ЭМГ' },
  { id: 's2', heading: 'Поток 2:', title: 'Поток 2 · СПППР, 7 состояний', short: 'Поток 2 · СПППР' },
  { id: 'edu', heading: 'Обучение, мотивация, удержание', title: 'Обучение, мотивация, удержание', short: 'Обучение' },
  { id: 'ux', heading: 'Интерфейс, доступность, оформление', title: 'Интерфейс, доступность, оформление', short: 'UX и доступность' },
  { id: 'int', heading: 'Встраивание, документация, сдача', title: 'Встраивание, документация, сдача', short: 'Внедрение' },
];
const CRITERIA = [
  { weight: '33 %', name: 'Соответствие ТЗ и интеграция сигналов', groups: ['s1', 's2'] },
  { weight: '16 % + 16 %', name: 'Обучающая ценность, мотивация и удержание', groups: ['edu'] },
  { weight: '16 %', name: 'UX/UI, доступность, визуально-звуковое оформление', groups: ['ux'] },
  { weight: '16 %', name: 'Техническое исполнение и готовность к внедрению', groups: ['int'] },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NB = ' ';

/** A path of the repository in `code` becomes a link to it on GitHub; any other code stays code. */
function code(text) {
  const t = text.trim();
  const path = /^(?:[\w.-]+\/)+(?:[\w.*-]+)?$|^[\w-]+\.(?:md|json|js|mjs|py|kt|swift|sh|css|html|cff)$/.test(t) && !/\s/.test(t);
  if (!path) return `<code>${esc(t)}</code>`;
  const dir = t.endsWith('/') || t.includes('*') || !/\.[a-z]+$/.test(t);
  const target = t.includes('*') ? t.slice(0, t.lastIndexOf('/') + 1) : t;
  return `<a href="${dir ? TREE : BLOB}${esc(target.replace(/\/$/, ''))}"><code>${esc(t)}</code></a>`;
}
/** Inline markdown of a cell: `code`, **bold**; the rest is text. */
export function inline(md) {
  return md.split(/(`[^`]+`)/).map(part => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return code(part.slice(1, -1));
    return esc(part).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }).join('');
}

/** The tables of the document: [{ id, title, rows: [[cell, …]] }] in the order of GROUPS. */
export function parse(md) {
  const sections = md.split(/^## /m).slice(1).map(s => ({ heading: s.slice(0, s.indexOf('\n')).trim(), body: s }));
  return GROUPS.map(g => {
    const sec = sections.find(s => s.heading.startsWith(g.heading));
    if (!sec) throw new Error(`${DOC}: нет раздела «${g.heading}»`);
    const rows = sec.body.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1)   // the header row goes
      .map(l => l.trim().replace(/^\|\s*/, '').replace(/\s*\|$/, '').split(/\s+\|\s+/));
    const width = rows[0]?.length;
    rows.forEach((r, i) => { if (r.length !== width) throw new Error(`${DOC}, «${g.heading}»: в строке ${i + 1} ${r.length} ячеек вместо ${width}`); });
    return { ...g, rows };
  });
}

function row([req, done, where, check]) {
  const parts = [];
  if (where === undefined) parts.push(`<dl><div><dt>Где</dt><dd>${inline(done)}</dd></div></dl>`);   // a table of two columns
  else parts.push(`<p>${inline(done)}</p><dl><div><dt>Где</dt><dd>${inline(where)}</dd></div><div><dt>Проверка</dt><dd>${inline(check)}</dd></div></dl>`);
  return `<details class="req"><summary><span class="ok"><span class="sr">Сделано: </span></span><span class="rq">${inline(req)}</span></summary><div class="how">${parts.join('')}</div></details>`;
}

/** The block of the page: the criteria, the tools, every group with its rows. */
export function render(groups) {
  const count = id => groups.find(g => g.id === id).rows.length;
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const crit = CRITERIA.map(c => {
    const n = c.groups.reduce((s, id) => s + count(id), 0);
    return `<li><a class="ck" href="#rg-${c.groups[0]}" data-show="${c.groups.join(' ')}"><span class="ring" aria-hidden="true"><span>${n}</span></span><span class="cw">${esc(c.weight).replace(/ /g, NB)}</span><span class="cn">${esc(c.name)}</span><span class="cs">${n} из ${n} требований — сделано</span></a></li>`;
  }).join('');
  const chips = [`<button type="button" data-show="all" aria-pressed="true">Все <span>${total}</span></button>`,
    ...groups.map(g => `<button type="button" data-show="${g.id}" aria-pressed="false">${esc(g.short)} <span>${g.rows.length}</span></button>`)].join('');
  const tools = `<div class="tz-tools" hidden><div class="seg" role="group" aria-label="Какие требования показать">${chips}</div>`
    + `<div class="tz-find"><label class="sr" for="tz-q">Найти требование</label><input id="tz-q" type="search" placeholder="Найти: порог, 200 мс, СПППР, отчёт…" autocomplete="off" enterkeyhint="search" spellcheck="false"></div>`
    + `<button type="button" class="tz-open" aria-pressed="false">Раскрыть все</button><p class="tz-count" role="status">Показано ${total} из ${total}</p></div>`;
  const body = groups.map(g => `<section class="rg" data-group="${g.id}" aria-labelledby="rg-${g.id}"><h3 id="rg-${g.id}">${esc(g.title)}<small>${g.rows.length} из ${g.rows.length}</small></h3>${g.rows.map(row).join('')}</section>`).join('');
  return `<ol class="crit">${crit}</ol>${tools}<div class="reqs" data-total="${total}">${body}<p class="tz-none" hidden>Ничего не нашлось — попробуйте другое слово или «Все».</p></div>`;
}

export function build(page, md) {
  const a = page.indexOf('<!-- tz:begin -->'), b = page.indexOf('<!-- tz:end -->');
  if (a < 0 || b < a) throw new Error(`${PAGE}: нет меток <!-- tz:begin --> и <!-- tz:end -->`);
  return page.slice(0, a + '<!-- tz:begin -->'.length) + '\n' + render(parse(md)) + '\n' + page.slice(b);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const page = readFileSync(join(root, PAGE), 'utf8'), md = readFileSync(join(root, DOC), 'utf8');
  const next = build(page, md);
  if (process.argv.includes('--check')) {
    if (next !== page) { console.log(`✗ ${PAGE}: чек-лист ТЗ не совпадает с ${DOC} — node tools/pitch-tz.mjs`); process.exit(1); }
    console.log(`Чек-лист ТЗ на странице совпадает с ${DOC}`);
  } else {
    writeFileSync(join(root, PAGE), next);
    const groups = parse(md);
    console.log(`${PAGE}: чек-лист ТЗ — ${groups.reduce((n, g) => n + g.rows.length, 0)} требований: ${groups.map(g => `${g.short} ${g.rows.length}`).join(', ')}`);
  }
}
