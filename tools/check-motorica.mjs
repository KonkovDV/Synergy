#!/usr/bin/env node
// Сайт и колода для «Моторики» без браузера.   node tools/check-motorica.mjs
// Один источник — tools/motorica/*.mjs: сайт (index.html), PDF, PowerPoint и slides.json должны быть собраны из одного
// и того же состояния. Проверяется: слайдов на странице столько же, сколько страниц PDF, слайдов PPTX (и заметок к ним)
// и записей slides.json, а заголовки и текст выступления совпадают — значит, PDF и PPTX не устарели; каждая ссылка на
// файл ведёт к файлу, а её ?v= совпадает с его хэшем; телефон и почта — только в блоке contacts:begin/end главной
// страницы; есть CSP, noindex, lang и alt; id не повторяются, якоря ведут к существующим id; маршруты кресел и
// «20 минут» ссылаются на существующие слайды; числа модели на странице — те же, что в slides.json; план на сайте
// собран из текущего motorica/PLAN.md; в офлайн-копии нет устаревших файлов.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'motorica');
const problems = [];
const fail = (m) => problems.push(m);
const { slides, model, sections } = JSON.parse(readFileSync(join(dir, 'slides.json'), 'utf8'));
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const plan = readFileSync(join(dir, 'plan.html'), 'utf8');
const N = slides.length;   // столько слайдов в колоде; страница, PDF и PPTX должны совпасть с ним

// ── 1. Число слайдов везде одно: страница, PDF, PPTX, slides.json ──
const secs = [...html.matchAll(/<section class="s L-([\w-]+)( core)?" id="s(\d+)" data-n="(\d+)" data-sec="(\w+)"/g)];
if (secs.length !== N) fail(`на странице ${secs.length} слайдов, а нужно ${N}`);
secs.forEach((m, i) => { if (+m[3] !== i + 1 || +m[4] !== i + 1) fail(`слайд ${i + 1} на странице записан как id s${m[3]}, data-n ${m[4]}`); });
if (slides.length !== N) fail(`slides.json: ${slides.length} слайдов`);
slides.forEach((s, i) => { if (s.n !== i + 1) fail(`slides.json: слайд ${i + 1} записан как ${s.n}`); });

