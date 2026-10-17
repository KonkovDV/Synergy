// Settings (control scheme, signal source, sensitivity, training habits, data) and the calibration wizard.
import { h, toast } from './dom.js';
import { bottomNav, topBar, segmented, sliderRow, toggleRow, signalMeter } from './widgets.js';
import { SCHEME_INFO } from '../core/vocabulary.js';
import { CalibrationRecorder } from '../core/calibration.js';
import { defaultCalibration } from '../core/signal.js';
import { download, reminderIcs } from '../services/report.js';
import { createTwoChannelPads } from '../input/controls.js';
import { APP } from '../config.js';

const pct = v => `${Math.round(v * 100)}%`;

export function settingsScreen(app) {
  const s = app.settings;
  const meter = signalMeter(app);
  const status = h('small', { class: 'bridge-status' }, app.bridge ? `Статус: ${app.bridge.status}` : '');
  const urlInput = h('input', { type: 'url', value: s.wsUrl, placeholder: 'ws://192.168.0.10:8765', 'aria-label': 'Адрес WebSocket' });
  const bridgeBox = h('div', { class: 'bridge-box', hidden: s.source !== 'bridge' },
    h('label', { class: 'row' }, h('span', {}, 'WebSocket эмулятора'), urlInput),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: () => { app.updateSettings({ wsUrl: urlInput.value.trim() }); toast('Подключаемся…'); } }, 'Подключить'),
      h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка')),
    status,
    h('p', { class: 'note' }, 'Также принимаются кадры через window.postMessage({type:"synergy-frame", a, b}) и window.Synergy.feed(frame). Формат — docs/INTEGRATION.md.'));

  const section = (title, ...children) => h('section', { class: 'card' }, h('h2', {}, title), ...children);
  const preview = { pipeline: app.createPipeline(), source: app.signalSource() };
  const refreshPreview = () => { preview.pipeline = app.createPipeline(); preview.source = app.signalSource(); };

  const node = h('div', { class: 'screen settings' },
    h('main', { class: 'scroll' },
      h('h1', {}, 'Настройки'),
      section('Управление',
        segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { app.updateSettings({ scheme: v }); refreshPreview(); app.go('settings'); }),
        h('p', { class: 'note' }, SCHEME_INFO[s.scheme].text),
        h('label', { class: 'row' }, h('span', {}, 'Протез'),
          segmented([{ value: 'right', label: 'Правая рука' }, { value: 'left', label: 'Левая рука' }], s.side, v => app.updateSettings({ side: v })))),
      section('Источник сигнала',
        segmented([{ value: 'touch', label: 'Эмулятор на экране', sub: 'без датчиков' }, { value: 'bridge', label: 'Внешний', sub: 'эмулятор / протез' }], s.source, v => {
          app.updateSettings({ source: v }); bridgeBox.hidden = v !== 'bridge'; refreshPreview();
        }),
        bridgeBox,
        sliderRow('Реалистичность эмулятора', { min: 0, max: 1, step: 0.05, value: s.realism, format: v => v < 0.2 ? 'чистый сигнал' : v < 0.7 ? 'как у датчика' : 'шумно', onInput: v => app.updateSettings({ realism: v }) })),
      section('Чувствительность',
        sliderRow('Порог включения канала', { min: 0.1, max: 0.45, step: 0.01, value: s.sensitivity, format: pct, onInput: v => { app.updateSettings({ sensitivity: v }); refreshPreview(); } }),
        sliderRow('Порог коактивации (A+B)', { min: 0.25, max: 0.7, step: 0.01, value: s.coThreshold, format: pct, onInput: v => { app.updateSettings({ coThreshold: v }); refreshPreview(); } }),
        h('p', { class: 'note' }, 'Проверка вживую — напрягите мышцы или используйте площадки ниже:'),
        meter.node,
        s.source === 'touch' && s.scheme !== 'gesture' ? createTwoChannelPads(app.emulator) : null,
        h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков')),
      section('Привычка',
        sliderRow('Цель: дней в неделю', { min: 2, max: 7, step: 1, value: s.weeklyGoal, format: v => String(v), onInput: v => app.updateSettings({ weeklyGoal: v }) }),
        h('label', { class: 'row' }, h('span', {}, 'Напоминание'),
          h('input', { type: 'time', value: s.reminder, onchange: e => app.updateSettings({ reminder: e.target.value }) })),
        h('button', { class: 'btn ghost', onclick: () => download('synergy-reminder.ics', reminderIcs(s.reminder), 'text/calendar') }, 'Добавить в календарь (.ics)'),
        h('label', { class: 'row' }, h('span', {}, 'Имя'), h('input', { type: 'text', value: s.name, maxlength: 24, onchange: e => app.updateSettings({ name: e.target.value.trim() }) })),
        toggleRow('Звук', s.sound, v => app.updateSettings({ sound: v })),
        toggleRow('Вибрация', s.haptics, v => app.updateSettings({ haptics: v })),
        toggleRow('Полоски сигнала в игре', s.showMeters, v => app.updateSettings({ showMeters: v }), 'мышечная обратная связь рядом с игровой')),
      section('Данные',
        h('p', { class: 'note' }, app.store.persisted ? 'Всё хранится только на этом устройстве. Без аккаунта и аналитики.' : 'Хранилище недоступно: результаты не сохранятся после закрытия.'),
        h('button', { class: 'btn danger', onclick: () => { if (confirm('Удалить весь прогресс на этом устройстве?')) { app.store.reset(); app.go('onboarding'); } } }, 'Сбросить прогресс')),
      section('О приложении',
        h('p', {}, `${APP.name} ${APP.version} — игра-тренажёр управления бионическим протезом по ЭМГ (2 канала: пороговый и пропорциональный режимы; 7 жестов).`),
        h('p', { class: 'note warn' }, 'Не медицинское изделие. Не заменяет занятия с реабилитологом. При боли или усталости — остановитесь.'),
        h('p', { class: 'note' }, 'Код создан командой с помощью ИИ-ассистента; что именно и как проверено — docs/AI_USAGE.md.'))),
    bottomNav(app, 'settings'));

  return {
    node,
    tick(now) { meter.update(preview.pipeline.process(preview.source?.sample(now) ?? null, now)); },
    onBridgeStatus(st) { status.textContent = `Статус: ${st}`; },
  };
}

