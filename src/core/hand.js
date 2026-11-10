// BionicHand — model of a myoelectric hand, faithful to how a real one behaves
// (transfer to the prosthesis is shown only for trainers with its task — Garske et al. 2021, a viewpoint):
//  • CLOSE moves fingers with speed ∝ intensity; after contact the grip force grows;
//  • REST keeps position and force (non-backdrivable drive — the hand holds by itself);
//  • OPEN opens the fingers at once: the grip is let go with the first movement (answer 1г of the experts, 09.11 — «сигнал
//    раскрытия сразу открывает»; until 6.3.2 the opening first lowered the force, then opened);
//  • the grip switches the way the person's prosthesis does it (GRIP_SWITCH): «open» — at full opening a new
//    opening signal held for holdOpenS (Motorica); «co» — a co-contraction, re-armed only after full relaxation.
//  • 07.11 (answer 3 of the experts): on the СПППР stream the intensity is the clarity of a gesture, not its force — the
//    grip force grows while the closing gesture is held (rate control, as in the threshold scheme), at a speed that
//    follows the clarity only up to SPPPR.fullSpeedAt.
import { HAND, GRIP_SWITCH } from '../config.js';
import { COMMAND, SCHEME, GESTURE_BY_ID, COMMAND_POSE, GRIP_POSE, rateControl } from './vocabulary.js';
import { clarityRate } from './spppr.js';

const OPEN_POSE = COMMAND_POSE.open;
const lerp = (a, b, k) => a + (b - a) * k;

export class BionicHand {
  constructor({ grips = HAND.twoChannelGrips, switchMode = GRIP_SWITCH.defaultMode, holdOpenS = GRIP_SWITCH.holdDefaultS } = {}) {
    this.grips = grips;
    this.switchMode = switchMode;
    this.holdOpenS = holdOpenS;
    this.reset();
  }

  reset() {
    this.grip = this.grips[0];
    this.closure = 0;      // 0 — раскрыта, 1 — сжата полностью
    this.force = 0;        // условная сила хвата 0..1 (не ньютоны)
    this.armed = true;     // коактивация снова доступна после покоя
    this.openReady = false; // «open»: кисть раскрыта и раскрытие отпущено — следующее раскрытие может сменить хват
    this.openFor = 0;
    this.switches = 0;
    this.contactAt = null; // closure at which fingers touch the current object (null — пусто)
  }

  /** The game places an object between the fingers: contact closure for the current grip. */
  setObject(contactAt) { this.contactAt = contactAt; }
  clearObject() { this.contactAt = null; this.force = 0; }

  get inContact() { return this.contactAt !== null && this.closure >= this.contactAt - 1e-6; }

  update(intent, dt) {
    if (!intent.valid) return; // signal lost: the drive holds its position, like the real hand
    if (!intent.aOn && !intent.bOn && !intent.co) this.armed = true;
    if (intent.gesture) this.selectGestureGrip(intent.gesture);
    else if (this.switchMode === 'open') this.trackOpenHold(intent, dt);
    const fixedSpeed = intent.scheme === SCHEME.THRESHOLD;
    const rate = rateControl(intent.scheme);
    // The СПППР stream has no floor: its speed fades with the clarity, so on a silent link (the inertia after 200 ms) the
    // hand slows down and holds — audit 07.11: with the floor of the channels (0.25) it kept squeezing for 1.5 s without
    // a packet, +0.18 of force, an egg crushed by a lost signal.
    const speed = fixedSpeed ? 1 : rate ? clarityRate(intent.intensity) : Math.max(0.25, intent.intensity);
    switch (intent.command) {
      case COMMAND.SWITCH: if (this.switchMode === 'co') this.trySwitch(); break; // «open»: A+B is the lock, the hand holds
      case COMMAND.CLOSE: this.close(speed, intent, dt, rate); break;
      case COMMAND.OPEN:
        // 6.3.2 — the stream reacts on its first packet (answer 5 of the experts, 09.11), and a free hand opens at once.
        // A held object is let go by an opening the next packet confirmed: one wrong packet of the recognizer must not
        // drop it (at 10 Hz on the emulator's average stream it dropped 6 % of the objects of «Мастерская»). Serial hands
        // guard a grip the same way (auto grip, slip control); with two channels every opening is confirmed.
        if (intent.confirmed === false && this.force > 0) break;
        this.open(speed, dt);
        break;
      default: break; // REST — hold
    }
  }

  selectGestureGrip(gestureId) {
    const grip = GESTURE_BY_ID[gestureId]?.grip;
    if (grip && grip !== this.grip && this.force === 0 && this.closure < 0.35) {
      this.grip = grip; this.switches++;
    }
  }

  trySwitch() {
    if (!this.armed || this.force > 0) return;
    this.cycleGrip();
    this.armed = false;
  }

  /**
   * Motorica's switch: the hand is fully open, the opening signal was let go, and a new one lasts holdOpenS — the next
   * grip, once per signal. Opening a closed hand all the way in one long signal does not switch («triggers the opening
   * signal again» in the manual).
   */
  trackOpenHold(intent, dt) {
    if (this.closure > 0 || this.force > 0) { this.openReady = false; this.openFor = 0; return; }
    if (!intent.bOn) { this.openReady = true; this.openFor = 0; return; }
    if (!this.openReady || intent.command !== COMMAND.OPEN) { this.openFor = 0; return; }
    this.openFor += dt;
    if (this.openFor >= this.holdOpenS) { this.cycleGrip(); this.openReady = false; this.openFor = 0; }
  }

  cycleGrip() {
    const i = this.grips.indexOf(this.grip);
    this.grip = this.grips[(i + 1) % this.grips.length];
    this.switches++;
  }

  close(speed, intent, dt, rate = false) {
    const limit = this.contactAt ?? 1;
    if (this.closure < limit) {
      this.closure = Math.min(limit, this.closure + HAND.closeSpeed * speed * dt);
      return;
    }
    if (this.contactAt === null) return;
    if (intent.scheme === SCHEME.THRESHOLD) {
      this.force = Math.min(1, this.force + HAND.thresholdForceRate * dt);
    } else if (rate) {
      // The СПППР stream: the force is gathered while the gesture is held — a clear gesture at the threshold scheme's rate.
      this.force = Math.min(1, this.force + HAND.thresholdForceRate * speed * dt);
    } else if (intent.intensity > this.force) {
      // Proportional: force follows the effort up to its level; relaxing keeps it.
      this.force = Math.min(intent.intensity, this.force + HAND.forceRiseRate * dt);
    }
  }

  /**
   * 6.3.2 — the experts of Motorica, 09.11 (answer 1г): the opening signal opens the hand at once; it does not first lower
   * the force. The fingers leave the object with the first movement, so the force is gone, and too strong a grip is
   * corrected the way a real hand does it: open and take the object again. Speed 0 — the fading inertia of a silent СПППР
   * stream — does not open: an object is not let go by a lost signal.
   */
  open(speed, dt) {
    if (!(speed > 0)) return;
    this.force = 0;
    this.closure = Math.max(0, this.closure - HAND.openSpeed * speed * dt);
  }

  /** Finger flexions for rendering: open pose blended toward the grip pose. */
  pose() {
    // 6.3.2: the pose of the grip itself (vocabulary.js GRIP_POSE). The pose of the gesture with the grip's id was the same
    // thing only in the «Синергия» set; in the task's set there is no gesture «fist», and the hand closed half-way.
    const target = GRIP_POSE[this.grip] ?? COMMAND_POSE.close;
    return OPEN_POSE.map((open, i) => lerp(open, target[i], this.closure));
  }
}
