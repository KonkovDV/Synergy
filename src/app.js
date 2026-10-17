// Composition root: state, signal sources, routing, the frame loop and training sessions.
import { APP } from './config.js';
import { Store, memoryStorage } from './core/storage.js';
import { SignalPipeline } from './core/signal.js';
import { RestTracker, restAdaptationAllowed } from './core/calibration.js';
import { BionicHand } from './core/hand.js';
import { HAND } from './config.js';
import { recordRun, completePlanItem, buildDailyPlan, lightenPlan, dayKey, sessionRules, unlockAchievements, skillProfile } from './core/progress.js';
import { guidanceFor } from './core/guidance.js';
import { FpsGuard } from './core/fps.js';
import { CHECKIN_ACTION } from './core/wellbeing.js';
import { exportState, importState } from './core/storage.js';
import { buildShowcaseState } from './core/showcase.js';
import { EmgEmulator } from './input/emulator.js';
import { BridgeSource } from './input/bridge.js';
import { connectBle, bleSupported } from './input/ble.js';
import { bindKeyboard } from './ui/controls.js';
import { createGame, GAME_BY_ID, PLAN_CATALOG } from './games/registry.js';
import { GameRunner } from './games/runner.js';
import { createFeedback } from './services/feedback.js';
import { setSoundEnabled, unlockAudio } from './services/audio.js';
import { setVoiceEnabled, say } from './services/voice.js';
import { setRenderOptions } from './render/draw.js';
import { mount, toast, h } from './ui/dom.js';
import { SCREENS } from './ui/screens.js';

