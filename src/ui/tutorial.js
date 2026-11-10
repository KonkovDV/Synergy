// «Первые шаги» — interactive tutorial with live feedback: the hand on screen follows the signal,
// each step completes by itself when the command is held. Works with the on-screen emulator,
// the organizers' emulator or real sensors (same pipeline as the games).
import { h, toast } from './dom.js';
import { topBar, signalMeter } from './widgets.js';
import { TutorialRun } from '../core/tutorial.js';
import { createTwoChannelPads, createGesturePads } from './controls.js';
import { SCHEME, GESTURE_BY_ID } from '../core/vocabulary.js';
import { ACHIEVEMENTS } from '../core/progress.js';
import { drawHand, drawGauge, circle, panel, COLORS } from '../render/draw.js';
import { drawSprite } from '../render/sprites.js';
import { drawBionic, roomPlace, skinTint } from '../render/bionic.js';
import { clearTints } from '../render/sprites.js';
import { loadSprites, roomPictures } from './pictures.js';

/** A padlock on the tutorial canvas (5.14): the prosthesis is locked — signals do not move it. */
function padlock(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y - 6, 11, Math.PI, 0); ctx.lineTo(x + 11, y + 2); ctx.moveTo(x - 11, y - 6); ctx.lineTo(x - 11, y + 2); ctx.stroke();
  ctx.beginPath(); ctx.roundRect?.(x - 17, y, 34, 26, 6) ?? ctx.rect(x - 17, y, 34, 26); ctx.fill();
  ctx.restore();
}

