// Two test files rebuild dist/ at once. On Windows the second rmSync hits EPERM, then the other file
// reads a service worker that is already gone. The lock is one file; the owner may rebuild, everyone else waits.
import { openSync, closeSync, unlinkSync, readFileSync, writeSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SYNERGY_DIST_LOCK — another lock file, for the test of the lock itself: it must not free the real one under parallel tests.
const lockPath = process.env.SYNERGY_DIST_LOCK || join(dirname(fileURLToPath(import.meta.url)), '..', '.dist-build.lock');

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
      // 5.29: an empty file is a lock being created (its owner writes the pid right after opening it), not a dead one —
      // treating it as stale let two builds hold the lock at once. Empty for more than 2 s is a crash between the two.
      let age = 0;
      try { age = Date.now() - statSync(lockPath).mtimeMs; } catch { continue; } // released meanwhile: try again
      let stale = who ? !alive(who) : age > 2000;
      if (age > 120000) stale = true;
      if (stale) { try { unlinkSync(lockPath); } catch { /* the owner released it */ } continue; }
      if (Date.now() - started > 120000) throw e;
      pause(100);
    }
  }
}
