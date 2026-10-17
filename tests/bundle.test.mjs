// The unit tests import only the domain; this bundles the whole app (UI included) the way `npm run build`
// does, so a syntax error or an import of a missing export anywhere in src/ fails `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('bundle: every module of the app parses and every import resolves', async () => {
  const result = await build({ entryPoints: ['src/main.js'], bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  assert.equal(result.errors.length, 0);
  assert.ok(result.outputFiles[0].text.length > 100_000);
});
