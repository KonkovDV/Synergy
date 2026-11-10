// «Азбука протеза» (5.15, the sample's learning flashcards — core/primer.js): topics → a deck of cards to flip → a
// short check without time. One screen, three views: the list of topics, a deck, its check. A card is one button:
// a touch, Enter or Space turns it (the answer appears under the question, announced politely), the dots show what
// was read. A wrong answer is not a fault: the right one and why come at once, the check can be taken again.
import { h, toast } from './dom.js';
import { topBar, mioAvatar } from './widgets.js';
import { badgeArt, firebird, achievementArt, giftArt } from './art.js';
import { PRIMER, PRIMER_BY_ID, deckProgress, resumeIndex, markSeen, checkOpen, recordCheck } from '../core/primer.js';
import { ACHIEVEMENTS, unlockAchievements, dayKey, trainingDays } from '../core/progress.js';
import { PET_ITEMS, petStageIndex, wornItems, withPet } from '../core/pet.js';
import { PET } from '../config.js';

/** replaceChildren without the «null» text a conditional child would leave (h() skips them, replaceChildren does not). */
const fill = (el, ...children) => el.replaceChildren(...children.filter(Boolean));
const focusHeading = node => { const t = node.querySelector('h2'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } };

export function primerScreen(app, { deck = null, card = null, check = false, from = 'home' } = {}) {
  const d = deck ? PRIMER_BY_ID[deck] : null;
  if (d && check) return checkView(app, d, from);
  if (d) return deckView(app, d, card, from);
  return listView(app, from);
}

/** 5.16: a young or grown Firebird reads its book here (the pose of the illustrations); before that Мио explains. */
function reader(p, pet = true) {
  const stage = PET.stages[petStageIndex(trainingDays(p))].id;
  return pet && ['young', 'firebird'].includes(stage)
    ? h('span', { class: 'pet-art', 'aria-hidden': 'true' }, firebird(stage, 'fed', 72, { items: wornItems(p, stage), pose: 'read' }))
    : mioAvatar('support', 56);
}

function listView(app, from) {
  const p = app.profile;
  const topics = PRIMER.map(d => {
    const g = deckProgress(p, d.id);
    const status = g.best === null ? (g.studied ? 'Можно проверить себя' : 'Проверка — после всех карточек')
      : `Проверка: ${g.best} из ${g.total}${g.best === g.total ? ' — всё верно' : ''}`;
    return h('section', { class: `card primer-topic ${g.studied ? 'studied' : ''}` },
      h('div', { class: 'card-head' }, h('h2', {}, d.title), h('span', { class: 'pill' }, `${g.seen.length}/${d.cards.length}`)),
      h('p', { class: 'note' }, `Прочитано: ${g.seen.length} из ${d.cards.length}. ${status}.`),
      h('div', { class: 'row-actions' },
        h('button', { class: `btn ${g.studied ? 'ghost' : 'primary'}`, onclick: () => app.go('primer', { deck: d.id, from }) }, g.seen.length ? (g.studied ? 'Перечитать' : 'Продолжить') : 'Читать'),
        g.studied ? h('button', { class: `btn ${g.best === g.total ? 'ghost' : 'primary'}`, onclick: () => app.go('primer', { deck: d.id, check: true, from }) }, g.best === null ? 'Проверить себя' : 'Пройти ещё раз') : null));
  });
  const prize = PET_ITEMS.find(i => i.achievement === 'primer');
  const won = !!p.achievements.primer;
  return {
    node: h('div', { class: 'screen primer' },
      topBar('Азбука протеза', () => app.go(from)),
      h('main', { class: 'scroll' },
        h('section', { class: 'card faq-intro' }, reader(p, withPet(app.settings)),
          h('p', {}, 'Короткие карточки о жизни с протезом. Переверните карточку касанием, а в конце темы проверьте себя — без времени и без оценок. Вопрос о здоровье — к врачу или протезисту.')),
        ...topics,
        // 6.3.3: without the bird (answer 10 of the experts) the prize is the achievement itself
        withPet(app.settings)
          ? h('p', { class: 'note primer-prize' }, won ? achievementArt('primer', true, 28) : giftArt(prize.id, 28),
            won ? `«${ACHIEVEMENTS.find(a => a.id === 'primer').name}»: подарок «${prize.name}» — в гнезде.` : `Все проверки верно — подарок Жар-птице: «${prize.name}».`)
          : h('p', { class: 'note primer-prize' }, achievementArt('primer', won, 28),
            won ? `Достижение «${ACHIEVEMENTS.find(a => a.id === 'primer').name}» получено.` : `Все проверки верно — достижение «${ACHIEVEMENTS.find(a => a.id === 'primer').name}».`))),
  };
}

