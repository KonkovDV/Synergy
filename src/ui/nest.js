// The nest — the Firebird's own section (5.14). In the team's sample the pet is the hero of its screen, not a card
// among others; here the bird gets the bottom bar's second place: its scene, its character, the path it has grown,
// what it wears and the gifts the training earned. Progress keeps the skills and the report (it had grown to ten
// phone screens). Ethics of 5.12 stay: growth only from training days, nothing decays, no currency and no shop.
import { fmtDay, count, FORMS } from '../core/format.js';
import { h } from './dom.js';
import { firebird, badgeArt, trails, achievementArt, giftArt, skinArt, sectionArt } from './art.js';
import { artBackground } from './pictures.js';
import { touchableBird } from './petcard.js';
import { bottomNav, segmented } from './widgets.js';
import { petState, petStageIndex, petName, PET_SLOTS, PET_ITEMS, itemUnlocked, slotOpen, wornItems, equipItem } from '../core/pet.js';
import { PET } from '../config.js';
import { trainingDays, dayKey, ACHIEVEMENTS, SKINS, skinUnlocked, daysSinceTraining } from '../core/progress.js';
import { drawHand } from '../render/draw.js';
import { COMMAND_POSE } from '../core/vocabulary.js';

function hiDpiCanvas(w, hgt, cls) {
  const canvas = h('canvas', { class: cls, width: w * 2, height: hgt * 2, style: { width: `${w}px`, height: `${hgt}px` } });
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  return { canvas, ctx };
}

const GIFT_BY_ACHIEVEMENT = Object.fromEntries(PET_ITEMS.map(i => [i.achievement, i]));

