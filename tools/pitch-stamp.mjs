// Versions in the addresses of the pitch page's files: ?v=<first 8 hex of sha1>.   node tools/pitch-stamp.mjs
// GitHub Pages lets a browser keep a file for ten minutes and a phone often longer: after an update the page would show
// an old slide or run an old script. A changed file gets a new address, so the page always loads its own files.
// `npm run check:pitch` calls stamp({ write: false }) and fails on a stale version.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PITCH = join(dirname(fileURLToPath(import.meta.url)), '..', 'pitch');
const PAGE = join(PITCH, 'index.html');
// src="…" and href="…" of the page's own files (the game's ../art and outside links are not ours to version)
const OWN = /((?:src|href|srcset|content)=")([^"]*)(")/g;
const FILE = /(?<![\w/.:-])((?:web\/[\w.-]+\.(?:webp|jpg|png))|app\.js|synergy-gameplay-reel\.mp4)(?:\?v=[0-9a-f]{8})?/g;
const hash = f => createHash('sha1').update(readFileSync(join(PITCH, f))).digest('hex').slice(0, 8);

/** The page with every own file versioned; `stale` names the files whose version changed. */
export function stamp({ write = true } = {}) {
  const src = readFileSync(PAGE, 'utf8');
  const stale = new Set(), missing = new Set();
  const out = src.replace(OWN, (_, a, value, z) => a + value.replace(FILE, (m, f) => {
    if (!existsSync(join(PITCH, f))) { missing.add(f); return m; }
    const v = `${f}?v=${hash(f)}`;
    if (v !== m) stale.add(f);
    return v;
  }) + z);
  if (write && out !== src) writeFileSync(PAGE, out);
  return { stale: [...stale], missing: [...missing] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { stale, missing } = stamp();
  if (missing.length) console.log('нет файлов:', missing.join(', '));
  console.log(stale.length ? `версии обновлены: ${stale.length} файлов` : 'версии уже свежие');
}
