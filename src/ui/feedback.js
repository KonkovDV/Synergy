// «Отзыв о тестировании» (6.0; task of 28.10: «возможность собрать обратную связь от пользователей по итогам тестирования»).
// SUS, the raw NASA-TLX (four subscales) and three questions of the game, a free text; kept on the device, exported by the
// person as JSON or CSV (core/survey.js). Menus are for the sound hand: plain buttons, no swipes, no timers.
import { h, toast } from './dom.js';
import { topBar, segmented, sliderRow } from './widgets.js';
import { sectionArt } from './art.js';
import { SUS_ITEMS, TLX_ITEMS, GAME_ITEMS, SURVEY_TEXT_MAX, susScore, tlxScore, cleanSurvey, surveyRows } from '../core/survey.js';
import { csvTable, download } from '../services/report.js';
import { APP } from '../config.js';

const LIKERT = [{ value: 1, label: '1', sub: 'нет' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 5, label: '5', sub: 'да' }];

export function feedbackScreen(app, { from = 'settings' } = {}) {
  const draft = { sus: SUS_ITEMS.map(() => null), tlx: Object.fromEntries(TLX_ITEMS.map(t => [t.id, null])), game: Object.fromEntries(GAME_ITEMS.map(t => [t.id, null])), text: '' };
  const list = () => app.profile.feedback ?? [];
  const text = h('textarea', { id: 'fb-text', rows: 4, maxlength: SURVEY_TEXT_MAX, placeholder: 'Что мешало, что понравилось, что добавить', oninput: e => { draft.text = e.target.value; } });
  const saved = h('p', { class: 'note', role: 'status' }, list().length ? `Сохранено отзывов: ${list().length}.` : '');
  const save = () => {
    const entry = cleanSurvey({ ...draft, at: new Date().toISOString(), scheme: app.settings.scheme, version: APP.version });
    if (!entry) { toast('Ответьте хотя бы на один вопрос', 'bad'); return; }
    app.profile.feedback = [...list(), entry].slice(-30);
    app.save();
    const sus = susScore(entry.sus);
    toast(`Спасибо! Отзыв сохранён${sus !== null ? `, SUS ${sus}` : ''}`, 'good');
    app.go(from);
  };
  const exportJson = () => download(`synergy-feedback-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: APP.name, version: APP.version, feedback: list() }, null, 2), 'application/json');
  const exportCsv = () => download(`synergy-feedback-${new Date().toISOString().slice(0, 10)}.csv`, csvTable(surveyRows(list())), 'text/csv');
  const last = list().at(-1);
  return {
    node: h('div', { class: 'screen feedback' },
      topBar('Отзыв о тестировании', () => app.go(from)),
      h('main', { class: 'scroll' },
        h('section', { class: 'card' }, h('h2', { class: 'with-art' }, sectionArt('report', 32), 'Как вам игра?'),
          h('p', {}, 'Три коротких части, около трёх минут. Ответы остаются на этом устройстве; файл для команды или специалиста вы сохраняете сами.'),
          last ? h('p', { class: 'note' }, `Прошлый отзыв: ${new Date(last.at).toLocaleDateString('ru-RU')}${susScore(last.sus) !== null ? ` · SUS ${susScore(last.sus)}` : ''}${tlxScore(last.tlx) !== null ? ` · нагрузка ${tlxScore(last.tlx)} из 10` : ''}`) : null),
        h('section', { class: 'card' }, h('h2', {}, 'Удобство (SUS)'), h('p', { class: 'note' }, '1 — совсем не согласен, 5 — полностью согласен.'),
          ...SUS_ITEMS.map((q, i) => h('div', { class: 'survey-item' }, h('p', {}, `${i + 1}. ${q}`), segmented(LIKERT, null, v => { draft.sus[i] = v; }, q)))),
        h('section', { class: 'card' }, h('h2', {}, 'Нагрузка (NASA-TLX)'), h('p', { class: 'note' }, '0 — очень низкая, 10 — очень высокая. Передвиньте ползунок, чтобы ответить; нетронутый не считается.'),
          ...TLX_ITEMS.map(t => sliderRow(t.text, { min: 0, max: 10, step: 1, value: 5, format: v => `${v} из 10`, onInput: v => { draft.tlx[t.id] = v; } }))),
        h('section', { class: 'card' }, h('h2', {}, 'Об игре'),
          ...GAME_ITEMS.map(t => h('div', { class: 'survey-item' }, h('p', {}, t.text), segmented(LIKERT, null, v => { draft.game[t.id] = v; }, t.text))),
          h('label', { class: 'field', for: 'fb-text' }, h('span', {}, 'Свободный отзыв'), text)),
        h('div', { class: 'row-actions col' },
          h('button', { class: 'btn primary big', onclick: save }, 'Сохранить отзыв'),
          h('button', { class: 'btn ghost', disabled: !list().length, onclick: exportJson }, 'Сохранить отзывы — JSON'),
          h('button', { class: 'btn ghost', disabled: !list().length, onclick: exportCsv }, 'Сохранить отзывы — CSV')),
        saved,
        h('p', { class: 'note' }, 'SUS и NASA-TLX — стандартные опросники удобства и нагрузки. Это мнение пользователя, а не клиническая шкала.'))),
  };
}
