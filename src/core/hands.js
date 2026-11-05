// Which hand does what (5.30). Two questions the meetup of 21.10.2026 raised: the on-screen controls should sit under the
// hand that taps them (the healthy one, the expert said: «под правую, левую, здоровую руку»), and a person may wear two
// prostheses. Pure functions: the settings screen, the layout and the source router read them.

export const SIDES = Object.freeze(['left', 'right']);
export const SIDE_NAME = Object.freeze({ left: 'левый', right: 'правый' });
export const SIDE_HAND = Object.freeze({ left: 'левая рука', right: 'правая рука' });

/** The other side. */
export const otherSide = side => (side === 'left' ? 'right' : 'left');

/**
 * Gesture picture (5.32). The prosthesis hand itself mirrors only on the left.
 * «Зеркальная подсказка» flips the picture once more, so the intact hand can copy it.
 * Off by default. Not a claim that the copy transfers to the prosthesis.
 */
export function gestureCueMirror({ side = 'right', mirrorHint = false } = {}) {
  return (side === 'left') !== !!mirrorHint;
}

/**
 * The hand under which the on-screen controls sit: chosen, or the healthy hand — the one without the prosthesis.
 * With two prostheses there is no healthy hand: the right one, unless chosen.
 */
export function controlHand(settings) {
  if (settings?.controlHand === 'left' || settings?.controlHand === 'right') return settings.controlHand;
  if (settings?.prostheses === 'two') return 'right';
  return otherSide(settings?.side === 'left' ? 'left' : 'right');
}

/**
 * The on-screen pads of the emulator (answers of the organizers 04.11, № 13: with a real EMG multitouch is not allowed —
 * one area for the healthy hand, everything else by EMG). The pads stand in for the muscles only when there are none:
 * the on-screen emulator ('pads') or the lab bridge, whose pads are the remote of bridge/ws_bridge.py --lab ('lab').
 * Frames of a prosthesis or a host app — the external source without a bridge address — leave none; a demo neither.
 */
export function emulatorPads({ demo = false, bridge = false, wsUrl = '' } = {}) {
  if (demo) return 'none';
  if (!bridge) return 'pads';
  return wsUrl ? 'lab' : 'none';
}

/** A side named by a frame or a host: left/right, l/r, Russian words, Motorica's hand side 0/1 is not guessed. */
export function sideOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (['left', 'l', 'левый', 'левая', 'лев'].includes(v)) return 'left';
  if (['right', 'r', 'правый', 'правая', 'прав'].includes(v)) return 'right';
  return null;
}
