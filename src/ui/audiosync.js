// «Синхронизация звука» (PLAN B.2, 5.11): the player moves the click until it matches a dot reaching the line.
// Bluetooth headphones add 100–300 ms that `outputLatency` may not report; the music of «Ритм» then lags the notes.
// Nudging by buttons instead of tapping in time: no motor timing is needed (tremor, one hand) and touch latency
// does not mix into the result. The clicks go through the same scheduler as the game (MusicPlayer + offsetClock).
import { h } from './dom.js';
import { topBar } from './widgets.js';
import { MusicPlayer, offsetClock, clickTrack } from '../core/music.js';
import { audioClock, playMusic, unlockAudio } from '../services/audio.js';
import { SETTINGS_RANGES } from '../config.js';

const PERIOD_S = 0.75; // 80 уд/мин — темп 3-го уровня «Ритма»
const R = SETTINGS_RANGES.audioOffsetMs;
export const fmtOffset = ms => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(ms)} мс`;

export function audioSyncScreen(app) {
  const s = app.settings;
  let offset = s.audioOffsetMs ?? 0;
  const value = h('output', { class: 'sync-value', 'aria-live': 'polite' }, fmtOffset(offset));
  const dot = h('div', { class: 'sync-dot', 'aria-hidden': 'true' });
  const line = h('div', { class: 'sync-line', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'sync-stage', role: 'img', 'aria-label': 'Точка падает на линию в такт щелчкам' }, dot, line);
  let player = null, t0 = null;
  const restart = () => {
    player?.silence(audioClock()?.now ?? 0);
    player = s.sound ? new MusicPlayer(clickTrack(PERIOD_S, 400), { clock: offsetClock(audioClock, offset), play: playMusic }) : null;
    t0 = null;
  };
  const nudge = d => {
    offset = Math.max(R.min, Math.min(R.max, offset + d));
    value.textContent = fmtOffset(offset);
    app.updateSettings({ audioOffsetMs: offset });
    restart();
  };
  unlockAudio();
  restart();
  const node = h('div', { class: 'screen audiosync' },
    topBar('Синхронизация звука', () => app.go('settings')),
    h('main', { class: 'scroll' },
      h('p', {}, 'Нужна, если в «Ритме» удар звучит раньше или позже, чем нота доходит до линии. Чаще всего так бывает в Bluetooth-наушниках.'),
      s.sound ? null : h('p', { class: 'note warn' }, 'Звук выключен. Включите «Звук» в настройках, чтобы подстроить.'),
      stage,
      h('p', { class: 'note' }, 'Смотрите на точку и слушайте: щелчок должен звучать, когда точка касается линии.'),
      h('div', { class: 'row sync-row' }, h('span', {}, 'Поправка'), value),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', disabled: !s.sound, onclick: () => nudge(R.step) }, 'Щелчок опаздывает'),
        h('button', { class: 'btn ghost', disabled: !s.sound, onclick: () => nudge(-R.step) }, 'Щелчок спешит')),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', disabled: !s.sound, onclick: () => nudge(-offset) }, 'Сбросить'),
        h('button', { class: 'btn primary', onclick: () => app.go('settings') }, 'Готово')),
      h('p', { class: 'note' }, `Шаг ${R.step} мс, от ${fmtOffset(R.min)} до ${fmtOffset(R.max)}. Поправка нужна только для музыки «Ритма»: попадание в ноту она не меняет.`)));
  return {
    node,
    tick(now) {
      t0 ??= now;
      const gameTime = (now - t0) / 1000;
      player?.update(gameTime, 1, !document.hidden);
      // The dot reaches the line exactly on every click: a sawtooth with the click period.
      const phase = (gameTime % PERIOD_S) / PERIOD_S;
      dot.style.setProperty('--y', phase.toFixed(3));
      line.classList.toggle('hit', phase < 0.12 && !s.reduceMotion);
    },
    cleanup() { player?.silence(audioClock()?.now ?? 0); player = null; },
  };
}
