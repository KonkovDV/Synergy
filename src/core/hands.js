// Which hand does what (5.30). Two questions the meetup of 21.10.2026 raised: the on-screen controls should sit under the
// hand that taps them (the healthy one, the expert said: «под правую, левую, здоровую руку»), and a person may wear two
// prostheses. Pure functions: the settings screen, the layout and the source router read them.

export const SIDES = Object.freeze(['left', 'right']);
export const SIDE_NAME = Object.freeze({ left: 'левый', right: 'правый' });
export const SIDE_HAND = Object.freeze({ left: 'левая рука', right: 'правая рука' });

/** The other side. */
export const otherSide = side => (side === 'left' ? 'right' : 'left');

/**
 * The hand under which the on-screen controls sit: chosen, or the healthy hand — the one without the prosthesis.
 * With two prostheses there is no healthy hand: the right one, unless chosen.
 */
export function controlHand(settings) {
  if (settings?.controlHand === 'left' || settings?.controlHand === 'right') return settings.controlHand;
  if (settings?.prostheses === 'two') return 'right';
  return otherSide(settings?.side === 'left' ? 'left' : 'right');
}

/** A side named by a frame or a host: left/right, l/r, Russian words, Motorica's hand side 0/1 is not guessed. */
export function sideOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (['left', 'l', 'левый', 'левая', 'лев'].includes(v)) return 'left';
  if (['right', 'r', 'правый', 'правая', 'прав'].includes(v)) return 'right';
  return null;
}
