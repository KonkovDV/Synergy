// Hint tours on the screen (5.13; rules and state — core/tours.js). A non-modal dialog card above the bottom bar (beside
// the rail in landscape) and a ring around the element it explains. The card takes focus, so a screen reader reads the
// hint; Esc and «Назад» dismiss the tour; leaving the screen pauses it where it was. The page stays usable.
import { h } from './dom.js';
import { TourSession, pendingTour } from '../core/tours.js';

/**
 * Shows the tour of this screen, if one is pending and its anchors are on the screen. Returns a controller or null.
 * `quiet` — the same screen was redrawn (a choice changed): the card comes back without taking focus or scrolling.
 */
export function startTour(app, screenName, { quiet = false } = {}) {
  const pending = pendingTour(app.settings.tours, { screen: screenName });
  if (!pending) return null;
  const find = anchor => app.root.querySelector(`[data-tour="${anchor}"]`);
  const session = new TourSession(pending.tour, a => !!find(a), pending.resume);
  if (!session.showable) return null;

  let target = null;
  const card = h('section', { class: 'tour', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tour-title' });
  const store = () => app.updateSettings({ tours: { ...app.settings.tours, [session.tour.key]: session.state() } });
  // Using the explained element is the step done (the sample's «tap the anchor»): «Начать» from the plan step moves the
  // tour on, so the next visit does not repeat it.
  const used = () => {
    if (!session.current) return;
    session.next(); store();
    queueMicrotask(() => { if (app.tour === controller && card.isConnected) render(); }); // unless the click left the screen
  };
  const unmark = () => { target?.classList.remove('tour-target'); target?.removeEventListener('click', used, true); target = null; };
  // Above the bottom bar, or right of the landscape rail: measured, so any text size and orientation fits.
  const place = () => {
    const nav = app.root.querySelector('.bottom-nav')?.getBoundingClientRect();
    const rail = nav && nav.height > innerHeight * 0.8;
    card.style.bottom = `${rail || !nav ? 12 : Math.max(12, innerHeight - nav.top + 10)}px`;
    card.style.left = `${rail ? nav.right + 12 : 12}px`;
  };
  const close = () => {
    store();
    unmark(); card.remove(); removeEventListener('resize', place);
    if (app.tour === controller) app.tour = null;
  };
  const render = () => {
    if (!card.isConnected) return;
    const step = session.current;
    if (!step) { close(); app.root.querySelector('h1')?.focus({ preventScroll: true }); return; }
    unmark();
    target = find(step.anchor);
    target?.classList.add('tour-target');
    target?.addEventListener('click', used, true);
    if (target && !quiet && !target.closest('.bottom-nav')) target.scrollIntoView({ block: 'start' }); // at once: a smooth scroll still ran when the card was measured
    const n = session.steps.length, i = session.index;
    card.replaceChildren(
      h('div', { class: 'tour-text' },
        h('p', { class: 'tour-count' }, `Подсказка ${i + 1} из ${n}`),
        h('h2', { id: 'tour-title', tabindex: '-1' }, step.title),
        h('p', { class: 'tour-body' }, step.body)),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn primary', onclick: () => { session.next(); store(); render(); } }, session.isLast ? 'Понятно' : 'Дальше'),
        session.isLast ? null : h('button', { class: 'btn ghost', onclick: () => controller.dismiss() }, 'Пропустить подсказки')));
    place();
    // Text that scrolls inside the card can be reached by the keyboard too (only then is it a tab stop).
    const text = card.querySelector('.tour-text');
    if (text.scrollHeight > text.clientHeight + 1) { text.tabIndex = 0; text.setAttribute('role', 'region'); text.setAttribute('aria-label', 'Текст подсказки'); }
    if (!quiet) card.querySelector('h2').focus({ preventScroll: true });
    quiet = false; // only the first card after a redraw stays quiet
  };
  const controller = {
    key: session.tour.key,
    /** Esc, «Назад» or «Пропустить подсказки»: this version of the tour will not come back. */
    dismiss() { session.skip(); close(); app.root.querySelector('h1')?.focus({ preventScroll: true }); },
    /** The screen is left mid-tour: keep the step, show it again next time. */
    pause() { close(); },
  };
  app.root.append(card);
  addEventListener('resize', place);
  app.tour = controller; // set before the first render: a click on the explained element checks it
  store(); // «in progress» from the first step: a reload resumes here
  render();
  return controller;
}
