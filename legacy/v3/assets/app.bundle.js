(() => {
  // src/engine.mjs
  var VERSION = 4;
  var MODES = ["threshold", "proportional", "gesture"];
  var ACTIONS = ["rest", "close", "open", "pinch", "switch"];
  var INVALID_PAUSE_S = 3;
  var INVALID_ABORT_S = 10;
  function rhythmCues() {
    const holds = [0.2, 0.5, 1, 2];
    const cues = [];
    let t = 0.8;
    for (let i = 0; i < 8; i++) {
      const hold = holds[i % 4];
      const tol = +(0.25 - (0.25 - 0.16) * (i / 7)).toFixed(3);
      const gap = 1.15 - 0.45 * (i / 7);
      cues.push({ channel: i % 2 ? "b" : "a", hold, at: +t.toFixed(3), tol });
      t += hold + gap;
    }
    return cues;
  }
  var LEVELS = [
    { id: "carry", title: "\u0414\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0441\u044B\u043B\u043A\u0443", object: "\u041F\u043E\u0441\u044B\u043B\u043A\u0430", story: "\u0412\u043E\u0437\u044C\u043C\u0438\u0442\u0435 \u043F\u043E\u0441\u044B\u043B\u043A\u0443, \u0443\u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0435\u0451 \u043F\u043E \u043F\u0443\u0442\u0438 \u043A \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044E \u0438 \u0441\u043F\u043E\u043A\u043E\u0439\u043D\u043E \u043E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435.", skill: "\u0417\u0430\u0445\u0432\u0430\u0442 \u2192 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u2192 \u043E\u0442\u043F\u0443\u0441\u043A\u0430\u043D\u0438\u0435", grip: "power", min: 0.3, max: 0.8, breakAt: 0.97, hold: 1.5, time: 14 },
    { id: "fragile", title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0430\u0441\u0442\u0435\u043D\u0438\u0435", object: "\u0420\u0430\u0441\u0442\u0435\u043D\u0438\u0435", story: "\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0438\u0442\u0435 \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u0440\u0430\u0441\u0442\u0435\u043D\u0438\u0435. \u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0441\u0438\u043B\u044C\u043D\u043E\u0435 \u0441\u0436\u0430\u0442\u0438\u0435 \u043F\u043E\u0432\u0440\u0435\u0434\u0438\u0442 \u0433\u043E\u0440\u0448\u043E\u043A.", skill: "\u0422\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u043D\u043E\u0433\u043E \u0443\u0441\u0438\u043B\u0438\u044F", grip: "power", min: 0.25, max: 0.5, breakAt: 0.7, hold: 1.5, time: 14 },
    { id: "pinch", title: "\u0421\u043E\u0431\u0440\u0430\u0442\u044C \u0434\u0435\u0442\u0430\u043B\u044C", object: "\u0414\u0435\u0442\u0430\u043B\u044C", story: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0449\u0438\u043F\u043A\u043E\u0432\u044B\u0439 \u0441\u0445\u0432\u0430\u0442 \u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0434\u0435\u0442\u0430\u043B\u044C \u043D\u0430 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B.", skill: "\u0412\u044B\u0431\u043E\u0440 \u0449\u0438\u043F\u043A\u043E\u0432\u043E\u0433\u043E \u0441\u0445\u0432\u0430\u0442\u0430", grip: "pinch", min: 0.3, max: 0.75, breakAt: 0.95, hold: 1.5, time: 16 },
    { id: "switch", title: "\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442", object: "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442", story: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0441\u0445\u0432\u0430\u0442 \u043A\u043E\u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u0435\u0439, \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439 \u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0442\u0435\u043C \u0437\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442.", skill: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u2192 \u043F\u043E\u043A\u043E\u0439 \u2192 \u0437\u0430\u0445\u0432\u0430\u0442", grip: "pinch", requiresSwitch: true, min: 0.3, max: 0.75, breakAt: 0.95, hold: 1.5, time: 16 },
    { id: "terminal", title: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0431\u0435\u0437 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438", object: "\u041C\u0430\u044F\u043A", story: "\u0412 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 \u0442\u0440\u0451\u0445 \u0441\u0435\u043A\u0443\u043D\u0434 \u0443\u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0443\u043C\u0435\u0440\u0435\u043D\u043D\u0443\u044E \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044E \u0445\u043E\u0442\u044F \u0431\u044B 1,2 \u0441\u0435\u043A\u0443\u043D\u0434\u044B \u043F\u043E\u0434\u0440\u044F\u0434. \u041E\u0446\u0435\u043D\u043A\u0430 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F.", skill: "\u0411\u0435\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043E\u0431\u0440\u0430\u0442\u043D\u043E\u0439 \u0441\u0432\u044F\u0437\u0438", grip: "power", min: 0.3, max: 0.6, breakAt: 0.95, hold: 1.2, time: 3, terminal: true },
    { id: "rhythm", title: "\u0420\u0438\u0442\u043C \u0437\u0430\u0445\u0432\u0430\u0442\u0430", object: "\u0420\u0438\u0442\u043C", story: "\u0414\u0432\u0430 \u0441\u0435\u043D\u0441\u043E\u0440\u0430: \u0441\u0436\u0430\u0442\u0438\u0435 \u0438 \u0440\u0430\u0437\u0436\u0430\u0442\u0438\u0435. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u044F \u0438 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F. \u042D\u0442\u043E \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0442\u0430\u0439\u043C\u0438\u043D\u0433, \u043D\u0435 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043A\u043E\u043D\u043A\u0443\u0440\u0441\u0430.", skill: "\u041D\u0430\u0447\u0430\u043B\u043E, \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 \u043E\u0442\u043F\u0443\u0441\u043A\u0430\u043D\u0438\u0435", grip: "power", min: 0.3, max: 0.8, breakAt: 0.97, hold: 2, time: 20, rhythm: true, minHits: 6 }
  ];
  function levelFor(id, mode) {
    const base = LEVELS.find((x) => x.id === id);
    if (!base) throw Error("Unknown level");
    const level = { ...base, skill: mode === "threshold" && id === "fragile" ? "\u041F\u043E\u0440\u043E\u0433\u043E\u0432\u043E\u0435 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435; \u0434\u043E\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u0438\u043B\u044B \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0432 \u043F\u0440\u043E\u043F\u043E\u0440\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435" : base.skill };
    if (base.rhythm) level.cues = rhythmCues();
    return level;
  }
  function createTrial(id, mode, auto = false, modelVersion2 = 0, source2 = "simulation", modelId2 = "simulation-v3", layout2 = "right") {
    if (!MODES.includes(mode)) throw Error("Unknown mode");
    if (!["left", "right"].includes(layout2)) throw Error("Unknown layout");
    return { level: levelFor(id, mode), mode, autodemo: !!auto, source: source2, modelVersion: modelVersion2, modelId: modelId2, layout: layout2, time: 0, force: 0, grip: "power", phase: id === "terminal" ? "attempt" : id === "rhythm" ? "rhythm" : "grasp", held: 0, totalInBand: 0, switches: 0, switchArmed: true, awaitRest: false, qualified: false, done: false, success: false, outcome: null, reason: null, invalidFrames: 0, invalidMs: 0, invalidRunMs: 0, requestPause: false, onA: false, onB: false, hits: 0, misses: 0, voided: 0, trajectory: [] };
  }
  function abort(s, reason = "cancelled") {
    if (s.done) return s;
    s.force = 0;
    s.held = 0;
    s.qualified = false;
    s.done = true;
    s.success = false;
    s.outcome = "aborted";
    s.reason = reason;
    return s;
  }
  function neutralize(s, reason = "invalid") {
    if (s.done) return s;
    s.force = 0;
    s.held = 0;
    s.qualified = false;
    s.switchArmed = false;
    s.awaitRest = s.switches > 0;
    s.invalidFrames++;
    s.onA = false;
    s.onB = false;
    if (s.level.terminal) return abort(s, "connection_lost");
    s.phase = s.level.rhythm ? "rhythm" : "grasp";
    return s;
  }
  function validFrame(f) {
    return !!f && f.valid === true && !f.stale && f.rejection_reason !== "low_confidence" && ACTIONS.includes(f.action) && Array.isArray(f.activation) && f.activation.length === 2 && f.activation.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) && Number.isFinite(f.effort) && f.effort >= 0 && f.effort <= 1;
  }
  function coherentFrame(f) {
    if (!validFrame(f)) return false;
    const [a, b] = f.activation;
    if (f.action === "rest") return a < 0.25 && b < 0.25;
    if (f.action === "switch") return a > 0.55 && b > 0.55;
    if (f.action === "close" || f.action === "pinch") return a >= 0.25 && a > b;
    if (f.action === "open") return b >= 0.25 && b > a;
    return false;
  }
  function chargeInvalid(s, dt) {
    const spent = Math.min(dt, 0.3);
    s.invalidMs += spent * 1e3;
    s.invalidRunMs += spent * 1e3;
    if (s.level.rhythm) {
      const cue = s.level.cues.find((c) => !c.settled && s.time >= c.at - c.tol && s.time <= c.at + c.hold + c.tol);
      if (cue) {
        cue.settled = "void";
        s.voided++;
      }
    }
    if (s.invalidMs + 1e-9 >= INVALID_ABORT_S * 1e3) return abort(s, "connection_lost");
    if (s.invalidRunMs + 1e-9 >= INVALID_PAUSE_S * 1e3) s.requestPause = true;
    return s;
  }
  function noteInvalid(s, dt) {
    chargeInvalid(s, dt);
    if (s.done) return s;
    neutralize(s);
    return s;
  }
  function noteContradiction(s, dt) {
    s.force = 0;
    s.held = 0;
    s.onA = false;
    s.onB = false;
    s.invalidFrames++;
    return chargeInvalid(s, dt);
  }
  function complete(s, ok, reason) {
    s.done = true;
    s.success = ok;
    s.outcome = ok ? "success" : "failure";
    s.reason = reason;
  }
  function hysteresis(prev, x) {
    return prev ? x >= 0.2 : x >= 0.3;
  }
  function stepRhythm(s, f, dt) {
    dt = Math.min(dt, s.level.time - s.time);
    s.time += dt;
    s.onA = hysteresis(s.onA, f.activation[0]);
    s.onB = hysteresis(s.onB, f.activation[1]);
    const both = s.onA && s.onB;
    for (const cue of s.level.cues) {
      if (cue.settled) continue;
      const end = cue.at + cue.hold + cue.tol;
      if (s.time + 1e-9 < cue.at - cue.tol) continue;
      const want = cue.channel === "a" ? s.onA : s.onB;
      const other = cue.channel === "a" ? s.onB : s.onA;
      if (!cue.seen && s.time <= end + 1e-9) {
        if (want && !other) {
          cue.seen = true;
          cue.onset = s.time;
        } else if (both) {
          cue.settled = "miss";
          s.misses++;
        }
      }
      if (cue.seen && !cue.settled && !want) {
        const onsetOk = Math.abs(cue.onset - cue.at) <= cue.tol + 1e-6;
        const releaseOk = Math.abs(s.time - (cue.at + cue.hold)) <= cue.tol + 1e-6;
        cue.settled = onsetOk && releaseOk ? "hit" : "miss";
        if (cue.settled === "hit") s.hits++;
        else s.misses++;
      }
      if (!cue.settled && s.time > end + 1e-9) {
        cue.settled = "miss";
        s.misses++;
      }
    }
    s.force = both ? 0 : s.onA ? f.activation[0] : s.onB ? f.activation[1] : 0;
    if ((s.onA || s.onB) && !both) s.totalInBand += dt;
    s.trajectory.push({ t: +s.time.toFixed(4), force: +s.force.toFixed(4), grip: s.grip });
    if (s.time + 1e-9 >= s.level.time) {
      const ok = s.hits >= s.level.minHits;
      complete(s, ok, ok ? "completed" : "target_not_held");
    }
    return s;
  }
  function step(s, f, dt) {
    if (s.done) return s;
    if (!Number.isFinite(dt) || dt <= 0) throw Error("Invalid timestep");
    if (dt > 0.3 || !validFrame(f)) return noteInvalid(s, dt);
    if (!coherentFrame(f)) return noteContradiction(s, dt);
    s.invalidRunMs = 0;
    s.requestPause = false;
    if (s.level.rhythm) return stepRhythm(s, f, dt);
    dt = Math.min(dt, s.level.time - s.time);
    s.time += dt;
    const [a, b] = f.activation;
    const co = s.mode === "gesture" ? f.action === "switch" : a > 0.55 && b > 0.55;
    const rest = f.action === "rest";
    if (rest) {
      s.switchArmed = true;
      s.awaitRest = false;
    }
    if (co && s.switchArmed) {
      s.grip = s.grip === "power" ? "pinch" : "power";
      s.switches++;
      s.switchArmed = false;
      s.awaitRest = true;
      s.held = 0;
      s.phase = s.level.terminal ? "attempt" : "grasp";
    }
    if (s.mode === "gesture" && f.action === "pinch" && !s.level.requiresSwitch && !s.awaitRest) s.grip = "pinch";
    const analog = Math.max(0, a - b);
    s.force = s.awaitRest || co ? 0 : s.mode === "threshold" ? a > 0.3 && a > b ? 0.4 : 0 : s.mode === "proportional" ? analog : ["close", "pinch"].includes(f.action) ? f.effort : 0;
    const good = !s.awaitRest && s.grip === s.level.grip && s.force >= s.level.min && s.force <= s.level.max && (!s.level.requiresSwitch || s.switches > 0);
    if (good) s.totalInBand += dt;
    s.trajectory.push({ t: +s.time.toFixed(4), force: +s.force.toFixed(4), grip: s.grip });
    if (s.level.terminal) {
      s.held = good ? s.held + dt : 0;
      if (s.held + 1e-9 >= s.level.hold) s.qualified = true;
      if (s.time + 1e-9 >= s.level.time) complete(s, s.qualified, s.qualified ? "completed" : "target_not_held");
      return s;
    }
    if (s.force > s.level.breakAt) {
      complete(s, false, "overload");
      return s;
    }
    if (s.phase === "grasp" && good) {
      s.phase = "carry";
      s.held = 0;
    }
    if (s.phase === "carry") {
      if (!good) {
        s.phase = "grasp";
        s.held = 0;
      } else {
        s.held += dt;
        if (s.held + 1e-9 >= s.level.hold) s.phase = "release";
      }
    } else if (s.phase === "release") {
      if (s.grip !== s.level.grip || s.awaitRest) {
        s.phase = "grasp";
        s.held = 0;
      } else if (s.force < 0.1 && ["rest", "open"].includes(f.action)) complete(s, true, "completed");
    }
    if (!s.done && s.time + 1e-9 >= s.level.time) complete(s, false, "timeout");
    return s;
  }
  function result(s, id) {
    if (!s.done) throw Error("Unfinished trial");
    const ratio = s.level.rhythm ? s.hits / s.level.cues.length : s.totalInBand / Math.max(s.time, 1e-3);
    return { event_id: id, type: "trial", level: s.level.id, mode: s.mode, feedback: s.level.terminal ? "terminal" : "concurrent", source: s.source, model_version: s.modelVersion, model_id: s.modelId, layout: s.layout, level_version: VERSION, protocol_version: VERSION, outcome: s.outcome, success: s.success, reason: s.reason, duration_ms: Math.round(s.time * 1e3), in_band_ratio: ratio, switch_count: s.switches, invalid_frames: s.invalidFrames, invalid_ms: Math.round(s.invalidMs), rhythm_hits: s.hits, rhythm_misses: s.misses, rhythm_voided: s.voided, autodemo: s.autodemo, clinical_transfer_measured: false };
  }
  function metrics(events, id, mode, source2, modelVersion2, modelId2) {
    const scope = events.filter((e) => e.type === "trial" && e.level === id && e.mode === mode && e.source === source2 && e.model_version === modelVersion2 && (modelId2 === void 0 || e.model_id === modelId2) && e.level_version === VERSION && !e.autodemo);
    const completed = scope.filter((e) => ["success", "failure"].includes(e.outcome));
    const times = completed.filter((e) => e.success).map((e) => e.duration_ms).sort((a, b) => a - b);
    return { completed: completed.length, aborted: scope.filter((e) => e.outcome === "aborted").length, successRate: completed.length ? completed.filter((e) => e.success).length / completed.length : null, medianMs: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null };
  }
  function oracle(s) {
    if (s.level.rhythm) {
      const cue = s.level.cues.find((c) => !c.settled && s.time + 1e-9 >= c.at && s.time + 1e-9 < c.at + c.hold);
      if (!cue) return { action: "rest", activation: [0, 0], effort: 0, valid: true };
      return cue.channel === "a" ? { action: "close", activation: [0.5, 0], effort: 0.5, valid: true } : { action: "open", activation: [0, 0.5], effort: 0.5, valid: true };
    }
    if (s.awaitRest || s.phase === "release") return { action: "rest", activation: [0, 0], effort: 0, valid: true };
    if (s.grip !== s.level.grip) return s.mode === "gesture" && !s.level.requiresSwitch ? { action: "pinch", activation: [0.5, 0.05], effort: 0.45, valid: true } : { action: "switch", activation: [0.8, 0.8], effort: 0.8, valid: true };
    return { action: s.grip === "pinch" && s.mode === "gesture" && !s.level.requiresSwitch ? "pinch" : "close", activation: [0.5, 0.05], effort: s.level.id === "fragile" ? 0.4 : 0.45, valid: true };
  }

  // src/storage.mjs
  var KEY = "synergy-v3-records";
  function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function canonicalId(s) {
    if (typeof s !== "string") throw Error("UUID string required");
    const h = s.replaceAll("-", "").toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(h)) throw Error("UUID invalid");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function validateEvent(e) {
    if (!e || e.type !== "trial" || !["carry", "fragile", "pinch", "switch", "terminal", "rhythm"].includes(e.level) || !["threshold", "proportional", "gesture"].includes(e.mode) || !["simulation", "synthetic_emg", "external"].includes(e.source) || ![3, 4].includes(e.level_version) || e.protocol_version !== e.level_version) throw Error("Event schema mismatch");
    if (e.level === "rhythm" && e.level_version !== 4) throw Error("Rhythm requires protocol 4");
    const event = { ...e, event_id: canonicalId(e.event_id) };
    if (typeof e.success !== "boolean" || typeof e.autodemo !== "boolean" || !["success", "failure", "aborted"].includes(e.outcome) || e.success !== (e.outcome === "success")) throw Error("Outcome invalid");
    if (e.feedback !== (e.level === "terminal" ? "terminal" : "concurrent") || e.clinical_transfer_measured !== false) throw Error("Provenance invalid");
    if (typeof e.model_id !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(e.model_id)) throw Error("Model identity invalid");
    if (!Number.isInteger(e.model_version) || e.model_version < 0 || e.model_version > 1e5) throw Error("Model version invalid");
    for (const k of ["switch_count", "invalid_frames"]) if (!Number.isInteger(e[k]) || e[k] < 0 || e[k] > 1e5) throw Error("Counter invalid");
    if (!Number.isFinite(e.duration_ms) || e.duration_ms < 0 || e.duration_ms > 36e5 || !Number.isFinite(e.in_band_ratio) || e.in_band_ratio < 0 || e.in_band_ratio > 1.000001) throw Error("Metric invalid");
    const aborted = ["cancelled", "connection_lost"].includes(e.reason);
    if (aborted !== (e.outcome === "aborted")) throw Error("Abort invalid");
    if (e.outcome === "failure" && !["timeout", "overload", "target_not_held"].includes(e.reason)) throw Error("Failure invalid");
    if (e.level_version === 4) {
      if (!["left", "right"].includes(e.layout)) throw Error("Layout invalid");
      if (!Number.isInteger(e.invalid_ms) || e.invalid_ms < 0 || e.invalid_ms > 36e5) throw Error("Invalid time invalid");
      for (const k of ["rhythm_hits", "rhythm_misses", "rhythm_voided"]) if (!Number.isInteger(e[k]) || e[k] < 0 || e[k] > 1e3) throw Error("Rhythm counter invalid");
      if (e.level === "rhythm" && e.success && e.rhythm_hits < 6) throw Error("Implausible rhythm success");
    }
    if (e.success && (e.reason !== "completed" || e.duration_ms < (e.level === "terminal" ? 2999 : e.level === "rhythm" ? 1499 : 1499) || e.in_band_ratio <= 0 || e.level === "switch" && e.switch_count < 1)) throw Error("Implausible success");
    return event;
  }
  var EventStore = class {
    constructor(storage) {
      this.storage = storage;
      this.events = [];
      this.persisted = false;
      this.message = "";
      this.corruptRaw = null;
      this.read();
    }
    read() {
      let raw;
      try {
        raw = this.storage.getItem(KEY);
      } catch {
        this.persisted = false;
        this.readFailed = true;
        this.corruptRaw = null;
        this.message = "\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0438\u043B\u0438 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u043E. \u042D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B; \u0441\u0442\u0430\u0440\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F.";
        return;
      }
      if (!raw) {
        this.events = [];
        this.persisted = true;
        this.readFailed = false;
        this.corruptRaw = null;
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length > 1e4) throw Error("Archive invalid");
        this.events = parsed.map(validateEvent);
        this.persisted = true;
        this.readFailed = false;
        this.corruptRaw = null;
      } catch {
        this.events = [];
        this.persisted = false;
        this.readFailed = true;
        this.corruptRaw = raw;
        this.message = "\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u043E. \u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E: \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0431\u0430\u0439\u0442\u044B \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0438 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u044F\u044E\u0442\u0441\u044F.";
      }
    }
    add(e) {
      e = validateEvent(e);
      if (this.readFailed) {
        this.persisted = false;
        return false;
      }
      const old = this.events.find((x) => x.event_id === e.event_id);
      if (old) {
        if (JSON.stringify(old) !== JSON.stringify(e)) throw Error("Conflicting UUID");
        return false;
      }
      if (this.events.length >= 1e4) throw Error("\u041B\u0438\u043C\u0438\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0438. \u042D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0438 \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435.");
      this.events.push(e);
      this.save();
      return true;
    }
    save() {
      if (this.readFailed) {
        this.persisted = false;
        return;
      }
      try {
        this.storage.setItem(KEY, JSON.stringify(this.events));
        this.persisted = true;
        this.message = "";
      } catch {
        this.persisted = false;
        this.message = "\u041D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u043D\u0430 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0432 \u043F\u0430\u043C\u044F\u0442\u0438: \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 JSON \u0434\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F.";
      }
    }
    clear() {
      this.storage.removeItem(KEY);
      this.events = [];
      this.corruptRaw = null;
      this.readFailed = false;
      this.save();
    }
  };

  // src/app.mjs
  var $ = (id) => document.getElementById(id);
  var NAMES = { rest: "\u041F\u043E\u043A\u043E\u0439", close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C", pinch: "\u0429\u0438\u043F\u043E\u043A", switch: "\u041A\u043E\u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F" };
  var backendToken = null;
  var backendSession = null;
  var backendAvailable = false;
  var backendBusy = false;
  var backendInit = false;
  var action = "rest";
  var strength = 0.5;
  var trial = null;
  var running = false;
  var paused = false;
  var source = "simulation";
  var modelVersion = 0;
  var modelId = "simulation-v3";
  var layout = "right";
  var lastHoldMs = 0;
  var holdBegan = 0;
  var lastFrame = null;
  var lastFrameAt = 0;
  var lastSeq = -1;
  var seq = 0;
  var lastTick = performance.now();
  var epoch = 0;
  var cal = null;
  var replay = null;
  var disposed = false;
  var requests = new AbortController();
  var lab = new AbortController();
  var recoverTimer = 0;
  var recoverDelay = 250;
  var store;
  try {
    store = new EventStore(localStorage);
  } catch {
    store = new EventStore({ getItem() {
      throw Error("Unavailable");
    }, setItem() {
      throw Error("Unavailable");
    }, removeItem() {
      throw Error("Unavailable");
    } });
  }
  var TAB = uuid();
  var TAB_KEY = "synergy-v3-tab";
  var leader = true;
  var leaving = false;
  function readTab() {
    try {
      return JSON.parse(localStorage.getItem(TAB_KEY) || "null");
    } catch {
      return null;
    }
  }
  function releaseLeader() {
    try {
      const current = readTab();
      if (current && current.id === TAB) localStorage.removeItem(TAB_KEY);
    } catch {
    }
  }
  function refreshLeader() {
    if (disposed || leaving) return;
    const current = readTab(), foreign = current && current.id !== TAB && Date.now() - current.at < 1e4, was = leader;
    if (foreign) {
      leader = false;
      if (was && active()) {
        abort(trial, "cancelled");
        trial.recorded = true;
        running = false;
        paused = false;
        setStatus("\u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435. \u042D\u0442\u0430 \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.");
      }
    } else {
      leader = true;
      try {
        localStorage.setItem(TAB_KEY, JSON.stringify({ id: TAB, at: Date.now() }));
      } catch {
      }
    }
    if (was !== leader) {
      controls();
      render();
      renderHistory();
    }
  }
  var timers = [];
  function selectedLevel() {
    return $("level").value;
  }
  function active() {
    return trial && !trial.done;
  }
  function protectedFeedback() {
    return active() && trial.level.terminal;
  }
  function setAction(x) {
    if (!ACTIONS.includes(x)) return;
    action = x;
    document.querySelectorAll("[data-action]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.action === x);
      b.setAttribute("aria-pressed", String(b.dataset.action === x));
    });
  }
  function setStrength(x) {
    strength = Math.max(0, Math.min(1, x));
    $("strength").value = Math.round(strength * 100);
    $("strengthLabel").textContent = `${Math.round(strength * 100)}%`;
  }
  function controls() {
    const busy = !!active() || !!cal;
    const streamReady = validFrame(lastFrame) && lastFrame.model_version === modelVersion && lastFrame.model_id === modelId && performance.now() - lastFrameAt < 300;
    const ready = source === "simulation" || (source === "synthetic_emg" && backendAvailable || source === "external") && streamReady;
    for (const id of ["mode", "level", "source"]) $(id).disabled = busy;
    $("start").disabled = busy || !ready || !leader || store.events.length >= 1e4;
    $("auto").disabled = busy || !ready || !leader || source === "external" || store.events.length >= 1e4;
    $("erase").disabled = !leader || busy;
    $("calibrate").disabled = busy || source === "external" || source === "synthetic_emg" && !backendAvailable;
    $("pause").disabled = !active();
    $("abort").disabled = !active();
    $("pause").textContent = paused ? "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" : "\u041F\u0430\u0443\u0437\u0430";
    const unavailable = source === "external" || !!cal;
    for (const b of document.querySelectorAll("[data-action]")) b.disabled = unavailable || trial?.autodemo && active();
    $("strength").disabled = unavailable || trial?.autodemo && active();
    for (const id of ["gentle", "moderate", "coactivate"]) $(id).disabled = unavailable || trial?.autodemo && active();
    for (const b of document.querySelectorAll("[data-strength]")) b.disabled = unavailable || trial?.autodemo && active();
  }
  function feedback() {
    const hidden = !!protectedFeedback();
    $("feedback").hidden = hidden;
    $("decoder").hidden = hidden;
    $("grip").hidden = hidden;
    $("feedbackCover").hidden = !hidden;
    $("scene").querySelector("svg").setAttribute("aria-hidden", String(hidden));
  }
  function cancelReplay() {
    if (replay) {
      clearInterval(replay);
      replay = null;
    }
  }
  function setStatus(text, kind = "") {
    if ($("status").textContent !== text) $("status").textContent = text;
    $("status").className = "status" + (kind ? " " + kind : "");
  }
  function mission() {
    cancelReplay();
    trial = null;
    running = false;
    paused = false;
    epoch++;
    setAction("rest");
    $("after").hidden = true;
    const l = LEVELS.find((x) => x.id === selectedLevel());
    $("missionIndex").textContent = `\u041C\u0418\u0421\u0421\u0418\u042F ${String(LEVELS.indexOf(l) + 1).padStart(2, "0")} / ${String(LEVELS.length).padStart(2, "0")}`;
    $("title").textContent = l.title;
    $("story").textContent = l.story;
    $("skill").textContent = `\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u043D\u0430\u0432\u044B\u043A: ${l.skill}. \u041F\u0435\u0440\u0435\u043D\u043E\u0441 \u043D\u0430\u0432\u044B\u043A\u0430 \u043D\u0430 \u043F\u0440\u043E\u0442\u0435\u0437 \u043D\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D.`;
    $("objectName").textContent = l.object;
    $("parcel").toggleAttribute("hidden", l.id === "fragile" || ["pinch", "switch", "rhythm"].includes(l.id));
    $("plant").toggleAttribute("hidden", l.id !== "fragile");
    $("component").toggleAttribute("hidden", !["pinch", "switch"].includes(l.id));
    $("scene").classList.remove("damaged");
    $("band").textContent = l.rhythm ? "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438: \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u0435 \u0438 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F 0,5 / 1 / 2 \u0441. \u0414\u043E\u043F\u0443\u0441\u043A 160\u2013250 \u043C\u0441 \u2014 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440 \u0434\u0435\u043C\u043E, \u0448\u0438\u0440\u0435 \u0434\u0432\u0443\u0445 \u043A\u0430\u0434\u0440\u043E\u0432 \u043F\u043E 50 \u043C\u0441." : $("mode").value === "threshold" ? "\u041F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F \u043F\u043E\u0440\u043E\u0433\u0430 \u0443\u0441\u0438\u043B\u0438\u0435 \u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E: 40%. \u0414\u043B\u044F \u0434\u043E\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u043F\u043E\u0440\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435." : `\u0426\u0435\u043B\u0435\u0432\u043E\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D: ${Math.round(l.min * 100)}\u2013${Math.round(l.max * 100)}%. ${l.terminal ? "\u0423\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 1,2 \u0441; \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u0441\u043B\u0435 3 \u0441." : "\u041F\u043E\u0441\u043B\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439."}`;
    $("instruction").textContent = l.rhythm ? "\xAB\u0417\u0430\u043A\u0440\u044B\u0442\u044C\xBB \u2014 \u0441\u0436\u0430\u0442\u0438\u0435, \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C\xBB \u2014 \u0440\u0430\u0437\u0436\u0430\u0442\u0438\u0435. \u0414\u0435\u0440\u0436\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u0440\u043E\u0432\u043D\u043E \u0441\u0442\u043E\u043B\u044C\u043A\u043E, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0441\u0438\u0442 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430, \u0437\u0430\u0442\u0435\u043C \u043E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435." : l.grip === "pinch" ? "\u0429\u0438\u043F\u043E\u043A: \u043A\u043E\u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F 85% \u2192 \u043F\u043E\u043A\u043E\u0439 \u2192 \u0437\u0430\u043A\u0440\u044B\u0442\u044C 50%. \u0412 \u0440\u0435\u0436\u0438\u043C\u0435 \u0436\u0435\u0441\u0442\u043E\u0432 \u0434\u043B\u044F \u043C\u0438\u0441\u0441\u0438\u0438 3 \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \xAB\u0429\u0438\u043F\u043E\u043A\xBB." : "\u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438 50%, \u0443\u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0438 \u043E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435. \u0414\u043B\u044F \u0440\u0430\u0441\u0442\u0435\u043D\u0438\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 40%.";
    setStatus("\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u043C\u0438\u0441\u0441\u0438\u044E. \u041A\u043D\u043E\u043F\u043A\u0430 \xAB\u0410\u0432\u0442\u043E\u0434\u0435\u043C\u043E\xBB \u043F\u043E\u043A\u0430\u0436\u0435\u0442 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C.");
    feedback();
    render();
    renderHistory();
    controls();
  }
  function rhythmCue(s) {
    const cue = s.level.cues.find((c) => !c.settled);
    if (!cue) return "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u043B\u0438\u0441\u044C";
    return `\u041A\u0430\u043D\u0430\u043B ${cue.channel === "a" ? "\u0441\u0436\u0430\u0442\u0438\u044F" : "\u0440\u0430\u0437\u0436\u0430\u0442\u0438\u044F"}: ${cue.hold <= 0.3 ? "\u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u0435" : `\u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 ${cue.hold.toFixed(1)} \u0441`}`;
  }
  function rhythmLive() {
    return active() && trial.level.rhythm && !trial.autodemo && source !== "external";
  }
  function render() {
    if (protectedFeedback()) return;
    const f = trial?.force || 0;
    $("force").textContent = `${Math.round(f * 100)}%`;
    $("forceBar").value = f;
    $("grip").textContent = trial?.grip === "pinch" ? "\u0429\u0438\u043F\u043A\u043E\u0432\u044B\u0439 \u0441\u0445\u0432\u0430\u0442" : "\u041E\u0431\u044B\u0447\u043D\u044B\u0439 \u0441\u0445\u0432\u0430\u0442";
    const x = trial ? trial.phase === "release" || trial.success ? 1 : trial.held / trial.level.hold : 0;
    $("carriage").setAttribute("transform", `translate(${Math.max(0, Math.min(1, x)) * 422} 0)`);
    $("phase").textContent = trial?.done ? trial.success ? "\u041C\u0438\u0441\u0441\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430" : trial.outcome === "aborted" ? "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438" : "\u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C" : trial?.level.rhythm ? rhythmCue(trial) : trial?.awaitRest ? "\u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439" : trial?.phase === "carry" ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430: \u0443\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0439\u0442\u0435" : trial?.phase === "release" ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E: \u043E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435" : "\u0413\u043E\u0442\u043E\u0432\u044B \u043A \u0437\u0430\u0445\u0432\u0430\u0442\u0443";
    $("remaining").textContent = active() ? `${Math.max(0, trial.level.time - trial.time).toFixed(1)} \u0441` : "";
    $("decoded").textContent = lastFrame?.valid === false ? "\u041D\u0435\u0443\u0432\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u2014 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0441\u0431\u0440\u043E\u0448\u0435\u043D" : NAMES[lastFrame?.action || action];
    $("model").textContent = `${source} / ${modelVersion} \xB7 ${modelId}`;
  }
  function renderHistory() {
    const m = metrics(store.events, selectedLevel(), $("mode").value, source, modelVersion, modelId);
    $("attempts").textContent = m.completed;
    $("success").textContent = m.successRate === null ? "\u2014" : `${Math.round(m.successRate * 100)}%`;
    $("median").textContent = m.medianMs === null ? "\u2014" : `${(m.medianMs / 1e3).toFixed(1)} \u0441`;
    const successes = store.events.filter((e) => e.success && !e.autodemo && e.mode === $("mode").value && e.source === source && e.model_version === modelVersion && e.model_id === modelId && e.level_version === VERSION);
    $("missions").textContent = `${new Set(successes.map((e) => e.level)).size} / ${LEVELS.length}`;
    $("scope").textContent = `${$("mode").selectedOptions[0].textContent} \xB7 ${source} \xB7 \u043C\u043E\u0434\u0435\u043B\u044C ${modelVersion} / ${modelId} \xB7 \u0440\u0443\u0447\u043D\u044B\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043C\u0438\u0441\u0441\u0438\u0438. \u041F\u0440\u0435\u0440\u0432\u0430\u043D\u043E \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438: ${m.aborted}. \u0410\u0432\u0442\u043E\u0434\u0435\u043C\u043E \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u043E.`;
    $("storageStatus").textContent = !leader && store.persisted ? "\u042D\u0442\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u043C\u043E\u0442\u0440\u0438\u0442: \u0437\u0430\u043F\u0438\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0451 \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C\u0438, \u043D\u0435 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435." : store.persisted ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u042D\u043A\u0441\u043F\u043E\u0440\u0442 JSON \u2014 \u0432\u0430\u0448\u0430 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F. \u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u0435\u0442 \u043A\u044D\u0448 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B." : store.message;
    $("storageStatus").className = "storage-note" + (!store.persisted ? " warning" : "");
    const items = store.events.slice(-8).reverse().map((e) => {
      const li = document.createElement("li");
      li.textContent = `${e.autodemo ? "[\u0410\u0432\u0442\u043E\u0434\u0435\u043C\u043E] " : ""}${LEVELS.find((l) => l.id === e.level).title} \xB7 ${e.outcome === "aborted" ? "\u043F\u0440\u0435\u0440\u0432\u0430\u043D\u043E \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438" : e.success ? "\u0433\u043E\u0442\u043E\u0432\u043E" : e.reason === "overload" ? "\u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0441\u0438\u043B\u044C\u043D\u043E\u0435 \u0441\u0436\u0430\u0442\u0438\u0435" : "\u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430"} \xB7 ${(e.duration_ms / 1e3).toFixed(1)} \u0441 \xB7 ${e.source} / v${e.model_version}`;
      return li;
    });
    if (!items.length) {
      const li = document.createElement("li");
      li.textContent = "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u043C\u0438\u0441\u0441\u0438\u044E \u2014 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C.";
      items.push(li);
    }
    $("history").replaceChildren(...items);
  }
  function start(auto = false) {
    if (disposed || !leader || active() || cal || $("start").disabled) return;
    cancelReplay();
    epoch++;
    trial = createTrial(selectedLevel(), $("mode").value, auto, modelVersion, source, modelId, layout);
    trial.eventId = uuid();
    running = true;
    paused = false;
    lastTick = performance.now();
    setAction("rest");
    $("after").hidden = true;
    $("scene").classList.remove("damaged");
    setStatus(trial.level.terminal ? "\u0423\u043C\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F. \u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043E\u0431\u0440\u0430\u0442\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u0441\u043A\u0440\u044B\u0442\u0430." : trial.level.rhythm ? "\u0416\u0434\u0438\u0442\u0435 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043D\u0430\u0436\u0430\u0442\u0438\u044F." : "\u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u043A\u0438\u0441\u0442\u044C \u0443\u043C\u0435\u0440\u0435\u043D\u043D\u043E. \u041F\u043E\u0441\u043B\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 \u2014 \u043F\u043E\u043A\u043E\u0439.");
    feedback();
    controls();
  }
  function finish() {
    if (!trial?.done || trial.recorded) return;
    if (!leader) {
      trial.recorded = true;
      running = false;
      paused = false;
      setStatus("\u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u0430 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435. \u042D\u0442\u0430 \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.");
      render();
      renderHistory();
      controls();
      return;
    }
    trial.recorded = true;
    running = false;
    paused = false;
    epoch++;
    feedback();
    setAction("rest");
    try {
      store.add({ ...result(trial, trial.eventId), created_at: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (e) {
      store.persisted = false;
      store.message = e.message;
    }
    if (trial.success) setStatus("\u2713 \u041C\u0438\u0441\u0441\u0438\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u0421\u043F\u043E\u043A\u043E\u0439\u043D\u043E\u0435 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0438 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0437\u0430\u0441\u0447\u0438\u0442\u0430\u043D\u044B.", "success");
    else if (trial.outcome === "aborted") setStatus("\u041F\u043E\u043F\u044B\u0442\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430 \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438. \u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F \u0441\u0431\u0440\u043E\u0448\u0435\u043D.");
    else if (trial.reason === "overload") {
      setStatus("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0441\u0438\u043B\u044C\u043D\u043E\u0435 \u0441\u0436\u0430\u0442\u0438\u0435. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043C\u044F\u0433\u0447\u0435 \u2014 \u0437\u0434\u0435\u0441\u044C \u0432\u0430\u0436\u043D\u0430 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C.", "failure");
      $("scene").classList.add("damaged");
    } else setStatus("\u041F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C. \u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0431\u0435\u0437 \u0441\u043F\u0435\u0448\u043A\u0438.", "failure");
    $("after").hidden = false;
    $("next").textContent = selectedLevel() === "terminal" ? "\u041D\u0430\u0447\u0430\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u043A\u0440\u0443\u0433 \u2192" : "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043C\u0438\u0441\u0441\u0438\u044F \u2192";
    $("resultNote").textContent = trial.autodemo ? "\u042D\u0442\u043E \u0430\u0432\u0442\u043E\u0434\u0435\u043C\u043E \u2014 \u043D\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F." : trial.success ? "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0441 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u043C \u0438 \u0432\u0435\u0440\u0441\u0438\u0435\u0439." : "\u041D\u0435\u0443\u0441\u043F\u0435\u0445 \u0438 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u043D\u0438\u0435 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.";
    render();
    renderHistory();
    controls();
    if (trial.level.terminal && trial.outcome !== "aborted") {
      const captured = trial, begin = performance.now();
      let i = 0;
      replay = setInterval(() => {
        if (active() || disposed) return cancelReplay();
        const elapsed = (performance.now() - begin) / 1e3;
        while (i + 1 < captured.trajectory.length && captured.trajectory[i + 1].t <= elapsed) i++;
        const p = captured.trajectory[i];
        if (p) {
          $("force").textContent = `${Math.round(p.force * 100)}%`;
          $("forceBar").value = p.force;
        }
        if (elapsed >= captured.time) cancelReplay();
      }, 30);
    }
  }
  function pause(reason = "pause") {
    if (!active()) return;
    epoch++;
    running = false;
    paused = true;
    trial.requestPause = false;
    setAction("rest");
    if (trial.level.terminal) {
      abort(trial, reason === "pause" ? "cancelled" : "connection_lost");
      finish();
      return;
    }
    neutralize(trial);
    setStatus(reason === "invalid" ? "\u041D\u0435\u0442 \u0443\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0433\u043E \u0441\u0438\u0433\u043D\u0430\u043B\u0430 3 \u0441. \u041F\u0430\u0443\u0437\u0430: \u0443\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043E, \u044D\u0442\u043E \u043D\u0435 \u043E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430\u0432\u044B\u043A\u0430." : reason === "pause" ? "\u041F\u0430\u0443\u0437\u0430. \u0423\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043E. \u0414\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439." : "\u041D\u0435\u0442 \u0441\u0432\u0435\u0436\u0435\u0433\u043E \u0432\u0430\u043B\u0438\u0434\u043D\u043E\u0433\u043E \u043F\u043E\u0442\u043E\u043A\u0430. \u0423\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043E; \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0435 \u043F\u043E\u0441\u043B\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F.");
    controls();
    render();
  }
  function resume() {
    if (!paused || !active()) return;
    if (source !== "simulation" && (!validFrame(lastFrame) || performance.now() - lastFrameAt > 300)) return;
    epoch++;
    paused = false;
    running = true;
    lastTick = performance.now();
    setAction("rest");
    feedback();
    controls();
  }
  function simFrame() {
    const a = strength;
    const map = { rest: [0, 0], close: [a, 0], open: [0, a], pinch: [a, 0], switch: [a, a] };
    return { action, activation: map[action], effort: action === "rest" ? 0 : a, valid: true, seq: ++seq, model_version: 0, model_id: "simulation-v3" };
  }
  function stopRecover() {
    if (recoverTimer) {
      clearTimeout(recoverTimer);
      recoverTimer = 0;
    }
    recoverDelay = 250;
  }
  function scheduleRecover() {
    if (recoverTimer || disposed || source !== "synthetic_emg" || backendAvailable) return;
    const wait = recoverDelay;
    recoverDelay = Math.min(recoverDelay * 2, 2e3);
    recoverTimer = setTimeout(() => {
      recoverTimer = 0;
      if (!disposed && source === "synthetic_emg" && !backendAvailable) setupBackend();
    }, wait);
  }
  function failLab() {
    if (disposed || source !== "synthetic_emg") return;
    const down = !backendAvailable && !backendSession;
    lastFrame = null;
    lastFrameAt = 0;
    if (cal) cancelCal();
    if (active() && !paused) pause("stale");
    if (down) {
      controls();
      return;
    }
    backendAvailable = false;
    backendSession = null;
    backendToken = null;
    lab.abort();
    lab = new AbortController();
    $("connection").textContent = "\u041B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u041F\u043E\u0432\u0442\u043E\u0440 \u0447\u0435\u0440\u0435\u0437 \u043F\u0430\u0443\u0437\u0443.";
    if (String(modelId).startsWith("pending-")) $("sourceNote").textContent = "LDA \u0442\u0440\u0435\u0431\u0443\u0435\u0442 Python server.py \u0438 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439. \u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u0441\u0438\u043C\u0443\u043B\u044F\u0446\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0431\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.";
    scheduleRecover();
    controls();
  }
  async function api(path, data) {
    const c = new AbortController(), timer = setTimeout(() => c.abort(), 2e3), stop = () => c.abort(), generation = lab;
    requests.signal.addEventListener("abort", stop, { once: true });
    generation.signal.addEventListener("abort", stop, { once: true });
    if (requests.signal.aborted || generation.signal.aborted) c.abort();
    try {
      const r = await fetch("/api/" + path, { method: data ? "POST" : "GET", headers: { ...data ? { "Content-Type": "application/json" } : {}, ...backendToken ? { "X-Demo-Token": backendToken } : {} }, ...data ? { body: JSON.stringify(data) } : {}, signal: c.signal });
      const b = await r.json();
      if (!r.ok) {
        const e = Error(b.error || String(r.status));
        e.status = r.status;
        throw e;
      }
      return b;
    } finally {
      clearTimeout(timer);
      requests.signal.removeEventListener("abort", stop);
      generation.signal.removeEventListener("abort", stop);
    }
  }
  async function setupBackend() {
    if (backendInit || location.protocol === "file:" || disposed || source !== "synthetic_emg") return;
    backendInit = true;
    const generation = lab;
    try {
      const token = (await api("bootstrap")).token;
      if (disposed || generation !== lab || source !== "synthetic_emg") return;
      backendToken = token;
      const session = (await api("session", {})).session;
      if (disposed || generation !== lab || source !== "synthetic_emg") {
        backendToken = null;
        return;
      }
      backendSession = session;
      backendAvailable = true;
      lastSeq = -1;
      recoverDelay = 250;
      $("connection").textContent = "LDA \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430";
    } catch {
      if (generation === lab && !disposed && source === "synthetic_emg") {
        backendAvailable = false;
        backendSession = null;
        backendToken = null;
        $("connection").textContent = "\u041B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u041F\u043E\u0432\u0442\u043E\u0440 \u0447\u0435\u0440\u0435\u0437 \u043F\u0430\u0443\u0437\u0443.";
        if (String(modelId).startsWith("pending-")) $("sourceNote").textContent = "LDA \u0442\u0440\u0435\u0431\u0443\u0435\u0442 Python server.py \u0438 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439. \u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u0441\u0438\u043C\u0443\u043B\u044F\u0446\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0431\u0435\u0437 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.";
        scheduleRecover();
      }
    } finally {
      backendInit = false;
      controls();
    }
  }
  async function pollBackend() {
    if (disposed || source !== "synthetic_emg" || backendBusy || !backendAvailable) return;
    backendBusy = true;
    const captured = epoch, sid = backendSession, generation = lab;
    try {
      let label = null;
      if (cal && !cal.pending) {
        const t = (performance.now() - cal.begin) / 1e3;
        const counts = cal.counts || (cal.counts = { rest: 0, close: 0, open: 0, pinch: 0, switch: 0 });
        const enough = Math.min(...Object.values(counts)) >= 12;
        if (t >= 30 && enough || t >= 45) {
          const pendingCal = cal;
          const r = await api("calibration/finish", { session: sid });
          if (disposed || cal !== pendingCal || generation !== lab) return;
          if (captured === epoch) {
            epoch++;
            lastFrame = null;
            lastFrameAt = 0;
            modelVersion = r.model_version;
            if (typeof r.model_id === "string") modelId = r.model_id;
          }
          cal = null;
          $("calibrationDialog").close();
          setAction("rest");
          $("sourceNote").textContent = `\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430: \u043C\u043E\u0434\u0435\u043B\u044C v${modelVersion}. \u041F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u043B\u0438\u0441\u044C.`;
          renderHistory();
          controls();
          return;
        }
        const step2 = Math.floor(t / 3);
        setAction(["rest", "close", "open", "pinch", "switch"][step2 % 5]);
        setStrength(0.6);
        $("calPrompt").textContent = `${step2 + 1} / 10 \xB7 ${NAMES[action]}`;
        $("calProgress").value = Math.min(t, 30);
        $("calCount").textContent = t < 30 ? `${Math.ceil(30 - t)} \u0441 \u0434\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F` : "\u0414\u043E\u0431\u0440\u0430\u0442\u044C \u043E\u043A\u043D\u0430 \u043A\u043B\u0430\u0441\u0441\u043E\u0432";
        if (t % 3 >= 1) label = action;
      }
      const f = await api("frame", { session: sid, action, strength, calibration_label: label });
      if (generation !== lab || disposed || source !== "synthetic_emg" || sid !== backendSession || captured !== epoch) return;
      if (label && cal && !cal.pending && f.ready) cal.counts[label] = (cal.counts[label] || 0) + 1;
      if (f.ready && f.seq > lastSeq) {
        lastSeq = f.seq;
        modelVersion = f.model_version;
        modelId = f.model_id;
        lastFrame = { ...f, valid: f.valid === true, effort: f.effort };
        lastFrameAt = performance.now();
        $("connection").textContent = "\u0421\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F raw \u042D\u041C\u0413 \xB7 request-clock";
        controls();
      }
    } catch (e) {
      if (disposed) return;
      failLab();
    } finally {
      backendBusy = false;
    }
  }
  function autoIntent() {
    const f = oracle(trial);
    setAction(f.action);
    setStrength(f.action === "switch" ? 0.85 : f.action === "pinch" ? 0.6 : trial.level.id === "fragile" ? 0.4 : 0.5);
  }
  function tick() {
    if (disposed) return;
    const now = performance.now(), dt = (now - lastTick) / 1e3;
    lastTick = now;
    if (running) {
      if (trial.autodemo) autoIntent();
      const frame = source === "simulation" ? simFrame() : lastFrame;
      if (source === "simulation") {
        lastFrame = frame;
        lastFrameAt = now;
      }
      if (source !== "simulation" && (!frame || now - lastFrameAt > 300)) {
        pause("stale");
      } else if (frame.model_version !== trial.modelVersion || frame.model_id !== trial.modelId) {
        abort(trial, "connection_lost");
        finish();
      } else {
        if (trial.level.terminal && !trial.attempt && (!coherentFrame(frame) || frame.action === "rest")) {
          if (coherentFrame(frame)) step(trial, frame, dt);
          else lastTick = now;
        } else {
          if (trial.level.terminal) trial.attempt = true;
          step(trial, frame, dt);
        }
        if (trial.requestPause && !trial.done) pause("invalid");
        else if (trial.done) finish();
        else if (!protectedFeedback()) setStatus(!validFrame(frame) ? "\u041D\u0435\u0443\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0441\u0438\u0433\u043D\u0430\u043B: \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0441\u0431\u0440\u043E\u0448\u0435\u043D. \u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439." : trial.level.rhythm ? rhythmCue(trial) : trial.awaitRest ? "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E. \u0422\u0435\u043F\u0435\u0440\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 \u043F\u043E\u043A\u043E\u0439." : trial.phase === "release" ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E! \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041F\u043E\u043A\u043E\u0439\xBB \u0438\u043B\u0438 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C\xBB." : trial.phase === "carry" ? "\u0423\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0439\u0442\u0435 \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044E. \u041F\u0440\u0435\u0434\u043C\u0435\u0442 \u0434\u0432\u0438\u0436\u0435\u0442\u0441\u044F \u043A \u0442\u043E\u0447\u043A\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438." : trial.grip !== trial.level.grip ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0449\u0438\u043F\u043A\u043E\u0432\u044B\u0439 \u0441\u0445\u0432\u0430\u0442." : "\u0417\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0432 \u0446\u0435\u043B\u0435\u0432\u043E\u043C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0435.");
      }
    }
    if (!replay) render();
    controls();
  }
  async function calibrate() {
    if (active() || cal) return;
    if (source === "simulation") {
      $("calTitle").textContent = "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435";
      $("calDescription").textContent = "\u042D\u0442\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u043D\u043E\u043F\u043E\u043A \u0438 \u0438\u0433\u0440\u043E\u0432\u043E\u0433\u043E \u043A\u043E\u043D\u0442\u0443\u0440\u0430, \u043D\u0435 \u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430 \u043C\u044B\u0448\u0446. \u0414\u043B\u044F \u043F\u0435\u0440\u0432\u043E\u0439 \u043C\u0438\u0441\u0441\u0438\u0438: \u0437\u0430\u043A\u0440\u044B\u0442\u044C 50% \u2192 \u0443\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u2192 \u043F\u043E\u043A\u043E\u0439.";
      $("calPrompt").textContent = "\u0421\u0438\u043C\u0443\u043B\u044F\u0446\u0438\u044F \u0433\u043E\u0442\u043E\u0432\u0430";
      $("calProgress").value = 30;
      $("calCount").textContent = "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0430\u043C\u0438 \u0438\u043B\u0438 \u043A\u043B\u0430\u0432\u0438\u0448\u0430\u043C\u0438 0\u20134.";
      openDialog($("calibrationDialog"));
      return;
    }
    if (!backendAvailable) return;
    cal = { begin: performance.now(), pending: true };
    const startingCal = cal;
    controls();
    $("calTitle").textContent = "\u041A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430 \u043D\u0430 \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u043A\u0435";
    $("calDescription").textContent = "10 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0439 \xD7 3 \u0441. \u0413\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0438\u0433\u0440\u0430\u0435\u0442 \u043A\u043E\u043C\u0430\u043D\u0434\u044B. \u042D\u0442\u043E \u043D\u0435 \u0441\u0438\u0433\u043D\u0430\u043B \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430.";
    $("calPrompt").textContent = "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430\u2026";
    $("calProgress").value = 0;
    openDialog($("calibrationDialog"));
    try {
      await api("calibration/reset", { session: backendSession });
      if (cal === startingCal && !disposed) {
        cal.begin = performance.now();
        cal.pending = false;
        cal.counts = { rest: 0, close: 0, open: 0, pinch: 0, switch: 0 };
      }
    } catch (e) {
      cancelCal();
      setStatus(e.message);
    }
  }
  async function cancelCal() {
    const had = !!cal;
    cal = null;
    if (disposed) return;
    setAction("rest");
    $("calibrationDialog").close();
    controls();
    if (had && backendAvailable) try {
      await api("calibration/cancel", { session: backendSession });
    } catch {
    }
  }
  function changeSource(value) {
    if (disposed || !["simulation", "synthetic_emg", "external"].includes(value)) return false;
    stopRecover();
    if (active()) {
      abort(trial, "cancelled");
      finish();
    }
    if (cal) cancelCal();
    source = value;
    backendAvailable = false;
    backendSession = null;
    backendToken = null;
    lab.abort();
    lab = new AbortController();
    $("source").value = value;
    modelVersion = value === "simulation" ? 0 : 1;
    modelId = value === "simulation" ? "simulation-v3" : "pending-" + value;
    lastFrame = null;
    lastFrameAt = 0;
    lastSeq = -1;
    epoch++;
    mission();
    $("controlNote").textContent = value === "external" ? "\u041A\u043E\u043C\u0430\u043D\u0434\u044B \u043F\u0440\u0438\u0445\u043E\u0434\u044F\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442 host. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 window.SynergyMVP.feed(frame); \u0434\u043E \u043F\u043E\u0442\u043E\u043A\u0430 \u0441\u0442\u0430\u0440\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D." : value === "synthetic_emg" ? "\u041A\u043D\u043E\u043F\u043A\u0438 \u0437\u0430\u0434\u0430\u044E\u0442 \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u2192 4-channel raw synthetic EMG \u2192 \u0444\u0438\u043B\u044C\u0442\u0440 \u2192 LDA \u2192 \u0438\u0433\u0440\u0430. \u041D\u0435 \u0430\u043F\u043F\u0430\u0440\u0430\u0442\u043D\u044B\u0439 SDK." : "\u041A\u043D\u043E\u043F\u043A\u0438 \u0437\u0430\u0434\u0430\u044E\u0442 \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438\u0435. \u042D\u0442\u043E \u043D\u0435 \u0441\u0438\u0433\u043D\u0430\u043B \u043C\u044B\u0448\u0446 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430.";
    $("calibrate").textContent = value === "synthetic_emg" ? "\u041A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430 \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u043A\u0438 \xB7 30 \u0441" : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435";
    $("connection").textContent = value === "simulation" ? "\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u0441\u0438\u043C\u0443\u043B\u044F\u0446\u0438\u044F" : value === "external" ? "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0432\u043D\u0435\u0448\u043D\u0438\u0439 \u043F\u043E\u0442\u043E\u043A" : "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044E\u2026";
    if (value === "synthetic_emg") {
      if (location.protocol === "file:") $("sourceNote").textContent = "\u0414\u043B\u044F LDA \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 Python-\u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u0427\u0435\u0440\u0435\u0437 file:// \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u0438\u0433\u0440\u0430.";
      else setupBackend();
    }
    controls();
    renderHistory();
  }
  function exportData() {
    const corrupt = typeof store.corruptRaw === "string";
    const body = corrupt ? store.corruptRaw : JSON.stringify({ app: "Synergy", version: "3.1.0", exported_at: (/* @__PURE__ */ new Date()).toISOString(), clinical_transfer_measured: false, persisted: store.persisted, events: store.events }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: corrupt ? "text/plain" : "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = corrupt ? "synergy-v3-corrupt-backup.txt" : "synergy-v3-results.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return corrupt ? { corrupt: true, bytes: store.corruptRaw.length } : { app: "Synergy", version: "3.1.0", events: store.events };
  }
  function feed(f) {
    if (source !== "external") return false;
    if (disposed) return false;
    if (!f || typeof f.model_id !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(f.model_id) || !Number.isInteger(f.seq) || f.seq <= lastSeq || !Number.isInteger(f.model_version) || f.model_version < 0 || f.model_version > 1e5) {
      lastFrame = null;
      lastFrameAt = 0;
      if (active()) pause("stale");
      controls();
      return false;
    }
    if (!Number.isFinite(f.age_ms) || f.age_ms < 0 || f.age_ms > 300) {
      lastFrame = null;
      lastFrameAt = 0;
      if (active()) pause("stale");
      controls();
      return false;
    }
    lastSeq = f.seq;
    lastFrame = { ...f, valid: f.valid === true };
    lastFrameAt = performance.now() - f.age_ms;
    modelVersion = f.model_version;
    modelId = f.model_id;
    $("connection").textContent = "\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u043F\u043E\u0442\u043E\u043A \xB7 \u0431\u0435\u0437 \u0430\u043A\u0442\u0443\u0430\u0446\u0438\u0438";
    controls();
    renderHistory();
    return true;
  }
  $("level").replaceChildren(...LEVELS.map((l, i) => {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = `${i + 1}. ${l.title}`;
    return o;
  }));
  $("mode").onchange = mission;
  $("level").onchange = mission;
  $("source").onchange = () => changeSource($("source").value);
  $("start").onclick = () => start();
  $("auto").onclick = () => start(true);
  $("pause").onclick = () => running ? pause() : resume();
  $("abort").onclick = () => {
    if (active()) {
      abort(trial);
      finish();
    }
  };
  function applyLayout(side) {
    layout = side === "left" ? "left" : "right";
    document.documentElement.dataset.layout = layout;
    if ($("layout")) $("layout").value = layout;
    for (const root of document.querySelectorAll(".gestures, .mobile-gestures")) {
      const by = Object.fromEntries([...root.querySelectorAll("[data-action]")].map((b) => [b.dataset.action, b]));
      for (const name of layout === "left" ? ["rest", "open", "close", "pinch", "switch"] : ["rest", "close", "open", "pinch", "switch"]) if (by[name]) root.appendChild(by[name]);
    }
    try {
      localStorage.setItem("synergy-prefs", JSON.stringify({ layout }));
    } catch {
    }
  }
  for (const b of document.querySelectorAll("[data-action]")) {
    b.onclick = () => {
      if (rhythmLive()) return;
      setAction(b.dataset.action);
    };
    b.addEventListener("pointerdown", (e) => {
      if (!rhythmLive() || e.button > 0) return;
      b.setPointerCapture?.(e.pointerId);
      holdBegan = performance.now();
      setAction(b.dataset.action);
    });
    const endHold = () => {
      if (!holdBegan) return;
      lastHoldMs = performance.now() - holdBegan;
      holdBegan = 0;
      setAction("rest");
    };
    b.addEventListener("pointerup", endHold);
    b.addEventListener("pointercancel", endHold);
    b.addEventListener("lostpointercapture", endHold);
  }
  for (const b of document.querySelectorAll("[data-strength]")) b.onclick = () => setStrength(Number(b.dataset.strength));
  $("strength").oninput = (e) => setStrength(Number(e.target.value) / 100);
  $("gentle").onclick = () => setStrength(0.4);
  $("moderate").onclick = () => setStrength(0.5);
  $("coactivate").onclick = () => {
    setStrength(0.85);
    setAction("switch");
  };
  $("next").onclick = () => {
    if (active()) return;
    const n = (LEVELS.findIndex((x) => x.id === selectedLevel()) + 1) % LEVELS.length;
    $("level").value = LEVELS[n].id;
    mission();
  };
  var dialogReturn = null;
  function openDialog(dialog) {
    if (dialog.open) return;
    const from = document.activeElement;
    dialogReturn = from instanceof HTMLElement && !dialog.contains(from) ? from : null;
    dialog.showModal();
  }
  function rememberDialog(dialog) {
    dialog.addEventListener("close", () => {
      const back = dialogReturn;
      dialogReturn = null;
      if (back && document.contains(back)) back.focus();
    });
  }
  rememberDialog($("helpDialog"));
  rememberDialog($("calibrationDialog"));
  $("help").onclick = () => openDialog($("helpDialog"));
  $("closeHelp").onclick = () => $("helpDialog").close();
  $("calibrate").onclick = calibrate;
  $("cancelCal").onclick = cancelCal;
  $("calibrationDialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    cancelCal();
  });
  $("export").onclick = exportData;
  $("erase").onclick = () => {
    if (!leader) {
      setStatus("\u042D\u0442\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u043C\u043E\u0442\u0440\u0438\u0442. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u0443\u044E \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.");
      return;
    }
    if (active() || cal) {
      setStatus("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0438\u043B\u0438 \u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0443.");
      return;
    }
    if (confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B MVP 3 \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435? \u041A\u044D\u0448 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F \u043D\u0435 \u043E\u0447\u0438\u0449\u0430\u044E\u0442\u0441\u044F.")) try {
      store.clear();
      renderHistory();
      setStatus("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0443\u0434\u0430\u043B\u0435\u043D\u0430. \u041A\u044D\u0448 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u043E\u0441\u0442\u0430\u043B\u0441\u044F.");
    } catch (e) {
      store.persisted = false;
      store.message = "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C: " + e.message;
      renderHistory();
    }
  };
  function onKey(e) {
    if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(e.target.tagName) || cal || source === "external" || trial?.autodemo && active() || e.repeat) return;
    if (/^[0-4]$/.test(e.key)) {
      e.preventDefault();
      if (rhythmLive()) holdBegan = performance.now();
      setAction(ACTIONS[Number(e.key)]);
    }
  }
  function onKeyUp(e) {
    if (!rhythmLive() || !/^[0-4]$/.test(e.key)) return;
    if (holdBegan) {
      lastHoldMs = performance.now() - holdBegan;
      holdBegan = 0;
    }
    setAction("rest");
  }
  function onVisibility() {
    if (document.hidden) {
      if (holdBegan) {
        lastHoldMs = performance.now() - holdBegan;
        holdBegan = 0;
        setAction("rest");
      }
      if (running) pause();
      if (cal) cancelCal();
    }
  }
  function onPageHide() {
    leaving = true;
    releaseLeader();
  }
  function onPageShow(e) {
    leaving = false;
    lastTick = performance.now();
    if (e.persisted && running) pause("stale");
    refreshLeader();
  }
  function onStorage(e) {
    if (e.key === TAB_KEY) {
      refreshLeader();
      return;
    }
    if (e.key === "synergy-v3-records" && !leader) {
      store = new EventStore(localStorage);
      renderHistory();
      controls();
    }
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    if (holdBegan) {
      lastHoldMs = performance.now() - holdBegan;
      holdBegan = 0;
      setAction("rest");
    }
  });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("storage", onStorage);
  try {
    const saved = JSON.parse(localStorage.getItem("synergy-prefs") || "{}");
    if (saved.layout === "left") layout = "left";
  } catch {
  }
  if ($("layout")) {
    $("layout").value = layout;
    $("layout").onchange = () => applyLayout($("layout").value);
  }
  applyLayout(layout);
  window.SynergyMVP = { version: "3.1.0", feed, setSource: changeSource, start, pause, resume, abort() {
    if (active()) {
      abort(trial);
      finish();
    }
  }, getState() {
    return JSON.parse(JSON.stringify({ source, modelVersion, modelId, layout, lastHoldMs, running, paused, leader, trial, events: store.events, persisted: store.persisted }));
  }, exportData, unmount() {
    disposed = true;
    stopRecover();
    if (active()) {
      abort(trial);
      finish();
    }
    releaseLeader();
    requests.abort();
    lab.abort();
    timers.forEach(clearInterval);
    cancelReplay();
    cal = null;
    try {
      $("calibrationDialog").close();
    } catch {
    }
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("storage", onStorage);
  } };
  refreshLeader();
  mission();
  setAction("rest");
  setStrength(0.5);
  timers.push(setInterval(tick, 50));
  timers.push(setInterval(() => {
    if (!cal?.pending) pollBackend();
  }, 50));
  timers.push(setInterval(refreshLeader, 2e3));
  if (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {
    });
  }
})();
//# sourceMappingURL=app.bundle.js.map
