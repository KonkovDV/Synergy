// Settings (control, signal source, sensitivity, training, accessibility, habit, data) and the calibration wizard.
// Child mode: the screen sits behind the parent PIN gate (ui/pin.js).
import { fmtPct, fmtFixed, count, FORMS } from '../core/format.js';
import { h, toast } from './dom.js';
import { bottomNav, topBar, segmented, sliderRow, toggleRow, signalMeter } from './widgets.js';
import { SCHEME_INFO } from '../core/vocabulary.js';
import { CalibrationRecorder } from '../core/calibration.js';
import { defaultCalibration } from '../core/signal.js';
import { download, reminderIcs } from '../services/report.js';
import { voiceAvailable } from '../services/voice.js';
import { bleSupported } from '../input/ble.js';
import { createTwoChannelPads } from './controls.js';
import { hashPin, validPin, pinGateScreen } from './pin.js';
import { dayKey } from '../core/progress.js';
import { APP, HANDS_FREE, SETTINGS_RANGES as R, TEXT_SCALES, CHILD } from '../config.js';

const pct = v => fmtPct(Math.round(v * 100));
const BRIDGE_STATUS = { idle: 'не подключён', connecting: 'подключение…', waiting: 'подключено, ждём кадры', streaming: 'поток идёт', reconnecting: 'переподключение…', error: 'ошибка адреса' };

/** Reads a user-picked file as text (backup restore). */
function pickTextFile(accept, onText) {
  const input = h('input', { type: 'file', accept, hidden: true });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) file.text().then(onText, () => toast('Не удалось прочитать файл', 'bad'));
  });
  document.body.append(input);
  input.click();
}

