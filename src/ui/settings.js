// Settings (control, signal source, sensitivity, training, accessibility, habit, data) and the calibration wizard.
// Child mode: the screen sits behind the parent PIN gate (ui/pin.js).
import { fmtPct, fmtFixed, count, FORMS } from '../core/format.js';
import { h, toast } from './dom.js';
import { bottomNav, topBar, segmented, sliderRow, toggleRow, signalMeter, signalTraceView, BRIDGE_STATUS, icon } from './widgets.js';
import { SCHEME_INFO, twoChannelControls, GESTURE_SET, GESTURE_SETS, STREAM_DICTIONARY } from '../core/vocabulary.js';
import { GESTURE_SET_IDS, gestureSetSource, saveGestureSet } from '../core/gesture-set.js';
import { CalibrationRecorder, CALIBRATION_STEPS, thresholdForRest, shownRippleIssues } from '../core/calibration.js';
import { dictionaryAdvice } from '../core/spppr.js';
import { defaultCalibration, thresholdShares } from '../core/signal.js';
import { download, reminderIcs, reminderTime, CHILD_REMINDER } from '../services/report.js';
import { voiceAvailable } from '../services/voice.js';
import { bleSupported } from '../input/ble.js';
import { createTwoChannelPads, createGesturePads } from './controls.js';
import { picture, artUrl, hasArt } from './pictures.js';
import { fmtOffset } from './audiosync.js';
import { hashPin, pinConfirmed, pinGateScreen } from './pin.js';
import { dayKey } from '../core/progress.js';
import { MAX_BACKUP_BYTES } from '../core/storage.js';
import { ELECTRICAL_SAFETY } from '../core/wellbeing.js';
import { fourStates, bothOnText } from '../core/fourstates.js';
import { APP, HANDS_FREE, SETTINGS_RANGES as R, TEXT_SCALES, CHILD, PET, LOCK, GRIP_SWITCH, BOTH_ON } from '../config.js';

const pct = v => fmtPct(Math.round(v * 100));
/** Section glyph and its tile tint (5.12): the sections are told apart at a glance, the title stays the name. */
const SECTION_ICON = { 'Управление': ['hand', 'green'], 'Источник сигнала': ['signal', 'blue'], 'Чувствительность': ['gauge', 'coral'], 'Тренировка': ['dumbbell', 'teal'],
  'Доступность': ['access', 'violet'], 'Звук и вибрация': ['sound', 'coral'], 'Привычка': ['bell', 'yellow'], 'Данные': ['data', 'blue'], 'О приложении': ['info', 'green'] };
/** 5.16: the illustrated icon of a section (public/art/ico-*); the line glyph stands in for a missing one. */
const SECTION_PICTURE = { 'Управление': 'hand', 'Источник сигнала': 'sensor', 'Чувствительность': 'calibration', 'Тренировка': 'effort',
  'Доступность': 'access', 'Звук и вибрация': 'sound', 'Привычка': 'bell', 'Данные': 'data', 'О приложении': 'info' };

/** Reads a user-picked file as text (backup restore). */
function pickTextFile(accept, onText) {
  const input = h('input', { type: 'file', accept, hidden: true });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file && file.size > MAX_BACKUP_BYTES) { toast('Файл слишком большой для копии «Синергии»', 'bad'); return; } // before reading it all (5.11)
    if (file) file.text().then(onText, () => toast('Не удалось прочитать файл', 'bad'));
  });
  document.body.append(input);
  input.click();
}

