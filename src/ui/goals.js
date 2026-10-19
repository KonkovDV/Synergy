// Goals from the Firebird (5.13, the sample's learning goals): the bird offers a few goals for the week from the
// player's skills; the player takes one or none. No deadline, no penalty: a goal can be dropped at any time.
import { h, toast } from './dom.js';
import { topBar } from './widgets.js';
import { firebird } from './art.js';
import { petName, petState, wornItems } from '../core/pet.js';
import { missionText, missionXp, takeMission, dropMission } from '../core/missions.js';
import { trainingDays, dayKey } from '../core/progress.js';
import { PLAN_CATALOG } from '../games/registry.js';

export function goalsScreen(app) {
  const p = app.profile, name = petName(app.settings), today = dayKey();
  const pet = petState(trainingDays(p), { trainedToday: (p.days[today]?.runs ?? 0) > 0, name });
  const progress = m => h('div', { class: 'xp-track', role: 'progressbar', 'aria-label': `Цель: ${missionText(m, PLAN_CATALOG).title}`, 'aria-valuenow': m.done, 'aria-valuemin': 0, 'aria-valuemax': m.target, 'aria-valuetext': `${m.done} из ${m.target}` },
    h('i', { style: { width: `${Math.round(100 * m.done / m.target)}%` } }));
  const card = (m, active) => {
    const t = missionText(m, PLAN_CATALOG);
    return h('section', { class: `card goal ${active ? 'active' : ''}` },
      active ? h('p', { class: 'eyebrow' }, 'Сейчас') : null,
      h(active ? 'h2' : 'h3', {}, t.title),
      h('p', { class: 'note' }, t.why),
      active ? progress(m) : null,
      h('small', {}, `${active ? `${m.done} из ${m.target} · ` : ''}награда +${missionXp(m)} XP`),
      active
        ? h('button', { class: 'btn ghost', onclick: () => { dropMission(p); app.save(); toast('Цель снята — можно выбрать другую'); app.go('goals'); } }, 'Отказаться от цели')
        : h('button', { class: 'btn primary', onclick: () => { if (takeMission(p, m, PLAN_CATALOG, today)) { app.save(); toast('Цель взята'); } app.go('goals'); } }, 'Взять цель'));
  };
  const offers = p.mission ? [] : app.missionOffers();
  return {
    node: h('div', { class: 'screen goals' },
      topBar('Цели', () => app.go('home')),
      h('main', { class: 'scroll' },
        h('section', { class: 'card goal-intro' },
          h('span', { class: 'pet-art', 'aria-hidden': 'true' }, firebird(pet.stage.id, pet.mood, 72, { items: wornItems(p, pet.stage.id) })),
          h('p', {}, `${name} предлагает цели на эту неделю — по вашим навыкам. Шаги отмечают сами упражнения. Срока нет: цель можно сменить или снять в любой момент.`)),
        p.mission ? card(p.mission, true) : null,
        p.mission ? h('p', { class: 'note' }, 'Новую цель можно взять, когда эта будет выполнена или снята.') : h('h2', {}, 'Цели недели'),
        ...offers.map(m => card(m, false)))),
  };
}
