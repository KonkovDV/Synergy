// The whole suite on the UBI4 gesture set of Motorica Start (5.29–5.30): every game, the tutorial, the skill check,
// the bridge and the report must speak the second set too. Cross-platform (no shell syntax for the variable).
// Usage: npm run test:ubi4
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => join('tests', f));
const run = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit', env: { ...process.env, SYNERGY_GESTURE_SET: 'ubi4' } });
process.exitCode = run.status ?? 1;