export function settingsScreen(app, { back = null } = {}) {
  const s = app.settings;
  if (s.audience === 'child' && s.parentPin && !app.pinOk) return pinGateScreen(app);
  const meter = signalMeter(app);
  const trace = twoChannelControls(s.scheme) ? signalTraceView(app) : null; // 5.32: gestures have no two lines to compare
  const status = h('small', { class: 'bridge-status' }, app.bridge ? `Статус: ${BRIDGE_STATUS[app.bridge.status] ?? app.bridge.status}` : '');
  const bleStatus = h('small', { class: 'bridge-status' }, app.ble ? `Bluetooth: ${app.ble.name}` : '');
  const urlInput = h('input', { type: 'url', value: s.wsUrl, placeholder: 'ws://192.168.0.10:8765', 'aria-label': 'Адрес WebSocket' });
  const connectBle = async () => {
    try { const name = await app.connectBle(); toast(`Подключено: ${name}`, 'good'); bleStatus.textContent = `Bluetooth: ${name}`; }
    catch (e) { toast(e?.name === 'NotFoundError' ? 'Устройство не выбрано' : e.message, 'bad'); }
  };
  const bridgeBox = h('div', { class: 'bridge-box', hidden: s.source !== 'bridge' },
    app.sensorsPaused() ? h('p', { class: 'note warn' }, 'Сегодня датчики выключены: кожа под ними раздражена. Подключите завтра или измените ответ опроса.') : null,
    h('label', { class: 'row' }, h('span', {}, 'WebSocket эмулятора'), urlInput),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: () => { app.updateSettings({ wsUrl: urlInput.value.trim() }); toast('Подключаемся…'); } }, 'Подключить'),
      h('button', { class: 'btn ghost', 'data-return': 'calibration', onclick: () => app.go('calibration') }, 'Калибровка')),
    status,
    toggleRow('Поменять каналы A и B', s.swapChannels, v => { app.updateSettings({ swapChannels: v }); toast('Каналы поменялись — пройдите калибровку'); },
      'если сжатие на экране раскрывает кисть: источник шлёт каналы наоборот. В приложении протеза — «поменять сенсоры»'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', disabled: !bleSupported() || app.sensorsPaused(), onclick: connectBle }, 'Bluetooth-датчик (BLE UART)')),
    bleStatus,
    h('p', { class: 'note' }, bleSupported()
      ? 'Датчики ESP32/nRF с сервисом Nordic UART (например, MyoWare 2.0 + беспроводной модуль) — прошивка-пример в bridge/firmware. После подключения выполните калибровку.'
      : 'Bluetooth из браузера работает в Chrome на Android и ПК. В приложении APK и на iOS используйте мост (WebSocket) или нативный pushFrame().'),
    // 5.27 (medical review): electrodes on the skin are a patient connection. Home-made sensors carry no isolation from
    // the mains, so the only safe supply is a battery — the reference firmware said so, the screen did not.
    h('p', { class: 'note warn' }, ELECTRICAL_SAFETY),
    h('p', { class: 'note' }, 'Также принимаются кадры через window.postMessage({type:"synergy-frame", a, b}) и window.Synergy.feed(frame). Формат — docs/INTEGRATION.md.'));

  // Progressive disclosure (W3C COGA «help users focus»): everyday sections are open, the rest fold (native <details>).
  const OPEN = ['Управление', 'Источник сигнала', 'Доступность'];
  const section = (title, ...children) => {
    const [glyph, tint] = SECTION_ICON[title] ?? ['info', 'violet'];
    return h('details', { class: 'card fold', open: OPEN.includes(title) },
      h('summary', {}, h('span', { class: 'sec-head' }, h('span', { class: `sec-ico t-${tint}`, 'aria-hidden': 'true' }, picture(`ico-${SECTION_PICTURE[title]}`, 34, 'sec-pic', () => icon(glyph))), h('h2', {}, title))), ...children);
  };
  // 5.31 — the four states of two channels and what each does with the chosen grip switch (meetup 21.10, slide 10).
  const statesList = h('dl', { class: 'four-states', 'aria-label': 'Четыре состояния двух каналов' });
  const paintStates = () => statesList.replaceChildren(...fourStates(app.settings).flatMap(st => [h('dt', {}, st.signal), h('dd', {}, st.action)]));
  paintStates();
  // 5.32 — liveFrames(), not signalSource(): the host's first frame rebuilds the bridge, and a screen opened before it
  // kept reading the stopped one («Нет сигнала» in a calibration that had a signal).
  const preview = { pipeline: app.createPipeline(), source: app.liveFrames() };
  const refreshPreview = () => { preview.pipeline = app.createPipeline(); preview.source = app.liveFrames(); paintLimits(); };
  // 5.29 — the prosthesis's own thresholds, when the host (Motorica Start) passed them: read, never written.
  const limitsNote = h('p', { class: 'note', 'aria-live': 'polite' });
  function paintLimits() {
    const raw = app.bridge?.thresholds, used = app.prosthesisThresholds();
    const [a, b] = app.switchOn();
    limitsNote.textContent = !raw
      ? 'Пороги протеза приходят от приложения протеза, когда игра встроена в него. Сейчас их нет — работают пороги игры выше, у каждого канала свой.'
      : used
        ? `Пороги протеза получены: канал A включается на ${pct(a)}, B — на ${pct(b)} комфортного уровня. Ползунки порогов выше на эти каналы не действуют. Игра их только читает.`
        : `Пороги протеза получены, но не используются: работает порог игры, A ${pct(s.sensitivity)}, B ${pct(s.sensitivityB)}.`;
  }
  paintLimits();
  // Two-channel laws only. Switching the grip method shows or hides the hold time without rebuilding the screen
  // (a rebuild would fold this section shut).
  const twoChannelSensitivity = () => {
    const hold = sliderRow('Смена хвата: удержание B', { min: GRIP_SWITCH.minS, max: GRIP_SWITCH.maxS, step: GRIP_SWITCH.stepS, value: s.holdOpenS, format: v => fmtFixed(v, 2) + '\u00a0с', onInput: v => { app.updateSettings({ holdOpenS: Math.round(v * 20) / 20 }); paintStates(); } }); // 0,05 с, as in Motorica Start
    const openNote = h('p', { class: 'note', hidden: s.gripSwitch !== 'open' }, 'В протезах «Моторики» хват меняется так: кисть раскрыта до конца, раскрытие отпущено и подано снова дольше этого времени. В Motorica Start это «время пиков», по умолчанию 1,00 с — его настраивает протезист. A+B там — блокировка.');
    const coNote = h('p', { class: 'note', hidden: s.gripSwitch === 'open' }, 'Сейчас хват меняет коактивация A+B. В протезах «Моторики» хват меняет повторное раскрытие, а A+B — блокировка. Время удержания появится, если выбрать «Снова раскрыть».');
    if (s.gripSwitch !== 'open') hold.hidden = true;
    const pick = v => { app.updateSettings({ gripSwitch: v }); hold.hidden = v !== 'open'; openNote.hidden = v !== 'open'; coNote.hidden = v === 'open'; paintStates(); };
    // 5.32 — the second channel later than the first: the hand stands, goes on with the first command or takes the later one (BOTH_ON).
    const bothNote = h('p', { class: 'note' }, bothOnText(s.bothOn));
    const pickBoth = v => { app.updateSettings({ bothOn: v }); bothNote.textContent = bothOnText(v); paintStates(); refreshPreview(); };
    return [
      sliderRow('Порог коактивации (A+B)', { ...R.coThreshold, value: s.coThreshold, format: pct, onInput: v => { app.updateSettings({ coThreshold: v }); refreshPreview(); meter.setThresholds(); } }),
      sliderRow('Блокировка протеза: удержание A+B', { min: LOCK.minS, max: LOCK.maxS, step: LOCK.stepS, value: s.lockHoldS, format: v => fmtFixed(v) + '\u00a0с', onInput: v => { app.updateSettings({ lockHoldS: Math.round(v * 10) / 10 }); paintStates(); } }),
      h('p', { class: 'note' }, 'Как «время удержания для блокировки» в Motorica Start (там по умолчанию 1,6 с); его настраивает протезист.'),
      h('div', { class: 'row' }, h('span', {}, 'Смена хвата'),
        segmented([{ value: 'open', label: 'Снова раскрыть', sub: 'как у «Моторики»' }, { value: 'co', label: 'Коактивация', sub: 'A+B разом' }], s.gripSwitch, pick, 'Смена хвата')),
      hold, openNote, coNote,
      h('div', { class: 'row' }, h('span', {}, 'Второй канал позже первого'),
        segmented([{ value: 'hold', label: 'Кисть стоит', sub: 'как раньше' }, { value: 'first', label: 'Первая команда', sub: 'классический режим' }, { value: 'latest', label: 'Вторая команда', sub: 'спортивный режим' }], s.bothOn ?? BOTH_ON.defaultMode, pickBoth, 'Второй канал включился позже первого')),
      bothNote,
      signalParamsBox(),
    ];
  };

  // 6.0 — the parameters the task names for the two channels (Поток 1), each with its own slider. Folded: the defaults
  // keep the response under 100 ms, a prosthetist tunes them for a person's noisy or weak signal.
  const signalParamsBox = () => {
    const ms = v => `${Math.round(v)}\u00a0мс`;
    const tune = (key, label, format, note) => [sliderRow(label, { ...R[key], value: s[key], format, onInput: v => { app.updateSettings({ [key]: key === 'hysteresis' || key === 'deadZone' ? Math.round(v * 100) / 100 : v }); refreshPreview(); } }), h('p', { class: 'note' }, note)];
    return h('details', { class: 'fold signal-params' }, h('summary', {}, 'Параметры сигнала (ТЗ)'),
      h('p', { class: 'note' }, 'Пороговый режим: превышение порога — действие. Канал A — сжатие, канал B — раскрытие, A+B — блокировка или смена хвата, нет сигнала — кисть держит. Пропорциональный: сила сигнала — скорость и сила кисти.'),
      ...tune('holdMs', 'Время удержания над порогом', ms, 'Канал включается, только если сигнал держится выше порога это время: короткий всплеск не срабатывает.'),
      ...tune('refractoryMs', 'Подавление ложных срабатываний', ms, 'После выключения канал не включится снова раньше этого времени: нет дребезга и двойных срабатываний.'),
      ...tune('hysteresis', 'Мёртвая зона порога', pct, 'Полоса ниже порога, где канал сохраняет состояние: сигнал у самой линии не мигает «вкл/выкл».'),
      ...tune('smoothingMs', 'Сглаживание', ms, 'Постоянная времени сглаживания огибающей. Больше — ровнее, но позже отклик.'),
      ...tune('slewPerS', 'Ограничение скачков', v => `${Math.round(v)}\u00a0/с`, 'Насколько быстро может меняться пропорциональный выход: резкий скачок сигнала не дёргает кисть.'),
      ...tune('deadZone', 'Мёртвая зона выхода', pct, 'Пропорциональный выход: разница A и B меньше этой доли — покой посередине; выше — выход растёт от нуля, без ступеньки.'), // 04.11: «пропорционального» не помещалось в 320 px при тексте 200 % (аудит раскладки в CI)
      h('p', { class: 'note' }, `По умолчанию отклик от первого кадра сокращения до команды — не больше 100 мс (ТЗ), сейчас удержание ${Math.round(s.holdMs)} мс.`));
  };

  const pinInput = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', placeholder: '4–6 цифр', 'aria-label': 'Новый PIN родителя' });
  const pinAgain = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password', placeholder: 'ещё раз', 'aria-label': 'Повторите PIN' });
  const savePin = () => {
    const verdict = pinConfirmed(pinInput.value, pinAgain.value);
    if (verdict === 'short') { toast('Оба поля — от 4 до 6 цифр', 'bad'); return; }
    if (verdict === 'mismatch') { toast('PIN не совпал. Введите его дважды', 'bad'); pinAgain.value = ''; pinAgain.focus(); return; }
    app.updateSettings({ parentPin: hashPin(pinInput.value), pinLock: { fails: 0, until: 0 } });
    app.pinOk = true; pinInput.value = ''; pinAgain.value = ''; toast('PIN установлен', 'good');
  };
  const childBox = h('div', { hidden: s.audience !== 'child' },
    h('label', { class: 'row' }, h('span', {}, 'PIN родителя для настроек', h('small', {}, s.parentPin ? 'установлен' : 'не установлен')), pinInput),
    h('label', { class: 'row' }, h('span', {}, 'Повторите PIN', h('small', {}, 'так опечатка не закроет настройки')), pinAgain),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', onclick: savePin }, 'Сохранить PIN'),
      s.parentPin ? h('button', { class: 'btn ghost', onclick: () => { if (!confirm('Снять PIN? Настройки снова откроются без кода.')) return; app.updateSettings({ parentPin: '' }); toast('PIN снят'); app.go('settings'); } }, 'Снять PIN') : null));

  // 5.29: which gesture set the game speaks — ours or the UBI4 set of Motorica Start's gesture training. A change reloads
  // the page: every game derives its lists from the set once (core/gesture-set.js).
  function gestureSetRow() {
    if (gestureSetSource() === 'address') {
      return h('p', { class: 'note' }, `Набор жестов «${GESTURE_SET.name}» задало приложение, которое открыло игру.`);
    }
    return h('div', { class: 'gesture-set' },
      // 6.0: the slide's hypothesis (spr8) is superseded by the task's set — offered only to whoever is still on it.
      segmented(GESTURE_SET_IDS.filter(id => id !== 'spr8' || GESTURE_SET.id === 'spr8').map(id => ({ value: id, label: GESTURE_SETS[id].name, sub: GESTURE_SETS[id].short })), GESTURE_SET.id, v => {
        if (v === GESTURE_SET.id) return;
        if (!saveGestureSet(v)) { toast('Не удалось сохранить выбор: хранилище браузера недоступно'); return; }
        toast(`Набор жестов «${GESTURE_SETS[v].name}»: перезапускаем игру`);
        setTimeout(() => globalThis.location?.reload?.(), 600);
      }, 'Набор жестов'),
      h('p', { class: 'note' }, `Сейчас: ${GESTURE_SET.source}. Прежние упражнения сохраняются; в отчёте видно, в каком наборе каждое.`));
  }

  // 6.0 — the СПППР stream of the task, live: the counters and the last packet as it came (the hard contract is visible).
  const tzStream = s.scheme === 'gesture' && !!STREAM_DICTIONARY;
  const lastPacket = h('pre', { class: 'stream-packet', 'aria-label': 'Последний пакет СПППР' }, '—');
  // Answers of 04.11 (№ 22): a СПППР sends 6 movements + neutral or 2 + neutral. The panel names what the stream speaks
  // and, when it is not the dictionary of the set, which set fits it — a game must not ask for a state that never comes.
  const dictionaryNote = h('p', { class: 'note', 'aria-live': 'polite' });
  const streamBox = tzStream ? h('div', { class: 'stream-box' },
    h('p', { class: 'note' }, `Пакет ТЗ: {"timestamp_ms": время микроконтроллера, "dist": вероятности ${STREAM_DICTIONARY === 'pair' ? '3 состояний — нейтраль, сгибание, разгибание' : '7 состояний'}}. Скорость считается только по разнице timestamp_ms; джиттер сглаживается, пауза > 200 мс плавно гасит скорость, одиночный шум прощается.`),
    lastPacket, dictionaryNote) : null;
  let streamAt = 0;
  const node = h('div', { class: 'screen settings' },
    h('main', { class: 'scroll' },
      h('h1', {}, 'Настройки'),
      app.showcase ? h('p', { class: 'note warn' }, 'Открыт демо-профиль для презентации: изменения не сохраняются.') : null,
      section('Управление',
        segmented(Object.entries(SCHEME_INFO).map(([value, i]) => ({ value, label: i.name, sub: i.short })), s.scheme, v => { app.updateSettings({ scheme: v }); refreshPreview(); app.go('settings'); }, 'Схема управления'),
        h('p', { class: 'note' }, SCHEME_INFO[s.scheme].text),
        s.scheme === 'gesture' ? gestureSetRow() : statesList,
        // 5.30 — two prostheses (meetup 21.10: «не исключена»): each has its own stream and calibration; the one chosen
        // here leads the exercise, the other one waits (core/hands.js, input/bridge.js `side`).
        h('div', { class: 'row' }, h('span', {}, 'Протезы'),
          segmented([{ value: 'one', label: 'Один' }, { value: 'two', label: 'Два', sub: 'левый и правый' }], s.prostheses, v => { app.updateSettings({ prostheses: v }); app.go('settings'); }, 'Сколько протезов')),
        h('p', { class: 'note' }, 'Основной сценарий — один протез. «Два» — если протезы на обеих руках.'),
        h('div', { class: 'row' }, h('span', {}, s.prostheses === 'two' ? 'Упражнение ведёт' : 'Протез'),
          segmented([{ value: 'right', label: s.prostheses === 'two' ? 'Правый' : 'Правая рука' }, { value: 'left', label: s.prostheses === 'two' ? 'Левый' : 'Левая рука' }], s.side, v => { app.updateSettings({ side: v }); app.go('settings'); }, s.prostheses === 'two' ? 'Какой протез ведёт упражнение' : 'Рука с протезом')),
        toggleRow('Зеркальная подсказка', s.mirrorHint, v => app.updateSettings({ mirrorHint: v }), 'картинка жеста зеркальная: можно повторять движение здоровой рукой одновременно'),
        // 5.30 — the on-screen controls under the hand that taps them (the expert's advice at the meetup of 21.10.2026).
        h('div', { class: 'row' }, h('span', {}, 'Кнопки на экране'),
          segmented([{ value: 'auto', label: 'Авто', sub: s.prostheses === 'two' ? 'под правую' : `под ${s.side === 'right' ? 'левую' : 'правую'}, здоровую` }, { value: 'left', label: 'Под левую' }, { value: 'right', label: 'Под правую' }],
            s.controlHand, v => { app.updateSettings({ controlHand: v }); app.go('settings'); }, 'Кнопки на экране под руку')),
        // 5.14 — people wait 3–6 months for a prosthesis (the customer's annual report): «жду протез» trains the control
        // on the emulator and shows the path to the prosthesis instead of tasks that need one.
        h('div', { class: 'row' }, h('span', {}, 'Протез уже есть?'),
          segmented([{ value: 'yes', label: 'Есть' }, { value: 'waiting', label: 'Жду протез', sub: 'учусь заранее' }], s.prosthesis, v => app.updateSettings({ prosthesis: v }), 'Протез уже есть?'))),
      section('Источник сигнала',
        segmented([{ value: 'touch', label: 'Эмулятор на экране', sub: 'без датчиков' }, { value: 'bridge', label: 'Внешний', sub: 'эмулятор / датчики / протез' }], s.source, v => {
          app.updateSettings({ source: v }); bridgeBox.hidden = v !== 'bridge'; refreshPreview();
        }, 'Источник сигнала'),
        bridgeBox,
        sliderRow('Реалистичность эмулятора', { ...R.realism, value: s.realism, format: v => v < 0.2 ? 'чистый сигнал' : v < 0.7 ? 'как у датчика' : 'шумно', onInput: v => app.updateSettings({ realism: v }) })),
      section('Чувствительность',
        h('p', { class: 'note' }, 'У канала закрытия и канала открытия свои пороги. Это пороги игры: в протез они не записываются.'),
        sliderRow('Порог закрытия (A)', { ...R.sensitivity, value: s.sensitivity, format: pct, onInput: v => { app.updateSettings({ sensitivity: v }); refreshPreview(); meter.setThresholds(); } }),
        sliderRow('Порог открытия (B)', { ...R.sensitivity, value: s.sensitivityB, format: pct, onInput: v => { app.updateSettings({ sensitivityB: v }); refreshPreview(); meter.setThresholds(); } }),
        toggleRow('Пороги как у протеза', s.prosthesisThresholds, v => { app.updateSettings({ prosthesisThresholds: v }); refreshPreview(); }, 'каждый канал включается на том же уровне сигнала, что и кисть; работает, когда приложение протеза передаёт пороги'),
        limitsNote,
        // 5.24 — co-contraction, the lock and the grip switch do nothing in the gesture scheme (the grip is the gesture).
        // Showing them asked the person to tune a control that never fired (W3C COGA). The saved values stay.
        ...(twoChannelControls(s.scheme) ? twoChannelSensitivity() : [
          h('p', { class: 'note' }, 'Схема жестов: хват выбирает сам жест. Порог коактивации, блокировка и смена хвата — для двух каналов. Значения сохранены и вернутся, если выбрать другую схему.'),
        ]),
        h('p', { class: 'note' }, 'Проверка вживую — напрягите мышцы или используйте площадки ниже:'),
        meter.node,
        trace?.node,
        streamBox,
        s.source === 'touch' && s.scheme !== 'gesture' ? createTwoChannelPads(app.emulator) : null,
        s.source === 'touch' && tzStream ? createGesturePads(app.emulator, { mirror: !!s.mirrorHint }) : null,
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn ghost', 'data-return': 'calibration', onclick: () => app.go('calibration') }, 'Калибровка датчиков'),
          h('button', { class: 'btn ghost', 'data-return': 'tutorial', onclick: () => app.go('tutorial', { from: 'settings' }) }, 'Первые шаги (обучение)')),
        toggleRow('Подстраивать покой', s.adaptRest, v => app.updateSettings({ adaptRest: v }), 'внешние датчики: покой медленно следует за дрейфом сигнала; при большом сдвиге попросим перекалибровать')),
      section('Тренировка',
        toggleRow('Адаптивная сложность', s.adaptive, v => app.updateSettings({ adaptive: v }), 'допуски подстраиваются, чтобы удавалось ~75 % попыток (первую неделю — почти 90 %); испытание без подсказки и проверка — без подстройки'),
        toggleRow('Затухающие подсказки', s.fadedFeedback, v => app.updateSettings({ fadedFeedback: v }), 'чем лучше навык, тем чаще шкала скрыта в отдельных попытках — так навык прочнее держится без экрана'),
        h('div', { class: 'row' }, h('span', {}, 'Кто занимается'),
          segmented([{ value: 'adult', label: 'Взрослый' }, { value: 'child', label: 'Ребёнок', sub: 'с родителем' }], s.audience, v => { app.updateSettings({ audience: v }); childBox.hidden = v !== 'child'; }, 'Кто занимается')),
        h('p', { class: 'note' }, `Детский режим: в плане ${count(CHILD.planExercises, FORMS.exercises)}, отдых ${CHILD.restBetweenExercisesS} с, дневной лимит ${CHILD.dailySoftCapMin} мин; настройки можно закрыть PIN-кодом.`),
        childBox),
      section('Доступность',
        h('div', { class: 'row' }, h('span', {}, 'Тема оформления'),
          segmented([{ value: 'auto', label: 'Как в системе' }, { value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' }], s.theme, v => app.updateSettings({ theme: v }), 'Тема оформления')),
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
          h('input', { type: 'time', value: s.reminder, ...(s.audience === 'child' ? { min: CHILD_REMINDER.from, max: CHILD_REMINDER.to } : {}), onchange: e => app.updateSettings({ reminder: reminderTime(e.target.value, s.audience === 'child') }) })),
        h('button', { class: 'btn ghost', 'data-return': 'habit', onclick: () => download('synergy-reminder.ics', reminderIcs(s.reminder, new Date(), s.weeklyGoal, { child: s.audience === 'child' }), 'text/calendar') }, 'Добавить в календарь (.ics)'),
        h('label', { class: 'row' }, h('span', {}, 'Имя'), h('input', { type: 'text', value: s.name, maxlength: 24, onchange: e => app.updateSettings({ name: e.target.value.trim() }) })),
        h('label', { class: 'row' }, h('span', {}, 'Имя Жар-птицы'), h('input', { type: 'text', value: s.petName, maxlength: 16, placeholder: PET.defaultName, onchange: e => app.updateSettings({ petName: e.target.value.trim() }) })),
        // 5.13: the hint tours once more — for a new person on this device, or before a demo.
        h('button', { class: 'btn ghost', disabled: !Object.keys(s.tours ?? {}).length, onclick: () => { app.updateSettings({ tours: {} }); toast('Подсказки появятся на главной и в «Прогрессе»'); app.go('settings'); } }, 'Показать подсказки снова')),
      // Sound and vibration have their own section (5.11, design review: they sat under «Привычка»).
      section('Звук и вибрация',
        toggleRow('Звук', s.sound, v => app.updateSettings({ sound: v })),
        toggleRow('Музыка в «Ритме»', s.music, v => app.updateSettings({ music: v }), 'барабаны, бас и аккорды в темпе уровня: такт слышен, когда нота доходит до линии'),
        h('button', { class: 'btn ghost', 'data-return': 'audiosync', onclick: () => app.go('audiosync') }, picture('ico-audiosync', 24), `Синхронизация звука: ${fmtOffset(s.audioOffsetMs ?? 0)}`),
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
            : h('button', { class: 'btn ghost', onclick: () => { app.enterShowcase(); app.go('progress'); } }, picture('ico-demo', 24), 'Демо-профиль для презентации')),
        !app.showcase && app.store.canUndoReset()
          ? h('button', { class: 'btn ghost', onclick: () => { if (confirm('Вернуть данные, которые были до последнего сброса? Текущие данные заменятся.')) { try { app.undoReset(); toast('Данные до сброса возвращены', 'good'); app.go('home'); } catch (e) { toast(e.message, 'bad'); } } } }, 'Вернуть данные до сброса') : null,
        h('button', { class: 'btn danger', disabled: !!app.showcase, onclick: () => { if (confirm('Удалить весь прогресс на этом устройстве? Копия останется до следующего сброса: вернуть — здесь же, в «Данных»; сбросить ещё раз — удалить без следа.')) { app.resetProgress(); toast('Прогресс удалён. Вернуть: Настройки → Данные'); app.go('onboarding'); } } }, 'Сбросить прогресс')),
      section('О приложении',
        h('p', {}, `${APP.name} ${APP.version} — игра-тренажёр управления бионическим протезом по ЭМГ. Два канала: пороговый и пропорциональный режимы. Поток СПППР: семь состояний из ТЗ 28.10 (нейтраль, сгибание, разгибание, пронация, супинация, приведение, отведение).`),
        h('p', { class: 'note warn' }, 'Не медицинское изделие: не диагностирует и не лечит. Не заменяет занятия с реабилитологом. При боли или усталости — остановитесь.'),
        h('p', { class: 'note' }, `Возрастная категория: ${APP.ageRating} (436-ФЗ). Детям — с родителем.`),
        h('p', { class: 'note' }, 'В разработке использовались ИИ-инструменты. Перечень функций и отчёт о проверке лежат в репозитории: docs/AI_USAGE.md.'),
        h('button', { class: 'btn ghost', 'data-return': 'faq', onclick: () => app.go('faq', { from: 'settings' }) }, 'Вопросы и ответы'),
        // 6.0 — feedback after testing (task of 28.10): SUS, NASA-TLX, questions of the game; exported by the person
        h('button', { class: 'btn ghost', 'data-return': 'feedback', onclick: () => app.go('feedback', { from: 'settings' }) }, 'Отзыв о тестировании'))),
    bottomNav(app, 'settings'));

  // Back from a sub-screen (calibration, sound sync, tutorial): its section is open and focus is on the button that
  // led there (5.11 — focus went to the heading at the top with the section folded again).
  const returnTo = back ? [...node.querySelectorAll(`[data-return="${back}"]`)].find(b => !b.closest('[hidden]')) : null;
  if (returnTo) returnTo.closest('details')?.setAttribute('open', '');
  return {
    node,
    focus: returnTo,
    tick(now) {
      const intent = preview.pipeline.process(preview.source?.sample(now) ?? null, now);
      meter.update(intent);
      trace?.update(intent, now);
      if (streamBox && now - streamAt > 500) {
        streamAt = now;
        const decoder = app.sppprDecoder();
        const text = decoder?.lastText ? JSON.stringify(JSON.parse(decoder.lastText), null, 1).replace(/\n\s*/g, ' ') : '—';
        if (lastPacket.textContent !== text) lastPacket.textContent = text;
        const note = dictionaryAdvice(decoder?.stats.variant ?? null, STREAM_DICTIONARY);
        if (dictionaryNote.textContent !== note) dictionaryNote.textContent = note;
      }
    },
    onBridgeStatus(st) { status.textContent = `Статус: ${BRIDGE_STATUS[st] ?? st}`; },
    onThresholds() { refreshPreview(); },
    onBleStatus(st) { bleStatus.textContent = st === 'disconnected' ? 'Bluetooth: связь потеряна — переподключаемся…' : st === 'failed' ? 'Bluetooth: не удалось переподключиться' : `Bluetooth: ${st}`; },
  };
}