const PIN_SCREENS = ['settings', 'calibration', 'pin'];

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
    this.lastTime = performance.now();
    this.ble = null;
    this.fps = new FpsGuard(); // one per visit: a weak phone stays in simple graphics for every game
    this.applyPresentation();
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
    this.applyPresentation();
    if (patch.source !== undefined || patch.wsUrl !== undefined || before !== this.settings.source) this.applySource();
    this.save();
  }

  /** Sound, voice and the accessibility presentation (text size, contrast, motion). */
  applyPresentation() {
    const s = this.settings, root = document.documentElement;
    setSoundEnabled(s.sound);
    setVoiceEnabled(s.voice);
    root.style.setProperty('--text-scale', String(s.textScale));
    root.classList.toggle('hc', !!s.contrast);
    root.classList.toggle('rm', !!s.reduceMotion);
    setRenderOptions({ scale: s.textScale, highContrast: s.contrast });
  }

  /** Voice prompt (no-op when the voice setting is off). */
  say(text, options) { return say(text, options); }

  get rules() { return sessionRules(this.settings.audience); }

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
      this.ble?.disconnect(); this.ble = null;
      this.bridge?.stop();
      this.bridge = new BridgeSource({ url: this.settings.wsUrl, onStatus: s => this.screen?.onBridgeStatus?.(s) });
      this.bridge.start();
    } else if (this.bridge) {
      this.ble?.disconnect(); this.ble = null;
      this.bridge.stop(); this.bridge = null;
    }
  }

  /** Bluetooth EMG sensor (Nordic UART Service): its text lines go through the same parser. */
  async connectBle() {
    if (!bleSupported()) throw new Error('Bluetooth недоступен: нужен Chrome на Android или ПК (в APK — через pushFrame).');
    if (this.settings.source !== 'bridge') this.updateSettings({ source: 'bridge' });
    this.ble?.disconnect();
    this.ble = await connectBle({
      onLine: line => this.bridge?.feed(line),
      onStatus: st => { if (st === 'disconnected') this.bridge?.setStatus('waiting'); this.screen?.onBleStatus?.(st); },
    });
    return this.ble.name;
  }

  /** Showcase profile (pitch / demo to a specialist): synthetic data in memory, real data untouched. */
  enterShowcase() {
    if (this.showcase) return;
    this.realStore = this.store;
    this.store = new Store(memoryStorage());
    this.store.replace(buildShowcaseState({ ...this.settings, source: 'touch' }, dayKey()));
    this.showcase = true;
    this.applySource();
  }

  exitShowcase() {
    if (!this.showcase) return;
    this.store = this.realStore; this.realStore = null; this.showcase = false;
    this.applyPresentation(); this.applySource();
  }

  exportBackup() { return exportState(this.state); }

  /** Replaces all local data with a validated backup (throws a user-facing message). */
  importBackup(raw) {
    this.store.replace(importState(raw));
    this.applyPresentation();
    this.applySource();
  }

  /** Marks the tutorial done and unlocks its achievement; returns new achievement ids. */
  completeTutorial() {
    this.profile.tutorialDone = true;
    const fresh = unlockAchievements(this.profile, null, {}, dayKey());
    this.save();
    return fresh;
  }

  sourceKind() { return this.settings.source === 'bridge' ? 'bridge' : 'touch'; }
  signalSource(demo = false) { return demo || this.sourceKind() === 'touch' ? this.emulator : this.bridge; }
  calibration(kind = this.sourceKind()) { return this.state.calibrations[kind]; }

  createPipeline(demo = false, { adaptRest = false } = {}) {
    const s = this.settings;
    const calibration = demo ? this.state.calibrations.touch : this.calibration();
    const restTracker = adaptRest ? new RestTracker(calibration, { onThreshold: s.sensitivity }) : null;
    return new SignalPipeline({ scheme: s.scheme, calibration, params: { onThreshold: s.sensitivity, coThreshold: s.coThreshold }, restTracker });
  }

  createHand() { return new BionicHand({ grips: HAND.twoChannelGrips }); }

  /** Today's wellbeing check-in ({pain, fatigue, action} | {skipped} | undefined). */
  checkin() { return this.profile.days[dayKey()]?.checkin; }

  dailyPlan() {
    const plan = buildDailyPlan(this.profile, this.state.runs, PLAN_CATALOG, this.settings.scheme, dayKey(), { exercises: this.rules.planExercises });
    // A plan rebuilt today (e.g. after a scheme change) keeps today's «light session» answer.
    if (this.checkin()?.action === CHECKIN_ACTION.LIGHT && !plan.light) lightenPlan(plan);
    return plan;
  }

  /** Daily-plan flow: check-in once a day → next unfinished item (or home when resting today). */
  startPlan({ checked = false } = {}) {
    const item = this.nextPlanItem();
    if (!item) return this.go('home');
    const answer = this.checkin();
    if (!checked && !answer) return this.go('checkin');
    if (answer?.action === CHECKIN_ACTION.STOP) return this.go('home');
    this.go('play', { game: item.game, level: item.level, retention: item.retention, plan: true });
  }

  /** Today's runs (for fatigue signs and the soft daily cap). */
  runsToday() { const today = dayKey(); return this.state.runs.filter(r => !r.demo && dayKey(new Date(r.at)) === today); }

  /** Builds a runnable session for the play screen. */
  createSession({ game, level, retention = false, demo = false }) {
    const s = this.settings;
    const instance = createGame(game, { levelNumber: level, scheme: s.scheme, seed: (Date.now() % 9973) + level, retention, skin: this.profile.skin,
      mirror: s.side === 'left', adaptive: s.adaptive, speed: s.gameSpeed, reduceMotion: s.reduceMotion, guidance: demo ? 1 : this.guidance(game) });
    const hand = this.createHand();
    const adaptRest = restAdaptationAllowed({ source: this.sourceKind(), enabled: s.adaptRest, demo, gameAdaptive: instance.constructor.adaptive });
    const runner = new GameRunner({ game: instance, pipeline: this.createPipeline(demo, { adaptRest }), hand, source: this.signalSource(demo), emulator: this.emulator, autopilot: demo });
    return { id: game, level, retention, demo, game: instance, hand, runner, entry: GAME_BY_ID[game] };
  }

  /** Faded feedback: share of trials with live feedback from this game's recent skill (all trials when off). */
  guidance(game) {
    if (!this.settings.fadedFeedback) return 1;
    const profile = skillProfile(this.state.runs.filter(r => r.game === game));
    const skills = GAME_BY_ID[game].skills.map(k => profile[k]).filter(Number.isFinite);
    return guidanceFor(skills.length ? skills.reduce((a, b) => a + b, 0) / skills.length : NaN);
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
    const calibrationNote = this.adoptRest(session.runner.pipeline.restTracker);
    this.save();
    if (report.levelUp) this.feedback.event({ name: 'levelup' });
    return { run, report, planBonus, calibrationNote };
  }

  /** Co-adaptive calibration: keeps a bounded rest shift for the next session, or asks to recalibrate. */
  adoptRest(tracker) {
    if (!tracker) return null;
    const s = tracker.summary();
    if (s.keep) this.state.calibrations.bridge = { ...this.state.calibrations.bridge, ...s.calibration, adaptedAt: new Date().toISOString() };
    return s.recalibrate || s.keep ? { recalibrate: s.recalibrate, shiftPct: Math.round(100 * s.shift), stuckChannel: s.stuckChannel } : null;
  }

  /** Next unfinished item of today's plan, or null. */
  nextPlanItem() { return this.dailyPlan().items.find(i => !i.done) ?? null; }

  go(name, params = {}) {
    if (!PIN_SCREENS.includes(name)) this.pinOk = false; // leaving the settings locks them again
    this.screen?.cleanup?.();
    const screen = SCREENS[name](this, params);
    this.screen = { name, ...screen };
    mount(this.root, ...(this.showcase ? [this.showcaseBanner()] : []), screen.node);
    this.root.scrollTop = 0; window.scrollTo(0, 0);
    this.announce(screen.node);
  }

  /** Route change for assistive tech (SPA practice): the screen's heading takes focus and names the tab. */
  announce(node) {
    const heading = node.querySelector('h1, h2, [data-heading]');
    const title = heading?.textContent.trim();
    document.title = title && title !== APP.name ? `${title} · ${APP.name}` : APP.name;
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  showcaseBanner() {
    return h('div', { class: 'showcase-banner', role: 'status' }, 'Демо-профиль: синтетические данные',
      h('button', { class: 'btn ghost small', onclick: () => { this.exitShowcase(); this.go('home'); } }, 'Выйти'));
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
