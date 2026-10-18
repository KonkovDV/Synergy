// «Первые шаги» — interactive tutorial with live feedback: the hand on screen follows the signal,
// each step completes by itself when the command is held. Works with the on-screen emulator,
// the organizers' emulator or real sensors (same pipeline as the games).
import { h, toast } from './dom.js';
import { topBar, signalMeter } from './widgets.js';
import { TutorialRun } from '../core/tutorial.js';
import { createTwoChannelPads, createGesturePads } from './controls.js';
import { SCHEME } from '../core/vocabulary.js';
import { ACHIEVEMENTS } from '../core/progress.js';
import { drawHand, drawGauge, COLORS } from '../render/draw.js';

export function tutorialScreen(app, { from = 'home' } = {}) {
  const s = app.settings;
  const run = new TutorialRun(s.scheme);
  const pipeline = app.createPipeline(), source = app.signalSource(), hand = app.createHand();
  const title = h('h2', {}), text = h('p', { class: 'lead' }), tip = h('p', { class: 'note warn' });
  const counter = h('p', { class: 'eyebrow' });
  const ring = h('div', { class: 'cal-ring tut-ring' });
  const canvas = h('canvas', { class: 'tut-canvas', width: 640, height: 480, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2); // sharp on 2–3× screens; drawn in 320 × 240
  const meter = signalMeter(app);
  const pads = s.source === 'touch' ? (s.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator) : createTwoChannelPads(app.emulator)) : null;
  const finish = () => {
    const fresh = app.completeTutorial(run.passed);
    fresh.forEach(id => toast(`🏅 ${ACHIEVEMENTS.find(a => a.id === id).name}`, 'good'));
    app.go(from, from === 'settings' ? { back: 'tutorial' } : {}); // go() stops the previous screen's speech: say it after (5.11 — it was cut at once)
    app.say(run.passed ? 'Обучение пройдено. Отлично!' : 'Обучение завершено. Шаги можно пройти снова в настройках.', { interrupt: true });
  };
  const live = h('p', { class: 'sr-only', role: 'status' });
  const showStep = () => {
    const step = run.step;
    if (!step) return;
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
    h('main', { class: 'frame-body center' }, counter, canvas, ring, title, text, tip, live,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => { run.skipStep(); if (run.done) finish(); else showStep(); } }, 'Пропустить шаг'),
        h('button', { class: 'btn ghost', onclick: finish }, 'Завершить обучение'))),
    h('div', { class: 'frame-dock' }, meter.node, pads ? h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' }, pads) : null));

  return {
    node,
    tick(now, dt) {
      const intent = pipeline.process(source?.sample(now) ?? null, now);
      meter.update(intent);
      hand.update(intent, dt);
      if (run.update(intent, dt)) { app.feedback.event({ name: 'ring' }); if (run.done) { finish(); return; } showStep(); }
      ring.style.setProperty('--p', String(run.stepProgress));
      // Pad tips are for the on-screen emulator; with sensors the usual cause is contact or calibration.
      const tipText = s.source === 'touch' ? run.step.tip : 'Не получается? Проверьте, что датчики плотно прилегают к коже, или пройдите калибровку в настройках.';
      if (run.showTip && !tip.textContent) { tip.textContent = tipText; app.say(tipText); }
      // Live picture: the prosthesis follows the signal; the force band of the «level» step is drawn.
      ctx.clearRect(0, 0, 320, 240);
      drawHand(ctx, { x: 150, y: 228, size: 92, pose: hand.pose(), skin: app.profile.skin, glow: intent.intensity, mirror: s.side === 'left' });
      const band = run.step?.band;
      // The channel of the step: B on «Раскрытие» (5.11 — the gauge always showed A, empty while B was working).
      const ch = run.step?.id === 'open' ? 'b' : 'a';
      drawGauge(ctx, { x: 282, y: 20, w: 20, h: 180, value: intent[ch], min: band?.[0] ?? null, max: band?.[1] ?? null, color: COLORS[ch], label: ch.toUpperCase() });
    },
  };
}
