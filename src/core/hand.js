// BionicHand — model of a myoelectric hand, faithful to how a real one behaves
// (task-specific transfer needs the same control law: Garske et al. 2021):
//  • CLOSE moves fingers with speed ∝ intensity; after contact the grip force grows;
//  • REST keeps position and force (non-backdrivable drive — the hand holds by itself);
//  • OPEN first releases force, then opens the fingers;
//  • SWITCH (co-contraction) cycles the grip, re-armed only after full relaxation.
import { HAND } from '../config.js';
import { COMMAND, SCHEME, GESTURE_BY_ID, COMMAND_POSE } from './vocabulary.js';

const OPEN_POSE = COMMAND_POSE.open;
const lerp = (a, b, k) => a + (b - a) * k;

export class BionicHand {
  constructor({ grips = HAND.twoChannelGrips } = {}) {
    this.grips = grips;
    this.reset();
  }

  reset() {
    this.grip = this.grips[0];
    this.closure = 0;      // 0 — раскрыта, 1 — сжата полностью
    this.force = 0;        // условная сила хвата 0..1 (не ньютоны)
    this.armed = true;     // коактивация снова доступна после покоя
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
    const fixedSpeed = intent.scheme === SCHEME.THRESHOLD;
    const speed = fixedSpeed ? 1 : Math.max(0.25, intent.intensity);
    switch (intent.command) {
      case COMMAND.SWITCH: this.trySwitch(); break;
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
    const i = this.grips.indexOf(this.grip);
    this.grip = this.grips[(i + 1) % this.grips.length];
    this.armed = false;
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