const pdf = readFileSync(join(dir, 'MOTUS-Lab-Motorica.pdf')).toString('latin1');
const pages = (pdf.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
if (pages !== N) fail(`PDF: ${pages} страниц, а слайдов ${N} — node tools/motorica-deck.cjs`);
if (!/\/Outlines\b/.test(pdf)) fail('PDF без оглавления (outline)');
const pptx = readFileSync(join(dir, 'MOTUS-Lab-Motorica.pptx')).toString('latin1');
const pSlides = new Set(pptx.match(/ppt\/slides\/slide\d+\.xml/g) || []).size;
const pNotes = new Set(pptx.match(/ppt\/notesSlides\/notesSlide\d+\.xml/g) || []).size;
if (pSlides !== N || pNotes !== N) fail(`PPTX: ${pSlides} слайдов и ${pNotes} страниц заметок, а нужно ${N}`);

// Текст слайдов на странице и в slides.json (а значит, в PDF и PPTX, снятых с той же страницы) совпадает
const plainText = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;| /g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const parts = html.split(/(?=<section class="s )/).slice(1);
parts.forEach((part, i) => {
  const s = slides[i];
  if (!s) return;
  const title = plainText(/<h[12] class="title" id="h\d+">([\s\S]*?)<\/h[12]>/.exec(part)?.[1] ?? '');
  const notes = plainText(/<details class="speech"><summary>[^<]*<\/summary><p>([\s\S]*?)<\/p>/.exec(part)?.[1] ?? '');
  if (title !== norm(s.title)) fail(`слайд ${i + 1}: заголовок на странице «${title}», в slides.json «${norm(s.title)}» — PDF и PPTX устарели, node tools/motorica-deck.cjs`);
  if (notes !== norm(s.notes)) fail(`слайд ${i + 1}: текст выступления на странице и в slides.json расходится — node tools/motorica-deck.cjs`);
  if (!s.notes || s.notes.length < 80) fail(`слайд ${i + 1}: нет текста выступления`);
  if (!s.sources) fail(`слайд ${i + 1}: нет источников`);
  if (/\{#[\w:]+\}|undefined|NaN|\[object /.test(part)) fail(`слайд ${i + 1}: неразрешённая ссылка или пустое значение в тексте`);
  // Типографика: перед тире — неразрывный пробел, иначе строка может начаться с тире (так было в заголовках до 24.11.2026)
  for (const m of part.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/>([^<]+)</g)) if (/ [—–] /.test(m[1])) { fail(`слайд ${i + 1}: обычный пробел перед тире — строка может начаться с тире: «${m[1].trim().slice(0, 50)}»`); break; }
});
const secIds = new Set(sections.map((x) => x.id));
for (const m of secs) if (!secIds.has(m[5])) fail(`слайд ${m[3]}: раздел ${m[5]} не описан`);

// ── 2. Маршруты: «20 минут» и восемь кресел ──
const deck = JSON.parse(/<script type="application\/json" id="deck-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}');
const coreHtml = secs.filter((m) => m[2]).map((m) => +m[3]);
if (JSON.stringify(deck.core) !== JSON.stringify(coreHtml)) fail(`маршрут «20 минут» в данных (${deck.core}) и на странице (${coreHtml}) расходится`);
if (coreHtml.length < 15 || coreHtml.length > 24) fail(`в маршруте «20 минут» ${coreHtml.length} слайдов — это не 20 минут`);
if (JSON.stringify(slides.filter((s) => s.core).map((s) => s.n)) !== JSON.stringify(coreHtml)) fail('маршрут «20 минут» в slides.json устарел');
const chairs = Object.entries(deck.chairs || {});
if (chairs.length !== 8) fail(`кресел ${chairs.length}, а нужно 8`);
for (const [id, c] of chairs) {
  if (!c.slides?.length || c.slides.some((n) => n < 1 || n > N)) fail(`маршрут кресла ${id}: ${c.slides}`);
  if (!html.includes(`<option value="${id}">`)) fail(`маршрута кресла ${id} нет в списке маршрутов`);
  if (!html.includes(`data-chair="${id}"`)) fail(`у кресла ${id} нет карточки, которая включает маршрут`);
}

// ── 2а. Маршрут читателя «Департамент инноваций»: те же слайды на странице (data-ch), в списке маршрутов, на своём слайде и в своём PDF ──
const readers = Object.entries(deck.readers || {});
if (readers.length !== 1 || !deck.readers.innov) fail(`маршрутов читателя ${readers.length}, а нужен один — innov`);
const chOf = [...html.matchAll(/<section class="s [^"]*" id="s(\d+)" data-n="\d+" data-sec="\w+" data-ch="([^"]*)"/g)].map((m) => [+m[1], m[2].split(' ')]);
for (const [id, r] of readers) {
  const want = chOf.filter(([, ch]) => ch.includes(id)).map(([n]) => n);
  if (JSON.stringify(r.slides) !== JSON.stringify(want)) fail(`маршрут ${id}: в данных ${r.slides}, на странице ${want}`);
  if (r.slides.length < 10 || r.slides.length > 22 || r.slides[0] !== 1) fail(`маршрут ${id}: ${r.slides.length} слайдов, первый — ${r.slides[0]}`);
  if (!html.includes(`<option value="${id}">`)) fail(`маршрута ${id} нет в списке маршрутов`);
  const readerSlide = slides.find((s) => s.layout === 'reader')?.n;
  if (!readerSlide || !r.slides.includes(readerSlide)) fail(`маршрут ${id} не открывается своим слайдом`);
  const file = `MOTUS-Lab-Motorica-${id}.pdf`;
  if (!existsSync(join(dir, file))) { fail(`нет ${file} — node tools/motorica-deck.cjs`); continue; }
  const rpdf = readFileSync(join(dir, file)).toString('latin1');
  const rpages = (rpdf.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  if (rpages !== r.slides.length) fail(`${file}: ${rpages} страниц, а в маршруте ${r.slides.length} слайдов — node tools/motorica-deck.cjs`);
  if (!html.includes(`href="${file}?v=`)) fail(`на странице нет ссылки на ${file}`);
}

// ── 3. Файлы, ?v=, CSP, noindex, alt, id и якоря ──
const hash = (rel) => createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex').slice(0, 8);
const CONTACT = /(\+7|\b8)[\s( -]*\d{3}[\s) -]*\d{3}[\s ‑-]*\d{2}[\s ‑-]*\d{2}|\+79154528864|[\w.+-]+@[\w-]+\.[a-z]{2,}|&#8209;/gi;
const contact = new RegExp(CONTACT.source, 'i');   // без флага g: test() не помнит прошлую позицию

function page(name, text) {
  const refs = [...text.matchAll(/(?:href|src)="([^"#][^"]*)"|srcset="([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((x) => x.trim().split(/\s+/)[0])));
  for (const ref of new Set(refs)) {
    if (/^(https?:|mailto:|tel:|\.\.\/)/.test(ref)) continue;
    const [file, query] = ref.split('#')[0].split('?');
    if (!existsSync(join(dir, file || '.'))) { fail(`${name}: нет файла ${file}`); continue; }
    if (query && query !== `v=${hash(file)}`) fail(`${name}: устаревший ?v= у ${file}: ${query}, а хэш ${hash(file)}`);
  }
  if (!/<html lang="ru"/.test(text)) fail(`${name}: нет lang="ru"`);
  if (!/<meta name="robots" content="noindex, nofollow">/.test(text)) fail(`${name}: нет noindex`);
  if (!/http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';/.test(text)) fail(`${name}: нет строгой CSP`);
  if (/\sstyle="|<style|<script>(?!<\/script>)|\son[a-z]+="/.test(text)) fail(`${name}: встроенные стили, скрипты или обработчики — CSP их не пропустит`);
  for (const m of text.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]*"/.test(m[0])) fail(`${name}: картинка без alt: ${m[0].slice(0, 80)}`);
  // SVG — либо украшение (aria-hidden), либо картинка или группа со ссылками (role="img" / "group") с подписью
  for (const m of text.matchAll(/<svg\b[^>]*>/g)) if (!/aria-hidden="true"|role="(?:img|group)"[^>]*aria-label="[^"]+"|aria-label="[^"]+"[^>]*role="(?:img|group)"/.test(m[0])) fail(`${name}: SVG без aria-hidden и без подписи: ${m[0].slice(0, 90)}`);
  const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${name}: повторяются id: ${[...new Set(dup)].join(', ')}`);
  for (const m of text.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(m[1])) fail(`${name}: якорь #${m[1]} никуда не ведёт`);
  for (const m of text.matchAll(/aria-(?:labelledby|controls|describedby)="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) if (!ids.includes(id)) fail(`${name}: aria-ссылка на несуществующий id ${id}`);
  return ids;
}
const indexIds = page('index.html', html);
page('plan.html', plan);
{ const bad = [...plan.replace(/<(script|title)[^>]*>[\s\S]*?<\/\1>/g, '').matchAll(/>([^<]+)</g)].find((m) => / [—–] /.test(m[1])); if (bad) fail(`plan.html: обычный пробел перед тире — строка может начаться с тире: «${bad[1].trim().slice(0, 50)}»`); }
for (const m of plan.matchAll(/href="\.\/#([^"]+)"/g)) if (!indexIds.includes(m[1])) fail(`plan.html: ссылка ./#${m[1]} никуда не ведёт на главной`);
if (!html.includes('href="plan.html')) fail('главная не ссылается на план сотрудничества');
const contactsSlide = slides.find((s) => s.layout === 'decisions')?.n;
if (!plan.includes(`href="./#s${contactsSlide}"`)) fail('план не ведёт к контактам на главной');
if (/href="#\d+"/.test(html)) fail('ссылки на слайды вида #N — нужны #sN, как id слайдов');

for (const f of ['fonts/inter-cyr.woff2', 'fonts/inter-lat.woff2', 'fonts/unbounded-cyr.woff2', 'fonts/unbounded-lat.woff2', 'sw.js', 'og.jpg', 'img/ambassador.webp', 'img/modes-emg.webp', 'img/modes-bci.webp', 'img/modes-glasses.webp', 'img/hero-hand.webp',
  'MOTUS-Lab-Motorica.pdf', 'MOTUS-Lab-Motorica-innov.pdf', 'MOTUS-Lab-Motorica.pptx', 'MOTUS-Lab-Motorica-model.xlsx']) if (!existsSync(join(dir, f))) fail(`нет ${f}`);
if (existsSync(join(dir, 'slides'))) fail('motorica/slides/ — картинки прошлой колоды; страница больше на них не ссылается');
const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
const core = JSON.parse(/const CORE = (\[.*\]);/.exec(sw)?.[1] ?? '[]');
if (!core.includes('plan.html') || !core.includes('./')) fail('sw.js: страница или план не попадают в офлайн-копию');
for (const ref of core) {
  if (ref === './') continue;
  const [file, query] = ref.split('?');
  if (!existsSync(join(dir, file)) || (query && query !== `v=${hash(file)}`)) fail(`sw.js: устаревший или пропавший файл ${ref} — node tools/motorica-site.mjs`);
}
for (const m of html.matchAll(/<img\b[^>]*src="(img\/[^"?]+)/g)) if (!core.some((r) => r.startsWith(m[1]))) fail(`sw.js: картинки ${m[1]} нет в офлайн-копии`);

// ── 4. Контакты — только в блоке contacts ──
const begin = html.indexOf('<!-- contacts:begin -->');
const end = html.indexOf('<!-- contacts:end -->');
if (begin < 0 || end < begin) fail('нет блока contacts:begin … contacts:end');
// Данные калькулятора (JSON) — числа с длинной дробной частью похожи на телефон; в них проверяем только строки
const jsonRe = /<script type="application\/json" id="deck-data">[\s\S]*?<\/script>/;
const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
for (const t of strings(deck)) if (contact.test(t)) fail(`контакты в данных страницы: ${t.slice(0, 60)}`);
const outside = (html.slice(0, begin).replace(jsonRe, '') + html.slice(end).replace(jsonRe, '')).match(CONTACT);
if (outside) fail(`контакты вне блока contacts: ${[...new Set(outside)].join(', ')}`);
if (contact.test(plan)) fail('контакты на странице плана — там должна быть только ссылка на слайд с контактами');
for (const f of ['app.js', 'site.css', 'sw.js', 'PLAN.md', 'README.md']) if (contact.test(readFileSync(join(dir, f), 'utf8'))) fail(`контакты в ${f}`);
for (const s of slides) for (const t of [...s.lines, s.notes, s.sources]) if (t && contact.test(t)) fail(`контакты в тексте слайда ${s.n} (slides.json)`);

// ── 5. План на сайте собран из текущего PLAN.md ──
const planFlat = plan.replace(/\u00a0/g, ' ');   // типографика страницы ставит неразрывные пробелы
for (const m of readFileSync(join(dir, 'PLAN.md'), 'utf8').matchAll(/^## (.+)$/gm)) {
  const title = m[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*|`/g, '');
  if (!planFlat.includes(title.replace(/(\d+)–(\d+)/g, '<span class="nw">$1–$2</span>'))) fail(`plan.html устарел: нет раздела «${m[1]}» — node tools/motorica-site.mjs`);
}

// ── 5а. План говорит то же, что колода: все пакеты работ с теми же названиями и итоги модели ──
const D = await import(new URL('./motorica/data.mjs', import.meta.url).href);
const planMd = readFileSync(join(dir, 'PLAN.md'), 'utf8').replace(/\u00a0/g, ' ');
for (const w of D.WPS) if (!planMd.includes(`### ${w.id}. ${w.t.replace(/\u00a0/g, ' ')}`)) fail(`PLAN.md: нет пакета «${w.id}. ${w.t}» — названия в плане и в колоде должны совпадать`);
const rubP = (x) => Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' ');
for (const [k, s] of Object.entries(model.scenarios)) {
  const row = `| ${s.name} | ${[s.total[4], s.cum, s.ebitdaFull[4], s.ebitdaFullCum, s.cashPulled].map(rubP).join(' | ')} |`;
  if (!planMd.includes(row)) fail(`PLAN.md: строка сценария «${s.name}» в разделе «Бизнес-эффект» не совпадает с моделью: нужно ${row}`);
}
for (const x of [`+${rubP(model.scenarios.base.total[4])} млн ₽ выручки`, `+${rubP(model.scenarios.base.ebitdaFull[4])} млн ₽ EBITDA`]) if (!planMd.includes(x)) fail(`PLAN.md: в разделе «Коротко» нет «${x}» из модели`);

// ── 6. Числа модели на странице — из той же модели, что slides.json и Excel ──
const rub = (x) => Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' ');
for (const [k, s] of Object.entries(model.scenarios)) {
  for (const [o, x] of [['2031', s.total[4]], ['cum', s.cum], ['ebitda', s.ebitdaFull[4]]]) {
    // пробел между разрядами — любой: обычный или неразрывный (типограф ставит неразрывный)
    const num = rub(x).split(' ').join('[\\s\\u00a0\\u202f]');
    if (!new RegExp(`data-o="${k}-${o}">${num}<`).test(html)) fail(`в таблице сценариев нет числа ${rub(x)} (${k}-${o}) из модели`);
  }
}
const b = model.scenarios.base;
if (Math.abs(b.ebitdaFull[4] - (b.total[4] * 0.26 + b.ops)) > 0.01) fail('EBITDA 2031 со всеми рычагами ≠ (L1 + L2) × маржа + L3…L6');
// L7 — экономия на стоимости денег: это проценты, ниже EBITDA. В EBITDA входят только рычаги затрат L3–L6.
if (Math.abs(b.ops - (b.saving + b.l4 + b.l5 + b.l6)) > 0.01) fail('рычаги затрат L3–L6 не сходятся — L7 (стоимость денег) в EBITDA не входит');
if (Math.abs(b.l7 - b.cashPulled * 0.15) > 0.01) fail('L7 ≠ оборотный капитал × стоимость денег');
for (const k of ['cons', 'base', 'opt']) if (!(model.scenarios[k].ebitdaFull.every((x, i, a) => i === 0 || x > a[i - 1]))) fail(`сценарий ${k}: EBITDA по годам не растёт`);
if (!(model.scenarios.cons.ebitdaFull[4] < b.ebitdaFull[4] && b.ebitdaFull[4] < model.scenarios.opt.ebitdaFull[4])) fail('сценарии не упорядочены: консервативный < базовый < оптимистичный');
if (deck.model?.base?.margin !== 0.26) fail('калькулятор на странице получает не ту базу модели');

const slidesRu = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'слайд' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слайда' : 'слайдов'}`;
if (problems.length) {
  console.error(`Сайт «Моторики» — ${problems.length} проблем:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`motorica: ${N} слайдов = ${pages} страниц PDF = ${pSlides} слайдов PPTX = slides.json, текст совпадает; маршрут на 20 минут — ${slidesRu(coreHtml.length)}, кресел — ${chairs.length}, маршрут департамента инноваций — ${slidesRu(deck.readers?.innov?.slides.length ?? 0)} = страниц его PDF; план — ${(plan.match(/<h2 id="sec-/g) || []).length} разделов; ссылки, ?v=, контакты, CSP, alt, id и якоря в порядке; числа модели сходятся`);
