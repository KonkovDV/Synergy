// Build: dist/ (installable offline PWA) + dist/synergy-standalone.html (one file, opens from file://).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'icons'), { recursive: true });

const result = await build({
  entryPoints: [join(root, 'src/main.js')], bundle: true, format: 'iife', minify: true, write: false,
  target: ['chrome90', 'safari15', 'firefox90'], legalComments: 'none', sourcemap: false,
  // Cyrillic as UTF-8, not \uXXXX escapes (5.11): 289 → 208 KB of script to parse on a weak phone; every page
  // declares UTF-8 and the servers send it.
  charset: 'utf8',
});
const js = result.outputFiles[0].text;
const css = readFileSync(join(root, 'styles/app.css'), 'utf8');
// Brand fonts (5.12, SIL OFL — public/fonts/OFL.txt): files next to app.css in dist/, data URIs in the standalone file.
const fonts = readdirSync(join(root, 'public/fonts'));
const distCss = css.replaceAll('../public/fonts/', 'fonts/');
const inlineCss = css.replace(/url\("\.\.\/public\/fonts\/([\w.-]+\.woff2)"\)/g, (_, f) => `url("data:font/woff2;base64,${readFileSync(join(root, 'public/fonts', f)).toString('base64')}")`);
const preload = prefix => fonts.filter(f => f.endsWith('-cyr.woff2')).map(f => `<link rel="preload" href="${prefix}${f}" as="font" type="font/woff2" crossorigin>`).join('\n');

// Content-Security-Policy: no network except WebSocket bridges, no foreign scripts, no plugins.
const csp = inline => `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'${inline ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'">`;
const page = ({ head, body, inline = false }) => `<!doctype html>
<html lang="ru" data-build="dist">
<head>
<meta charset="utf-8">
${csp(inline)}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f3f5f7">
<meta name="description" content="Синергия — мобильная игра-тренажёр управления бионическим протезом по ЭМГ">
<title>Синергия — тренажёр протеза</title>
${head}
</head>
<body>
<div id="app" class="app"></div>
<div id="toasts" aria-live="polite"></div>
${body}
</body>
</html>
`;

writeFileSync(join(dist, 'app.js'), js);
writeFileSync(join(dist, 'app.css'), distCss);
mkdirSync(join(dist, 'fonts'), { recursive: true });
for (const f of fonts) copyFileSync(join(root, 'public/fonts', f), join(dist, 'fonts', f));
writeFileSync(join(dist, 'index.html'), page({
  head: '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-48.png" type="image/png">\n<link rel="apple-touch-icon" href="icons/icon-180.png">\n' + preload('fonts/') + '\n<link rel="stylesheet" href="app.css">',
  body: '<script src="app.js"></script>',
}));
for (const f of readdirSync(join(root, 'public/icons'))) copyFileSync(join(root, 'public/icons', f), join(dist, 'icons', f));
copyFileSync(join(root, 'public/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
// The team's illustrations (5.16, tools/import-art.py): files in dist/art/, precached for offline; data URIs in the
// one-file build (window.SYNERGY_ART, read by ui/pictures.js before the script runs).
const art = readdirSync(join(root, 'public/art')).filter(f => f.endsWith('.webp')).sort();
mkdirSync(join(dist, 'art'), { recursive: true });
for (const f of art) copyFileSync(join(root, 'public/art', f), join(dist, 'art', f));
const shell = ['./', './index.html', './app.js', './app.css', './manifest.webmanifest', ...readdirSync(join(root, 'public/icons')).map(f => `./icons/${f}`), ...fonts.filter(f => f.endsWith('.woff2')).map(f => `./fonts/${f}`), ...art.map(f => `./art/${f}`)];
writeFileSync(join(dist, 'sw.js'), `// App-shell cache: the game works offline after the first visit.
const CACHE = 'synergy-${pkg.version}';
const SHELL = ${JSON.stringify(shell)};
// 'reload': a new version is fetched from the network, not from the HTTP cache (5.10 — GitHub Pages sends
// max-age=600, and the cache of a hotfix stored the old app.js).
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('synergy-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  // Only the app's own files, from the app's own cache (5.10): on a shared origin (user.github.io/…) another site's
  // cache must not answer, and requests outside the app's scope are not cached.
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  // Cache-first; only successful responses are cached (an error page must not stick until the next version).
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
});
`);
const icon = readFileSync(join(root, 'public/icons/icon-48.png'));
const inlineArt = Object.fromEntries(art.map(f => [f.replace(/\.webp$/, ''), `data:image/webp;base64,${readFileSync(join(root, 'public/art', f)).toString('base64')}`]));
const standalone = page({
  head: `<link rel="icon" href="data:image/png;base64,${icon.toString('base64')}">\n<style>${inlineCss}</style>`,
  body: `<script>window.SYNERGY_ART=${JSON.stringify(inlineArt)};</script>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  inline: true,
});
writeFileSync(join(dist, 'synergy-standalone.html'), standalone);
const kb = text => (Buffer.byteLength(text) / 1024).toFixed(0);
console.log(`Built v${pkg.version}: dist/ (${kb(js)} KB JS, ${art.length} pictures) + synergy-standalone.html (${kb(standalone)} KB)`);
