// Maps game events to sound and vibration (one place, DRY).
import { play } from './audio.js';

const HAPTIC = { crush: [60, 40, 60], miss: 30, success: [20, 30, 20], perfect: 25, switch: 15, lift: 15, win: [30, 50, 30, 50, 60] };

export function createFeedback(settings) {
  return {
    event(e) {
      if (settings().sound && !e.silent) play(e.name, e); // silent: the music already carries the beat
      // Vibro-metronome: the beat of «Ритм» felt in the hand (deaf and hard-of-hearing players).
      const pattern = e.name === 'beat' ? (settings().hapticBeat ? (e.strong ? 45 : 20) : null) : HAPTIC[e.name];
      if (pattern && settings().haptics && navigator.vibrate) navigator.vibrate(pattern);
    },
  };
}
