// Maps game events to sound and vibration (one place, DRY).
// 5.17 — feedback supports, never punishes: a success is felt at least as clearly as a mistake (a hard-of-hearing
// player felt almost only misses), a pulse is ≤ 30 ms and an event ≤ 100 ms (Android haptics principles: CLICK ≈ 12 ms,
// TICK ≈ 5 ms; «no haptics beats buzzy haptics»). In the APK the system haptic is used where the event has one.
import { play, audioClock } from './audio.js';

/**
 * A verdict sound of «Ритм» heard 100 ms or more after the press (Bluetooth: 100–300 ms) reads as the next note's
 * mistake; then the hit or miss is only seen and felt — the pulse is not delayed (`timed` events).
 */
export const LATE_SFX_S = 0.1;
export const lateAudio = (latencyS, offsetMs = 0) => latencyS + offsetMs / 1000 >= LATE_SFX_S;

export const HAPTIC = Object.freeze({
  ring: 12, hit: 12, perfect: [12, 60, 12], success: 20, lift: 10, switch: 10, miss: 6, crush: 15, done: 10, win: [15, 70, 15], levelup: [15, 70, 15],
});
/** The system haptic of the APK (MainActivity.haptic): «confirm» for a success, «tick» for a hit or a grip change. */
export const NATIVE_HAPTIC = Object.freeze({ success: 'confirm', perfect: 'confirm', win: 'confirm', levelup: 'confirm', ring: 'tick', hit: 'tick', lift: 'tick', switch: 'tick' });
/** The vibro-metronome of «Ритм»: the beat felt in the hand (deaf and hard-of-hearing players), within the pulse limit. */
export const BEAT_HAPTIC = Object.freeze({ strong: 30, weak: 15 });

export function createFeedback(settings) {
  return {
    event(e) {
      const s = settings();
      // silent: the music already carries the beat; timed: no verdict sound when it would come late.
      if (s.sound && !e.silent && !(e.timed && lateAudio(audioClock()?.latency ?? 0, s.audioOffsetMs ?? 0))) play(e.name, e);
      if (!s.haptics) return;
      if (e.name === 'beat') { if (s.hapticBeat && navigator.vibrate) navigator.vibrate(e.strong ? BEAT_HAPTIC.strong : BEAT_HAPTIC.weak); return; }
      const native = globalThis.SynergyNative?.haptic;
      if (native && NATIVE_HAPTIC[e.name]) { try { native.call(globalThis.SynergyNative, NATIVE_HAPTIC[e.name]); return; } catch { /* fall back to vibrate */ } }
      const pattern = HAPTIC[e.name];
      if (pattern && navigator.vibrate) navigator.vibrate(pattern);
    },
  };
}
