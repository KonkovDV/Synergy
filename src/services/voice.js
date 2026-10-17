// Voice prompts for eyes-free play and low vision: Web Speech API in browsers, the native TTS bridge
// in the Android shell (WebView has no speechSynthesis). Repeats and chatter are throttled.
let enabled = false;
let last = { text: '', at: -Infinity };

const native = () => (globalThis.SynergyNative?.speak ? globalThis.SynergyNative : null);

export function voiceAvailable() { return !!native() || !!globalThis.speechSynthesis; }

export function setVoiceEnabled(on) {
  enabled = !!on;
  if (!enabled) { globalThis.speechSynthesis?.cancel?.(); native()?.stop?.(); }
}

/**
 * Speaks a short phrase. `interrupt` — important (countdown, result): cuts the current phrase.
 * Otherwise a phrase is dropped if one was spoken less than `minGapMs` ago or it repeats.
 */
export function say(text, { interrupt = false, minGapMs = 1500 } = {}) {
  if (!enabled || !text) return false;
  const now = Date.now();
  if (text === last.text && now - last.at < 5000) return false;
  if (!interrupt && now - last.at < minGapMs) return false;
  last = { text, at: now };
  const host = native();
  if (host) { host.speak(String(text), !!interrupt); return true; }
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = 'ru-RU'; u.rate = 1.05;
  const ru = synth.getVoices?.().find(v => v.lang?.toLowerCase().startsWith('ru'));
  if (ru) u.voice = ru;
  synth.speak(u);
  return true;
}
