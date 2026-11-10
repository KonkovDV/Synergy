// Every level of the four main games on the СППР hypothesis set (5.31). The whole suite is not run: its tests name the
// ids of the Synergy set. Usage: node tools/test-spr8.mjs
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = spawnSync(process.execPath, ['tools/spr8-play.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, SYNERGY_GESTURE_SET: 'spr8' } });
process.exitCode = run.status ?? 1;
