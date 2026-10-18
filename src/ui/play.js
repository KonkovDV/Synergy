// Play screen: canvas game + live signal meter + emulator controls (or external-source status).
// Hands-free flow: the intro can be confirmed by holding A for 1 s — the phone is in the sound hand,
// the sensors are on the other arm, so the player should not need to touch the screen to continue.
import { h, toast } from './dom.js';
import { signalMeter, icon, handsFreeText } from './widgets.js';
import { createTwoChannelPads, createGesturePads } from './controls.js';
import { SCHEME, SCHEME_INFO, gestureLegend } from '../core/vocabulary.js';
import { COLORS } from '../render/draw.js';
import { MusicPlayer } from '../core/music.js';
import { audioClock, playMusic } from '../services/audio.js';
import { freePlayCaution } from '../core/wellbeing.js';
import { secondsToday, dayKey } from '../core/progress.js';
import { HoldConfirm } from '../core/handsfree.js';

const BRIDGE_STATUS = { idle: 'не подключён', connecting: 'подключение…', waiting: 'подключено, ждём кадры', streaming: 'поток идёт', reconnecting: 'переподключение…', error: 'ошибка адреса' };

export function playScreen(app, { game, level, retention = false, plan = false, demo = false }) {
  const s = app.settings;
  let session = app.createSession({ game, level, retention, demo, plan });
  // Procedural music (only «Ритм» has a song): scheduled on the audio clock, heard when the note reaches the line.
  const musicFor = sess => { const song = s.sound && s.music ? sess.game.music() : null; return song ? new MusicPlayer(song, { clock: audioClock, play: playMusic }) : null; };
  let music = musicFor(session);
  let phase = 'intro', countdown = 0, confirm = new HoldConfirm(s.dwellS), doneAt = 0, lastScore = -1, lastSpoken = '', lastCount = 0, lastNow = null, outcome = null;
  const confirmS = s.dwellS;
  const entry = session.entry;
  const bridgeMode = s.source === 'bridge' && !demo;

  const canvas = h('canvas', { class: 'stage-canvas', 'aria-label': `Игровое поле: ${entry.title}` });
  const ctx = canvas.getContext('2d');
  const hint = h('p', { class: 'stage-hint', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'play-dialog-title' });
  const scoreEl = h('b', { class: 'score' }, '0');
  const bar = h('i');
  const meter = signalMeter(app);
  const bridgeInfo = h('p', { class: 'bridge-status' });

  const controls = h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' });
  const renderControls = () => {
    if (demo) controls.replaceChildren(h('p', { class: 'pads-note' }, 'Демо: автопилот управляет эмулятором ЭМГ — тот же путь сигнала, что у вас. Результат не сохраняется.'));
    else {
      const pads = s.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator) : createTwoChannelPads(app.emulator);
      // In bridge mode the pads stay as a remote for the raw-EMG lab (bridge/ws_bridge.py --lab).
      controls.replaceChildren(...(bridgeMode ? [h('div', { class: 'bridge-panel' }, h('b', {}, 'Внешний источник'), bridgeInfo, h('small', {}, s.wsUrl ? `Адрес: ${s.wsUrl}. Площадки ниже — пульт лаборатории (--lab).` : 'Кадры приходят от протеза или эмулятора напрямую (без адреса).')), pads] : [pads]));
      if (bridgeMode) controls.classList.add('compact');
    }
  };
  renderControls();
  const updateBridge = status => { bridgeInfo.textContent = `Статус: ${BRIDGE_STATUS[status] ?? status} · кадров: ${app.bridge?.received ?? 0}${app.bridge?.raw ? ' · сырая ЭМГ → огибающая 150 мс' : ''}`; };

  const badge = retention ? 'Без подсказки' : demo ? 'Демо' : plan ? 'План дня' : '';
  const header = h('header', { class: 'play-top' },
    h('button', { class: 'icon-btn', 'aria-label': 'Выйти', onclick: () => exit() }, icon('close')),
    h('div', { class: 'play-title' }, h('h1', {}, `${entry.title} · ур. ${level}`), badge ? h('small', {}, badge) : null),
    h('button', { class: 'icon-btn pause-btn', 'aria-label': 'Пауза', onclick: () => pause() }, icon('pause')),
    scoreEl);
  const node = h('div', { class: 'screen play-screen' },
    header,
    h('div', { class: 'play-progress', 'aria-hidden': 'true' }, bar),
    h('main', { class: 'stage', 'aria-label': 'Игровое поле' }, canvas),
    hint, // under the field, not over it: never covers the header or what a game draws at the bottom
    // Signal and pads: one column on the right in landscape (styles/app.css), in the flow in portrait.
    h('div', { class: 'play-side' }, s.showMeters ? meter.node : null, controls),
    // The intro and pause dialogs cover everything under the header (5.10): over the field alone the sheet was
    // ~140 px tall on a small phone with gesture pads, and «Старт» did not fit.
    overlay);

  // Canvas sizing (device pixel ratio aware).
  let view = { w: 300, h: 300 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(app.fps.degraded ? 1.5 : 2.5, window.devicePixelRatio || 1); // fewer pixels on a slow phone
    view = { w: Math.max(100, r.width), h: Math.max(100, r.height) };
    canvas.width = Math.round(view.w * dpr); canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const headerObserver = new ResizeObserver(() => node.style.setProperty('--play-top', `${header.offsetHeight + 4}px`));
  headerObserver.observe(header);

  function showIntro() {
    phase = 'intro'; session.game.paused = true; confirm = new HoldConfirm(confirmS);
    // Safety > motivation: free play stays open on a declared rest day or over the cap, with a caution.
    const caution = demo ? null : freePlayCaution({ checkin: app.checkin(), secondsToday: secondsToday(app.profile, dayKey()), softCapMin: app.rules.softCapMin });
    const legend = s.scheme === SCHEME.GESTURE
      ? gestureLegend()
      : 'A — сжатие · B — раскрытие · A+B разом — коактивация (смена хвата) · покой — протез держит';
    overlay.replaceChildren(h('div', { class: 'sheet' },
      h('p', { class: 'eyebrow' }, `${SCHEME_INFO[s.scheme].name} режим${retention ? ' · без подсказки' : ''}`),
      h('h2', { id: 'play-dialog-title' }, `${entry.icon} ${entry.title}`),
      h('p', {}, entry.teaches),
      h('ul', { class: 'how' }, ...entry.how.map(x => h('li', {}, x))),
      h('p', { class: 'legend' }, legend),
      !retention && session.game.guidance < 1 ? h('p', { class: 'note' }, `Навык растёт: шкала будет скрыта в ${session.game.guidance > 0.6 ? 'каждой третьей' : 'каждой второй'} попытке — результат вы увидите сразу после неё.`) : null,
      retention ? h('p', { class: 'note' }, 'Живые подсказки скрыты: так проверяется, держится ли навык без экрана. Это игровая метрика удержания навыка, а не прогноз управления протезом.') : null,
      caution ? h('p', { class: 'note warn', role: 'status' }, caution) : null,
      // Sticky at the bottom of the sheet (5.10): the description scrolls, «Старт» and the hands-free hint stay visible.
      h('div', { class: 'sheet-actions' },
        h('div', { class: 'confirm' }, h('i', { class: 'confirm-ring' }), h('span', {}, handsFreeText(s.scheme, confirmS, 'старт'))),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn primary big', onclick: () => begin() }, 'Старт'),
          !demo ? h('button', { class: 'btn ghost', onclick: () => restart(true) }, 'Смотреть демо') : null))));
    overlay.hidden = false;
    focusIn(overlay.querySelector('.btn.primary'));
    app.say(`${caution ? `${caution} ` : ''}${entry.title}. ${entry.how[0]}. ${handsFreeText(s.scheme, confirmS, 'старт', { spoken: true })}`, { interrupt: true });
  }

  // Dialog focus (5.10): the main button takes focus when a sheet opens, the pause button when it closes —
  // focus used to drop to the page body, and a screen-reader user did not hear the pause at all.
  function focusIn(el) { el?.focus({ preventScroll: true }); }
  const pauseBtn = () => header.querySelector('.pause-btn');

  function begin() { phase = 'countdown'; countdown = 3; lastCount = 0; overlay.hidden = true; focusIn(pauseBtn()); }

  function pause() {
    if (phase !== 'running') return;
    phase = 'paused'; session.game.paused = true;
    app.say('Пауза', { interrupt: true });
    overlay.replaceChildren(h('div', { class: 'sheet small' }, h('h2', { id: 'play-dialog-title' }, 'Пауза'),
      h('p', {}, 'Расслабьте руку. Если устали — закончите на сегодня, это тоже правильно.'),
      h('div', { class: 'row-actions col' },
        h('button', { class: 'btn primary big', onclick: () => { overlay.hidden = true; phase = 'running'; session.game.paused = false; focusIn(pauseBtn()); } }, 'Продолжить'),
        h('button', { class: 'btn ghost', onclick: () => restart(demo) }, 'Начать заново'),
        h('button', { class: 'btn ghost', onclick: () => exit() }, 'Выйти'))));
    overlay.hidden = false;
    focusIn(overlay.querySelector('.btn.primary'));
  }

  function restart(asDemo) {
    music?.update(0, 1, false);
    if (asDemo !== demo) { app.go('play', { game, level, retention, plan, demo: asDemo }); return; }
    session = app.createSession({ game, level, retention, demo, plan });
    music = musicFor(session);
    lastScore = -1; showIntro();
  }

  // Back to where the exercise came from: the plan and the skill check start on home, free play on the levels.
  function exit() {
    if (outcome) { showResults(); return; } // finished: the saved run is shown, not thrown away
    app.go(plan || game === 'check' ? 'home' : 'levels', { game });
  }

  // The run is saved the moment the game ends (5.10): until then it was saved only after the 0.9 s pause, and a
  // back, ✕ or Esc in that pause threw a finished exercise away. Results follow after the pause.
  function finishNow() { outcome = app.finishSession(session); }
  function showResults() { phase = 'leaving'; app.go('results', { ...outcome, plan, demo }); }

  function drawCountdown() {
    ctx.fillStyle = 'rgba(8,12,30,0.55)'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = '800 72px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text; ctx.fillText(String(Math.ceil(countdown)), view.w / 2, view.h / 2);
    ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = COLORS.muted;
    ctx.fillText('Расслабьтесь', view.w / 2, view.h / 2 + 60);
  }

  function tick(now, dt) {
    const intent = session.runner.step(now, dt);
    if (s.showMeters) meter.update(intent);
    if (bridgeMode) updateBridge(app.bridge?.status ?? 'idle');
    if (phase === 'intro') {
      // Armed only after a relaxation: a hold that left the results screen must not start the game too.
      const go = confirm.update(intent, dt);
      overlay.querySelector('.confirm-ring')?.style.setProperty('--p', String(confirm.progress));
      if (go) begin();
    } else if (phase === 'countdown') {
      countdown -= dt;
      const shown = Math.ceil(countdown);
      if (shown !== lastCount && shown > 0) { lastCount = shown; app.say(String(shown), { interrupt: true }); }
      if (countdown <= 0) { session.hand.reset(); session.game.paused = false; phase = 'running'; }
    }
    music?.update(session.game.time, session.game.speed, phase === 'running' && !session.game.done);
    for (const e of session.game.drainEvents()) app.feedback.event(music && e.name === 'beat' ? { ...e, silent: true } : e);
    session.game.render(ctx, view, session.hand, intent);
    if (phase === 'countdown') drawCountdown();
    const lost = bridgeMode && session.runner.signalLost && phase === 'running';
    node.classList.toggle('lost', lost);
    // The countdown goes to the live hint too: a screen-reader user without the app's own voice hears it (5.10).
    const hintText = lost ? 'Нет сигнала от источника — упражнение на паузе, прогресс сохранён'
      : phase === 'countdown' ? `Старт через ${Math.max(1, Math.ceil(countdown))}… расслабьтесь`
      : retention && phase === 'running' ? 'Без подсказки: доверьтесь ощущениям' : session.game.hint;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    // Voice: game hints while running (eyes-free play); repeats are throttled by the voice service.
    if (phase === 'running' && hintText !== lastSpoken) { lastSpoken = hintText; app.say(hintText, { interrupt: lost }); }
    const hud = session.game.hud();
    bar.style.width = `${Math.round(hud.progress * 100)}%`;
    if (hud.score !== lastScore) { scoreEl.textContent = retention && !session.game.done ? '—' : String(hud.score); lastScore = hud.score; }
    if (session.game.done && phase === 'running') { phase = 'done'; doneAt = now; finishNow(); }
    if (phase === 'done' && now - doneAt > 900) showResults();
    const frameS = lastNow === null ? dt : (now - lastNow) / 1000; // real frame time: the loop's dt is clamped
    lastNow = now;
    if (phase === 'running' && app.fps.update(frameS)) { toast('Упростили графику для плавности'); resize(); }
    if (app.fps.degraded) session.game.reduceMotion = true;
  }

  showIntro();
  return {
    node, tick,
    onHidden: pause,
    /** Back during a run pauses it (a stray gesture must not throw the attempt away); back again leaves. */
    onBack() { if (phase === 'running') pause(); else if (phase !== 'leaving') exit(); return true; },
    onBridgeStatus: updateBridge,
    cleanup() { music?.update(0, 1, false); observer.disconnect(); headerObserver.disconnect(); },
  };
}
