// Synthetic two-channel traces in the shape read off the meetup graphs (docs/MEETUP_PLAN.md F7).
// Not Motorica's recordings: rest near 2, a peak inside 20–35, rise 0.15 s, fall 0.4 s, 15 % into the other channel.
export const MEETUP_SHAPE = Object.freeze({
  rest: 2,
  noise: 0.04,
  peak: 28,
  riseS: 0.15,
  fallS: 0.4,
  leak: 0.15,
});

/** Small deterministic wobble, so a calibration is not a perfectly flat line. */
export function meetupNoise(i) {
  return MEETUP_SHAPE.noise * Math.sin(i * 1.7) * Math.cos(i * 0.31);
}

/**
 * One sample of a calibration step. `a` and `b` are held contractions (the rise sits inside the 0.6 s the recorder skips).
 * @param {'rest'|'relax'|'a'|'b'|null} step
 */
export function meetupSample(step, i = 0) {
  const { rest, peak, leak } = MEETUP_SHAPE;
  const n = meetupNoise(i);
  const other = rest + (peak - rest) * leak;
  if (step === 'a') return { a: peak + n, b: other + meetupNoise(i + 3) };
  if (step === 'b') return { a: other + n, b: peak + meetupNoise(i + 5) };
  return { a: rest + n, b: rest + meetupNoise(i + 9) };
}

/** 0…1 envelope of one contraction: rise, hold, fall. */
export function meetupEnvelope(t, start = 0, holdS = 0.8) {
  const { riseS, fallS } = MEETUP_SHAPE;
  if (t < start) return 0;
  const u = t - start;
  if (u < riseS) return u / riseS;
  if (u < riseS + holdS) return 1;
  const d = u - riseS - holdS;
  if (d < fallS) return 1 - d / fallS;
  return 0;
}

/** One frame of a contraction on `channel`, in the same units as {@link meetupSample}. A new object every call. */
export function meetupContraction(t, channel, { start = 0, holdS = 1 } = {}) {
  const { rest, peak, leak } = MEETUP_SHAPE;
  const amp = (peak - rest) * meetupEnvelope(t, start, holdS);
  return {
    t: Math.round(t * 1000),
    a: rest + (channel === 'a' ? amp : amp * leak),
    b: rest + (channel === 'b' ? amp : amp * leak),
  };
}
