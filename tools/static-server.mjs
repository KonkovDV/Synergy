// Static server in Node (5.9): the same job as tools/serve.py without Python — Windows has no `python3`.
// The e2e scripts (tests/e2e/v5.mjs, layout.mjs) start it themselves on a free port when no URL is given.
// CLI: node tools/static-server.mjs [--dist] [--port 8080]   (127.0.0.1 only; for a phone use serve.py --lan)
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, sep, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** Serves `root` on 127.0.0.1; resolves to { url, close }. Paths outside `root` are refused (no traversal). */
export function startServer({ root = join(ROOT, 'dist'), port = 0, host = '127.0.0.1' } = {}) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      // `localhost` or an IP address only (5.11): a page that rebinds its own DNS name to 127.0.0.1 must not read files.
      const hostName = String(req.headers.host ?? '').toLowerCase().replace(/^\[([^\]]*)\](:\d+)?$/, '$1').replace(/^([^:]*):\d+$/, '$1');
      if (hostName !== 'localhost' && !isIP(hostName)) { res.writeHead(421).end(); return; }
      const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      let file = resolve(base, `.${path}`);
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
      // No dotfiles (.git) and no tool caches (tools/.cache holds the debug keystore), even on 127.0.0.1 (5.10) — on
      // the resolved path, split by both separators (5.11: `%5C.git%5Cconfig` passed on Windows).
      const parts = relative(base, file).split(/[\\/]/);
      if (parts.some(p => p.startsWith('.') && p !== '.') || (parts[0] === 'tools' && parts[1] === '.cache')) { res.writeHead(404).end(); return; }
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok({ url: `http://${host}:${server.address().port}/index.html`, close: () => new Promise(r => server.close(r)) }));
  });
}

/**
 * For the e2e scripts: the URL given on the command line, or a fresh server over dist/ (the bundle, as shipped;
 * run `npm run build` first) or, with { source: true }, over the repository (unbundled ES modules).
 */
export async function baseUrl({ argv = process.argv, source = false } = {}) {
  const given = argv.find(a => a.startsWith('http'));
  if (given) return { url: given, close: async () => {} };
  const root = source ? ROOT : join(ROOT, 'dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error(`${root}/index.html not found — run \`npm run build\` first`);
  return startServer({ root });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv.includes('--dist');
  const i = process.argv.indexOf('--port');
  const { url } = await startServer({ root: dist ? join(ROOT, 'dist') : ROOT, port: i > 0 ? Number(process.argv[i + 1]) : 8080 });
  console.log(`Синергия: ${url}  (Ctrl+C — стоп)`);
}
