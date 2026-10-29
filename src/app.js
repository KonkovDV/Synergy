// Composition root: state, signal sources, routing, the frame loop and training sessions.
import { APP, ARM_POSES, ADAPT } from './config.js';
import { Store, memoryStorage } from './core/storage.js';
import { SignalPipeline, thresholdShares } from './core/signal.js';
import { RestTracker, restAdaptationAllowed } from './core/calibration.js';
import { SignalQualityMonitor, runSignalIssues } from './core/signalquality.js';
import { BionicHand } from './core/hand.js';
import { HAND } from './config.js';
import { GESTURE_SET } from './core/vocabulary.js';
import { controlHand } from './core/hands.js';
import { recordRun, completePlanItem, buildDailyPlan, lightenPlan, dayKey, sessionRules, unlockAchievements, skillProfile, assessmentStatus, weekIndex, trainingDays, recordDayNote } from './core/progress.js';
import { missionOffers } from './core/missions.js';
import { guidanceFor } from './core/guidance.js';
import { FpsGuard } from './core/fps.js';
import { CHECKIN_ACTION, needsCheckin, safetyOutdated, checkinLight, electrodesOff, painStopDuring, PAIN_STOP_TEXT } from './core/wellbeing.js';
import { exportState, importState } from './core/storage.js';
import { buildShowcaseState } from './core/showcase.js';
import { EmgEmulator } from './input/emulator.js';
import { OnScreenEmulator } from './input/spppr-source.js';
import { BridgeSource, trustedMessageSource } from './input/bridge.js';
import { connectBle, bleSupported } from './input/ble.js';
import { bindKeyboard, setPadMode } from './ui/controls.js';
import { createGame, GAME_BY_ID, GAMES, PLAN_CATALOG, sessionScheme } from './games/registry.js';
import { assessmentTrials, formSeed } from './games/assess.js';
import { GameRunner, DuoRunner } from './games/runner.js';
import { createFeedback } from './services/feedback.js';
import { setSoundEnabled, unlockAudio } from './services/audio.js';
import { setVoiceEnabled, say, stopVoice } from './services/voice.js';
import { setRenderOptions } from './render/draw.js';
import { mount, toast, h } from './ui/dom.js';
import { parseLaunch, parseHostCommand, readyMessage, resultMessage, closeMessage, notifyHost, isEmbedded, hostChannel, HOST_PROTOCOL } from './services/host.js';
import { SCREENS } from './ui/screens.js';
import { startTour } from './ui/tour.js';
import { mergeTours } from './core/tours.js';

