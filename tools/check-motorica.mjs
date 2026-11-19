#!/usr/bin/env node
// Сайт презентации для «Моторики» без браузера.   node tools/check-motorica.mjs
// Слайдов в slides.json столько же, сколько картинок и статей на странице; каждая ссылка на файл ведёт к файлу, а её
// ?v= совпадает с его хэшем; телефон и почта — только в блоке contacts:begin/end; есть CSP, noindex, lang и alt;
// якоря ведут к существующим id; числа эффекта на странице — те же, что в модели колоды.
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

const pics = readdirSync(join(dir, 'slides'));
const big = pics.filter((f) => /^slide-\d\d\.webp$/.test(f)).length;
const small = pics.filter((f) => /^slide-\d\d-640\.webp$/.test(f)).length;
const articles = (html.match(/<article class="slide" id="slide-\d+"/g) || []).length;
if (!(slides.length === big && big === small && small === articles)) fail(`слайдов ${slides.length}, картинок ${big} и ${small}, статей ${articles}`);
slides.forEach((s, i) => { if (s.n !== i + 1) fail(`slides.json: слайд ${i + 1} записан как ${s.n}`); });

const hash = (rel) => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex').slice(0, 8);
const refs = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"|srcset="([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((x) => x.trim().split(/\s+/)[0])));
for (const ref of new Set(refs)) {
  if (/^(https?:|mailto:|tel:|\.\.\/)/.test(ref)) continue;
  const [file, query] = ref.split('?');
  if (!existsSync(join(dir, file))) { fail(`нет файла ${file}`); continue; }
  if (query && query !== `v=${hash(file)}`) fail(`устаревший ?v= у ${file}: ${query}, а хэш ${hash(file)}`);
}
for (const f of ['fonts/inter-cyr.woff2', 'fonts/unbounded-cyr.woff2', 'sw.js', 'og.jpg']) if (!existsSync(join(dir, f))) fail(`нет ${f}`);
const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
for (const ref of JSON.parse(/const CORE = (\[.*\]);/.exec(sw)?.[1] ?? '[]')) {
  if (ref === './') continue;
  const [file, query] = ref.split('?');
  if (!existsSync(join(dir, file)) || (query && query !== `v=${hash(file)}`)) fail(`sw.js: устаревший или пропавший файл ${ref} — node tools/motorica-site.mjs`);
}

const CONTACT = /(\+7|\b8)[\s( -]*\d{3}[\s) -]*\d{3}[\s ‑-]*\d{2}[\s ‑-]*\d{2}|\+79154528864|[\w.+-]+@[\w-]+\.[a-z]{2,}|&#8209;/gi;
const begin = html.indexOf('<!-- contacts:begin -->');
const end = html.indexOf('<!-- contacts:end -->');
if (begin < 0 || end < begin) fail('нет блока contacts:begin … contacts:end');
const outside = (html.slice(0, begin) + html.slice(end)).match(CONTACT);
if (outside) fail(`контакты вне блока contacts: ${[...new Set(outside)].join(', ')}`);
const contact = new RegExp(CONTACT.source, 'i');   // без флага g: test() не помнит прошлую позицию
for (const f of ['app.js', 'site.css', 'sw.js']) if (contact.test(readFileSync(join(dir, f), 'utf8'))) fail(`контакты в ${f}`);
for (const s of slides) for (const t of [...s.lines, s.notes, s.sources]) if (t && contact.test(t)) fail(`контакты в тексте слайда ${s.n}`);

if (!/<html lang="ru">/.test(html)) fail('нет lang="ru"');
if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) fail('нет noindex');
if (!/http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';/.test(html)) fail('нет строгой CSP');
if (/\sstyle="|<style|<script>(?!<\/script>)/.test(html)) fail('встроенные стили или скрипты — CSP их не пропустит');
for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(m[0])) fail(`картинка без alt: ${m[0].slice(0, 80)}`);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) fail(`повторяются id: ${[...new Set(dup)].join(', ')}`);
for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(m[1])) fail(`якорь #${m[1]} никуда не ведёт`);

const base = model.scenarios.base;
const rub = (x) => Math.round(x).toLocaleString('ru-RU');
for (const x of [...base.total, base.cum, base.ebitda2031]) if (!html.includes(`<td>${rub(x)}</td>`)) fail(`в таблице эффекта нет числа ${rub(x)} из модели`);

if (problems.length) {
  console.error(`Сайт «Моторики» — ${problems.length} проблем:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`motorica: ${slides.length} слайдов = ${big} картинок = ${articles} статей; ссылки, ?v=, контакты, CSP, alt и якоря в порядке`);
