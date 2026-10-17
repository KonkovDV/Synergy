// Composition root: state, signal sources, routing, the frame loop and training sessions.
import { APP } from './config.js';
import { Store, memoryStorage } from './core/storage.js';
import { SignalPipeline } from './core/signal.js';
import { BionicHand } from './core/hand.js';
import { HAND } from './config.js';
import { recordRun, completePlanItem, buildDailyPlan, dayKey } from './core/progress.js';
import { EmgEmulator } from './input/emulator.js';
import { BridgeSource } from './input/bridge.js';
import { bindKeyboard } from './input/controls.js';
import { createGame, GAME_BY_ID, PLAN_CATALOG } from './games/registry.js';
import { GameRunner } from './games/runner.js';
import { createFeedback } from './services/feedback.js';
import { setSoundEnabled, unlockAudio } from './services/audio.js';
import { mount, toast } from './ui/dom.js';
import { SCREENS } from './ui/screens.js';

function safeStorage() {
  try { const k = '__synergy_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return memoryStorage(); }
}

export class App {
  constructor(root) {
    this.root = root;
    this.store = new Store(safeStorage());
    this.emulator = new EmgEmulator({ realism: this.settings.realism, seed: Date.now() % 100000 });
    this.bridge = null;
    this.feedback = createFeedback(() => this.settings);
    this.screen = null;
    this.plan = null;              // active daily-plan walk: { index }
    this.lastTime = performance.now();
    setSoundEnabled(this.settings.sound);
    bindKeyboard(this.emulator, () => this.settings.scheme);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.screen?.onHidden?.(); });
    this.exposeApi();
    this.applySource();
    requestAnimationFrame(t => this.frame(t));
  }

  get state() { return this.store.state; }
  get settings() { return this.state.settings; }
  get profile() { return this.state.profile; }
  save() { this.store.save(); }

  updateSettings(patch) {
    const before = this.settings.source;
    Object.assign(this.settings, patch);
    this.emulator.realism = this.settings.realism;
    setSoundEnabled(this.settings.sound);
    if (patch.source !== undefined || patch.wsUrl !== undefined || before !== this.settings.source) this.applySource();
    this.save();
  }

  /** Window API for a native host / organizers' emulator / automated tests (docs/INTEGRATION.md). */
  exposeApi() {
    window.Synergy = {
      version: APP.version,
      feed: frame => { if (this.settings.source !== 'bridge') this.updateSettings({ source: 'bridge' }); return this.bridge.feed(frame); },
      useBridge: (url = '') => this.updateSettings({ source: 'bridge', wsUrl: url }),
      useTouch: () => this.updateSettings({ source: 'touch' }),
      state: () => JSON.parse(JSON.stringify({ settings: this.settings, profile: this.profile, runs: this.state.runs.length, screen: this.screen?.name, bridge: this.bridge?.status ?? null })),
      go: (name, params) => this.go(name, params),
      /** Android back button: returns false when already home (the host may close the app). */
      back: () => { if (this.screen?.name === 'home') return false; this.go('home'); return true; },
    };
  }

  applySource() {
    if (this.settings.source === 'bridge') {
      this.bridge?.stop();
      this.bridge = new BridgeSource({ url: this.settings.wsUrl, onStatus: s => this.screen?.onBridgeStatus?.(s) });
      this.bridge.start();
    } else if (this.bridge) {
      this.bridge.stop(); this.bridge = null;
    }
  }

  sourceKind() { return this.settings.source === 'bridge' ? 'bridge' : 'touch'; }
  signalSource(demo = false) { return demo || this.sourceKind() === 'touch' ? this.emulator : this.bridge; }
  calibration(kind = this.sourceKind()) { return this.state.calibrations[kind]; }

  createPipeline(demo = false) {
    return new SignalPipeline({
      scheme: this.settings.scheme,
      calibration: demo ? this.state.calibrations.touch : this.calibration(),
      params: { onThreshold: this.settings.sensitivity, coThreshold: this.settings.coThreshold },
    });
  }

  createHand() { return new BionicHand({ grips: HAND.twoChannelGrips }); }

  dailyPlan() { return buildDailyPlan(this.profile, this.state.runs, PLAN_CATALOG, this.settings.scheme, dayKey()); }

  /** Builds a runnable session for the play screen. */
  createSession({ game, level, retention = false, demo = false }) {
    const instance = createGame(game, { levelNumber: level, scheme: this.settings.scheme, seed: (Date.now() % 9973) + level, retention, skin: this.profile.skin, mirror: this.settings.side === 'left' });
    const hand = this.createHand();
    const runner = new GameRunner({ game: instance, pipeline: this.createPipeline(demo), hand, source: this.signalSource(demo), emulator: this.emulator, autopilot: demo });
    return { id: game, level, retention, demo, game: instance, hand, runner, entry: GAME_BY_ID[game] };
  }

  /** Persists a finished run and returns everything the results screen shows. */
  finishSession(session) {
    const r = session.game.result();
    const run = {
      id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(),
      game: session.id, level: session.level, levelCount: session.entry.Game.levels.length,
      scheme: this.settings.scheme, source: session.demo ? 'demo' : this.sourceKind(),
      retention: session.retention, demo: session.demo, ...r,
    };
    if (session.demo) return { run, report: null, planBonus: 0 };
    this.state.runs.push(run);
    const report = recordRun(this.profile, run, { today: dayKey(), weeklyGoal: this.settings.weeklyGoal });
    const planBonus = completePlanItem(this.profile, run, dayKey());
    this.save();
    if (report.levelUp) this.feedback.event({ name: 'levelup' });
    return { run, report, planBonus };
  }

  /** Next unfinished item of today's plan, or null. */
  nextPlanItem() { return this.dailyPlan().items.find(i => !i.done) ?? null; }

  go(name, params = {}) {
    this.screen?.cleanup?.();
    const screen = SCREENS[name](this, params);
    this.screen = { name, ...screen };
    mount(this.root, screen.node);
    this.root.scrollTop = 0; window.scrollTo(0, 0);
  }

  /** Tells a bidirectional lab what the on-screen pads ask for (only when it changes). */
  forwardIntent() {
    if (!this.bridge) return;
    const msg = JSON.stringify({ type: 'intent', ...this.emulator.target });
    if (msg !== this.lastIntentMsg) { this.lastIntentMsg = msg; this.bridge.send(JSON.parse(msg)); }
  }

  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.forwardIntent();
    try { this.screen?.tick?.(now, dt); } catch (e) { console.error(e); toast('Ошибка кадра: ' + e.message, 'bad'); this.screen.tick = null; }
    requestAnimationFrame(t => this.frame(t));
  }
}
