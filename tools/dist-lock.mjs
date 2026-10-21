// Two test files rebuild dist/ at once. On Windows the second rmSync hits EPERM, then the other file
// reads a service worker that is already gone. The lock is one file; the owner may rebuild, everyone else waits.
import { openSync, closeSync, unlinkSync, readFileSync, writeSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lockPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.dist-build.lock');

const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const owner = () => { try { return readFileSync(lockPath, 'utf8').trim(); } catch { return ''; } };
const alive = pid => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };

/** Holds the lock until the returned function runs. The same process acquires it again for free. */
export function acquireDistLock() {
  const me = String(process.pid);
  if (owner() === me) return () => {};
  const started = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, me);
      return () => { closeSync(fd); try { unlinkSync(lockPath); } catch { /* the next build removes a leftover */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const who = owner();
      if (who === me) return () => {};
      let stale = !who || !alive(who);
      try { if (Date.now() - statSync(lockPath).mtimeMs > 120000) stale = true; } catch { stale = true; }
      if (stale) { try { unlinkSync(lockPath); } catch { /* the owner released it */ } continue; }
      if (Date.now() - started > 120000) throw e;
      pause(100);
    }
  }
}
