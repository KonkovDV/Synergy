// Coach «Мио» — rule-based feedback after each exercise (transparent expert rules, not an ML model).
// Instructions point to the effect in the game (external focus of attention), not to muscles.
import { SKILL_NAME } from '../core/vocabulary.js';

const ADVICE = {
  precision: {
    grip: 'Сожмите мягче и расслабьтесь, как только стрелка в зелёной зоне — протез удержит сам.',
    flight: 'Подводите птицу к кольцу заранее и плавно: важна высота, а не скорость.',
    rhythm: 'Следите за точками на ноте: одна — едва заметно, три — уверенно.',
    safe: 'Держите команду ровно, пока не заполнится круг.',
  },
  stability: {
    grip: 'Во время переноса ничего не делайте — любое напряжение меняет силу хвата.',
    flight: 'В «потоке» держите уровень ровно: представьте, что несёте полный стакан.',
  },
  separation: 'Когда работает один канал, второй должен отдыхать. Начните с половины силы — так легче не «задеть» соседний.',
  timing: 'Начинайте чуть раньше удара: сигналу нужно мгновение, чтобы дойти до протеза.',
  switching: 'Смена хвата: раскройте кисть до конца, отпустите и снова держите B (или коротко A+B — как настроено).',
  retention: 'Без подсказки результат ниже — это нормально: так проверяется, что навык остаётся с вами.',
};

const PRAISE = [
  'Отличная работа! Регулярность важнее длительности.',
  'Так держать — навык закрепляется именно повторениями.',
  'Навык закрепляется между занятиями — завтра будет легче.',
];

export function coachFeedback(gameId, result, history = []) {
  const entries = Object.entries(result.skills).filter(([k]) => k !== 'retention');
  const lines = [];
  const previous = history.filter(r => r.game === gameId && r.level === result.level).slice(-2, -1)[0];
  if (previous && result.score > previous.score + 4) lines.push(`Лучше, чем в прошлый раз: ${previous.score} → ${result.score}.`);
  if (entries.length) {
    const [weakest, value] = entries.sort((a, b) => a[1] - b[1])[0];
    if (value < 75) {
      const advice = ADVICE[weakest];
      lines.push(`${SKILL_NAME[weakest]} — ${value}. ${typeof advice === 'string' ? advice : advice?.[gameId] ?? ''}`.trim());
    }
  }
  if (result.retention) lines.push(ADVICE.retention);
  if (result.stars === 3 || !lines.length) lines.push(PRAISE[(result.score + history.length) % PRAISE.length]);
  // 5.17 (the sample marks every finished game positively): no stars is still a counted practice — said first.
  if (result.stars === 0) lines.unshift('Тренировка засчитана: опыт и день с тренировкой уже ваши.');
  return lines.slice(0, 2);
}

/**
 * Mio's mood after an exercise (an affective pedagogical agent: the advice stays text — text agents helped
 * learning more than narrated ones, Schroeder et al. 2013). Safety first: a stop advice always means rest.
 */
export function coachMood({ stars = 0, stopAdvice = null } = {}) {
  if (stopAdvice) return 'rest';
  return stars >= 2 ? 'joy' : 'support';
}

export const DAILY_TIPS = [
  'Сколько заниматься в неделю, обсудите с реабилитологом или протезистом. Устали — отдохните: день отдыха серию не прерывает.',
  'Если мышцы устали или появилась боль — остановитесь. Отдых тоже часть тренировки.',
  'Протез держит хват сам: научитесь расслабляться, не разжимая кисть.',
  'Испытание «без подсказки» показывает, что навык остаётся с вами, а не только с экраном.',
  'В протезах «Моторики» A+B — блокировка, а хват меняется повторным раскрытием раскрытой кисти. Как у вашего протеза — Настройки → «Смена хвата».',
  'Хрупкие предметы — лучшая тренировка точности: яйцо любит мягкость.',
  'Перед тренировкой проверьте калибровку: кожа, датчики и усталость меняют сигнал.',
  'После занятия с датчиками осмотрите кожу: покраснение, которое не проходит, — повод показать её протезисту.',
];