export function settingsScreen(app) {
  const s = app.settings;
  if (s.audience === 'child' && s.parentPin && !app.pinOk) return pinGateScreen(app);
  const meter = signalMeter(app);
  const status = h('small', { class: 'bridge-status' }, app.bridge ? `Статус: ${BRIDGE_STATUS[app.bridge.status] ?? app.bridge.status}` : '');
  const bleStatus = h('small', { class: 'bridge-status' }, app.ble ? `Bluetooth: ${app.ble.name}` : '');
  const urlInput = h('input', { type: 'url', value: s.wsUrl, placeholder: 'ws://192.168.0.10:8765', 'aria-label': 'Адрес WebSocket' });
  const connectBle = async () => {
    try { const name = await app.connectBle(); toast(`Подключено: ${name}`, 'good'); bleStatus.textContent = `Bluetooth: ${name}`; }
    catch (e) { toast(e?.name === 'NotFoundError' ? 'Устройство не выбрано' : e.message, 'bad'); }
  };
  const bridgeBox = h('div', { class: 'bridge-box', hidden: s.source !== 'bridge' },
    h('label', { class: 'row' }, h('span', {}, 'WebSocket эмулятора'), urlInput),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: () => { app.updateSettings({ wsUrl: urlInput.value.trim() }); toast('Подключаемся…'); } }, 'Подключить'),
      h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка')),
    status,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', disabled: !bleSupported(), onclick: connectBle }, 'Bluetooth-датчик (BLE UART)')),
    bleStatus,
    h('p', { class: 'note' }, bleSupported()
      ? 'Датчики ESP32/nRF с сервисом Nordic UART (например, MyoWare 2.0 + беспроводной модуль) — прошивка-пример в bridge/firmware. После подключения выполните калибровку.'
      : 'Bluetooth из браузера работает в Chrome на Android и ПК. В приложении APK и на iOS используйте мост (WebSocket) или нативный pushFrame().'),
    h('p', { class: 'note' }, 'Также принимаются кадры через window.postMessage({type:"synergy-frame", a, b}) и window.Synergy.feed(frame). Формат — docs/INTEGRATION.md.'));

  // Progressive disclosure (W3C COGA «help users focus»): everyday sections are open, the rest fold (native <details>).
  const OPEN = ['Управление', 'Источник сигнала', 'Доступность'];
  const section = (title, ...children) => h('details', { class: 'card fold', open: OPEN.includes(title) }, h('summary', {}, h('h2', {}, title)), ...children);
  const preview = { pipeline: app.createPipeline(), source: app.signalSource() };
  const refreshPreview = () => { preview.pipeline = app.createPipeline(); preview.source = app.signalSource(); };

  const pinInput = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', placeholder: '4–6 цифр', 'aria-label': 'Новый PIN родителя' });
  const childBox = h('div', { hidden: s.audience !== 'child' },
    h('label', { class: 'row' }, h('span', {}, 'PIN родителя для настроек', h('small', {}, s.parentPin ? 'установлен' : 'не установлен')), pinInput),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: () => {
        if (!validPin(pinInput.value)) { toast('PIN — от 4 до 6 цифр', 'bad'); return; }
        app.updateSettings({ parentPin: hashPin(pinInput.value), pinLock: { fails: 0, until: 0 } }); app.pinOk = true; pinInput.value = ''; toast('PIN установлен', 'good');
      } }, 'Сохранить PIN'),
      s.parentPin ? h('button', { class: 'btn ghost', onclick: () => { app.updateSettings({ parentPin: '' }); toast('PIN снят'); app.go('settings'); } }, 'Снять PIN') : null));

  const node = h('div', { class: 'screen settings' },
    h('main', { class: 'scroll' },
      h('h1', {}, 'Настройки'),
      app.showcase ? h('p', { class: 'note warn' }, 'Открыт демо-профиль для презентации: изменения не сохраняются.') : null,
      section('Управление',
        segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { app.updateSettings({ scheme: v }); refreshPreview(); app.go('settings'); }, 'Схема управления'),
        h('p', { class: 'note' }, SCHEME_INFO[s.scheme].text),
        h('div', { class: 'row' }, h('span', {}, 'Протез'),
          segmented([{ value: 'right', label: 'Правая рука' }, { value: 'left', label: 'Левая рука' }], s.side, v => app.updateSettings({ side: v }), 'Рука с протезом'))),
      section('Источник сигнала',
        segmented([{ value: 'touch', label: 'Эмулятор на экране', sub: 'без датчиков' }, { value: 'bridge', label: 'Внешний', sub: 'эмулятор / датчики / протез' }], s.source, v => {
          app.updateSettings({ source: v }); bridgeBox.hidden = v !== 'bridge'; refreshPreview();
        }, 'Источник сигнала'),
        bridgeBox,
        sliderRow('Реалистичность эмулятора', { ...R.realism, value: s.realism, format: v => v < 0.2 ? 'чистый сигнал' : v < 0.7 ? 'как у датчика' : 'шумно', onInput: v => app.updateSettings({ realism: v }) })),
      section('Чувствительность',
        sliderRow('Порог включения канала', { ...R.sensitivity, value: s.sensitivity, format: pct, onInput: v => { app.updateSettings({ sensitivity: v }); refreshPreview(); } }),
        sliderRow('Порог коактивации (A+B)', { ...R.coThreshold, value: s.coThreshold, format: pct, onInput: v => { app.updateSettings({ coThreshold: v }); refreshPreview(); } }),
        h('p', { class: 'note' }, 'Проверка вживую — напрягите мышцы или используйте площадки ниже:'),
        meter.node,
        s.source === 'touch' && s.scheme !== 'gesture' ? createTwoChannelPads(app.emulator) : null,
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn ghost', onclick: () => app.go('calibration') }, 'Калибровка датчиков'),
          h('button', { class: 'btn ghost', onclick: () => app.go('tutorial', { from: 'settings' }) }, 'Первые шаги (обучение)')),
        toggleRow('Подстраивать покой', s.adaptRest, v => app.updateSettings({ adaptRest: v }), 'внешние датчики: покой медленно следует за дрейфом сигнала; при большом сдвиге попросим перекалибровать')),
      section('Тренировка',
        toggleRow('Адаптивная сложность', s.adaptive, v => app.updateSettings({ adaptive: v }), 'допуски подстраиваются, чтобы удавалось ~75 % попыток; испытание без подсказки и проверка — без подстройки'),
        toggleRow('Затухающие подсказки', s.fadedFeedback, v => app.updateSettings({ fadedFeedback: v }), 'чем лучше навык, тем чаще шкала скрыта в отдельных попытках — так навык прочнее держится без экрана'),
        h('div', { class: 'row' }, h('span', {}, 'Кто занимается'),
          segmented([{ value: 'adult', label: 'Взрослый' }, { value: 'child', label: 'Ребёнок', sub: 'с родителем' }], s.audience, v => { app.updateSettings({ audience: v }); childBox.hidden = v !== 'child'; }, 'Кто занимается')),
        h('p', { class: 'note' }, `Детский режим: в плане ${count(CHILD.planExercises, FORMS.exercises)}, отдых ${CHILD.restBetweenExercisesS} с, дневной лимит ${CHILD.dailySoftCapMin} мин; настройки можно закрыть PIN-кодом.`),
        childBox),
      section('Доступность',
        toggleRow('Озвучивание подсказок', s.voice, v => { app.updateSettings({ voice: v }); if (v) app.say('Озвучивание включено', { interrupt: true }); }, voiceAvailable() ? 'игра без взгляда на экран; при слабом зрении' : 'синтез речи недоступен на этом устройстве'),
        h('div', { class: 'row' }, h('span', {}, 'Размер текста'),
          segmented(TEXT_SCALES.map(v => ({ value: v, label: fmtPct(Math.round(v * 100)) })), s.textScale, v => app.updateSettings({ textScale: v }), 'Размер текста')),
        toggleRow('Высокий контраст', s.contrast, v => app.updateSettings({ contrast: v }), app.systemContrast ? 'сейчас включён настройкой системы (повышенный контраст)' : 'чёрный фон, белые рамки, жёлтые главные кнопки; включается и сам, если в системе выбран повышенный контраст'),
        toggleRow('Меньше движения', s.reduceMotion, v => app.updateSettings({ reduceMotion: v }), 'без частиц, вспышек и анимаций'),
        toggleRow('Площадки без удержания', s.stickyPads, v => app.updateSettings({ stickyPads: v }), 'касание включает сигнал, второе касание выключает — если трудно держать палец (тремор, слабость)'),
        toggleRow('Вибро-метроном в «Ритме»', s.hapticBeat, v => app.updateSettings({ hapticBeat: v }), 'такт ощущается рукой — для слабослышащих'),
        sliderRow('Темп игр', { ...R.gameSpeed, value: s.gameSpeed, format: pct, onInput: v => app.updateSettings({ gameSpeed: v }) }),
        sliderRow('Удержание A для «без касания»', { min: HANDS_FREE.minS, max: HANDS_FREE.maxS, step: 0.1, value: s.dwellS, format: v => fmtFixed(v) + '\u00a0с', onInput: v => app.updateSettings({ dwellS: v }) })),
      section('Привычка',
        sliderRow('Цель: дней в неделю', { ...R.weeklyGoal, value: s.weeklyGoal, format: v => String(v), onInput: v => app.updateSettings({ weeklyGoal: v }) }),
        h('label', { class: 'row' }, h('span', {}, 'Напоминание'),
          h('input', { type: 'time', value: s.reminder, onchange: e => app.updateSettings({ reminder: e.target.value }) })),
        h('button', { class: 'btn ghost', onclick: () => download('synergy-reminder.ics', reminderIcs(s.reminder), 'text/calendar') }, 'Добавить в календарь (.ics)'),
        h('label', { class: 'row' }, h('span', {}, 'Имя'), h('input', { type: 'text', value: s.name, maxlength: 24, onchange: e => app.updateSettings({ name: e.target.value.trim() }) })),
        toggleRow('Звук', s.sound, v => app.updateSettings({ sound: v })),
        toggleRow('Музыка в «Ритме»', s.music, v => app.updateSettings({ music: v }), 'барабаны, бас и аккорды в темпе уровня: такт слышен, когда нота доходит до линии'),
        toggleRow('Вибрация', s.haptics, v => app.updateSettings({ haptics: v })),
        toggleRow('Полоски сигнала в игре', s.showMeters, v => app.updateSettings({ showMeters: v }), 'мышечная обратная связь рядом с игровой')),
      section('Данные',
        h('p', { class: 'note' }, app.store.persisted ? location.protocol === 'file:' ? 'Файл открыт с диска: браузер может давать доступ к этим данным другим файлам с диска. Для занятий — PWA или APK.' : 'Всё хранится на этом устройстве: без аккаунта, сервера и аналитики. Наружу данные уходят только в файлах, которые вы сохраняете, и к источнику сигнала, который вы подключили.' : 'Хранилище недоступно: результаты не сохранятся после закрытия.'),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn ghost', disabled: !!app.showcase, onclick: () => download(`synergy-backup-${dayKey()}.json`, app.exportBackup(), 'application/json') }, 'Сохранить копию'),
          h('button', { class: 'btn ghost', disabled: !!app.showcase, onclick: () => pickTextFile('application/json,.json', raw => {
            if (!confirm('Заменить все данные на этом устройстве данными из копии?')) return;
            try { app.importBackup(raw); toast('Данные восстановлены', 'good'); app.go('home'); } catch (e) { toast(e.message, 'bad'); }
          }) }, 'Восстановить')),
        h('div', { class: 'row-actions' },
          app.showcase
            ? h('button', { class: 'btn ghost', onclick: () => { app.exitShowcase(); app.go('settings'); } }, 'Выйти из демо-профиля')
            : h('button', { class: 'btn ghost', onclick: () => { app.enterShowcase(); app.go('progress'); } }, 'Демо-профиль для презентации')),
        !app.showcase && app.store.canUndoReset()
          ? h('button', { class: 'btn ghost', onclick: () => { if (confirm('Вернуть данные, которые были до последнего сброса? Текущие данные заменятся.')) { try { app.undoReset(); toast('Данные до сброса возвращены', 'good'); app.go('home'); } catch (e) { toast(e.message, 'bad'); } } } }, 'Вернуть данные до сброса') : null,
        h('button', { class: 'btn danger', disabled: !!app.showcase, onclick: () => { if (confirm('Удалить весь прогресс на этом устройстве? Копия останется до следующего сброса: вернуть — здесь же, в «Данных»; сбросить ещё раз — удалить без следа.')) { app.resetProgress(); toast('Прогресс удалён. Вернуть: Настройки → Данные'); app.go('onboarding'); } } }, 'Сбросить прогресс')),
      section('О приложении',
        h('p', {}, `${APP.name} ${APP.version} — игра-тренажёр управления бионическим протезом по ЭМГ (2 канала: пороговый и пропорциональный режимы; 7 жестов).`),
        h('p', { class: 'note warn' }, 'Не медицинское изделие: не диагностирует и не лечит. Не заменяет занятия с реабилитологом. При боли или усталости — остановитесь.'),
        h('p', { class: 'note' }, `Возрастная категория: ${APP.ageRating} (436-ФЗ). Детям — с родителем.`),
        h('p', { class: 'note' }, 'Код создан командой с помощью ИИ-ассистента; что именно и как проверено — docs/AI_USAGE.md.'))),
    bottomNav(app, 'settings'));

  return {
    node,
    tick(now) { meter.update(preview.pipeline.process(preview.source?.sample(now) ?? null, now)); },
    onBridgeStatus(st) { status.textContent = `Статус: ${BRIDGE_STATUS[st] ?? st}`; },
    onBleStatus(st) { bleStatus.textContent = st === 'disconnected' ? 'Bluetooth: связь потеряна — переподключаемся…' : st === 'failed' ? 'Bluetooth: не удалось переподключиться' : `Bluetooth: ${st}`; },
  };
}

