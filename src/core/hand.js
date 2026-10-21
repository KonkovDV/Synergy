// BionicHand — model of a myoelectric hand, faithful to how a real one behaves
// (transfer to the prosthesis is shown only for trainers with its task — Garske et al. 2021, a viewpoint):
//  • CLOSE moves fingers with speed ∝ intensity; after contact the grip force grows;
//  • REST keeps position and force (non-backdrivable drive — the hand holds by itself);
//  • OPEN first releases force, then opens the fingers;
//  • the grip switches the way the person's prosthesis does it (GRIP_SWITCH): «open» — at full opening a new
//    opening signal held for holdOpenS (Motorica); «co» — a co-contraction, re-armed only after full relaxation.
import { HAND, GRIP_SWITCH } from '../config.js';
import { COMMAND, SCHEME, GESTURE_BY_ID, COMMAND_POSE } from './vocabulary.js';

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
    const speed = fixedSpeed ? 1 : Math.max(0.25, intent.intensity);
    switch (intent.command) {
      case COMMAND.SWITCH: if (this.switchMode === 'co') this.trySwitch(); break; // «open»: A+B is the lock, the hand holds
      case COMMAND.CLOSE: this.close(speed, intent, dt); break;
      case COMMAND.OPEN: this.open(speed, dt); break;
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

  close(speed, intent, dt) {
    const limit = this.contactAt ?? 1;
    if (this.closure < limit) {
      this.closure = Math.min(limit, this.closure + HAND.closeSpeed * speed * dt);
      return;
    }
    if (this.contactAt === null) return;
    if (intent.scheme === SCHEME.THRESHOLD) {
      this.force = Math.min(1, this.force + HAND.thresholdForceRate * dt);
    } else if (intent.intensity > this.force) {
      // Proportional: force follows the effort up to its level; relaxing keeps it.
      this.force = Math.min(intent.intensity, this.force + HAND.forceRiseRate * dt);
    }
  }

  open(speed, dt) {
    if (this.force > 0) {
      this.force = Math.max(0, this.force - HAND.forceDropRate * Math.max(0.3, speed) * dt);
      return;
    }
    this.closure = Math.max(0, this.closure - HAND.openSpeed * speed * dt);
  }

  /** Finger flexions for rendering: open pose blended toward the grip pose. */
  pose() {
    const target = GESTURE_BY_ID[this.grip]?.pose ?? COMMAND_POSE.close;
    return OPEN_POSE.map((open, i) => lerp(open, target[i], this.closure));
  }
}
