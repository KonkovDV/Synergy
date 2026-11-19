#!/usr/bin/env node
// Сайт презентации для «Моторики» без браузера.   node tools/check-motorica.mjs
// Слайдов в slides.json столько же, сколько картинок и статей на странице; каждая ссылка на файл ведёт к файлу, а её
// ?v= совпадает с его хэшем; телефон и почта — только в блоке contacts:begin/end главной страницы, на странице плана
// их нет; есть CSP, noindex, lang и alt; якоря ведут к существующим id; числа эффекта на странице — те же, что в модели
// колоды; план на сайте собран из текущего motorica/PLAN.md.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'motorica');
const problems = [];
const fail = (m) => problems.push(m);
const { slides, model } = JSON.parse(readFileSync(join(dir, 'slides.json'), 'utf8'));
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const plan = readFileSync(join(dir, 'plan.html'), 'utf8');

const pics = readdirSync(join(dir, 'slides'));
const big = pics.filter((f) => /^slide-\d\d\.webp$/.test(f)).length;
const small = pics.filter((f) => /^slide-\d\d-640\.webp$/.test(f)).length;
const articles = (html.match(/<article class="slide" id="slide-\d+"/g) || []).length;
if (!(slides.length === big && big === small && small === articles)) fail(`слайдов ${slides.length}, картинок ${big} и ${small}, статей ${articles}`);
slides.forEach((s, i) => { if (s.n !== i + 1) fail(`slides.json: слайд ${i + 1} записан как ${s.n}`); });

const hash = (rel) => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex').slice(0, 8);
const CONTACT = /(\+7|\b8)[\s( -]*\d{3}[\s) -]*\d{3}[\s ‑-]*\d{2}[\s ‑-]*\d{2}|\+79154528864|[\w.+-]+@[\w-]+\.[a-z]{2,}|&#8209;/gi;
const contact = new RegExp(CONTACT.source, 'i');   // без флага g: test() не помнит прошлую позицию

function page(name, text) {
  const refs = [...text.matchAll(/(?:href|src)="([^"#][^"]*)"|srcset="([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((x) => x.trim().split(/\s+/)[0])));
  for (const ref of new Set(refs)) {
    if (/^(https?:|mailto:|tel:|\.\.\/)/.test(ref)) continue;
    const [file, query] = ref.split('#')[0].split('?');
    if (!existsSync(join(dir, file || '.'))) { fail(`${name}: нет файла ${file}`); continue; }
    if (query && query !== `v=${hash(file)}`) fail(`${name}: устаревший ?v= у ${file}: ${query}, а хэш ${hash(file)}`);
  }
  if (!/<html lang="ru">/.test(text)) fail(`${name}: нет lang="ru"`);
  if (!/<meta name="robots" content="noindex, nofollow">/.test(text)) fail(`${name}: нет noindex`);
  if (!/http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';/.test(text)) fail(`${name}: нет строгой CSP`);
  if (/\sstyle="|<style|<script>(?!<\/script>)/.test(text)) fail(`${name}: встроенные стили или скрипты — CSP их не пропустит`);
  for (const m of text.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(m[0])) fail(`${name}: картинка без alt: ${m[0].slice(0, 80)}`);
  const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${name}: повторяются id: ${[...new Set(dup)].join(', ')}`);
  for (const m of text.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(m[1])) fail(`${name}: якорь #${m[1]} никуда не ведёт`);
  return ids;
}

const indexIds = page('index.html', html);
page('plan.html', plan);
for (const m of plan.matchAll(/href="\.\/#([^"]+)"/g)) if (!indexIds.includes(m[1])) fail(`plan.html: ссылка ./#${m[1]} никуда не ведёт на главной`);
if (!html.includes('href="plan.html"')) fail('главная не ссылается на план сотрудничества');

for (const f of ['fonts/inter-cyr.woff2', 'fonts/unbounded-cyr.woff2', 'sw.js', 'og.jpg']) if (!existsSync(join(dir, f))) fail(`нет ${f}`);
const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
const core = JSON.parse(/const CORE = (\[.*\]);/.exec(sw)?.[1] ?? '[]');
if (!core.includes('plan.html')) fail('sw.js: план не попадает в офлайн-копию');
for (const ref of core) {
  if (ref === './') continue;
  const [file, query] = ref.split('?');
  if (!existsSync(join(dir, file)) || (query && query !== `v=${hash(file)}`)) fail(`sw.js: устаревший или пропавший файл ${ref} — node tools/motorica-site.mjs`);
}

const begin = html.indexOf('<!-- contacts:begin -->');
const end = html.indexOf('<!-- contacts:end -->');
if (begin < 0 || end < begin) fail('нет блока contacts:begin … contacts:end');
const outside = (html.slice(0, begin) + html.slice(end)).match(CONTACT);
if (outside) fail(`контакты вне блока contacts: ${[...new Set(outside)].join(', ')}`);
if (contact.test(plan)) fail('контакты на странице плана — там должна быть только ссылка на блок «Контакты» главной');
for (const f of ['app.js', 'site.css', 'sw.js', 'PLAN.md']) if (contact.test(readFileSync(join(dir, f), 'utf8'))) fail(`контакты в ${f}`);
for (const s of slides) for (const t of [...s.lines, s.notes, s.sources]) if (t && contact.test(t)) fail(`контакты в тексте слайда ${s.n}`);

// План на сайте собран из текущего PLAN.md: каждый заголовок раздела есть на странице.
for (const m of readFileSync(join(dir, 'PLAN.md'), 'utf8').matchAll(/^## (.+)$/gm)) {
  const title = m[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*|`/g, '');
  if (!plan.includes(title.replace(/(\d)–(\d)/g, '<span class="nowrap">$1–$2</span>'))) fail(`plan.html устарел: нет раздела «${m[1]}» — node tools/motorica-site.mjs`);
}

const base = model.scenarios.base;
const rub = (x) => Math.round(x).toLocaleString('ru-RU');
for (const x of [...base.total, base.cum, base.ebitda2031]) if (!html.includes(`<td>${rub(x)}</td>`)) fail(`в таблице эффекта нет числа ${rub(x)} из модели`);

if (problems.length) {
  console.error(`Сайт «Моторики» — ${problems.length} проблем:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`motorica: ${slides.length} слайдов = ${big} картинок = ${articles} статей; план — ${(plan.match(/<h2 id="sec-/g) || []).length} разделов; ссылки, ?v=, контакты, CSP, alt и якоря в порядке`);