export function calibrationScreen(app) {
  // Calibration changes how the signal is read: in child mode it sits behind the parent PIN like the settings
  // (the results screen links here directly).
  if (app.settings.audience === 'child' && app.settings.parentPin && !app.pinOk) return pinGateScreen(app, { next: 'calibration' });
  const kind = app.sourceKind();
  let recorder = new CalibrationRecorder();
  const title = h('h2', {}), text = h('p', {}), ring = h('div', { class: 'cal-ring' });
  const meter = signalMeter(app);
  const result = h('div', { class: 'cal-result' });
  const pipeline = app.createPipeline();
  const source = app.signalSource();
  // Same frame as «Первые шаги» (5.10): the steps scroll, the signal and the pads stay on screen.
  const node = h('div', { class: 'screen calibration frame' },
    topBar('Калибровка', () => app.go('settings')),
    h('main', { class: 'frame-body center' },
      h('p', { class: 'note' }, kind === 'touch'
        ? 'Сейчас источник — эмулятор на экране: калибровка покажет процесс, а результат для эмулятора не нужен. Подключите внешний источник для настоящей калибровки.'
        : 'Как «чувствительность датчиков» в приложении протеза: определяем покой и комфортное напряжение каждого канала.'),
      ring, title, text, result,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn ghost', onclick: () => { recorder = new CalibrationRecorder(); result.replaceChildren(); } }, 'Заново'),
        h('button', { class: 'btn ghost', onclick: () => { app.state.calibrations[kind] = defaultCalibration(); app.save(); toast('Калибровка сброшена'); } }, 'Сбросить'))),
    h('div', { class: 'frame-dock' }, meter.node,
      kind === 'touch' ? h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' }, createTwoChannelPads(app.emulator)) : null));
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
        // Without signal there is nothing to save: the previous calibration stays.
        const save = r.usable && kind !== 'touch';
        result.replaceChildren(...r.issues.map(i => h('p', { class: 'note warn' }, i)),
          h('button', { class: 'btn primary big', onclick: () => { if (save) { app.state.calibrations[kind] = r.calibration; app.save(); toast('Калибровка сохранена', 'good'); } app.go('settings'); } }, save ? 'Сохранить' : 'Понятно'));
      }
    },
  };
}
