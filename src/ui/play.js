// Play screen: canvas game + live signal meter + emulator controls (or external-source status).
// Hands-free flow: the intro can be confirmed by holding A for 1 s — the phone is in the sound hand,
// the sensors are on the other arm, so the player should not need to touch the screen to continue.
import { h, toast } from './dom.js';
import { signalMeter, icon, handsFreeText, bridgeLine, lostSignalHint } from './widgets.js';
import { createTwoChannelPads, createGesturePads, createDuoPads } from './controls.js';
import { SCHEME, SCHEME_INFO, STREAM_SET, gestureLegend } from '../core/vocabulary.js';
import { COLORS, text, holdRing } from '../render/draw.js';
import { BRAND, glow, radial, clearLayers } from '../render/fx.js';
import { clearTints } from '../render/sprites.js';
import { gameArt, mio } from './art.js';
import { useFlier, loadSprites, roomPictures } from './pictures.js';
import { petStageIndex, wornItems } from '../core/pet.js';
import { PET, SESSION } from '../config.js';
import { LiveAnnouncer } from '../core/announce.js';
import { MusicPlayer, offsetClock } from '../core/music.js';
import { audioClock, playMusic } from '../services/audio.js';
import { freePlayCaution, adviseStop } from '../core/wellbeing.js';
import { secondsToday, dayKey, trainingDays } from '../core/progress.js';
import { HoldConfirm } from '../core/handsfree.js';
import { SIDE_NAME } from '../core/hands.js';
import { LossWatch } from '../core/signal.js';
import { howFor } from '../games/registry.js';


/** Hints that flip with the signal (spaced for screen readers); everything else is a task and is said promptly. */
const FEEDBACK_HINT = /^(Держите|Сильнее|Слабее|Слабо|Сильно|Отлично|Несите)/;

/**
 * 6.1 — the controls under an external source (Q&A of 04.11, answer 13: touch is for menus, settings and emulation; with
 * real EMG no multi-touch — one area for the healthy hand, the rest by EMG). The pads of the emulator appear only for a
 * source that reads them — the raw-EMG lab says so on connect (`bridge-hello`, bridge/ws_bridge.py --lab). A device, a
 * recording or the prosthesis through the host app gets no pads. Pure: tests/pads.test.mjs.
 */
export function bridgeControls({ wsUrl = '', listens = false } = {}) {
  if (listens) return { pads: true, note: `${wsUrl ? `Адрес: ${wsUrl}. ` : ''}Площадки ниже — пульт лаборатории сырой ЭМГ.` };
  return { pads: false, note: wsUrl ? `Адрес: ${wsUrl}. Управление только сигналом: площадок эмулятора нет.` : 'Кадры приходят от протеза или эмулятора напрямую (без адреса). Управление только сигналом.' };
}

