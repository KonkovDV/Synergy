// The pitch of the final (pitch/): the talk, the slides and the numbers stay in step.   npm run check:pitch
// 17.11.2026, the night before the final: the deck, its notes, the script and the text copy of the slides were edited
// separately, and the gate of the submission does not read pitch/. A number changed on one of them and not on the
// others is what the jury would catch first, so the copies are compared here:
//   1. the speech in the notes of the deck = the table of pitch/SCRIPT.md (slide, time, words);
//   2. the blocks of the talk follow each other from 0:00, end within 4:00, keep a calm pace, and the header of the
//      script names the real number of words and the real end;
//   3. what the pitch quotes from the run (tests, axe states, layout combinations, APK) = docs/evidence.json;
//   4. no phone number or e-mail in the text pages (they are public; the contacts stay on slide 12 of the deck only);
//   5. at most 15 slides (the organizers' limit), each with its title in pitch/slides.md, no local paths in the file;
//   6. the site (audit of 17.11): a picture for every slide, fresh versions in the addresses, the sizes of the files and
//      the length of the reel as the page says them, the build the page names; no contacts in the decks but slide 12.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_COUNT, APK_SIZE, testsWord } from './number-docs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const problems = [];
const fail = m => problems.push(m);

const DECK = 'pitch/Synergy-pitch.pptx', SCRIPT = 'pitch/SCRIPT.md', SLIDES = 'pitch/slides.md', APPX = 'pitch/Synergy-pitch-appendix.pptx';
const PHONE = /(\+7|(?<![\d.,])8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/, MAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const TEXT_PAGES = ['pitch/README.md', SCRIPT, SLIDES, 'pitch/QA.md', 'pitch/index.html'].filter(f => existsSync(join(root, f)));
const LIMIT_S = 240, MAX_SLIDES = 15, MAX_WPM = 140;

/** The files of a ZIP archive (a .pptx is one): name → () => Buffer. Stored and deflated entries, no ZIP64. */
function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a ZIP archive');
  const files = new Map();
  for (let i = 0, at = buf.readUInt32LE(end + 16); i < buf.readUInt16LE(end + 10); i++) {
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42), name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    files.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => entities[e]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
/** Paragraphs of the shapes whose placeholder type matches, as plain text. */
function paragraphs(xml, type) {
  const out = [];
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
    if (!new RegExp(`<p:ph[^>]*type="${type}"`).test(sp)) continue;
    for (const p of sp.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) out.push(decode((p.match(/<a:t>[^<]*<\/a:t>|<a:br\/>/g) ?? []).map(t => (t === '<a:br/>' ? '\n' : t.slice(5, -6))).join('')));
  }
  return out;
}
const norm = s => s.replace(/[\u00a0\s]+/g, ' ').trim();
const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const seconds = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
const wordsWord = n => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов');
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// 1–2. The deck and the talk.
const files = unzip(readFileSync(join(root, DECK)));
const slideNames = [...files.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
if (slideNames.length > MAX_SLIDES) fail(`${DECK}: ${slideNames.length} слайдов, организаторы ограничили презентацию ${MAX_SLIDES}`);
for (const [name, get] of files) if (/\.(xml|rels)$/.test(name) && /\/tmp\/|\/home\/|scratchpad|[A-Z]:\\\\Users/.test(get().toString('utf8'))) fail(`${DECK}: ${name} — путь к файлу на компьютере сборки (альтернативный текст картинки?)`);

const speech = [], titles = [];
slideNames.forEach((name, i) => {
  const n = i + 1, xml = files.get(name)().toString('utf8');
  const title = norm(paragraphs(xml, 'title').join(' '));
  if (title) titles.push([n, title]);
  const rel = files.get(`ppt/slides/_rels/slide${name.match(/\d+/)[0]}.xml.rels`)?.().toString('utf8') ?? '';
  const notes = rel.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
  if (!notes) return;
  // A line break inside a paragraph (<a:br/>) starts a new block of the notes, as a new paragraph does.
  const paras = paragraphs(files.get(`ppt/notesSlides/${notes}`)().toString('utf8'), 'body').flatMap(p => p.split('\n')).filter(p => p.trim());
  const k = paras.findIndex(p => /^\[\d:\d\d–\d:\d\d\]/.test(p));
  if (k < 0) return;
  const [, from, to, rest] = paras[k].match(/^\[(\d:\d\d)–(\d:\d\d)\]\s*([\s\S]*)$/);
  // «Видео … Говорить поверх него:» is a direction; the words follow in the next paragraph.
  speech.push({ n, from, to, text: norm(rest.trim().endsWith(':') ? paras[k + 1] ?? '' : rest) });
});

const script = read(SCRIPT);
const rows = new Map([...script.matchAll(/^\| (\d+) \| [^|]+ \| (\d:\d\d)–(\d:\d\d) \| (.+?) \|\s*$/gm)]
  .map(m => [Number(m[1]), { from: m[2], to: m[3], text: norm(m[4].replace(/^\*\([^)]*\)\*\s*/, '')) }]));
