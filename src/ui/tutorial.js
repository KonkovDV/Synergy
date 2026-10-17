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
  const canvas = h('canvas', { class: 'tut-canvas', width: 320, height: 240, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  const meter = signalMeter(app);
  const pads = s.source === 'touch' ? (s.scheme === SCHEME.GESTURE ? createGesturePads(app.emulator) : createTwoChannelPads(app.emulator)) : null;
  const finish = () => {
    const fresh = app.completeTutorial();
    fresh.forEach(id => toast(`🏅 ${ACHIEVEMENTS.find(a => a.id === id).name}`, 'good'));
    app.say('Обучение пройдено. Отлично!', { interrupt: true });
    app.go(from);
  };
  const showStep = () => {
    const step = run.step;
    if (!step) return;
    counter.textContent = `Шаг ${run.index + 1} из ${run.steps.length}`;
    title.textContent = step.title; text.textContent = step.text; tip.textContent = '';
    app.say(`${step.title}. ${step.text}`, { interrupt: true });
  };
  showStep();
  const node = h('div', { class: 'screen tutorial' },
    topBar('Первые шаги', () => app.go(from)),
    h('main', { class: 'scroll center' }, counter, canvas, ring, title, text, tip,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => { run.skipStep(); if (run.done) finish(); else showStep(); } }, 'Пропустить шаг'),
        h('button', { class: 'btn ghost', onclick: finish }, 'Завершить'))),
    meter.node, pads ? h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' }, pads) : null);

  return {
    node,
    tick(now, dt) {
      const intent = pipeline.process(source?.sample(now) ?? null, now);
      meter.update(intent);
      hand.update(intent, dt);
      if (run.update(intent, dt)) { app.feedback.event({ name: 'ring' }); if (run.done) { finish(); return; } showStep(); }
      ring.style.setProperty('--p', String(run.stepProgress));
      if (run.showTip && !tip.textContent) { tip.textContent = run.step.tip; app.say(run.step.tip); }
      // Live picture: the prosthesis follows the signal; the force band of the «level» step is drawn.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawHand(ctx, { x: 150, y: 228, size: 92, pose: hand.pose(), skin: app.profile.skin, glow: intent.intensity, mirror: s.side === 'left' });
      const band = run.step?.band;
      drawGauge(ctx, { x: 282, y: 20, w: 20, h: 180, value: intent.a, min: band?.[0] ?? null, max: band?.[1] ?? null, color: COLORS.a, label: 'A' });
    },
  };
}
