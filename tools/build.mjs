// Build: dist/ (installable offline PWA) + dist/synergy-standalone.html (one file, opens from file://).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
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
});
const js = result.outputFiles[0].text;
const css = readFileSync(join(root, 'styles/app.css'), 'utf8');

// Content-Security-Policy: no network except WebSocket bridges, no foreign scripts, no plugins.
const csp = inline => `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'${inline ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'">`;
const page = ({ head, body, inline = false }) => `<!doctype html>
<html lang="ru" data-build="dist">
<head>
<meta charset="utf-8">
${csp(inline)}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1530">
<meta name="description" content="Синергия — мобильная игра-тренажёр управления бионическим протезом по ЭМГ">
<title>Синергия — тренажёр протеза</title>
${head}
</head>
<body>
<div id="app" class="app"></div>
${body}
</body>
</html>
`;

writeFileSync(join(dist, 'app.js'), js);
writeFileSync(join(dist, 'app.css'), css);
writeFileSync(join(dist, 'index.html'), page({
  head: '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="app.css">',
  body: '<script src="app.js"></script>',
}));
copyFileSync(join(root, 'public/icons/icon.svg'), join(dist, 'icons/icon.svg'));
copyFileSync(join(root, 'public/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
const shell = ['./', './index.html', './app.js', './app.css', './manifest.webmanifest', './icons/icon.svg'];
writeFileSync(join(dist, 'sw.js'), `// App-shell cache: the game works offline after the first visit.
const CACHE = 'synergy-${pkg.version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('synergy-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Cache-first; only successful responses are cached (an error page must not stick until the next version).
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })));
});
`);
const icon = readFileSync(join(root, 'public/icons/icon.svg'), 'utf8');
const standalone = page({
  head: `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">\n<style>${css}</style>`,
  body: `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  inline: true,
});
writeFileSync(join(dist, 'synergy-standalone.html'), standalone);
console.log(`Built v${pkg.version}: dist/ (${(js.length / 1024).toFixed(0)} KB JS) + synergy-standalone.html (${(standalone.length / 1024).toFixed(0)} KB)`);