let clock = 0, total = 0;
for (const s of speech) {
  const row = rows.get(s.n);
  if (!row) { fail(`${SCRIPT}: нет строки слайда ${s.n}, а в заметках колоды у него речь`); continue; }
  if (row.from !== s.from || row.to !== s.to) fail(`слайд ${s.n}: в заметках ${s.from}–${s.to}, в ${SCRIPT} ${row.from}–${row.to}`);
  if (row.text !== s.text) fail(`слайд ${s.n}: речь в заметках колоды и в ${SCRIPT} расходится — правьте обе`);
  const a = seconds(s.from), b = seconds(s.to), w = words(s.text);
  if (a !== clock) fail(`слайд ${s.n}: блок начинается в ${s.from}, а предыдущий кончился в ${mmss(clock)}`);
  if (b <= a) fail(`слайд ${s.n}: блок ${s.from}–${s.to} пустой`);
  else if (w / (b - a) * 60 > MAX_WPM) fail(`слайд ${s.n}: ${w} слов за ${b - a} с — ${Math.round(w / (b - a) * 60)} в минуту, спокойный темп — до ${MAX_WPM}`);
  clock = b; total += w;
}
for (const n of rows.keys()) if (!speech.some(s => s.n === n)) fail(`${SCRIPT}: строка слайда ${n}, а в заметках колоды речи нет`);
if (clock > LIMIT_S) fail(`речь заканчивается на ${mmss(clock)}, а на выступление ${mmss(LIMIT_S)}`);
const head = script.match(/(\d+) слов[ао]?, речь заканчивается на (\d:\d\d)/);
if (!head) fail(`${SCRIPT}: в начале нет строки «N слов, речь заканчивается на м:сс»`);
else if (Number(head[1]) !== total || head[2] !== mmss(clock)) fail(`${SCRIPT}: «${head[0]}», а в колоде ${total} ${wordsWord(total)} до ${mmss(clock)}`);

// 3. Numbers quoted from the run.
const ev = JSON.parse(read('docs/evidence.json'));
const apkMb = Math.round(ev.apk.kb / 1024);
for (const f of TEXT_PAGES) {
  const text = read(f).replace(/\*\*|<\/?(b|strong)>/g, ''); // «**624** автотеста» is a number too
  for (const m of text.matchAll(TEST_COUNT)) if (Number(m[1]) !== ev.tests.total) fail(`${f}: «${m[0].trim()}», а тестов ${ev.tests.total} (docs/evidence.json)`);
  for (const m of text.matchAll(APK_SIZE)) if (Number(m[1]) !== ev.apk.kb) fail(`${f}: «${m[0]}», а APK ${ev.apk.kb} КБ (docs/evidence.json)`);
  for (const m of text.matchAll(/APK[^\n|]{0,12}?(\d+)\s*МБ/g)) if (Number(m[1]) !== apkMb) fail(`${f}: «${m[0]}», а APK ${ev.apk.kb} КБ ≈ ${apkMb} МБ`);
  for (const m of text.matchAll(/(\d+)\s+состояни[а-яё]*\s+экран/g)) if (Number(m[1]) !== ev.a11y.light + ev.a11y.dark) fail(`${f}: «${m[0]}», а axe проверял ${ev.a11y.light + ev.a11y.dark} состояний`);
  for (const m of text.matchAll(/(\d{3,})\s+сочетани/g)) if (Number(m[1]) !== ev.layout.combinations) fail(`${f}: «${m[0]}», а линтер раскладки — ${ev.layout.combinations} сочетаний`);
  // 4. Privacy: the text pages are public on GitHub and on the site.
  if (PHONE.test(text)) fail(`${f}: номер телефона — в публичных страницах контактов нет, только на слайде 12 колоды`);
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text.replace(/@[0-9a-f]{40}/g, ''))) fail(`${f}: адрес почты — в публичных страницах контактов нет`);
}

// 5. The text copy of the slides.
const copy = norm(read(SLIDES)).replace(/\*\*/g, '').toUpperCase();
for (let n = 1; n <= slideNames.length; n++) if (!new RegExp(`^## ${n}\\. `, 'm').test(read(SLIDES))) fail(`${SLIDES}: нет раздела слайда ${n}`);
for (const [n, t] of titles) if (!copy.includes(t.toUpperCase())) fail(`${SLIDES}: нет заголовка слайда ${n} «${t}»`);