function deckView(app, d, start, from) {
  const p = app.profile;
  let i = Number.isInteger(start) && start >= 0 && start < d.cards.length ? start : resumeIndex(p, d.id);
  const flipped = new Set(); // turned this visit: a card comes back as it was left (the sample's rule)
  const body = h('div', { class: 'primer-deck' });
  const back = h('button', { class: 'btn ghost' }, 'Назад');
  const next = h('button', { class: 'btn primary big' });
  // A new card is built on «Дальше» / «Назад» (focus stays on the pressed button, the card is said by the status line);
  // turning a card changes it in place, so focus stays on the card itself — no ring forced by a script focus (5.15).
  const status = h('p', { class: 'sr-only', role: 'status' });
  let face, hint, card, answer, dots, read;
  const paint = () => {
    const c = d.cards[i], open = flipped.has(c.id), g = deckProgress(p, d.id);
    face.setAttribute('aria-expanded', String(open));
    hint.textContent = open ? 'Нажмите, чтобы закрыть ответ' : 'Нажмите, чтобы перевернуть';
    card.classList.toggle('flipped', open);
    fill(answer, open ? h('p', {}, c.back()) : null);
    dots.forEach((dot, k) => dot.classList.toggle('seen', g.seen.includes(d.cards[k].id)));
    read.textContent = `Прочитано ${g.seen.length} из ${d.cards.length}`;
    next.textContent = i < d.cards.length - 1 ? 'Дальше' : g.studied ? 'Проверить себя' : 'К темам';
  };
  const render = ({ announce = true } = {}) => {
    const c = d.cards[i];
    hint = h('small');
    face = h('button', { class: 'flash-face', 'aria-controls': `card-${c.id}`, onclick: () => flip() },
      h('span', { class: 'eyebrow' }, `Карточка ${i + 1} из ${d.cards.length}`), h('b', { class: 'flash-front' }, c.front), hint);
    answer = h('div', { class: 'flash-back', id: `card-${c.id}`, 'aria-live': 'polite' });
    // The card: the question is the button, the answer opens under it inside the same card (announced politely).
    card = h('div', { class: 'flashcard' }, face, answer);
    dots = d.cards.map((x, k) => h('i', { class: k === i ? 'on' : '' }));
    read = h('p', { class: 'note' });
    fill(body, h('h2', { class: 'sr-only' }, d.title), card, h('div', { class: 'dots', 'aria-hidden': 'true' }, ...dots), read, status);
    back.disabled = i === 0;
    paint();
    if (announce) status.textContent = `Карточка ${i + 1} из ${d.cards.length}: ${c.front}`;
  };
  const flip = () => {
    const c = d.cards[i];
    if (flipped.has(c.id)) { flipped.delete(c.id); paint(); return; }
    flipped.add(c.id);
    const studied = markSeen(p, d.id, c.id);
    app.save();
    paint();
    if (studied) toast('Тема прочитана — можно проверить себя', 'good');
  };
  back.onclick = () => { if (i > 0) { i--; render(); } };
  next.onclick = () => {
    if (i < d.cards.length - 1) { i++; render(); return; }
    app.go('primer', checkOpen(p, d.id) ? { deck: d.id, check: true, from } : { from });
  };
  render({ announce: false });
  return {
    node: h('div', { class: 'screen primer' },
      topBar(d.title, () => app.go('primer', { from })),
      h('main', { class: 'scroll center' }, body, h('div', { class: 'sticky-actions' }, next, h('div', { class: 'row-actions' }, back)))),
  };
}

