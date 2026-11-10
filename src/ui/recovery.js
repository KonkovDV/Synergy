// Recovery (5.10): shown only when even the home screen cannot be built from the stored data. Until then a damaged
// or crafted state left a blank page on every launch, with no way to reach the settings.
import { h, toast } from './dom.js';
import { download } from '../services/report.js';
import { dayKey } from '../core/progress.js';

export function recoveryScreen(app, { error }) {
  return {
    node: h('div', { class: 'screen recovery' },
      h('main', { class: 'scroll center' },
        h('h1', {}, 'Данные не читаются'),
        h('p', {}, 'Главный экран не открылся: сохранённые данные повреждены или от другой версии.'),
        h('p', { class: 'note' }, `Подробность для разработчика: ${String(error?.message ?? error).slice(0, 160)}`),
        h('div', { class: 'row-actions col' },
          h('button', { class: 'btn primary big', onclick: () => download(`synergy-backup-${dayKey()}.json`, app.exportBackup(), 'application/json') }, 'Сохранить копию данных'),
          h('button', { class: 'btn ghost', onclick: () => { app.resetProgress(); toast('Начали заново. Прежние данные — в копии и в «Вернуть данные до сброса»'); app.go('onboarding'); } }, 'Начать заново (копия останется)')))),
  };
}