// 6. The site and the decks.
const page = read('pitch/index.html');
const pad = n => String(n).padStart(2, '0');
for (let n = 1; n <= slideNames.length; n++) for (const f of [`slide-${pad(n)}.webp`, `slide-${pad(n)}-640.webp`]) {
  if (!existsSync(join(root, 'pitch/web', f))) fail(`pitch/web/${f}: нет картинки слайда — python3 tools/pitch-export.py`);
}
if (existsSync(join(root, 'pitch/web', `slide-${pad(slideNames.length + 1)}.webp`))) fail('pitch/web: картинок слайдов больше, чем слайдов — python3 tools/pitch-export.py');
const { stamp } = await import('./pitch-stamp.mjs');
const { stale, missing } = stamp({ write: false });
if (stale.length) fail(`pitch/index.html: устаревшие версии в адресах (${stale.slice(0, 3).join(', ')}${stale.length > 3 ? '…' : ''}) — node tools/pitch-stamp.mjs`);
if (missing.length) fail(`pitch/index.html: ссылки на файлы, которых нет: ${missing.join(', ')}`);
for (const m of page.matchAll(/data-file="([^"]+)">[^<]*?(\d+(?:,\d)?)[\s ]*МБ/g)) {
  const [, file, num] = m;
  if (!existsSync(join(root, file))) { fail(`pitch/index.html: ${file} — файла нет`); continue; }
  const mb = statSync(join(root, file)).size / 1048576, said = Number(num.replace(',', '.'));
  if (Math.abs(mb - said) > (num.includes(',') ? 0.1 : 0.6)) fail(`pitch/index.html: ${file} — «${num} МБ», а файл ${mb.toFixed(1).replace('.', ',')} МБ`);
}
const version = JSON.parse(read('package.json')).version;
for (const m of page.matchAll(/сборк[аиуеой]+[\s ]+(\d+\.\d+\.\d+)|"softwareVersion":\s*"([\d.]+)"/g)) if ((m[1] ?? m[2]) !== version) fail(`pitch/index.html: «${m[0]}», а версия ${version}`);
// the length of the reel from its mvhd box: what the page and the slides say must be what plays
const mp4 = readFileSync(join(root, 'pitch/synergy-gameplay-reel.mp4')), at = mp4.indexOf('mvhd');
if (at > 0) {
  const v1 = mp4[at + 4] === 1, scale = mp4.readUInt32BE(at + (v1 ? 24 : 16)), dur = v1 ? Number(mp4.readBigUInt64BE(at + 28)) : mp4.readUInt32BE(at + 20);
  const secs = Math.round(dur / scale);
  for (const f of ['pitch/index.html', SLIDES, 'pitch/README.md']) for (const m of read(f).matchAll(/(\d+)[\s ]*(?:секунд|с,\s*1080p)/g)) if (Number(m[1]) !== secs) fail(`${f}: «${m[0]}», а ролик идёт ${secs} с`);
}
// contacts: on slide 12 of the pitch deck only
const decks = [[DECK, files, n => n !== 12]];
if (existsSync(join(root, APPX))) decks.push([APPX, unzip(readFileSync(join(root, APPX))), () => true]);
for (const [name, zip, guarded] of decks) {
  for (const [part, get] of zip) {
    const n = Number(part.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]);
    if (!n || !guarded(n)) continue;
    const t = decode((get().toString('utf8').match(/<a:t>[^<]*<\/a:t>/g) ?? []).map(x => x.slice(5, -6)).join(' '));
    if (PHONE.test(t) || MAIL.test(t)) fail(`${name}: слайд ${n} — телефон или почта; контакты только на слайде 12 колоды питча`);
  }
  if (name === APPX) for (const [part, get] of zip) if (/\.(xml|rels)$/.test(part) && /\/tmp\/|\/home\/|scratchpad/.test(get().toString('utf8'))) fail(`${APPX}: ${part} — путь к файлу на компьютере сборки`);
}

if (problems.length) {
  for (const p of problems) console.log(`✗ ${p}`);
  const n = problems.length;
  console.log(`\nПитч: ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'расхождение' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'расхождения' : 'расхождений'}`);
  process.exit(1);
}
console.log(`Питч сходится: ${slideNames.length} слайдов, речь — ${total} ${wordsWord(total)} до ${mmss(clock)}, цифры — как в docs/evidence.json (${ev.tests.total} ${testsWord(ev.tests.total)}, APK ${ev.apk.kb} КБ), контактов в текстах нет`);
