// Spoken and screen-reader announcements of the game hint (5.11). The visual hint follows the game every frame,
// but «Держите…» ↔ «Нужно: Кулак» can flip five times a second: a live region that changes so often is queued or
// cut off by TalkBack and NVDA, and the app's voice dropped a hint that came within 1.5 s of the previous one and
// never said it later — an eyes-free player did not hear what was needed. Here the latest text wins: it is
// announced once it has held for `stableS` and `minGapS` has passed since the last announcement; urgent texts
// (countdown, lost signal) go at once.
export class LiveAnnouncer {
  constructor({ minGapS = 1.5, stableS = 0.4 } = {}) {
    Object.assign(this, { minGapS, stableS });
    this.last = null; this.lastAt = -Infinity; this.current = null; this.since = 0;
  }

  /** Call every frame with the hint on screen; returns the text to announce now, or null. */
  update(text, nowS, { urgent = false } = {}) {
    if (text !== this.current) { this.current = text; this.since = nowS; }
    if (!text || text === this.last) return null;
    if (!urgent && (nowS - this.since < this.stableS || nowS - this.lastAt < this.minGapS)) return null;
    this.last = text; this.lastAt = nowS;
    return text;
  }
}