export function calibrationScreen(app) {
  const kind = app.sourceKind();
  let recorder = new CalibrationRecorder();
  const title = h('h2', {}), text = h('p', {}), ring = h('div', { class: 'cal-ring' });
  const meter = signalMeter(app);
  const result = h('div', { class: 'cal-result' });
  const pipeline = app.createPipeline();
  const source = app.signalSource();
  const node = h('div', { class: 'screen calibration' },
    topBar('Калибровка', () => app.go('settings')),
    h('main', { class: 'scroll center' },
      h('p', { class: 'note' }, kind === 'touch'
        ? 'Сейчас источник — эмулятор на экране: калибровка покажет процесс, а результат для эмулятора не нужен. Подключите внешний источник для настоящей калибровки.'
        : 'Как «чувствительность датчиков» в приложении протеза: определяем покой и комфортное напряжение каждого канала.'),
      ring, title, text, meter.node, result,
      kind === 'touch' ? createTwoChannelPads(app.emulator) : null,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => { recorder = new CalibrationRecorder(); result.replaceChildren(); } }, 'Заново'),
        h('button', { class: 'btn ghost', onclick: () => { app.state.calibrations[kind] = defaultCalibration(); app.save(); toast('Калибровка сброшена'); } }, 'Сбросить'))));
  let finished = false;
  return {
    node,
    tick(now, dt) {
      const frame = source?.sample(now) ?? null;
      meter.update(pipeline.process(frame, now));
      if (finished && recorder.done) return;
      recorder.push(frame, dt);
      const step = recorder.step;
      if (step) {
        finished = false;
        if (title.textContent !== step.title) { title.textContent = step.title; text.textContent = step.text; }
        ring.style.setProperty('--p', String(recorder.stepProgress));
        ring.dataset.step = step.id;
      } else if (!finished) {
        finished = true;
        const r = recorder.result();
        title.textContent = r.issues.length ? 'Есть замечания' : 'Готово';
        text.textContent = `Разделение каналов: A ${Math.round(r.separation[0] * 100)}%, B ${Math.round(r.separation[1] * 100)}%.`;
        result.replaceChildren(...r.issues.map(i => h('p', { class: 'note warn' }, i)),
          h('button', { class: 'btn primary big', onclick: () => { if (kind !== 'touch') { app.state.calibrations[kind] = r.calibration; app.save(); toast('Калибровка сохранена', 'good'); } app.go('settings'); } }, kind === 'touch' ? 'Понятно' : 'Сохранить'));
      }
    },
  };
}
