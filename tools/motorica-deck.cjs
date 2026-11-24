#!/usr/bin/env node
/*
 * PDF и PowerPoint «Плана сотрудничества MOTUS Lab и ГК «Моторика»» — из той же страницы, что сайт.
 *
 *   npm i --no-save pptxgenjs@3.12.0 sharp@0.34.4 react-icons@5.5.0 react@18.3.1 react-dom@18.3.1 qrcode@1.5.4
 *   node tools/motorica-site.mjs     → motorica/index.html (слайды — HTML и SVG)
 *   node tools/motorica-deck.cjs     → motorica/MOTUS-Lab-Motorica.pdf, .pptx, og.jpg, slides.json
 *   node tools/motorica-site.mjs     → ещё раз: ссылки на PDF и PPTX получают свежие ?v= и размеры
 *
 * Chromium открывает motorica/?print=1 — все слайды подряд по 1600 × 900, без анимаций — и печатает PDF: текст
 * в нём векторный, ищется и копируется. PowerPoint собирается из снимков тех же слайдов (1920 × 1080) с текстом
 * выступления в заметках и разделами презентации; править текст нужно в tools/motorica/slides.mjs и data.mjs, иначе
 * сайт, PDF и PPTX разойдутся. slides.json — текст слайдов, речь, источники и числа модели (их сверяет Excel-модель).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'motorica');
const PDF = path.join(OUT, 'MOTUS-Lab-Motorica.pdf');
const PPTX = path.join(OUT, 'MOTUS-Lab-Motorica.pptx');
const TITLE = 'План сотрудничества MOTUS Lab и ГК «Моторика»';
const SUBJECT = '11 пакетов работ, стыки с Motorica Start и ATTILAN, пилот за 8 недель, данные и право, модель эффекта, решения';

// Свойства PDF: Chromium пишет только название страницы и «Chromium». Автора, тему и название маршрута дописываем
// инкрементальным обновлением (новый словарь /Info, своя таблица xref, /Prev на старую) — байты страниц не трогаем.
function pdfInfo(file, { title, subject }) {
  const buf = fs.readFileSync(file);
  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1');
  const tr = /trailer\s*<<([\s\S]*?)>>\s*startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!tr) throw new Error(`${path.basename(file)}: нет таблицы xref в конце файла — формат PDF Chromium сменился`);
  const size = +/\/Size (\d+)/.exec(tr[1])[1], root = /\/Root (\d+ \d+ R)/.exec(tr[1])[1], infoRef = /\/Info (\d+) 0 R/.exec(tr[1])?.[1];
  const head = buf.toString('latin1');
  const old = infoRef ? new RegExp(`(?:^|\\n)${infoRef} 0 obj\\s*<<([\\s\\S]*?)>>\\s*endobj`).exec(head)?.[1] ?? '' : '';
  const keep = ['Creator', 'Producer', 'CreationDate', 'ModDate'].map((k) => new RegExp(`/${k} \\([^()\\\\]*\\)`).exec(old)?.[0]).filter(Boolean);
  const u16 = (t) => '<FEFF' + [...Buffer.from(t, 'utf16le').swap16()].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase() + '>';
  const obj = `${size} 0 obj\n<</Title ${u16(title)}\n/Author ${u16('MOTUS Lab')}\n/Subject ${u16(subject)}\n${keep.join('\n')}>>\nendobj\n`;
  const at = buf.length + 1, xref = at + Buffer.byteLength(obj, 'latin1');
  const add = `\n${obj}xref\n0 1\n0000000000 65535 f \n${size} 1\n${String(at).padStart(10, '0')} 00000 n \n` +
    `trailer\n<</Size ${size + 1}\n/Root ${root}\n/Info ${size} 0 R\n/Prev ${tr[2]}>>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, Buffer.concat([buf, Buffer.from(add, 'latin1')]));
}

(async () => {
  const { startServer } = await import(path.join(ROOT, 'tools/static-server.mjs'));
  const { MODEL } = await import(path.join(ROOT, 'tools/motorica/model.mjs'));
  const { SECTIONS } = await import(path.join(ROOT, 'tools/motorica/slides.mjs'));
  const D = await import(path.join(ROOT, 'tools/motorica/data.mjs'));
  const srv = await startServer({ root: ROOT });
  const origin = new URL(srv.url).origin;
  const browser = await chromium.launch();
  try {
    // ── PDF: вектор, по странице на слайд ──
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${origin}/motorica/?print=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    if (errors.length) throw new Error('ошибки на странице: ' + errors.join('; '));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: PDF, width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    pdfInfo(PDF, { title: TITLE, subject: SUBJECT });
    await page.emulateMedia({ media: 'screen' });

    // ── PDF маршрута читателя (D.READERS): только его слайды — то, что читатель открывает или пересылает ──
    for (const r of D.READERS) {
      const rp = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      await rp.goto(`${origin}/motorica/?print=1&route=${r.id}`, { waitUntil: 'load' });
      await rp.waitForFunction(() => document.documentElement.dataset.ready === '1');
      const shown = await rp.$$eval('#deck > .s:not(.print-out)', (ss) => ss.length);
      if (shown < 10) throw new Error(`маршрут ${r.id}: в печати ${shown} слайдов`);
      await rp.emulateMedia({ media: 'print' });
      await rp.pdf({ path: path.join(OUT, `MOTUS-Lab-Motorica-${r.id}.pdf`), width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
      pdfInfo(path.join(OUT, `MOTUS-Lab-Motorica-${r.id}.pdf`), { title: `${r.t} — маршрут на ${r.minutes} минут · MOTUS Lab × ГК «Моторика»`, subject: `${shown} слайдов маршрута «${r.t}» из плана сотрудничества MOTUS Lab и ГК «Моторика»` });
      await rp.close();
    }

    // Текст слайдов для slides.json: заголовок, подзаголовок, строки тела, речь и источники — из того же DOM
    const meta = await page.$$eval('#deck > .s', (ss) => ss.map((s) => {
      const t = (sel) => (s.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
      // Контакты живут в одном месте — в блоке contacts страницы; в slides.json и замещающий текст PPTX их не копируем
      const body = s.querySelector('.body');
      const keep = [...(body?.querySelectorAll('[data-contacts] .name, [data-contacts] .ct') || [])].map((e) => [e, e.style.display]);
      keep.forEach(([e]) => { e.style.display = 'none'; });
      const lines = (body?.innerText || '').split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      keep.forEach(([e, d]) => { e.style.display = d; });
      return { n: +s.dataset.n, sec: s.dataset.sec, layout: [...s.classList].find((c) => c.startsWith('L-'))?.slice(2), core: s.classList.contains('core'),
        kicker: t('.kicker'), title: t('.title'), lead: t('.sh .lead'), lines, notes: t('.speech p'), sources: t('.src').replace(/^Источники:\s*/, '') };
    }));
    const { SLIDES } = await import(path.join(ROOT, 'tools/motorica/slides.mjs'));
    if (meta.length !== SLIDES.length) throw new Error(`на странице ${meta.length} слайдов, в колоде ${SLIDES.length}`);

    // ── Снимки 1920 × 1080 для PowerPoint и обложка для превью ссылок ──
    const shotPage = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
    await shotPage.goto(`${origin}/motorica/?print=1`, { waitUntil: 'load' });
    await shotPage.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const shots = [];
    for (const m of meta) {
      const el = await shotPage.$(`#s${m.n}`);
      const png = await el.screenshot({ type: 'png' });
      shots.push(await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
    }
    await sharp(shots[0]).resize(1200, 675).extract({ left: 0, top: 22, width: 1200, height: 630 }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'og.jpg'));
    // Превью короткого адреса маршрута (/motorica/neuro/) — его слайд «Нейротехнологии и инновации»
    const reader = meta.findIndex((m) => m.layout === 'reader');
    if (reader < 0) throw new Error('нет слайда маршрута читателя для og-innov.jpg');
    await sharp(shots[reader]).resize(1200, 675).extract({ left: 0, top: 22, width: 1200, height: 630 }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'og-innov.jpg'));

    // ── PowerPoint: снимок на весь слайд, речь в заметках, разделы ──
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'MOTUS Lab';
    pres.company = 'MOTUS Lab';
    pres.title = TITLE;
    pres.subject = SUBJECT;
    const secTitle = Object.fromEntries(SECTIONS.map((s) => [s.id, s.t]));
    let lastSec = '';
    for (const [i, m] of meta.entries()) {
      if (m.sec !== lastSec) { pres.addSection({ title: secTitle[m.sec] }); lastSec = m.sec; }
      const s = pres.addSlide({ sectionTitle: secTitle[m.sec] });
      s.background = { color: '071019' };
      const alt = [m.title, m.lead, ...m.lines].filter(Boolean).join('. ').slice(0, 1800);
      s.addImage({ data: 'image/jpeg;base64,' + shots[i].toString('base64'), x: 0, y: 0, w: 13.333, h: 7.5, altText: alt });
      s.addNotes(`${m.core ? '[основной маршрут] ' : '[для вопросов] '}${m.notes}\n\nИсточники: ${m.sources}`);
    }
    await pres.writeFile({ fileName: PPTX });
    // Без записей-папок в ZIP: с ними PPTX не открывается или не редактируется совместно в облаке (OneDrive, SharePoint)
    {
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(fs.readFileSync(PPTX));
      const files = Object.keys(zip.files).filter((n) => !zip.files[n].dir);   // zip.remove() у папки удалил бы и её файлы
      const order = ['[Content_Types].xml', ...files.filter((n) => n !== '[Content_Types].xml')];
      const out = new JSZip();
      for (const n of order) out.file(n, await zip.files[n].async('nodebuffer'), { date: new Date('2026-01-01T00:00:00Z'), createFolders: false });
      fs.writeFileSync(PPTX, await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
    }

    // ── slides.json: текст, речь, источники и числа модели ──
    fs.writeFileSync(path.join(OUT, 'slides.json'), JSON.stringify({
      title: TITLE, site: D.SITE, demo: D.DEMO, generated: 'tools/motorica-site.mjs → tools/motorica-deck.cjs',
      model: { years: MODEL.years, scenarios: Object.fromEntries(Object.entries(MODEL.scen).map(([k, v]) => [k, { name: v.name, reach: v.reach, drop: v.drop,
        mix: v.mix, hours: v.hours, retained: v.retained, l1: v.l1, l2: v.l2, total: v.total, cum: v.cum, saving: v.saving, ebitda2031: v.ebitda5, fte: v.fte,
        l4: v.l4, l5: v.l5, l6: v.l6, l7: v.l7, ops: v.ops, ebitdaFull: v.ebitdaFull, ebitdaFullCum: v.ebitdaFullCum, cashPulled: v.cashPulled,
        visits: v.visits, docHoursSaved: v.docHoursSaved, onboardFte: v.onboardFte, specialistHours: v.specialistHours }])),
      asp: MODEL.asp, newUsers: MODEL.newUsers, cycleRevenue: MODEL.cycleRevenue, cycleEbitda: MODEL.cycleEbitda,
      breakEvenRevenue: MODEL.breakEvenRevenue, breakEvenEbitda: MODEL.breakEvenEbitda },
      sections: SECTIONS,
      slides: meta,
    }, null, 2) + '\n');
    const kb = (f) => Math.round(fs.statSync(f).size / 1024);
    console.log(`motorica/MOTUS-Lab-Motorica.pdf: ${kb(PDF)} КБ; .pptx: ${kb(PPTX)} КБ; ${meta.length} слайдов, ${meta.filter((m) => m.core).length} в маршруте на 20 минут`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