export function calibrationScreen(app) {
  // Calibration changes how the signal is read: in child mode it sits behind the parent PIN like the settings
  // (the results screen links here directly).
  if (app.settings.audience === 'child' && app.settings.parentPin && !app.pinOk) return pinGateScreen(app, { next: 'calibration' });
  if (app.sensorsPaused()) {
    return {
      node: h('div', { class: 'screen calibration' },
        topBar('Калибровка', () => app.go('settings', { back: 'calibration' })),
        h('main', { class: 'scroll center' },
          h('p', { class: 'note warn' }, 'Сегодня датчики выключены: кожа под ними раздражена. Калибровка — в другой день.'))),
      focus: null,
    };
  }
  const kind = app.sourceKind();
  // Paced by «Темп игр» and started on demand (5.11, accessibility review: it ran by itself, silently, in 11 s —
  // a blind or slow user with real sensors could not follow it and saved a wrong calibration).
  const pace = Math.max(0.6, app.settings.gameSpeed || 1);
  const steps = () => CALIBRATION_STEPS.map(st => ({ ...st, seconds: st.seconds / pace }));
  let recorder = new CalibrationRecorder(steps()), started = false, finished = false, lastStep = null;
  const title = h('h2', {}, 'Готовы?'), text = h('p', {}, 'Четыре шага: покой, сжатие, отдых, раскрытие. Каждый шаг будет назван и озвучен.'), ringPic = picture('hand-rest', 56, 'cal-hand'), ring = h('div', { class: 'cal-ring' }, ringPic);
  // 5.32: the bionic hand of the games in the ring shows the pose of the step
  const STEP_HAND = { rest: 'hand-rest', a: 'hand-close', relax: 'hand-rest', b: 'hand-open' };
  let ringPose = 'hand-rest';
  const live = h('p', { class: 'sr-only', role: 'status' });
  const meter = signalMeter(app);
  const result = h('div', { class: 'cal-result' });
  const pipeline = app.createPipeline();
  const source = app.liveFrames(); // 5.32: follows the bridge the host's first frame rebuilds
  const announce = (words, interrupt = true) => { live.textContent = words; app.say(words, { interrupt }); };
  const startButton = h('button', { class: 'btn primary big', onclick: () => begin() }, 'Начать калибровку');
  const again = h('button', { class: 'btn ghost', hidden: true, onclick: () => begin() }, 'Заново');
  const begin = () => {
    recorder = new CalibrationRecorder(steps()); started = true; finished = false; lastStep = null;
    result.replaceChildren(); startButton.hidden = true; again.hidden = false;
  };
  // Same frame as «Первые шаги» (5.10): the steps scroll, the signal and the pads stay on screen.
  const node = h('div', { class: 'screen calibration frame' },
    topBar('Калибровка', () => app.go('settings', { back: 'calibration' })),
    h('main', { class: 'frame-body center' },
      h('p', { class: 'note' }, kind === 'touch'
        ? 'Сейчас источник — эмулятор на экране: калибровка покажет процесс, а результат для эмулятора не нужен. Подключите внешний источник для настоящей калибровки.'
        : `Как «чувствительность датчиков» в приложении протеза: определяем покой и комфортное напряжение каждого канала${app.settings.prostheses === 'two' ? ` — ${app.settings.side === 'left' ? 'левого' : 'правого'} протеза. У второго своя калибровка: смените в настройках, какой протез ведёт` : ''}.`),
      ring, title, text, live, startButton, result,
      h('div', { class: 'row-actions' },
        again,
        h('button', { class: 'btn ghost', onclick: () => { if (!confirm('Сбросить калибровку этого источника к значениям по умолчанию? Сохранённую калибровку вернуть нельзя.')) return; app.state.calibrations[app.calibrationKey(kind)] = defaultCalibration(); app.save(); toast('Калибровка сброшена'); } }, 'Сбросить'))),
    h('div', { class: 'frame-dock' }, meter.node,
      kind === 'touch' ? h('div', { class: 'controls', role: 'region', 'aria-label': 'Управление' }, createTwoChannelPads(app.emulator)) : null));
  return {
    node,
    focus: startButton,
    tick(now, dt) {
      const frame = source?.sample(now) ?? null;
      meter.update(pipeline.process(frame, now));
      if (!started || (finished && recorder.done)) return;
      recorder.push(frame, dt);
      const step = recorder.step;
      if (step) {
        finished = false;
        if (lastStep !== step.id) {
          lastStep = step.id;
          title.textContent = step.title; text.textContent = step.text;
          announce(`${step.title}. ${step.text}`);
          app.feedback.event({ name: 'tick' }); // a sound and a buzz at every step change
        }
        ring.style.setProperty('--p', String(recorder.stepProgress));
        ring.dataset.step = step.id;
        const want = STEP_HAND[step.id];
        if (ringPic && want && want !== ringPose && hasArt(want)) { ringPic.src = artUrl(want); ringPose = want; }
      } else if (!finished) {
        finished = true;
        const r = recorder.result();
        const save = r.usable && kind !== 'touch';
        // 5.32 — rest that ripples up to the switch-off level: offer the threshold that keeps it off (game thresholds
        // only; the prosthesis's own ones, when the host sent them, are not the game's to change). A capped offer does
        // not clear rest (the slider is already at its top), so it is said and not applied.
        const s = app.settings, current = [s.sensitivity, s.sensitivityB ?? s.sensitivity];
        const hostRaw = app.prosthesisThresholds();
        // Judge the person's own line even when nothing can be saved. One flat channel used to hide the other
        // channel's ripple when that ripple sat between their slider and the default 22 % line. The offer to raise
        // a slider still needs a calibration we keep: a new threshold on the old calibration would be a different muscle.
        const judging = kind !== 'touch' && !hostRaw;
        const judged = judging ? current.map((v, ch) => thresholdForRest(r.restLevel?.[ch], v)) : [null, null];
        const raise = judged.map(x => (save && x?.clears ? x : null));
        const stuck = judged.map((x, ch) => (x && !x.clears ? ch : null)).filter(ch => ch !== null);
        // The recorder's ripple line is the default 22 %. Compare it with the line that will actually switch the
        // channel on: the prosthesis thresholds read through this calibration, or the game sliders.
        const hostOn = hostRaw ? thresholdShares(hostRaw, r.calibration, current) : null;
        const issues = shownRippleIssues(r.issues, { restLevel: r.restLevel, judging, judged, hostOn });
        title.textContent = issues.length ? 'Есть замечания' : 'Готово';
        text.textContent = `Разделение каналов: A ${fmtPct(Math.round(r.separation[0] * 100))}, B ${fmtPct(Math.round(r.separation[1] * 100))}.`;
        // Without signal there is nothing to save: the previous calibration stays.
        let applyRaise = raise.some(Boolean);
        const names = chs => chs.map(ch => (ch ? 'B' : 'A')).join(' и ');
        const stuckText = stuck.length ? `Канал${stuck.length > 1 ? 'ы' : ''} ${names(stuck)}: даже потолок порога ${pct(R.sensitivity.max)} не удержит покой — покой может включить ${stuck.length > 1 ? 'их' : 'его'} сам. Порог не меняем. Проверьте, как прилегает датчик.` : '';
        // The offer is said too: a screen-reader or a voice user does not see the switch above «Сохранить».
        const offerText = raise.some(Boolean) ? `Можно поднять ${raise.map((x, ch) => (x ? `порог ${ch ? 'B' : 'A'} до ${pct(x.value)}` : null)).filter(Boolean).join(' и ')}: переключатель над кнопкой «Сохранить».` : '';
        announce(`${title.textContent}. ${[...issues, stuckText, offerText].filter(Boolean).join(' ')}`);
        const raiseRow = applyRaise ? toggleRow(
          `Поднять ${raise.filter(Boolean).length > 1 ? 'пороги' : 'порог'} по дрожи покоя`, true, v => { applyRaise = v; },
          `${raise.map((x, ch) => (x ? `${ch ? 'B' : 'A'} — ${pct(x.value)}` : null)).filter(Boolean).join(', ')}. Так покой не включит ${raise.filter(Boolean).length > 1 ? 'эти каналы' : 'этот канал'} сам. Ползунки — в «Чувствительности».`) : null;
        const stuckNote = stuckText ? h('p', { class: 'note warn' }, stuckText) : null;
        const done = h('button', { class: 'btn primary big', onclick: () => {
          if (save) {
            app.state.calibrations[app.calibrationKey(kind)] = r.calibration; app.save();
            if (applyRaise) app.updateSettings({ sensitivity: raise[0]?.value ?? current[0], sensitivityB: raise[1]?.value ?? current[1] });
            toast(applyRaise ? 'Калибровка и пороги сохранены' : 'Калибровка сохранена', 'good');
          }
          app.go('settings', { back: 'calibration' });
        } }, save ? 'Сохранить' : 'Понятно');
        result.replaceChildren(...issues.map(i => h('p', { class: 'note warn' }, i)), ...(stuckNote ? [stuckNote] : []), ...(raiseRow ? [raiseRow] : []), done);
        done.focus({ preventScroll: true });
      }
    },
  };
}