export function tutorialScreen(app, { from = 'home' } = {}) {
  loadSprites(roomPictures('tutorial')); // the studio of «Две руки», not at startup
  const s = app.settings;
  const run = new TutorialRun(s.scheme, { lockHoldS: s.lockHoldS, gripSwitch: s.gripSwitch, holdOpenS: s.holdOpenS });
  let locked = false; // 5.14: between «Замок» and «Открыть замок» the drawn prosthesis holds still, a padlock shows it
  const pipeline = app.createPipeline(), source = app.liveFrames(), hand = app.createHand(); // 5.32: the live bridge, not the one at opening
  const title = h('h2', {}), text = h('p', { class: 'lead' }), tip = h('p', { class: 'note warn' });
  const counter = h('p', { class: 'eyebrow' });
  const ring = h('div', { class: 'cal-ring tut-ring' });
  const canvas = h('canvas', { class: 'tut-canvas', width: 640, height: 480, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2); // sharp on 2–3× screens; drawn in 320 × 240
  const meter = signalMeter(app);
  // On a skin day the saved source may be «Внешний», but the emulator gives the signal: it needs its pads.
  const onScreen = app.liveSource() === 'touch';
  const pads = onScreen ? (s.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator) : createTwoChannelPads(app.emulator)) : null;
  const finish = () => {
    const fresh = app.completeTutorial(run.passed);
    fresh.forEach(id => toast(`Достижение: ${ACHIEVEMENTS.find(a => a.id === id).name}`, 'good'));
    app.go(from, from === 'settings' ? { back: 'tutorial' } : {}); // go() stops the previous screen's speech: say it after (5.11 — it was cut at once)
    app.say(run.passed ? 'Обучение пройдено. Отлично!' : 'Обучение завершено. Шаги можно пройти снова в настройках.', { interrupt: true });
  };
  const live = h('p', { class: 'sr-only', role: 'status' });
  let body = null; // the scroll area of the step (set once the screen is built)
  const showStep = () => {
    const step = run.step;
    if (!step) return;
    // 6.3.2: a new step starts at its words — after «Пропустить шаг» at the bottom the title was above the fold
    if (body) body.scrollTop = 0;
    counter.textContent = `Шаг ${run.index + 1} из ${run.steps.length}`;
    title.textContent = step.title; text.textContent = step.text; tip.textContent = '';
    live.textContent = `${counter.textContent}. ${step.title}. ${step.text}`; // for a screen reader without the app's voice (5.11)
    app.say(`${step.title}. ${step.text}`, { interrupt: true });
  };
  showStep();
  // A frame like the game screen (5.10): the step scrolls in the middle, the signal and the pads stay on screen —
  // until 5.9 the pads were below the fold on most phones and the instruction scrolled away to press them.
  const node = h('div', { class: 'screen tutorial frame' },
    topBar('Первые шаги', () => app.go(from, from === 'settings' ? { back: 'tutorial' } : {})),
    // 6.3.2: the step's words first, the live picture under them. With six gesture pads and the stream panel in the dock
    // the picture took the whole body, and «what to do» began below the fold of a 150 px scroll area.
    body = h('main', { class: 'frame-body center' }, counter, h('div', { class: 'tut-head' }, ring, title), text, canvas, tip, live,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => { if (run.step?.lock === 'off') locked = false; run.skipStep(); if (run.done) finish(); else showStep(); } }, 'Пропустить шаг'),
        h('button', { class: 'btn ghost', onclick: finish }, 'Завершить обучение'))),
    h('div', { class: 'frame-dock' }, meter.node, pads ? h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' }, pads) : null));

  return {
    node,
    tick(now, dt) {
      const intent = pipeline.process(source?.sample(now) ?? null, now);
      meter.update(intent);
      if (!locked) hand.update(intent, dt); // a locked prosthesis ignores the signals of a moving arm
      const before = run.step;
      if (run.update(intent, dt)) {
        if (before?.lock) locked = before.lock === 'on';
        app.feedback.event({ name: 'ring' }); if (run.done) { finish(); return; } showStep();
      }
      ring.style.setProperty('--p', String(run.stepProgress));
      // Pad tips are for the on-screen emulator; with sensors the usual cause is contact or calibration.
      const tipText = onScreen ? run.step.tip : 'Не получается? Проверьте, что датчики плотно прилегают к коже, или пройдите калибровку в настройках.';
      if (run.showTip && !tip.textContent) { tip.textContent = tipText; app.say(tipText); }
      // Live picture: the prosthesis follows the signal; the force band of the «level» step is drawn.
      // 5.32: the generated studio and hand of «Две руки» (render/bionic.js); the drawn ones until the pictures load.
      const mirror = (s.side === 'left') !== !!s.mirrorHint, lit = locked ? 0 : intent.intensity, pose = hand.pose();
      const room = COLORS.hc ? null : roomPlace(320, 240, 178, COLORS.theme === 'dark');
      if (room) ctx.drawImage(room.img, room.x, room.y, room.w, room.h);
      else {
        const bg = ctx.createLinearGradient(0, 0, 0, 240);
        bg.addColorStop(0, COLORS.sceneTop); bg.addColorStop(1, COLORS.sceneBottom);
        ctx.fillStyle = bg; ctx.fillRect(0, 0, 320, 240);
        circle(ctx, 150, 150, 96, COLORS.accentSoft); // a soft spotlight behind the hand
      }
      const standY = room ? Math.min(178 + (room.strip - 178) * 0.5, 232) : 238;
      if (!drawBionic(ctx, 150, standY, Math.min(220, standY - 8), pose, { mirror, tint: COLORS.hc ? null : skinTint(app.profile.skin), lit: COLORS.hc ? 0 : lit, reflect: room ? 0.18 : 0, reflectTo: room?.strip ?? 240, grip: hand.grip, amount: hand.closure })) {
        drawHand(ctx, { x: 150, y: 228, size: 92, pose, skin: app.profile.skin, glow: lit, mirror });
      }
      if (locked && !drawSprite(ctx, 'ico-lock', 214, 76, 56)) padlock(ctx, 214, 70, COLORS.goodInk); // 5.16: the lock of the illustrations
      // 6.3.2 — the movement a gesture step asks for, as its picture: the hand above is the prosthesis, and at a movement
      // of the wrist it stands still (the set of the task), so without the picture the step showed nothing to repeat.
      const cue = run.step?.gesture ? GESTURE_BY_ID[run.step.gesture] : null;
      if (cue) {
        panel(ctx, 8, 8, 72, 72, 14);
        if (!drawSprite(ctx, `gesture-${cue.id}`, 44, 44, 64, { sx: mirror ? -1 : 1 })) {
          drawHand(ctx, { x: 44, y: 66, size: 22, pose: cue.pose, skin: 'icon', sleeve: false, mirror, wrist: cue.wrist ?? 0, roll: cue.roll ?? 0, dev: cue.dev ?? 0 });
        }
      }
      const band = run.step?.band;
      // The channel of the step: B on «Раскрытие» (5.11 — the gauge always showed A, empty while B was working).
      const ch = run.step?.id === 'open' ? 'b' : 'a';
      drawGauge(ctx, { x: 282, y: 20, w: 20, h: 180, value: intent[ch], min: band?.[0] ?? null, max: band?.[1] ?? null, color: COLORS[ch], label: ch.toUpperCase() });
    },
    cleanup() { clearTints(); }, // the tinted shell of the hand; the play screen drops its own on leaving
  };
}