export function playScreen(app, { game, level, retention = false, plan = false, demo = false, pose = null, quick = false }) {
  loadSprites(roomPictures(game)); // the room of this game only — not the four rooms at startup
  const s = app.settings;
  // 5.16+: in «Полёт» the player's Firebird flies through the rings once it has wings (fledgling on); the egg and the
  // chick leave it to the glider. The game reads the sprite `flight-flier` (render/sprites.js). 26.10: in its outfit.
  const stage = PET.stages[petStageIndex(trainingDays(app.profile))];
  useFlier('flight-flier', stage.id, wornItems(app.profile, stage.id));
  let session = app.createSession({ game, level, retention, demo, plan, pose, quick });
  // Procedural music (only «Ритм» has a song): scheduled on the audio clock, heard when the note reaches the line.
  const musicFor = sess => { const song = s.sound && s.music ? sess.game.music() : null; return song ? new MusicPlayer(song, { clock: offsetClock(audioClock, s.audioOffsetMs), play: playMusic }) : null; };
  let music = musicFor(session);
  let phase = 'intro', countdown = 0, confirm = new HoldConfirm(s.dwellS), doneAt = 0, lastScore = -1, lastCount = 0, lastNow = null, outcome = null;
  // 6.0 — an exercise of the daily plan is a block (task of 28.10: 60–80 % of the time is gameplay with critical timings):
  // rounds of the same level follow one another after a 3-2-1, until SESSION.blockS of active play or SESSION.maxRounds.
  // Each round is a run of its own (progress and the report stay per run); the results show the last one and the block.
  const block = { rounds: 1, activeS: 0, outcomes: [] };
  const blockable = plan && !demo && !session.entry.assessment && !session.game.constructor.bimanual;
  const confirmS = s.dwellS;
  const entry = session.entry;
  // The live source, not the saved one: on a skin day the saved «Внешний» stays, but the emulator gives the signal.
  const bridgeMode = app.liveSource() === 'bridge' && !demo;

  const canvas = h('canvas', { class: 'stage-canvas', 'aria-label': `Игровое поле: ${entry.title}` });
  const ctx = canvas.getContext('2d');
  // The hint on screen follows the game every frame; screen readers and the voice get it through LiveAnnouncer (5.11).
  const hint = h('p', { class: 'stage-hint', 'aria-hidden': 'true' });
  const liveHint = h('p', { class: 'sr-only', role: 'status' });
  // 5.17 — the verdict drawn on the field («Чуть выше цели», «Раздавлено») reaches a screen reader too. «Полёт» and
  // «Мастерская» only: «Ритм» judges a note twice a second — its sound and pulse carry that.
  const liveVerdict = h('p', { class: 'sr-only', role: 'status' });
  let lastFlash = null;
  const announcer = new LiveAnnouncer();
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'play-dialog-title' });
  const scoreEl = h('b', { class: 'score' }, '0');
  const bar = h('i');
  const meter = signalMeter(app);
  const bridgeInfo = h('p', { class: 'bridge-status' });
  // 5.30 — «Тренер качества сигнала» (core/signalquality.js): what is wrong with the external signal and what to do.
  // Shown while it lasts; said once per kind of issue during the run (not a stream of warnings).
  const qualityInfo = h('p', { class: 'signal-quality', role: 'status', hidden: true });
  const qualitySaid = new Set();
  let qualityShown = null;
  const qualityVerdict = () => {
    const r = session.runner;
    if (!r.qualities) return r.quality?.verdict ?? null;
    for (const side of ['left', 'right']) {
      const v = r.qualities[side]?.verdict;
      if (v && !v.ok) return { ...v, text: `${v.text} · ${SIDE_NAME[side]}` };
    }
    return r.qualities.left || r.qualities.right ? { ok: true, text: 'Сигнал: хороший' } : null;
  };
  // Only a problem is shown (a good signal is the normal case and the pads need the room). On a short landscape
  // phone and on a 320 px portrait the title only — the voice says the tip, the results repeat it (styles/app.css).
  const updateQuality = () => {
    const v = qualityVerdict();
    const bad = !!v && !v.ok;
    const text = bad ? `${v.text}. ${v.tip}` : '';
    if (text !== qualityShown) {
      qualityShown = text;
      qualityInfo.replaceChildren(...(bad ? [h('b', {}, `${v.text}. `), h('span', { class: 'quality-tip' }, v.tip)] : []));
      qualityInfo.hidden = !bad; qualityInfo.classList.toggle('bad', bad);
    }
    if (v && !v.ok && phase === 'running' && !qualitySaid.has(v.id)) { qualitySaid.add(v.id); app.say(`${v.text}. ${v.tip}`); }
  };

  const controls = h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' });
  let shownRemote = null; // whether the lab's remote is on the screen (a «bridge-hello» may come after the screen opened)
  const renderControls = () => {
    // 6.3.2: in the gesture scheme of a set of the task the autopilot drives the emulator of the СПППР stream, not of the EMG
    if (demo) controls.replaceChildren(h('p', { class: 'pads-note' }, `Демо: автопилот управляет эмулятором ${session.scheme === SCHEME.GESTURE && STREAM_SET ? 'потока СПППР' : 'ЭМГ'} — тот же путь сигнала, что у вас. Результат не сохраняется.`));
    else {
      // 5.30 — «Две руки»: a pair of pads per arm (keys: left F/D, right J/K); the left arm is `emulator`, the right `emulator2`.
      const duo = session.game.constructor.bimanual;
      const pads = duo ? createDuoPads(app.emulator, app.emulator2)
        : session.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator, { mirror: !!s.mirrorHint }) : createTwoChannelPads(app.emulator);
      // 6.1: under an external source the pads are a remote only for a source that reads them (bridgeControls above).
      const remote = bridgeMode ? bridgeControls({ wsUrl: s.wsUrl, listens: !!app.bridge?.listens }) : null;
      shownRemote = remote?.pads ?? null;
      controls.replaceChildren(...(bridgeMode ? [h('div', { class: 'bridge-panel' }, h('b', {}, 'Внешний источник'), bridgeInfo, qualityInfo, h('small', {}, remote.note)), ...(remote.pads ? [pads] : [])] : [pads]));
      if (bridgeMode) controls.classList.add('compact');
    }
  };
  renderControls();
  const updateBridge = status => {
    bridgeInfo.textContent = bridgeLine(app.bridge, status);
    // The lab greets on connect, maybe after this screen opened: its remote appears then (and goes when it leaves).
    if (shownRemote !== null && shownRemote !== !!app.bridge?.listens) renderControls();
  };

  const badge = retention ? 'Без подсказки' : demo ? 'Демо' : plan ? 'План дня' : '';
  const header = h('header', { class: 'play-top' },
    h('button', { class: 'icon-btn', 'aria-label': 'Выйти', onclick: () => exit() }, icon('close')),
    h('div', { class: 'play-title' }, h('h1', {}, entry.assessment ? entry.title : `${entry.title} · ур. ${level}`), badge ? h('small', {}, badge) : null),
    h('button', { class: 'icon-btn pause-btn', 'aria-label': 'Пауза', onclick: () => pause() }, icon('pause')),
    scoreEl);
  const node = h('div', { class: 'screen play-screen' },
    header,
    h('div', { class: 'play-progress', 'aria-hidden': 'true' }, bar),
    h('main', { class: 'stage', 'aria-label': 'Игровое поле' }, canvas),
    hint, // under the field, not over it: never covers the header or what a game draws at the bottom
    liveHint, liveVerdict,
    // Signal and pads: one column on the right in landscape (styles/app.css), in the flow in portrait.
    h('div', { class: 'play-side' }, s.showMeters ? meter.node : null, controls),
    // The intro and pause dialogs cover everything under the header (5.10): over the field alone the sheet was
    // ~140 px tall on a small phone with gesture pads, and «Старт» did not fit.
    overlay);

  // Canvas sizing (device pixel ratio aware).
  let view = { w: 300, h: 300 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    // The same pixel size: keep the backing store (5.11 — a 1 px hint change re-allocated 4–6 MB, 12 times in 15 s).
    if (Math.round(r.width) === Math.round(view.w) && Math.round(r.height) === Math.round(view.h) && canvas.dataset.dpr === String(app.fps.degraded)) return;
    canvas.dataset.dpr = String(app.fps.degraded);
    // 5.32: up to 3 — the generated pictures are sharp on today's 3× screens; a slow phone still drops to 1.5 (FpsGuard)
    const dpr = Math.min(app.fps.degraded ? 1.5 : 3, window.devicePixelRatio || 1);
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
    // The words describe the exercise's own scheme — «Созвездие» is gestures and «Две руки» two channels whatever the
    // settings say (the pads already followed session.scheme).
    const legend = session.scheme === SCHEME.GESTURE
      ? gestureLegend()
      : s.gripSwitch === 'co'
        ? 'A — сжатие · B — раскрытие · A+B разом — коактивация (смена хвата) · покой — протез держит'
        : `A — сжатие · B — раскрытие · снова B у раскрытой кисти ${String(s.holdOpenS).replace('.', ',')} с — смена хвата · A+B — коактивация · покой — протез держит`;
    overlay.replaceChildren(h('div', { class: 'sheet' },
      h('p', { class: 'eyebrow' }, `${SCHEME_INFO[session.scheme].mode}${retention ? ' · без подсказки' : ''}`),
      // 5.16: before the weekly skill check Мио is focused with the player (the illustrations' «перед проверкой»).
      h('div', { class: 'sheet-title' }, h('span', { class: `tile g-${entry.id}`, 'aria-hidden': 'true' }, entry.assessment ? mio('focus', 44) : gameArt(entry.id, 44)), h('h2', { id: 'play-dialog-title' }, entry.title)),
      h('p', {}, entry.teaches),
      h('ul', { class: 'how' }, ...howFor(entry, session.scheme).map(x => h('li', {}, x))),
      h('p', { class: 'legend' }, legend),
      !retention && session.game.guidance < 1 ? h('p', { class: 'note' }, session.game.constructor.summaryBlocks && session.game.guidance <= 0.5
        ? 'Две попытки подряд без шкалы: что вышло — сразу после них.'
        : `Навык растёт: шкала будет скрыта в ${session.game.guidance > 0.6 ? 'каждой третьей' : 'каждой второй'} попытке — результат вы увидите сразу после неё.`) : null,
      retention ? h('p', { class: 'note' }, 'Живые подсказки скрыты: так проверяется, держится ли навык без экрана. Это игровая метрика удержания навыка, а не прогноз управления протезом.') : null,
      session.pose ? h('p', { class: 'note pose' }, h('b', {}, `Поза руки: ${session.pose.name}.`), ' Распознавание зависит от положения руки, поэтому проверка каждый день — в другой позе. Если так неудобно или тяжело держать руку — выполняйте как обычно.') : null,
      caution ? h('p', { class: 'note warn', role: 'status' }, caution) : null,
      // Sticky at the bottom of the sheet (5.10): the description scrolls, «Старт» and the hands-free hint stay visible.
      h('div', { class: 'sheet-actions' },
        h('div', { class: 'confirm' }, h('i', { class: 'confirm-ring' }), h('span', {}, handsFreeText(session.scheme, confirmS, 'старт'))),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn primary big', onclick: () => begin() }, 'Старт'),
          !demo ? h('button', { class: 'btn ghost', onclick: () => restart(true) }, 'Смотреть демо') : null))));
    setDialog(true);
    focusIn(overlay.querySelector('.btn.primary'));
    app.say(`${caution ? `${caution} ` : ''}${entry.title}. ${howFor(entry, session.scheme)[0]}. ${handsFreeText(session.scheme, confirmS, 'старт', { spoken: true })}`, { interrupt: true });
  }

  // Dialog focus (5.10): the main button takes focus when a sheet opens, the pause button when it closes —
  // focus used to drop to the page body, and a screen-reader user did not hear the pause at all.
  function focusIn(el) { el?.focus({ preventScroll: true }); }
  // What the open dialog covers is inert (5.11): Tab used to walk to the pads under it and drop to the page body.
  function setDialog(open) {
    overlay.hidden = !open;
    for (const el of [node.querySelector('.stage'), hint, node.querySelector('.play-side')]) el?.toggleAttribute('inert', open);
  }
  const pauseBtn = () => header.querySelector('.pause-btn');

  function begin() { phase = 'countdown'; countdown = 3; lastCount = 0; setDialog(false); focusIn(pauseBtn()); }

  // A lost external signal that lasts is critical (the organizers' answer 25): the exercise pauses and says why. The
  // silence counts from the source's last data — a signal gone during the 3-2-1 pauses the exercise as it starts — and
  // anew from «Продолжить»: with the signal still gone the exercise pauses again a full SIGNAL.criticalLossMs later.
  const lossWatch = new LossWatch();
  let resumedAt = -Infinity; // null: «Продолжить» was pressed, the next frame starts the count
  function pause({ signal = false } = {}) {
    if (phase !== 'running') return;
    phase = 'paused'; session.game.paused = true;
    app.say(signal ? 'Сигнал потерян. Пауза' : 'Пауза', { interrupt: true });
    overlay.replaceChildren(h('div', { class: 'sheet small' }, h('h2', { id: 'play-dialog-title' }, signal ? 'Сигнал потерян' : 'Пауза'),
      h('p', {}, signal
        ? 'Сигнала с датчиков нет — упражнение на паузе, кисть стоит. Проверьте контакт электродов, заряд и связь. Сигнал вернулся — нажмите «Продолжить».'
        : 'Расслабьте руку. Если устали — закончите на сегодня, это тоже правильно.'),
      h('div', { class: 'row-actions col' },
        h('button', { class: 'btn primary big', onclick: () => { setDialog(false); phase = 'running'; resumedAt = null; session.game.paused = false; focusIn(pauseBtn()); } }, 'Продолжить'),
        h('button', { class: 'btn ghost', onclick: () => restart(demo) }, 'Начать заново'),
        h('button', { class: 'btn ghost', onclick: () => exit() }, 'Выйти'),
        // 5.27 (medical review): pain that came with the exercise is said here, not only in the morning check-in — today
        // closes like a severe-pain answer and the report shows it. Not in the demo: it is not the person's training.
        demo ? null : h('button', { class: 'btn ghost pain-stop', onclick: () => { phase = 'leaving'; app.stopForPain(); } }, 'Стало больно — закончить на сегодня'))));
    setDialog(true);
    focusIn(overlay.querySelector('.btn.primary'));
  }

  function restart(asDemo) {
    music?.update(0, 1, false);
    if (asDemo !== demo) { app.go('play', { game, level, retention, plan, demo: asDemo, pose }); return; }
    session = app.createSession({ game, level, retention, demo, plan, pose, quick });
    music = musicFor(session);
    lastScore = -1; showIntro();
  }

  // Back to where the exercise came from: the plan and the skill check start on home, free play on the levels.
  function exit() {
    // finished: the saved run is shown, not thrown away; 6.0 — also the rounds of a block already played
    if (outcome || block.outcomes.length) { outcome ??= block.outcomes.at(-1); showResults(); return; }
    app.go(plan || game === 'check' ? 'home' : 'levels', { game });
  }

  // The run is saved the moment the game ends (5.10): until then it was saved only after the 0.9 s pause, and a
  // back, ✕ or Esc in that pause threw a finished exercise away. Results follow after the pause.
  function finishNow() { outcome = app.finishSession(session); block.outcomes.push(outcome); block.activeS += outcome.run.durationS ?? 0; }
  function showResults() {
    phase = 'leaving';
    const blockInfo = block.outcomes.length > 1 ? { rounds: block.outcomes.length, activeS: Math.round(block.activeS), meanScore: Math.round(block.outcomes.reduce((s0, o) => s0 + o.run.score, 0) / block.outcomes.length), reports: block.outcomes.map(o => o.report).filter(Boolean) } : null;
    const planBonus = block.outcomes.reduce((s0, o) => s0 + (o.planBonus ?? 0), 0); // round 1 completed the plan item
    app.go('results', { ...outcome, planBonus, plan, demo, pose, ...(blockInfo ? { block: blockInfo } : {}) });
  }
  /** Another round of the block, unless the block is long enough, the round limit is reached or fatigue is advised. */
  function nextRound() {
    if (!blockable || block.activeS >= SESSION.blockS || block.rounds >= SESSION.maxRounds) return false;
    if (adviseStop(app.runsToday(), secondsToday(app.profile, dayKey()), app.rules.softCapMin, app.state.runs)) return false;
    music?.update(0, 1, false);
    block.rounds++;
    session = app.createSession({ game, level, retention, demo, plan: false, pose, quick }); // the plan item is done by round 1
    music = musicFor(session);
    lastScore = -1; outcome = null;
    session.game.paused = true;
    phase = 'countdown'; countdown = SESSION.roundCountdownS; lastCount = 0;
    app.say(`Раунд ${block.rounds}`, { interrupt: true });
    return true;
  }

  // Countdown: the scene under a veil, the number in a round badge whose ring runs out with the second.
  // 5.32: a glass badge with the brand's glow, the ring in the brand gradient, the number in Unbounded.
  function drawCountdown() {
    ctx.fillStyle = COLORS.veil; ctx.fillRect(0, 0, view.w, view.h);
    const r = Math.max(30, Math.min(60, view.h * 0.2)), cx = view.w / 2, cy = view.h / 2 - 12, deco = !COLORS.hc;
    if (deco) glow(ctx, cx, cy, r * 2.4, BRAND.mint, 0.6);
    ctx.fillStyle = deco ? radial(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.1, r * 1.2, COLORS.theme === 'dark' ? [[0, '#22344a'], [1, '#101c27']] : [[0, '#ffffff'], [1, '#eef3f6']], COLORS.panel) : COLORS.panel;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    holdRing(ctx, cx, cy, r - 5, countdown % 1 || 1, 6);
    text(ctx, String(Math.ceil(countdown)), cx, cy + 2, { size: Math.round(r * 0.95), weight: 800, color: COLORS.accentInk, display: true });
    text(ctx, 'Расслабьтесь', cx, cy + r + 22, { size: 16, weight: 700, color: COLORS.text, maxWidth: view.w - 24 });
  }

  function tick(now, dt) {
    const intent = session.runner.step(now, dt);
    if (s.showMeters) meter.update(intent);
    if (bridgeMode) { updateBridge(app.bridge?.status ?? 'idle'); updateQuality(); }
    if (phase === 'intro') {
      // Armed only after a relaxation: a hold that left the results screen must not start the game too.
      // The demo bot drives the emulator during the intro too: it must not start the game itself (5.11).
      const go = !demo && confirm.update(intent, dt);
      overlay.querySelector('.confirm-ring')?.style.setProperty('--p', String(confirm.progress));
      if (go) begin();
    } else if (phase === 'countdown') {
      countdown -= dt;
      const shown = Math.ceil(countdown);
      if (shown !== lastCount && shown > 0) { lastCount = shown; app.say(String(shown), { interrupt: true }); }
      if (countdown <= 0) { session.hand.reset(); session.game.paused = false; phase = 'running'; }
    }
    // The count-in is scheduled during the 3-2-1 as well (5.11): with output latency plus the sync offset the click at
    // game time 0 was already late when the game started, and skipped.
    const musicTime = session.game.time - (phase === 'countdown' ? Math.max(0, countdown) * session.game.speed : 0);
    music?.update(musicTime, session.game.speed, (phase === 'running' || phase === 'countdown') && !session.game.done);
    for (const e of session.game.drainEvents()) app.feedback.event(music && e.name === 'beat' ? { ...e, silent: true } : e);
    session.game.render(ctx, view, session.hand, intent);
    const flash = session.game.flash;
    if (flash && flash !== lastFlash) { lastFlash = flash; liveVerdict.textContent = flash.text; }
    if (phase === 'countdown') drawCountdown();
    const lost = bridgeMode && session.runner.signalLost && phase === 'running';
    node.classList.toggle('lost', lost);
    resumedAt ??= now;
    if (lossWatch.update(lost, lost ? Math.min(session.runner.silentMs(now), now - resumedAt) : 0)) { pause({ signal: true }); return; }
    // The countdown goes to the live hint too: a screen-reader user without the app's own voice hears it (5.10).
    const hintText = lost ? lostSignalHint(app.bridge?.status)
      : phase === 'countdown' ? `${block.rounds > 1 ? `Раунд ${block.rounds} · ` : ''}Старт через ${Math.max(1, Math.ceil(countdown))}… расслабьтесь`
      : retention && phase === 'running' ? 'Без подсказки: доверьтесь ощущениям' : session.game.hint;
    if (hint.textContent !== hintText) hint.textContent = hintText;
    // Screen reader and voice: the latest hint once it holds, not every flip (the voice says the countdown itself).
    const spoken = announcer.update(hintText, now / 1000, { urgent: lost || phase === 'countdown', task: !FEEDBACK_HINT.test(hintText) });
    if (spoken !== null) {
      liveHint.textContent = spoken;
      if (phase === 'running') app.say(spoken, { interrupt: lost, minGapMs: 0 }); // the announcer already spaces them
    }
    const hud = session.game.hud();
    bar.style.width = `${Math.round(hud.progress * 100)}%`;
    if (hud.score !== lastScore) { scoreEl.textContent = retention && !session.game.done ? '—' : String(hud.score); lastScore = hud.score; }
    if (session.game.done && phase === 'running') { phase = 'done'; doneAt = now; finishNow(); }
    if (phase === 'done' && now - doneAt > 900 && !nextRound()) showResults();
    const frameS = lastNow === null ? dt : (now - lastNow) / 1000; // real frame time: the loop's dt is clamped
    lastNow = now;
    if (phase === 'running' && app.fps.update(frameS)) { toast('Упростили графику для плавности'); resize(); }
    if (app.fps.degraded) session.game.reduceMotion = true;
  }

  showIntro();
  return {
    node, tick, fresh: true,
    /** 5.30: «Две руки» — the keyboard drives both arms of the on-screen emulator (app.js, bindKeyboard). */
    get duo() { return !demo && !!session.game.constructor.bimanual; },
    // First focus after the screen is mounted (5.11): focusing «Старт» while building it was undone by the heading.
    get focus() { return phase === 'intro' ? overlay.querySelector('.btn.primary') : null; },
    onHidden: pause,
    /** 6.0 — the block of this plan exercise so far: rounds played and seconds of active play (a function: app.screen is a copy). */
    blockState: () => ({ rounds: block.rounds, activeS: block.activeS, phase }),
    /** The running session (tests drive its autopilot through the on-screen emulator). */
    session: () => session,
    // 6.0 — the time that counts as «gameplay with critical timings» (core/timeshare.js): running, live signal, not a demo.
    running: () => phase === 'running' && !demo && !session.game.done && !session.runner.signalLost,
    /** Back during a run pauses it (a stray gesture must not throw the attempt away); back again leaves. */
    onBack() { if (phase === 'running') pause(); else if (phase !== 'leaving') exit(); return true; },
    onBridgeStatus: updateBridge,
    cleanup() { music?.update(0, 1, false); observer.disconnect(); headerObserver.disconnect(); clearLayers(); clearTints(); },
  };
}