function checkView(app, d, from) {
  const p = app.profile;
  if (!checkOpen(p, d.id)) {
    return {
      node: h('div', { class: 'screen primer' },
        topBar(`Проверка: ${d.title}`, () => app.go('primer', { from })),
        h('main', { class: 'scroll center' }, h('section', { class: 'card' }, h('h2', {}, 'Сначала карточки'),
          h('p', {}, 'Проверка откроется, когда вы прочитаете все карточки темы.'),
          h('button', { class: 'btn primary', onclick: () => app.go('primer', { deck: d.id, from }) }, 'Читать')))),
    };
  }
  const qs = d.check();
  const answers = [];
  let qi = 0;
  const body = h('div', { class: 'primer-check' });
  const next = h('button', { class: 'btn primary big' });
  const actions = h('div', { class: 'sticky-actions' }, next);
  const render = () => {
    const q = qs[qi], chosen = answers[qi];
    const done = chosen !== undefined;
    fill(body, 
      h('p', { class: 'eyebrow' }, `Вопрос ${qi + 1} из ${qs.length}`),
      h('h2', {}, q.q),
      h('div', { class: 'primer-options', role: 'group', 'aria-label': 'Варианты ответа' }, ...q.options.map((text, k) => h('button', {
        class: `btn ghost option ${done && k === q.answer ? 'right' : ''} ${done && k === chosen && k !== q.answer ? 'wrong' : ''}`,
        'aria-disabled': done ? 'true' : null, 'aria-pressed': done ? String(k === chosen) : null,
        onclick: () => { if (answers[qi] !== undefined) return; answers[qi] = k; render(); body.querySelector('.primer-why')?.focus({ preventScroll: true }); },
      }, text))),
      done ? h('div', { class: `card primer-why ${chosen === q.answer ? 'tinted' : ''}`, role: 'status', tabindex: '-1' },
        h('b', { class: 'with-art' }, badgeArt(chosen === q.answer ? 'done' : 'book', 24), chosen === q.answer ? 'Верно' : `Правильный ответ: ${q.options[q.answer]}`),
        h('p', {}, q.why)) : null);
    actions.hidden = !done; // nothing to press before an answer: no empty bar
    next.textContent = qi < qs.length - 1 ? 'Следующий вопрос' : 'Итог';
  };
  const finish = () => {
    const before = deckProgress(p, d.id).best;
    const r = recordCheck(p, d.id, answers, dayKey());
    const fresh = unlockAchievements(p, null, {}, dayKey());
    app.save();
    for (const id of fresh) {
      const gift = PET_ITEMS.find(x => x.achievement === id);
      toast(`Достижение: ${ACHIEVEMENTS.find(a => a.id === id).name}${gift ? ` · подарок «${gift.name}»` : ''}`, 'good');
    }
    const g = deckProgress(p, d.id);
    fill(body, 
      h('p', { class: 'eyebrow' }, d.title),
      h('h2', {}, `Верно: ${r.correct} из ${r.total}`),
      h('ul', { class: 'primer-summary' }, ...qs.map((q, k) => h('li', { class: r.perQuestion[k] ? 'right' : 'wrong' },
        badgeArt(r.perQuestion[k] ? 'done' : 'book', 20), h('span', {}, q.q, h('span', { class: 'sr-only' }, r.perQuestion[k] ? ' — верно' : ` — правильно: ${q.options[q.answer]}`))))),
      h('p', { class: 'note' }, r.correct === r.total ? 'Отлично: эту тему вы знаете.'
        : `Лучший результат: ${g.best} из ${g.total}. Перечитайте карточки — и попробуйте ещё раз, когда захотите.`),
      before !== null && r.correct < before ? h('p', { class: 'note' }, 'Лучший результат сохранён — пересдача его не снижает.') : null,
      // In the page, not in the sticky bar: three buttons at 200 % text took most of a small screen (linter, 5.15).
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => app.go('primer', { deck: d.id, check: true, from }) }, 'Пройти ещё раз'),
        h('button', { class: 'btn ghost', onclick: () => app.go('primer', { deck: d.id, card: 0, from }) }, 'Перечитать')));
    fill(actions, h('button', { class: 'btn primary big', onclick: () => app.go('primer', { from }) }, 'К темам'));
    actions.hidden = false;
    focusHeading(body);
  };
  next.onclick = () => {
    if (answers[qi] === undefined) return;
    if (qi < qs.length - 1) { qi++; render(); focusHeading(body); return; }
    finish();
  };
  render();
  return {
    node: h('div', { class: 'screen primer' },
      topBar(`Проверка: ${d.title}`, () => app.go('primer', { from })),
      h('main', { class: 'scroll' }, body, actions)),
  };
}
