// The unit tests import only the domain; this bundles the whole app (UI included) the way `npm run build`
// does, so a syntax error or an import of a missing export anywhere in src/ fails `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';

test('bundle: every module of the app parses and every import resolves', async () => {
  const result = await build({ entryPoints: ['src/main.js'], bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  assert.equal(result.errors.length, 0);
  assert.ok(result.outputFiles[0].text.length > 100_000);
});

test('pwa: installable icons — 192 and 512 PNG «any», a separate maskable 512, all present', () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const has = (size, purpose) => m.icons.some(i => i.sizes === size && i.type === 'image/png' && i.purpose === purpose);
  assert.ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'));
  assert.ok(!m.icons.some(i => /any maskable|maskable any/.test(i.purpose ?? '')), '«any maskable» crops the «any» icon');
  // External audit 5.8: «129/130» was an archive extracted without PNGs — the message has to say so, not just a path.
  const PNG = '89504e470d0a1a0a';
  for (const i of m.icons) {
    const file = `public/${i.src}`;
    assert.ok(existsSync(file), `${file} not found — the archive was not extracted completely (PNG files are missing)`);
    if (i.type === 'image/png') assert.equal(readFileSync(file).subarray(0, 8).toString('hex'), PNG, `${file} is not a PNG (damaged on extraction or a text placeholder)`);
  }
  assert.ok(m.start_url && m.display === 'standalone' && m.lang === 'ru');
});
