// Spoken and screen-reader announcements of the game hint (5.11). The visual hint follows the game every frame,
// but «Держите…» ↔ «Нужно: Кулак» can flip five times a second: a live region that changes so often is queued or
// cut off by TalkBack and NVDA, and the app's voice dropped a hint that came within 1.5 s of the previous one and
// never said it later — an eyes-free player did not hear what was needed. Here the latest text wins: it is
// announced once it has held for `stableS` and `minGapS` has passed since the last announcement; urgent texts
// (countdown, lost signal) go at once; a new task skips the gap but must still hold.
export class LiveAnnouncer {
  constructor({ minGapS = 1.5, stableS = 0.4 } = {}) {
    Object.assign(this, { minGapS, stableS });
    this.last = null; this.lastAt = -Infinity; this.current = null; this.since = 0;
  }

  /**
   * Call every frame with the hint on screen; returns the text to announce now, or null. `task` — the text changes
   * what to do («Нужно: Кулак», a new object): it does not wait out the gap (5.11 — an instruction came 1.5 s late
   * after «Покой», and a player by ear lost points); only the flipping feedback («Держите…», «Сильнее») is spaced.
   */
  update(text, nowS, { urgent = false, task = false } = {}) {
    if (text !== this.current) { this.current = text; this.since = nowS; }
    if (!text || text === this.last) return null;
    if (!urgent && (nowS - this.since < this.stableS || (!task && nowS - this.lastAt < this.minGapS))) return null;
    this.last = text; this.lastAt = nowS;
    return text;
  }
}
