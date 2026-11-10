// The Firebird you can touch (5.13 on the home card; 5.14 shared with the nest): a button with the drawing and a
// bubble with its words. A touch makes it answer in turn (core/pet.js petTap) with a small hop or wave; the bubble is
// announced politely. Asleep on a rest day it only stirs.
import { h } from './dom.js';
import { firebird } from './art.js';
import { petTap } from '../core/pet.js';

/** 5.16: the pose of the illustrations for the day's event — back after a break it waves; a stage, a goal, the whole plan — it holds up a star. */
const DAY_POSE = { back: 'wave', grew: 'star', goal: 'star', plan: 'star' };

/**
 * @param app the app (its `petTaps` counter keeps the answers in turn across screens)
 * @param pet `petState()` of today
 * @returns {{ button: HTMLButtonElement, say: HTMLElement, bird: SVGElement }}
 */
export function touchableBird(app, pet, { name, size = 104, items = {}, cls = 'pet-art' } = {}) {
  const bird = firebird(pet.stage.id, pet.mood, size, { items, alive: true, pose: DAY_POSE[pet.reason] ?? null });
  const say = h('p', { class: 'pet-say', 'aria-live': 'polite' }, pet.line);
  const touch = () => {
    const reply = petTap(pet, ++app.petTaps);
    say.textContent = reply.line;
    bird.classList.remove(...[...bird.classList].filter(c => c.startsWith('anim-')), 'alive');
    void bird.getBoundingClientRect(); // restart the one-shot animation on every touch
    bird.classList.add(`anim-${reply.animation}`);
  };
  const button = h('button', { class: cls, 'aria-label': `Погладить Жар-птицу ${name}`, onclick: touch }, bird);
  return { button, say, bird };
}
