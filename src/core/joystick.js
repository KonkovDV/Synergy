// The joystick of the СПППР stream on the screen (6.0, «Созвездие»). The decoder gives the axes of the task
// (core/spppr.js): x = flexion − extension, y = pronation − supination, z = abduction − adduction. One rule turns them
// into a direction on the screen, for every picture that shows the joystick (the dot under the signal bars, the spark of
// «Созвездие») and for the autopilot that has to move it — so the three never disagree. Pure, no DOM.
//   Horizontal: in the neutral pose of the forearm (thumb up) wrist flexion moves the hand towards the body's midline —
//   left for the right arm, right for the left one (`mirror`); extension the other way.
//   Vertical: supination turns the palm up — up; pronation turns it down — down (the cues say «ладонь вверх» and «ладонь
//   вниз»). Until 6.0 the dot rose on pronation, against its own cue.
import { SPPPR_SET } from './vocabulary.js';

/** The axes as a screen vector { x: right +, y: up + }, each −1…1. Missing or broken axes are zero. */
export function stickVector(axes, { mirror = false } = {}) {
  const n = v => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  // `|| 0`: a zero axis stays +0 (−0 is equal to 0, but a test or a picture reading `Object.is` should not see it)
  return { x: (mirror ? 1 : -1) * n(axes?.x) || 0, y: -n(axes?.y) || 0 };
}

/**
 * Which class of the task's set moves the spark towards a screen direction: 'left' | 'right' | 'up' | 'down'.
 * The inverse of stickVector (the autopilot and the hints use it).
 */
export function stickGesture(direction, { mirror = false } = {}) {
  const towardsMidline = mirror ? 'right' : 'left';
  if (direction === 'left' || direction === 'right') return direction === towardsMidline ? 'flexion' : 'extension';
  if (direction === 'up') return 'supination';
  if (direction === 'down') return 'pronation';
  return 'rest';
}

/** The name of a class of the task's set («Сгибание» …) — the game speaks the words of the task whatever set is shown. */
export const taskGestureName = id => SPPPR_SET.gestures.find(g => g.id === id)?.name ?? id;

/**
 * The axes a frame without the stream's joystick still means (the gesture emulator of the tests, a recognizer that sends a
 * label): the axis of its gesture in the task's set, scaled by the intensity. Null when the gesture has no axis.
 */
export function axesOfGesture(gestureId, intensity) {
  const g = SPPPR_SET.gestures.find(x => x.id === gestureId);
  if (!g?.axis || !(intensity > 0)) return null;
  const axes = { x: 0, y: 0, z: 0 };
  axes[g.axis[0]] = g.axis[1] * Math.min(1, intensity);
  return axes;
}

/** The joystick axis ('x', 'y', 'z') of a class of the task's set, or null (neutral, a class of another set). */
export const axisOf = gestureId => SPPPR_SET.gestures.find(x => x.id === gestureId)?.axis?.[0] ?? null;

/**
 * 07.11 — what a frame moves by: the axis of the decoder's command alone (answer 4 of the experts: the СПППР does not
 * recognize compound gestures — the other pair's share is a leak or a mixed gesture and moves nothing), at the
 * probability difference of that pair (the task: «вектор джойстика формируется разностью flexion − extension»).
 * `axes` — the decoder's, past its dead zone (−1…1); without them (a gesture label) the frame's intensity. Null when the
 * command has no axis or the frame points the other way.
 */
export function commandAxes(gestureId, axes, intensity) {
  const g = SPPPR_SET.gestures.find(x => x.id === gestureId);
  if (!g?.axis) return null;
  const [k, sign] = g.axis;
  const along = Math.min(1, axes ? sign * (Number.isFinite(axes[k]) ? axes[k] : 0) : Number.isFinite(intensity) ? intensity : 0);
  if (!(along > 0)) return null;
  const out = { x: 0, y: 0, z: 0 };
  out[k] = sign * along;
  return out;
}