const TAP_GUARD_MS = 350;
const PIN_SCREENS = ['settings', 'calibration', 'pin', 'audiosync', 'tutorial']; // sub-screens of the settings keep them open
// 5.14 (the sample's parentLock): the PIN-opened settings lock again after two minutes in the background — a phone left
// on the settings is not left open for a child.
const PIN_RELOCK_MS = 120000;
/** Browser bar colour of each theme (the page background at the top). */
const THEME_COLOR = { light: '#f3f5f7', dark: '#071019' };
/** Game catalog for the stored-state check (core does not import games): id → number of levels. */
const CATALOG = Object.fromEntries(Object.entries(GAME_BY_ID).map(([id, g]) => [id, g.Game.levels.length]));
/** A game id → its number of levels, for the launch parameters and the host's commands (services/host.js). */
const gameInfo = id => (GAME_BY_ID[id] ? { levels: GAME_BY_ID[id].Game.levels.length } : null);

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
  if (!(el instanceof Element) || !el.matches(':focus-visible') || el.closest('.bottom-nav, .sticky-actions, .top-bar, .play-top, .tour')) return;
  // A hint card (5.13) floats over the page like the bars: what gets focus moves above it, not under it.
  const bars = [...document.querySelectorAll('.bottom-nav, .sticky-actions, .tour')]
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
    // 6.0: the pads, the keys and the autopilot drive this one; in the gesture scheme of the task's set it speaks the
    // СПППР stream (JSON packets with the MCU's time through the decoder), otherwise the EMG envelopes as before.
    this.emulator = new OnScreenEmulator({ realism: this.settings.realism, seed: Date.now() % 100000 });
    // 5.30: the second arm of «Две руки» on the on-screen emulator (the left hand is `emulator`, the right one this).
    this.emulator2 = new EmgEmulator({ realism: this.settings.realism, seed: (Date.now() + 7919) % 100000 });
    this.bridge = null;
    this.feedback = createFeedback(() => this.settings);
    this.screen = null;
    this.lastTime = performance.now();
    this.ble = null;
    this.fps = new FpsGuard(); // one per visit: a weak phone stays in simple graphics for every game
    this.petTaps = -1;         // touches of the Firebird this visit: its answers go in turn (core/pet.js petTap)
    this.tour = null;          // the hint tour on screen (ui/tour.js), or null
    this.applyPresentation();
    bindKeyboard(this.emulator, () => this.settings.scheme, () => (this.screen?.duo ? { left: this.emulator, right: this.emulator2 } : null)); // 5.30
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.hiddenAt = Date.now(); this.hiddenDay = dayKey(); this.screen?.onHidden?.(); return; }
      const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
      if (this.pinOk && away > PIN_RELOCK_MS) { this.pinOk = false; if (PIN_SCREENS.includes(this.screen?.name)) { this.go('settings'); return; } }
      // Midnight passed while the app was hidden (5.14): the day's screens show the new day — plan, the bird's words.
      if (this.hiddenDay && this.hiddenDay !== dayKey()) this.applySource({ force: false });
      if (this.hiddenDay && this.hiddenDay !== dayKey() && ['home', 'nest', 'progress'].includes(this.screen?.name)) this.go(this.screen.name);
    });
    document.addEventListener('focusin', e => keepFocusVisible(e.target));
    // A double tap must not land on the next screen (5.11): the second tap after «Отдых 20 с → Ритм» hit «Пропустить
    // отдых», after «Начать» it chose a pain level. Touch only — a mouse or keyboard click is deliberate.
    root.addEventListener('pointerdown', e => { this.lastPointer = e.pointerType; }, true);
    root.addEventListener('keydown', () => { this.lastPointer = 'keyboard'; }, true);
    root.addEventListener('click', e => {
      if (this.lastPointer === 'touch' && performance.now() - (this.mountedAt ?? 0) < TAP_GUARD_MS) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    for (const q of ['(prefers-contrast: more)', '(forced-colors: active)', '(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)']) globalThis.matchMedia?.(q).addEventListener?.('change', () => this.applyPresentation());
    // Back in a browser or an installed PWA: one history entry stands for «inside the app», so the back gesture
    // comes here instead of closing the app (an SPA without history entries is left by the first back).
    window.addEventListener('popstate', () => {
      if (this.ignorePop) { this.ignorePop = false; return; }
      const handled = this.handleBack();
      // go() inside handleBack may have pushed the entry already: never two (5.10 — one back on home did nothing).
      // Not handled (home, the first onboarding page): no new entry, so the next back leaves the app (5.11 — the
      // browser back never left the first onboarding page).
      if (handled && this.screen?.name !== 'home' && !history.state?.synergy) history.pushState({ synergy: 1 }, '');
    });
    // Another window of the app saved (a second tab, the PWA and a browser tab): take its state instead of writing
    // ours over it later (5.10 — a finished exercise vanished when the other tab toggled a setting).
    window.addEventListener('storage', e => {
      if (e.key !== APP.storageKey || this.showcase) return;
      this.store.state = this.store.load();
      this.refreshFromState();
      if (['home', 'nest', 'progress'].includes(this.screen?.name)) this.go(this.screen.name);
    });
    // Settings are saved shortly after the last change (a slider fires dozens of inputs), and at once when hidden.
    const flush = () => { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.save(); } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea, select')) { e.preventDefault(); this.handleBack(); } });
    // The app sets the scroll of every screen itself (go, restoreView); the browser's own restoration on history.back()
    // scrolled a freshly shown hint back to the top (5.13).
    if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
    // 5.14 — embedding (services/host.js): a host may name a game to open and its own origin for result messages.
    this.launch = parseLaunch(typeof location !== 'undefined' ? location.search : '', gameInfo);
    // 5.15 — the exercise a host asked for waits for the safety onboarding (and «Первые шаги», if taken) and opens on
    // the way home; before, it was lost when the onboarding came first.
    this.pendingLaunch = this.launch.game ? { game: this.launch.game, level: this.launch.level } : null;
    this.launchEmbedded = isEmbedded(this.launch);
    // Started by a host: the host gives the signal, so a stored «Внешний» source does not dial its WebSocket address
    // until the person types one (hostSource). Before the first host frame the game simply waits for frames.
    this.hostFed = this.launchEmbedded;
    // 5.15 — a host in another origin cannot call window.Synergy: it posts commands (start, ping, signal frames).
    window.addEventListener('message', e => this.onHostCommand(e));
    this.exposeApi();
    this.applySource();
    requestAnimationFrame(t => this.frame(t));
  }

  /**
   * Inside the customer's app: started by a host, or a native channel is there now — a plugin may inject it after the
   * page started (gree/unity-webview on iOS). Tests may set it.
   */
  get embedded() { return this.forceEmbedded ?? (this.launchEmbedded || !!hostChannel()); }
  set embedded(v) { this.forceEmbedded = v; }

  get state() { return this.store.state; }
  get settings() { return this.state.settings; }
  get profile() { return this.state.profile; }
  save() {
    const ok = this.store.save();
    // Once per failure, not on every save: the data lives only on this device, a copy is the way out.
    if (!ok && !this.saveWarned && !this.showcase) toast('Не удалось сохранить: память браузера заполнена или недоступна. Сохраните копию: Настройки → Данные.', 'bad');
    this.saveWarned = !ok;
    return ok;
  }

  updateSettings(patch) {
    const before = this.settings.source;
    if (patch.wsUrl !== undefined || patch.source === 'touch') this.hostFed = false; // the person chose the source
    Object.assign(this.settings, patch);
    this.emulator.realism = this.settings.realism; this.emulator2.realism = this.settings.realism;
    this.applyPresentation();
    if (patch.source !== undefined || patch.wsUrl !== undefined || before !== this.settings.source) this.applySource();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 300);
  }

  /**
   * After the whole state changed (import, reset, undo, demo profile, another window's save): presentation, emulator
   * and source follow it. The source restarts only when it really changed (5.11 — another window ticking «Меньше
   * движения» rebuilt the bridge, and a running exercise froze on «Нет сигнала»).
   */
  refreshFromState() {
    this.emulator.realism = this.settings.realism;
    this.applyPresentation();
    this.applySource({ force: false });
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
    // The system's «reduce motion» counts too (5.11): only the app's own switch did, and the canvas kept moving.
    this.reduceMotion = !!s.reduceMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    root.classList.toggle('rm', this.reduceMotion);
    // Theme (5.12): light by default, dark by the system setting or by choice; high contrast above both.
    // The APK's WebView (target API 29) always reports a light scheme: the native bridge tells the system's night mode.
    const systemDark = (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) || !!globalThis.SynergyNative?.nightMode?.();
    const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : systemDark ? 'dark' : 'light';
    root.dataset.theme = theme;
    root.dataset.hand = controlHand(s); // 5.30: the on-screen controls under the tapping hand (core/hands.js)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', contrast ? '#000000' : THEME_COLOR[theme]);
    // Canvas text follows the system font size as well (Android WebView scales the root font), up to the tuned +25 %.
    const rootPx = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(root).fontSize) || 16 : 16;
    setRenderOptions({ scale: Math.max(s.textScale, rootPx / 16), highContrast: contrast, theme: contrast ? 'dark' : theme });
    setPadMode({ sticky: s.stickyPads });
  }

  /** Voice prompt (no-op when the voice setting is off). */
  say(text, options) { return say(text, options); }

  get rules() { return sessionRules(this.settings.audience); }

  /** Window API for a native host / organizers' emulator / automated tests (docs/INTEGRATION.md). */
  exposeApi() {
    window.Synergy = {
      version: APP.version,
      feed: frame => {
        if (this.sensorsPaused()) return false;
        this.hostSource();
        return this.bridge ? this.bridge.feed(frame) : false;
      },
      useBridge: (url = '') => this.updateSettings({ source: 'bridge', wsUrl: url }),
      useTouch: () => this.updateSettings({ source: 'touch' }),
      state: () => JSON.parse(JSON.stringify({ settings: this.settings, profile: this.profile, runs: this.state.runs.length, screen: this.screen?.name, bridge: this.bridge?.status ?? null })),
      /** Tests: plant up to 30 training days, then show home. A host does not need this. */
      rememberDays: (list) => {
        if (!Array.isArray(list)) return false;
        for (const item of list.slice(0, 30)) {
          if (!item || typeof item.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.day)) continue;
          const seconds = Number.isFinite(item.seconds) ? Math.min(3600, Math.max(0, item.seconds)) : 0;
          const runs = Number.isInteger(item.runs) ? Math.min(20, Math.max(0, item.runs)) : 1;
          this.profile.days[item.day] = { ...(this.profile.days[item.day] ?? {}), seconds, runs };
        }
        clearTimeout(this.saveTimer); this.saveTimer = null; this.save();
        this.go('home');
        return true;
      },
      go: (name, params) => this.go(name, params),
      /** 5.14 — a host opens a given exercise (unknown ids and levels are ignored; the safety onboarding comes first). */
      start: (game, level = 1) => {
        const l = parseLaunch(`?game=${encodeURIComponent(game)}&level=${encodeURIComponent(level)}`, gameInfo);
        if (!l.game) return false;
        // Not onboarded yet, or the safety rules changed: those pages first, then this exercise (5.15 — it was dropped).
        if (!this.profile.onboarded || safetyOutdated(this.profile)) { this.pendingLaunch = { game: l.game, level: l.level }; this.go(this.profile.onboarded ? 'home' : 'onboarding'); return false; }
        this.go('play', { game: l.game, level: l.level });
        return true;
      },
      protocol: HOST_PROTOCOL,
      /** Android back button: returns false when already home (the host may close the app). */
      back: () => this.handleBack(),
    };
  }

  applySource({ force = true } = {}) {
    if (this.sensorsPaused()) {
      this.ble?.disconnect(); this.ble = null;
      this.bridge?.stop(); this.bridge = null;
      this.appliedSource = 'skin-off';
      return;
    }
    const url = this.hostFed ? '' : this.settings.wsUrl;
    const key = `${this.settings.source}|${url}`;
    if (!force && key === this.appliedSource) return;
    this.appliedSource = key;
    if (this.settings.source === 'bridge') {
      this.ble?.disconnect(); this.ble = null;
      this.bridge?.stop();
      this.bridge = new BridgeSource({ url, onStatus: s => this.screen?.onBridgeStatus?.(s), swap: () => this.settings.swapChannels, hostOrigin: this.launch?.hostOrigin ?? null,
        thresholds: this.bridge?.rawThresholds ?? null, onThresholds: () => this.screen?.onThresholds?.(),
        lead: () => ({ side: this.settings.side, two: this.settings.prostheses === 'two' }) }); // 5.30: two prostheses
      this.bridge.start();
    } else if (this.bridge) {
      this.ble?.disconnect(); this.ble = null;
      this.bridge.stop(); this.bridge = null;
    }
  }

  /**
   * A command from the host (5.15): only from the embedding frame, the page itself or a native WebMessage
   * (trustedMessageSource, RT-7). A signal frame switches to the external source like `Synergy.feed` does — before,
   * frames posted by an iframe host were dropped until the person chose «Внешний» in the settings; once the source is
   * external, BridgeSource hears the frames itself (no frame is fed twice).
   */
  onHostCommand(e) {
    if (!trustedMessageSource(e, window, this.launch?.hostOrigin ?? null)) return;
    const cmd = parseHostCommand(e.data, gameInfo);
    if (!cmd) return;
    if (cmd.kind === 'ping') { this.notifyReady(); return; }
    if (cmd.kind === 'start') { window.Synergy.start(cmd.game, cmd.level); return; }
    if (this.hostSource()) this.bridge?.feed(cmd.frame);
  }

  /**
   * The host gives the signal itself (Synergy.feed, posted frames): the external source without a WebSocket (5.15 — it
   * kept dialling the stored ws:// address, by default 127.0.0.1:8765, while the frames came from the host). Returns
   * true when the source was (re)started now — then BridgeSource did not hear the frame that caused it.
   */
  hostSource() {
    if (this.sensorsPaused()) return false;
    if (this.settings.source === 'bridge' && this.hostFed) return false;
    this.hostFed = true;
    if (this.settings.source !== 'bridge') this.updateSettings({ source: 'bridge' });
    else this.applySource();
    return true;
  }

  /** «Ready» for the host (5.15, the handshake of the sample's scene bridge): after the first screen, and on a ping. */
  notifyReady() {
    const games = GAMES.map(g => ({ id: g.id, title: g.title, levels: g.Game.levels.length }));
    notifyHost(readyMessage({ version: APP.version, onboarded: this.profile.onboarded, games }), { hostOrigin: this.launch?.hostOrigin ?? null });
  }

  /** Hands control back to the host (5.15): «Вернуться в приложение» after an exercise, or back on the home screen. */
  closeToHost(reason) {
    if (!this.embedded) return false;
    notifyHost(closeMessage(reason, APP.version), { hostOrigin: this.launch?.hostOrigin ?? null });
    return true;
  }

  /** Bluetooth EMG sensor (Nordic UART Service): its text lines go through the same parser. */
  async connectBle() {
    if (this.sensorsPaused()) throw new Error('Сегодня датчики выключены: кожа под ними раздражена. Подключите завтра или измените ответ опроса.');
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
    // The person's settings come along (text size, theme, contrast, scheme, hints read). Taken before the store is
    // swapped (5.13: `this.settings` was read from the new, empty store — the demo dropped them all to defaults).
    const settings = { ...this.settings, source: 'touch', tours: { ...this.settings.tours } };
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.save(); } // a change of the last 300 ms is kept
    this.realStore = this.store;
    this.store = new Store(memoryStorage(), { catalog: CATALOG });
    this.store.replace(buildShowcaseState(settings, dayKey(), PLAN_CATALOG, { checkTrials: assessmentTrials(settings.scheme, settings.sensitivity).length }));
    this.showcase = true;
    this.refreshFromState();
  }

  exitShowcase() {
    if (!this.showcase) return;
    const seen = this.settings.tours; // hints read in the demo are not shown again (5.13: the sample's idempotent merge)
    this.store = this.realStore; this.realStore = null; this.showcase = false;
    // Another window may have saved meanwhile (its storage events are ignored in the demo): read, don't overwrite (5.11).
    this.store.state = this.store.load();
    this.settings.tours = mergeTours(this.settings.tours, seen);
    this.save();
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

  /**
   * Irritated skin under the electrodes: no sensor signal today. The saved source is left as it is. 5.27: also when
   * severe pain closed the day — the skin answer of that day used to be lost and the sensors stayed on for free play.
   */
  sensorsPaused() { return electrodesOff(this.checkin()); }

  /**
   * «Стало больно» in the pause (5.27, medical review): today closes like a severe-pain answer — no plan, the series is
   * kept — and the unfinished exercise is not saved. The morning answers stay, marked as pain during the session.
   * Changing the answer on the check-in screen opens the day again (a mis-tap is not a lost day).
   */
  stopForPain() {
    const today = dayKey();
    recordDayNote(this.profile, today, { checkin: painStopDuring(this.checkin()) });
    this.save();
    this.say(PAIN_STOP_TEXT, { interrupt: true });
    this.go('home');
  }

  sourceKind() { return this.settings.source === 'bridge' ? 'bridge' : 'touch'; }

  /** The emulator when the skin must rest; otherwise the chosen source. */
  liveSource() { return this.sensorsPaused() ? 'touch' : this.sourceKind(); }

  /** The emulator, or the external source; never null (5.10: a missing bridge made every frame throw). */
  signalSource(demo = false) {
    if (demo || this.liveSource() === 'touch') return this.emulator;
    if (!this.bridge) this.applySource();
    return this.bridge;
  }
  /**
   * What an exercise reads. The external source is read through `this.bridge` every frame (5.30): a host's first frame
   * rebuilds the source (hostSource → applySource), and an exercise that kept the old one stayed «без сигнала» to its end.
   */
  liveFrames(demo = false) {
    const source = this.signalSource(demo);
    return source === this.emulator ? source : { sample: now => this.bridge?.sample(now) ?? null };
  }
  /** 5.30: with two prostheses each external side has its own calibration (`bridge-left`, `bridge-right`). */
  calibrationKey(kind = this.sourceKind()) { return kind === 'bridge' && this.settings.prostheses === 'two' ? `bridge-${this.settings.side}` : kind; }
  calibration(kind = this.sourceKind()) { return this.state.calibrations[this.calibrationKey(kind)]; }

  /**
   * The prosthesis's switch-on thresholds [A, B] in frame units (5.29): only when the host passed them, the live source
   * is the external one and «Пороги как у протеза» is on. Else null — the game's own close and open thresholds.
   */
  prosthesisThresholds(demo = false) {
    if (demo || !this.settings.prosthesisThresholds || this.liveSource() !== 'bridge') return null;
    return this.bridge?.thresholds ?? null;
  }

  /**
   * Where the channels switch on, as shares of the calibrated span: the prosthesis's two thresholds when they are used,
   * else the game's own pair (close, open). Games place their force bands above the higher one, so every band stays reachable.
   */
  switchOn(demo = false) {
    const s = this.settings;
    const game = [s.sensitivity, s.sensitivityB ?? s.sensitivity];
    return thresholdShares(this.prosthesisThresholds(demo), this.calibration(), game);
  }

  createPipeline(demo = false, { adaptRest = false } = {}) {
    const s = this.settings;
    const calibration = demo || this.sensorsPaused() ? this.state.calibrations.touch : this.calibration();
    const restTracker = adaptRest ? new RestTracker(calibration, { onThreshold: Math.max(...this.switchOn(demo)) }) : null;
    return new SignalPipeline({ scheme: s.scheme, calibration, params: { ...this.signalParams(), bothOn: s.bothOn, prosthesisThresholds: this.prosthesisThresholds(demo) }, restTracker });
  }

  /** The person's signal parameters (Настройки → Чувствительность): thresholds and, since 6.0, the parameters of the task. */
  signalParams() {
    const s = this.settings;
    return { onThreshold: s.sensitivity, onThresholdB: s.sensitivityB, coThreshold: s.coThreshold,
      holdMs: s.holdMs, refractoryMs: s.refractoryMs, hysteresis: s.hysteresis, smoothingMs: s.smoothingMs, slewPerS: s.slewPerS, deadZone: s.deadZone };
  }

  /** The grip switches the way the person's prosthesis does it (Настройки → «Смена хвата»). */
  createHand() { return new BionicHand({ grips: HAND.twoChannelGrips, switchMode: this.settings.gripSwitch, holdOpenS: this.settings.holdOpenS }); }

  /** Today's wellbeing check-in ({pain, fatigue, action} | {skipped} | undefined). */
  checkin() { return this.profile.days[dayKey()]?.checkin; }

  dailyPlan() {
    const plan = buildDailyPlan(this.profile, this.state.runs, PLAN_CATALOG, this.settings.scheme, dayKey(), { exercises: this.rules.planExercises });
    // A plan rebuilt today (e.g. after a scheme change) keeps today's «light session» answer.
    if (checkinLight(this.checkin()) && !plan.light) lightenPlan(plan);
    return plan;
  }

  /** Daily-plan flow: check-in once a day → next unfinished item (or home when resting today). */
  startPlan({ checked = false } = {}) {
    const item = this.nextPlanItem();
    if (!item) return this.go('home');
    const answer = this.checkin();
    if (!checked && needsCheckin(this.profile, dayKey())) return this.go('checkin');
    if (answer?.action === CHECKIN_ACTION.STOP && answer?.reason !== 'skin') return this.go('home');
    this.go('play', { game: item.game, level: item.level, retention: item.retention, plan: true, pose: item.pose });
  }

  /** Today's runs (for fatigue signs and the soft daily cap). */
  runsToday() { const today = dayKey(); return this.state.runs.filter(r => !r.demo && dayKey(new Date(r.at)) === today); }

  /** Builds a runnable session for the play screen. */
  createSession({ game, level, retention = false, demo = false, plan = false, pose = null, quick = false }) {
    const s = this.settings;
    const scheme = sessionScheme(GAME_BY_ID[game], s.scheme); // 5.30: «Две руки» has two-channel schemes only
    const week = weekIndex(dayKey());
    const instance = createGame(game, { levelNumber: level, scheme, seed: (Date.now() % 9973) + level, retention, skin: this.profile.skin,
      mirror: s.side === 'left', cueMirror: !!s.mirrorHint, adaptive: s.adaptive, speed: s.gameSpeed, reduceMotion: this.reduceMotion, guidance: demo ? 1 : this.guidance(game), onThreshold: Math.max(...this.switchOn(demo)),
      successTarget: trainingDays(this.profile) < ADAPT.firstWeekDays ? ADAPT.firstWeekTarget : null,
      formSeed: game === 'check' && !demo ? formSeed(week) : undefined });
    const hand = this.createHand();
    const live = this.liveSource();
    const adaptRest = restAdaptationAllowed({ source: live, enabled: s.adaptRest, demo, gameAdaptive: instance.constructor.adaptive });
    const runner = instance.constructor.bimanual ? this.createDuoRunner(instance, scheme, demo)
      : new GameRunner({ game: instance, pipeline: this.createPipeline(demo, { adaptRest }), hand, source: this.liveFrames(demo), emulator: this.emulator, autopilot: demo,
        quality: live === 'bridge' && !demo ? this.qualityMonitor(this.calibration()) : null });
    const armPose = pose && !demo && live === 'bridge' ? ARM_POSES.find(p => p.id === pose) ?? null : null;
    this.sppprDecoder(demo)?.resetStats(); // 6.0: the stream's counters of this exercise (the run keeps them)
    return { id: game, level, retention, demo, plan, quick: !!quick && !demo, pose: armPose, game: instance, hand: runner.hand, runner, entry: GAME_BY_ID[game], scheme,
      ...(game === 'check' && !demo ? { formWeek: week } : {}) };
  }

  /**
   * 5.30 — «Две руки»: a pipeline, a hand and a stream per prosthesis. The on-screen emulator (or the demo) gives two
   * emulators; the external source gives each arm's own frames (input/bridge.js `sampleSide`); each external arm has its
   * own calibration. The prosthesis's thresholds are one pair in Motorica Start, so they are not used here.
   */
  createDuoRunner(game, scheme, demo) {
    const touch = demo || this.liveSource() === 'touch';
    const emulators = { left: this.emulator, right: this.emulator2 };
    const calibration = side => (touch ? this.state.calibrations.touch : this.state.calibrations[`bridge-${side}`]);
    const params = { ...this.signalParams(), prosthesisThresholds: null };
    const pipelines = { left: new SignalPipeline({ scheme, calibration: calibration('left'), params }), right: new SignalPipeline({ scheme, calibration: calibration('right'), params }) };
    if (!touch) this.signalSource(false); // builds the external source if it is not there yet
    // Read through `this.bridge` every frame: a host's first frame may rebuild the source (applySource).
    const sources = touch ? emulators : { left: { sample: () => this.bridge?.sampleSide?.('left') ?? null }, right: { sample: () => this.bridge?.sampleSide?.('right') ?? null } };
    const qualities = touch ? null : { left: this.qualityMonitor(calibration('left')), right: this.qualityMonitor(calibration('right')) };
    return new DuoRunner({ game, pipelines, hands: { left: this.createHand(), right: this.createHand() }, sources, emulators, autopilot: demo, lead: this.settings.side, qualities });
  }

  /**
   * 5.30 — «Тренер качества сигнала» (core/signalquality.js) on an external source: the play screen shows what is wrong
   * with the signal and what to do, the run keeps what lasted for the specialist's report. The emulator is not watched.
   */
  qualityMonitor(calibration) {
    return calibration?.rest && calibration?.max ? new SignalQualityMonitor({ calibration, onThreshold: Math.max(...this.switchOn()) }) : null;
  }

  /**
   * 6.0 — the decoder of the СПППР stream in use, or null: the external one (a packet of the task came through the bridge)
   * or the on-screen emulator's (the gesture scheme of the task's set).
   */
  sppprDecoder(demo = false) {
    if (!demo && this.liveSource() === 'bridge') return this.bridge?.spppr ?? null;
    return this.emulator.usesStream?.() || (this.settings.scheme === 'gesture' && GESTURE_SET.id === 'tz') ? this.emulator.decoder ?? null : null;
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
    const signalIssues = session.demo ? [] : runSignalIssues(session.runner);
    // 6.0: what the СПППР stream was like during the exercise (rate, jitter, gaps, forgiven noise) — for the report.
    const decoder = session.scheme === 'gesture' ? this.sppprDecoder(session.demo) : null;
    const stream = decoder && decoder.stats.accepted ? decoder.summary() : null;
    const run = {
      id: crypto.randomUUID?.() ?? String(Date.now()), at: new Date().toISOString(),
      game: session.id, level: session.level, levelCount: session.entry.Game.levels.length,
      scheme: session.scheme ?? this.settings.scheme, source: session.demo ? 'demo' : this.liveSource(),
      retention: session.retention, demo: session.demo, plan: !!session.plan, ...(session.quick ? { quick: true } : {}), ...(session.pose ? { pose: session.pose.id } : {}),
      // 5.29: the channels switched on at the prosthesis's thresholds — a weekly check is compared like with like.
      ...(session.runner.pipeline.params.prosthesisThresholds ? { thresholds: 'prosthesis' } : {}),
      // 5.29: a gesture run of the UBI4 set says so — its gestures and its skill check differ from the Синергия set.
      ...(this.settings.scheme === 'gesture' && GESTURE_SET.id !== 'synergy' ? { gestureSet: GESTURE_SET.id } : {}),
      // 5.30: with two prostheses the report says which arm did the exercise.
      ...(this.settings.prostheses === 'two' && !session.game.constructor.bimanual ? { side: this.settings.side } : {}),
      ...(Number.isInteger(session.formWeek) ? { formWeek: session.formWeek } : {}),
      // 5.30: what was wrong with the signal for 3 s or more — the specialist sees contact problems next to the results.
      ...(signalIssues.length ? { signalIssues } : {}), ...(stream ? { stream } : {}), ...r,
    };
    const replay = session.game.replay?.() ?? null; // shown on the results screen, never saved
    if (session.demo) return { run, report: null, planBonus: 0, replay };
    this.state.runs.push(run);
    const report = recordRun(this.profile, run, { today: dayKey(), weeklyGoal: this.settings.weeklyGoal });
    // Only exercises started from the plan complete it (5.10: a free-play «без подсказки» ticked the plan's probe
    // before any training and without the day's check-in).
    const planBonus = session.plan ? completePlanItem(this.profile, run, dayKey()) : 0;
    const calibrationNote = this.adoptRest(session.runner.pipeline.restTracker);
    this.save();
    if (report.levelUp) this.feedback.event({ name: 'levelup' });
    notifyHost(resultMessage(run, APP.version), { hostOrigin: this.launch?.hostOrigin ?? null });
    return { run, report, planBonus, calibrationNote, replay };
  }

  /** Co-adaptive calibration: keeps a bounded rest shift for the next session, or asks to recalibrate. */
  adoptRest(tracker) {
    if (!tracker) return null;
    const s = tracker.summary();
    const key = this.calibrationKey('bridge');
    if (s.keep) this.state.calibrations[key] = { ...this.state.calibrations[key], ...s.calibration, adaptedAt: new Date().toISOString() };
    return s.recalibrate || s.keep ? { recalibrate: s.recalibrate, shiftPct: Math.round(100 * s.shift), stuckChannel: s.stuckChannel } : null;
  }

  /** Goals the Firebird offers this week (5.13): from the training skills, the games played longest ago, the weekly check. */
  missionOffers() {
    const today = dayKey(), runs = this.state.runs.filter(r => !r.demo);
    const lastPlayed = Object.fromEntries(PLAN_CATALOG.map(g => [g.id, runs.filter(r => r.game === g.id).reduce((m, r) => (r.at > m ? r.at : m), '')]));
    const week = weekIndex(today);
    const pass = this.profile.missionPass?.week === week ? this.profile.missionPass : null;
    return missionOffers({ skills: skillProfile(runs), lastPlayed, catalog: PLAN_CATALOG, scheme: this.settings.scheme, week,
      checkDue: assessmentStatus(runs, this.settings.scheme, today).due, passed: pass?.keys ?? [], bias: pass?.bias ?? 'other' });
  }

  /** Next unfinished item of today's plan, or null. */
  nextPlanItem() { return this.dailyPlan().items.find(i => !i.done) ?? null; }

  go(name, params = {}) {
    if (!SCREENS[name]) name = 'home';
    // The exercise a host asked for opens instead of the first home screen after the onboarding (5.15).
    if (name === 'home' && this.pendingLaunch && this.profile.onboarded && !safetyOutdated(this.profile) && !this.showcase) {
      params = { ...this.pendingLaunch }; this.pendingLaunch = null; name = 'play';
    }
    if (!PIN_SCREENS.includes(name)) this.pinOk = false; // leaving the settings locks them again
    // The same screen redrawn (a setting changed) keeps scroll, open sections and focus (5.10: an arrow key in
    // «Схема управления» changed the scheme and sent focus to the heading, an opened section closed).
    // `fresh`: the next screen of the same name mounts anew (after the PIN gate; a replay of the game — 5.11).
    const view = this.screen?.name === name && !this.screen.fresh ? captureView(this.root) : null;
    this.tour?.pause(); // a hint tour keeps its step and comes back with its screen
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
    this.mountedAt = performance.now();
    mount(this.root, ...(this.showcase ? [this.showcaseBanner()] : []), screen.node);
    if (!(view && restoreView(this.root, view))) {
      if (!view) { this.root.scrollTop = 0; window.scrollTo(0, 0); }
      this.announce(screen.node, { focus: !view });
      if (!view) screen.focus?.focus({ preventScroll: true }); // a dialog's main button, a control to return to
    }
    this.tour = startTour(this, name, { quiet: !!view });
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
    if (this.tour) { this.tour.dismiss(); return true; } // a hint on screen: back closes the hint, not the screen
    const own = this.screen?.onBack?.();
    if (own === 'exit') { this.closeToHost('back'); return false; } // the screen lets the host close the app (first onboarding page)
    if (own) return true;
    const arrow = this.root.querySelector('.top-bar .back-btn');
    if (arrow) { arrow.click(); return true; }
    if (this.screen?.name === 'home') { this.closeToHost('back'); return false; }
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
    const today = dayKey();
    if (this.daySeen && this.daySeen !== today) this.applySource({ force: false });
    this.daySeen = today;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.forwardIntent();
    try { this.screen?.tick?.(now, dt); } catch (e) { console.error(e); toast('Ошибка кадра: ' + e.message, 'bad'); this.screen.tick = null; }
    requestAnimationFrame(t => this.frame(t));
  }
}
