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
import { CHECKIN_ACTION, needsCheckin } from './core/wellbeing.js';
import { exportState, importState } from './core/storage.js';
import { buildShowcaseState } from './core/showcase.js';
import { EmgEmulator } from './input/emulator.js';
import { BridgeSource } from './input/bridge.js';
import { connectBle, bleSupported } from './input/ble.js';
import { bindKeyboard, setPadMode } from './ui/controls.js';
import { createGame, GAME_BY_ID, PLAN_CATALOG } from './games/registry.js';
import { GameRunner } from './games/runner.js';
import { createFeedback } from './services/feedback.js';
import { setSoundEnabled, unlockAudio } from './services/audio.js';
import { setVoiceEnabled, say, stopVoice } from './services/voice.js';
import { setRenderOptions } from './render/draw.js';
import { mount, toast, h } from './ui/dom.js';
import { SCREENS } from './ui/screens.js';

const PIN_SCREENS = ['settings', 'calibration', 'pin'];
/** Game catalog for the stored-state check (core does not import games): id → number of levels. */
const CATALOG = Object.fromEntries(Object.entries(GAME_BY_ID).map(([id, g]) => [id, g.Game.levels.length]));

/** What a same-screen re-render keeps (5.10): scroll, open sections, the focused choice group or button. */
function captureView(root) {
  const el = document.activeElement;
  const group = el?.closest?.('[role="radiogroup"]')?.getAttribute('aria-label');
  const label = !group && el?.matches?.('button, [role="switch"], input') ? (el.getAttribute('aria-label') || el.textContent || '').trim() : null;
  return { y: window.scrollY, open: [...root.querySelectorAll('details')].map(d => d.open), group, label, tag: el?.tagName };
}

