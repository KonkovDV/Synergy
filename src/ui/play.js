// Play screen: canvas game + live signal meter + emulator controls (or external-source status).
// Hands-free flow: the intro can be confirmed by holding A for 1 s — the phone is in the sound hand,
// the sensors are on the other arm, so the player should not need to touch the screen to continue.
import { h } from './dom.js';
import { signalMeter } from './widgets.js';
import { createTwoChannelPads, createGesturePads } from '../input/controls.js';
import { SCHEME, SCHEME_INFO, COMMAND, gestureLegend } from '../core/vocabulary.js';
import { COLORS } from '../render/draw.js';

const BRIDGE_STATUS = { idle: 'не подключён', connecting: 'подключение…', waiting: 'подключено, ждём кадры', streaming: 'поток идёт', reconnecting: 'переподключение…', error: 'ошибка адреса' };

export function playScreen(app, { game, level, retention = false, plan = false, demo = false }) {
  const s = app.settings;
  let session = app.createSession({ game, level, retention, demo });
  let phase = 'intro', countdown = 0, confirm = 0, doneAt = 0, lastScore = -1, lastSpoken = '', lastCount = 0;
  const confirmS = s.dwellS;
  const entry = session.entry;
  const bridgeMode = s.source === 'bridge' && !demo;

  const canvas = h('canvas', { class: 'stage-canvas', 'aria-label': `Игровое поле: ${entry.title}` });
  const ctx = canvas.getContext('2d');
  const hint = h('p', { class: 'stage-hint', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'overlay' });
  const scoreEl = h('b', { class: 'score' }, '0');
  const bar = h('i');
  const meter = signalMeter(app);
  const bridgeInfo = h('p', { class: 'bridge-status' });

  const controls = h('div', { class: 'controls' });
  const renderControls = () => {
    if (demo) controls.replaceChildren(h('p', { class: 'pads-note' }, 'Демо: автопилот управляет эмулятором ЭМГ — тот же путь сигнала, что у вас. Результат не сохраняется.'));
    else {
      const pads = s.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator) : createTwoChannelPads(app.emulator);
      // In bridge mode the pads stay as a remote for the raw-EMG lab (bridge/ws_bridge.py --lab).
      controls.replaceChildren(...(bridgeMode ? [h('div', { class: 'bridge-panel' }, h('b', {}, 'Внешний источник'), bridgeInfo, h('small', {}, `${s.wsUrl || 'postMessage / window.Synergy.feed'} · площадки ниже управляют лабораторией --lab`)), pads] : [pads]));
      if (bridgeMode) controls.classList.add('compact');
    }
  };
  renderControls();
  const updateBridge = status => { bridgeInfo.textContent = `Статус: ${BRIDGE_STATUS[status] ?? status} · кадров: ${app.bridge?.received ?? 0}`; };

  const badge = retention ? 'Без подсказки' : demo ? 'Демо' : plan ? 'План дня' : '';
  const node = h('div', { class: 'screen play-screen' },
    h('header', { class: 'play-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Выйти', onclick: () => exit() }, '✕'),
      h('div', { class: 'play-title' }, h('b', {}, `${entry.title} · ур. ${level}`), badge ? h('small', {}, badge) : null),
      h('button', { class: 'icon-btn', 'aria-label': 'Пауза', onclick: () => pause() }, 'Ⅱ'),
      scoreEl),
    h('div', { class: 'play-progress' }, bar),
    h('div', { class: 'stage' }, canvas, hint, overlay),
    s.showMeters ? meter.node : null,
    controls);

  // Canvas sizing (device pixel ratio aware).
  let view = { w: 300, h: 300 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    view = { w: Math.max(100, r.width), h: Math.max(100, r.height) };
    canvas.width = Math.round(view.w * dpr); canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);

  function showIntro() {
    phase = 'intro'; session.game.paused = true;
    const legend = s.scheme === SCHEME.GESTURE
      ? gestureLegend()
      : 'A — сжатие · B — раскрытие · A+B разом — коактивация (смена хвата) · покой — протез держит';
    overlay.replaceChildren(h('div', { class: 'sheet' },
      h('p', { class: 'eyebrow' }, `${SCHEME_INFO[s.scheme].name} режим${retention ? ' · без подсказки' : ''}`),
      h('h2', {}, `${entry.icon} ${entry.title}`),
      h('p', {}, entry.teaches),
      h('ul', { class: 'how' }, ...entry.how.map(x => h('li', {}, x))),
      h('p', { class: 'legend' }, legend),
      !retention && session.game.guidance < 1 ? h('p', { class: 'note' }, `Навык растёт: шкала будет скрыта в ${session.game.guidance > 0.6 ? 'каждой третьей' : 'каждой второй'} попытке — результат вы увидите сразу после неё.`) : null,
      retention ? h('p', { class: 'note' }, 'Живые подсказки скрыты: так проверяется, держится ли навык без экрана. В исследованиях результаты таких попыток были связаны с управлением реальным протезом — это игровая метрика, не прогноз.') : null,
      h('div', { class: 'confirm' }, h('i', { class: 'confirm-ring' }), h('span', {}, `Удерживайте сжатие (A) ${confirmS.toFixed(1).replace('.0', '')} с — старт без касания`)),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn primary big', onclick: () => begin() }, 'Старт'),
        !demo ? h('button', { class: 'btn ghost', onclick: () => restart(true) }, 'Смотреть демо') : null)));
    overlay.hidden = false;
    app.say(`${entry.title}. ${entry.how[0]}. Чтобы начать, удерживайте сжатие.`, { interrupt: true });
  }

  function begin() { phase = 'countdown'; countdown = 3; lastCount = 0; confirm = 0; overlay.hidden = true; }

  function pause() {
    if (phase !== 'running') return;
    phase = 'paused'; session.game.paused = true;
    app.say('Пауза', { interrupt: true });
    overlay.replaceChildren(h('div', { class: 'sheet small' }, h('h2', {}, 'Пауза'),
      h('p', {}, 'Расслабьте руку. Если устали — закончите на сегодня, это тоже правильно.'),
      h('div', { class: 'row-actions col' },
        h('button', { class: 'btn primary big', onclick: () => { overlay.hidden = true; phase = 'running'; session.game.paused = false; } }, 'Продолжить'),
        h('button', { class: 'btn ghost', onclick: () => restart(demo) }, 'Начать заново'),
        h('button', { class: 'btn ghost', onclick: () => exit() }, 'Выйти'))));
    overlay.hidden = false;
  }

  function restart(asDemo) {
    session = app.createSession({ game, level, retention, demo: asDemo });
    if (asDemo !== demo) { app.go('play', { game, level, retention, plan, demo: asDemo }); return; }
    lastScore = -1; showIntro();
  }

  function exit() { app.go(plan ? 'home' : 'levels', { game }); }

  function finish() {
    const outcome = app.finishSession(session);
    app.go('results', { ...outcome, plan, demo });
  }

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
      confirm = intent.valid && intent.command === COMMAND.CLOSE ? confirm + dt : Math.max(0, confirm - dt * 2);
      overlay.querySelector('.confirm-ring')?.style.setProperty('--p', String(Math.min(1, confirm / confirmS)));
      if (confirm >= confirmS) begin();
    } else if (phase === 'countdown') {
      countdown -= dt;
      const shown = Math.ceil(countdown);
      if (shown !== lastCount && shown > 0) { lastCount = shown; app.say(String(shown), { interrupt: true }); }
      if (countdown <= 0) { session.hand.reset(); session.game.paused = false; phase = 'running'; }
    }
    for (const e of session.game.drainEvents()) app.feedback.event(e);
    session.game.render(ctx, view, session.hand, intent);
    if (phase === 'countdown') drawCountdown();
    const lost = bridgeMode && session.runner.signalLost && phase === 'running';
    node.classList.toggle('lost', lost);
    const hintText = lost ? 'Нет сигнала от источника — упражнение на паузе, прогресс сохранён'
      : retention && phase === 'running' ? 'Без подсказки: доверьтесь ощущениям' : session.game.hint;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    // Voice: game hints while running (eyes-free play); repeats are throttled by the voice service.
    if (phase === 'running' && hintText !== lastSpoken) { lastSpoken = hintText; app.say(hintText, { interrupt: lost }); }
    const hud = session.game.hud();
    bar.style.width = `${Math.round(hud.progress * 100)}%`;
    if (hud.score !== lastScore) { scoreEl.textContent = retention && !session.game.done ? '—' : String(hud.score); lastScore = hud.score; }
    if (session.game.done && phase === 'running') { phase = 'done'; doneAt = now; }
    if (phase === 'done' && now - doneAt > 900) { phase = 'leaving'; finish(); }
  }

  showIntro();
  return {
    node, tick,
    onHidden: pause,
    onBridgeStatus: updateBridge,
    cleanup() { observer.disconnect(); app.emulator.setTarget({ a: 0, b: 0, gesture: s.scheme === SCHEME.GESTURE ? 'rest' : null }); },
  };
}