export function nestScreen(app) {
  if (!app.profile.onboarded) { queueMicrotask(() => app.go('onboarding')); return { node: h('div') }; }
  const p = app.profile, s = app.settings, today = dayKey();
  const name = petName(s);
  const days = trainingDays(p);
  const resting = app.checkin()?.action === 'stop' && app.checkin()?.reason !== 'skin';
  const pet = petState(days, { trainedToday: (p.days[today]?.runs ?? 0) > 0, restToday: resting, name,
    planDone: !!(p.plan?.day === today && p.plan.rewarded), goalDone: !!p.days[today]?.goal, daysSince: daysSinceTraining(p, today) });
  const worn = wornItems(p, pet.stage.id);
  const { button, say } = touchableBird(app, pet, { name, size: 196, items: worn, cls: 'pet-art nest-bird' });

  // The scene: a dark brand cover with the light trails, a warm aura whose strength is the way to the next stage (the
  // sample's level glow, PhoenixView) — it never fades back: a rest day changes the words, not the light.
  const aura = 0.3 + 0.6 * (pet.next ? pet.progress : 1);
  // 5.16: the bird stands on the rug of its room (bg-nest-room) — a light scene under the dark cover's words.
  const room = artBackground('bg-nest-room');
  const hero = h('section', { class: 'nest-hero', 'data-tour': 'nest.bird', style: { '--aura': aura.toFixed(2) } }, trails(),
    h('div', { class: `nest-stage${room ? ' room' : ''}`, style: room ? { '--room': room } : null },
      h('div', { class: 'nest-aura', 'aria-hidden': 'true' }),
      button),
    h('div', { class: 'nest-info' },
      h('p', { class: 'eyebrow' }, pet.stage.name),
      h('h1', {}, h('span', { class: 'sr-only' }, 'Жар-птица '), name),
      h('p', { class: 'nest-character' }, pet.stage.character),
      pet.next ? h('div', { class: 'pet-progress' },
        h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Рост до стадии «${pet.next.name}»`, 'aria-valuenow': Math.round(pet.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.round(pet.progress * 100)}%` } })),
        h('small', {}, `${pet.next.name} — через ${count(pet.left, FORMS.days)} с тренировкой`)) : h('small', {}, 'Выросла! Свет не гаснет и в дни отдыха.'),
      say));

  // The path it has grown (5.12): passed stages, the current one, the next ones as a promise in words.
  const now = petStageIndex(days);
  const path = h('section', { class: 'card', 'data-tour': 'nest.path' }, h('h2', {}, 'Путь роста'),
    h('ol', { class: 'pet-path' }, ...PET.stages.map((st, i) => {
      const state = i < now ? 'done' : i === now ? 'now' : 'next';
      const note = { done: 'Пройдено', now: 'Сейчас' }[state] ?? `Через ${count(st.from - days, FORMS.days)} с тренировкой`;
      return h('li', { class: state }, h('span', { class: 'pet-node' }, firebird(st.id, 'waiting', 48)), h('div', {}, h('b', {}, st.name), h('small', {}, note)));
    })),
    h('p', { class: 'note' }, `Растёт от дней с тренировкой: сейчас ${count(days, FORMS.days)}. День отдыха и пропуск рост не отнимают.`));

  // What it wears (5.13): one choice per open slot among the earned items; the rest says which achievement brings it.
  const outfit = h('section', { class: 'card outfit', 'data-tour': 'nest.outfit' }, h('h2', { class: 'with-art' }, sectionArt('gift', 32), 'Наряды'),
    ...PET_SLOTS.map(slot => {
      const earned = PET_ITEMS.filter(i => i.slot === slot.id && itemUnlocked(p, i));
      const from = PET.stages.find(st => st.id === slot.from)?.name;
      return h('div', { class: 'outfit-slot' }, h('p', { class: 'outfit-label' }, slot.name),
        !slotOpen(slot.id, pet.stage.id) ? h('p', { class: 'note' }, `Откроется на стадии «${from}».${earned.length ? ` Уже ждёт: ${earned.map(i => i.name).join(', ')}.` : ''}`)
          : earned.length ? segmented([{ value: '', label: 'Без' }, ...earned.map(i => ({ value: i.id, label: i.name, art: () => giftArt(i.id, 36) }))], p.pet?.[slot.id] ?? '',
            v => { equipItem(p, slot.id, v || null); app.save(); app.go('nest'); }, `Наряд: ${slot.name.toLowerCase()}`)
            : h('p', { class: 'note' }, 'Пока пусто — подарки приходят за достижения.'));
    }));

  // Gifts and achievements as a collection (the sample's album): what is earned shows its date and its gift; what is
  // not yet earned says how — a promise in words, never a lock that blames.
  const got = ACHIEVEMENTS.filter(a => p.achievements[a.id]).length;
  const gifts = h('section', { class: 'card', 'data-tour': 'nest.gifts' },
    h('div', { class: 'card-head' }, h('h2', { class: 'with-art' }, sectionArt('gifts', 32), 'Достижения и подарки'), h('span', { class: 'pill with-pic' }, sectionArt('medal', 18), `${got}/${ACHIEVEMENTS.length}`)),
    h('ul', { class: 'badges collection' }, ...ACHIEVEMENTS.map(a => {
      const at = p.achievements[a.id], gift = GIFT_BY_ACHIEVEMENT[a.id];
      return h('li', { class: `badge ${at ? 'on' : ''}` },
        achievementArt(a.id, !!at, 48), h('b', {}, a.name),
        h('small', {}, at ? `Получено ${fmtDay(`${at}T12:00:00`)}` : a.text),
        gift ? h('small', { class: 'gift' }, giftArt(gift.id, 22), `${at ? 'Подарок' : 'Подарит'}: ${gift.name}`) : null,
        h('span', { class: 'sr-only' }, at ? ' — получено.' : ' — пока нет.'));
    })));

  // The look of the game hand (from Progress, 5.14): another reward of practice, by level or by a week of training.
  const skins = h('section', { class: 'card' }, h('h2', { class: 'with-art' }, sectionArt('palette', 32), 'Облик протеза в играх'),
    h('div', { class: 'skins' }, ...SKINS.map(sk => {
      const open = skinUnlocked(p, sk);
      // 5.16: the team's picture of the hand in this look; the drawn game hand stands in for a missing one.
      const look = skinArt(sk.id, 56) ?? (() => {
        const { canvas, ctx } = hiDpiCanvas(56, 56, 'skin-icon');
        drawHand(ctx, { x: 28, y: 50, size: 22, pose: COMMAND_POSE.open, skin: sk.id, sleeve: false });
        return canvas;
      })();
      return h('button', { class: `skin ${p.skin === sk.id ? 'active' : ''}`, disabled: !open, 'aria-pressed': String(p.skin === sk.id),
        'aria-label': open ? `Облик «${sk.name}»` : `Облик «${sk.name}» — откроется ${sk.level ? `на уровне ${sk.level}` : 'за 7 дней подряд'}`,
        onclick: () => { p.skin = sk.id; app.save(); app.go('nest'); } },
        look, h('small', { 'aria-hidden': 'true' }, open ? sk.name : sk.level ? `ур. ${sk.level}` : '7 дней'));
    })));

  const restNote = resting ? h('p', { class: 'note' }, badgeArt('moon', 20), ' Сегодня день отдыха — птица отдыхает вместе с вами.') : null;
  return { node: h('div', { class: 'screen nest' }, h('main', { class: 'scroll' }, hero, restNote, path, outfit, gifts, skins), bottomNav(app, 'nest')) };
}