function restoreView(root, view) {
  const details = [...root.querySelectorAll('details')];
  if (details.length === view.open.length) details.forEach((d, i) => { d.open = view.open[i]; });
  window.scrollTo(0, view.y);
  const esc = s => (globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
  const target = view.group ? root.querySelector(`[role="radiogroup"][aria-label="${esc(view.group)}"] [aria-checked="true"]`)
    : view.label ? [...root.querySelectorAll(view.tag === 'INPUT' ? 'input' : 'button, [role="switch"]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === view.label) : null;
  target?.focus({ preventScroll: true });
  return !!target;
}

function safeStorage() {
  try { const k = '__synergy_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return memoryStorage(); }
}

/**
 * Keyboard focus never hides under the floating bottom bar, the sticky actions or a sticky top bar (WCAG 2.2, 2.4.11): a browser
 * does not scroll an element that is already partly on screen, even with scroll-padding. Pointer focus is left alone.
 */
function keepFocusVisible(el) {
  if (!(el instanceof Element) || !el.matches(':focus-visible') || el.closest('.bottom-nav, .sticky-actions, .top-bar, .play-top')) return;
  const bars = [...document.querySelectorAll('.bottom-nav, .sticky-actions')]
    .filter(b => /fixed|sticky/.test(getComputedStyle(b).position)).map(b => b.getBoundingClientRect().top).filter(top => top > 0);
  const limit = Math.min(innerHeight, ...bars);
  const top = Math.max(0, ...[...document.querySelectorAll('.top-bar, .showcase-banner')].map(t => t.getBoundingClientRect().bottom));
  const r = el.getBoundingClientRect();
  if (r.top + Math.min(r.height, 40) <= limit - 8 && r.top >= top) return;
  // Fits between the bars → centre it; taller (a long table) → its top goes right under the top bar.
  const shift = r.height < limit - top - 16 ? r.top - (top + limit - r.height) / 2 : r.top - top - 8;
  window.scrollBy(0, shift);
}

export class App {
  constructor(root) {
    this.root = root;
    this.store = new Store(safeStorage(), { catalog: CATALOG });
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
    document.addEventListener('focusin', e => keepFocusVisible(e.target));
    for (const q of ['(prefers-contrast: more)', '(forced-colors: active)']) globalThis.matchMedia?.(q).addEventListener?.('change', () => this.applyPresentation());
    // Back in a browser or an installed PWA: one history entry stands for «inside the app», so the back gesture
    // comes here instead of closing the app (an SPA without history entries is left by the first back).
    window.addEventListener('popstate', () => {
      if (this.ignorePop) { this.ignorePop = false; return; }
      this.handleBack();
      // go() inside handleBack may have pushed the entry already: never two (5.10 — one back on home did nothing).
      if (this.screen?.name !== 'home' && !history.state?.synergy) history.pushState({ synergy: 1 }, '');
    });
    // Another window of the app saved (a second tab, the PWA and a browser tab): take its state instead of writing
    // ours over it later (5.10 — a finished exercise vanished when the other tab toggled a setting).
    window.addEventListener('storage', e => {
      if (e.key !== APP.storageKey || this.showcase) return;
      this.store.state = this.store.load();
      this.refreshFromState();
      if (['home', 'progress'].includes(this.screen?.name)) this.go(this.screen.name);
    });
    // Settings are saved shortly after the last change (a slider fires dozens of inputs), and at once when hidden.
    const flush = () => { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.save(); } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea, select')) { e.preventDefault(); this.handleBack(); } });
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
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 300);
  }

  /** After the whole state changed (import, reset, undo, demo profile): presentation, emulator and source follow it. */
  refreshFromState() {
    this.emulator.realism = this.settings.realism;
    this.applyPresentation();
    this.applySource();
  }

  /** Deletes the progress (one copy stays for undo). Until 5.10 the signal source was not re-applied: a reset on the
   *  external source left the bridge running under a «touch» setting. */
  resetProgress() { this.store.reset(); this.refreshFromState(); }

  /** Brings back the data from before the last reset; throws a user-facing message when the copy is unreadable. */
  undoReset() {
    try { this.store.undoReset(); } catch { throw new Error('Копия до сброса повреждена — вернуть её нельзя'); }
    this.refreshFromState(); // the old source may be «bridge»: without this the game loop threw on a null bridge
  }

  /** Sound, voice and the accessibility presentation (text size, contrast, motion). */
  applyPresentation() {
    const s = this.settings, root = document.documentElement;
    setSoundEnabled(s.sound);
    setVoiceEnabled(s.voice);
    root.style.setProperty('--text-scale', String(s.textScale));
    // The system's «increase contrast» / Windows high contrast turns our contrast mode on by itself (5.9).
    this.systemContrast = typeof matchMedia === 'function' && (matchMedia('(prefers-contrast: more)').matches || matchMedia('(forced-colors: active)').matches);
    const contrast = !!s.contrast || this.systemContrast;
    root.classList.toggle('hc', contrast);
    root.classList.toggle('rm', !!s.reduceMotion);
    setRenderOptions({ scale: s.textScale, highContrast: contrast });
    setPadMode({ sticky: s.stickyPads });
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
      back: () => this.handleBack(),
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
    this.ble = null; // a failed connect must not leave the old, disconnected device in place
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
    this.store = new Store(memoryStorage(), { catalog: CATALOG });
    this.store.replace(buildShowcaseState({ ...this.settings, source: 'touch' }, dayKey(), PLAN_CATALOG));
    this.showcase = true;
    this.refreshFromState();
  }

  exitShowcase() {
    if (!this.showcase) return;
    this.store = this.realStore; this.realStore = null; this.showcase = false;
    this.refreshFromState();
  }

  exportBackup() { return exportState(this.state); }

  /** Replaces all local data with a validated backup (throws a user-facing message). */
  importBackup(raw) {
    this.store.replace(importState(raw, CATALOG));
    this.refreshFromState();
  }

  /** Marks the tutorial done (its card leaves home); the achievement needs every step done, not skipped. */
  completeTutorial(passed = false) {
    this.profile.tutorialDone = true;
    if (passed) this.profile.tutorialPassed = true;
    const fresh = unlockAchievements(this.profile, null, {}, dayKey());
    this.save();
    return fresh;
  }

  sourceKind() { return this.settings.source === 'bridge' ? 'bridge' : 'touch'; }
  /** The emulator, or the external source; never null (5.10: a missing bridge made every frame throw). */
  signalSource(demo = false) {
    if (demo || this.sourceKind() === 'touch') return this.emulator;
    if (!this.bridge) this.applySource();
    return this.bridge;
  }
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
    if (!checked && needsCheckin(this.profile, dayKey())) return this.go('checkin');
    if (answer?.action === CHECKIN_ACTION.STOP) return this.go('home');
    this.go('play', { game: item.game, level: item.level, retention: item.retention, plan: true });
  }

  /** Today's runs (for fatigue signs and the soft daily cap). */
  runsToday() { const today = dayKey(); return this.state.runs.filter(r => !r.demo && dayKey(new Date(r.at)) === today); }

  /** Builds a runnable session for the play screen. */
  createSession({ game, level, retention = false, demo = false, plan = false }) {
    const s = this.settings;
    const instance = createGame(game, { levelNumber: level, scheme: s.scheme, seed: (Date.now() % 9973) + level, retention, skin: this.profile.skin,
      mirror: s.side === 'left', adaptive: s.adaptive, speed: s.gameSpeed, reduceMotion: s.reduceMotion, guidance: demo ? 1 : this.guidance(game), onThreshold: s.sensitivity });
    const hand = this.createHand();
    const adaptRest = restAdaptationAllowed({ source: this.sourceKind(), enabled: s.adaptRest, demo, gameAdaptive: instance.constructor.adaptive });
    const runner = new GameRunner({ game: instance, pipeline: this.createPipeline(demo, { adaptRest }), hand, source: this.signalSource(demo), emulator: this.emulator, autopilot: demo });
    return { id: game, level, retention, demo, plan, game: instance, hand, runner, entry: GAME_BY_ID[game] };
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
      retention: session.retention, demo: session.demo, plan: !!session.plan, ...r,
    };
    if (session.demo) return { run, report: null, planBonus: 0 };
    this.state.runs.push(run);
    const report = recordRun(this.profile, run, { today: dayKey(), weeklyGoal: this.settings.weeklyGoal });
    // Only exercises started from the plan complete it (5.10: a free-play «без подсказки» ticked the plan's probe
    // before any training and without the day's check-in).
    const planBonus = session.plan ? completePlanItem(this.profile, run, dayKey()) : 0;
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
    if (!SCREENS[name]) name = 'home';
    if (!PIN_SCREENS.includes(name)) this.pinOk = false; // leaving the settings locks them again
    // The same screen redrawn (a setting changed) keeps scroll, open sections and focus (5.10: an arrow key in
    // «Схема управления» changed the scheme and sent focus to the heading, an opened section closed).
    const view = this.screen?.name === name ? captureView(this.root) : null;
    this.screen?.cleanup?.();
    stopVoice(); // the previous screen's long phrase must not run over the next one
    // A pad latched on the previous screen (pads without holding) must not keep «contracting» on the next one.
    this.emulator.setTarget({ a: 0, b: 0, gesture: this.settings.scheme === 'gesture' ? 'rest' : null });
    let screen;
    try { screen = SCREENS[name](this, params); } catch (e) {
      // A screen that cannot be built (bad parameters, damaged data) must not leave a torn-down page (5.10).
      console.error(e);
      if (name !== 'home') { toast('Экран не открылся — вернулись на главную', 'bad'); return this.go('home'); }
      screen = SCREENS.recovery(this, { error: e });
      name = 'recovery';
    }
    this.screen = { name, ...screen };
    mount(this.root, ...(this.showcase ? [this.showcaseBanner()] : []), screen.node);
    if (!(view && restoreView(this.root, view))) {
      if (!view) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
      this.announce(screen.node, { focus: !view });
    }
    this.syncHistory(name);
  }

  /** One history entry while away from home; going home removes it (its popstate is ignored). */
  syncHistory(name) {
    if (typeof history === 'undefined') return;
    const inside = !!history.state?.synergy;
    if (name !== 'home' && !inside) history.pushState({ synergy: 1 }, '');
    else if (name === 'home' && inside) { this.ignorePop = true; history.back(); }
  }

  /**
   * Back — the Android button, the browser/PWA back gesture, Esc: the screen's own back (a running game pauses),
   * else its top-bar arrow, else home. Returns false at home (the host may close the app).
   */
  handleBack() {
    const own = this.screen?.onBack?.();
    if (own === 'exit') return false; // the screen lets the host close the app (first onboarding page)
    if (own) return true;
    const arrow = this.root.querySelector('.top-bar .back-btn');
    if (arrow) { arrow.click(); return true; }
    if (this.screen?.name === 'home') return false;
    this.go('home');
    return true;
  }

  /** Route change for assistive tech (SPA practice): the screen's heading takes focus and names the tab. */
  announce(node, { focus = true } = {}) {
    const heading = node.querySelector('h1, h2, [data-heading]');
    const title = heading?.textContent.trim();
    document.title = title && title !== APP.name ? `${title} · ${APP.name}` : APP.name;
    if (!heading || !focus) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  showcaseBanner() {
    return h('div', { class: 'showcase-banner', role: 'status' }, h('span', {}, 'Демо-профиль', h('small', {}, ': синтетические данные')),
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
