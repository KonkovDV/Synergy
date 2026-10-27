// A short text to someone close. The system sheet when the phone has one; otherwise the clipboard.
// A cancelled sheet is not an error. No file and no health fields: the caller passes the sentence.

/** @returns {'shared'|'cancel'|'copied'|'none'} */
export async function sharePlain(text, nav = globalThis.navigator) {
  if (typeof nav?.share === 'function') {
    try { await nav.share({ text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  }
  if (typeof nav?.clipboard?.writeText === 'function') {
    try { await nav.clipboard.writeText(text); return 'copied'; }
    catch { /* the page is not allowed to write the clipboard */ }
  }
  return 'none';
}
