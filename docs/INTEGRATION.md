# Подключение эмулятора организаторов, датчиков или протеза

## Контракт кадра (SignalFrame)

```json
{ "a": 0.42, "b": 0.05, "gesture": "pinch", "confidence": 0.91, "effort": 0.6 }
```

| Поле | Обязательно | Смысл |
|---|---|---|
| `a`, `b` | да (для жестов можно опустить) | огибающая ЭМГ каналов A (сжатие) и B (раскрытие), ≥ 0. Если не 0..1 — выполните калибровку |
| `gesture` | нет | `rest, fist, open, pinch, point, key, thumb`, индекс 0–6 или синонимы (`close`, `palm`, `tripod`, `lateral`, `кулак`…) |
| `confidence` | нет | уверенность классификатора 0..1; ниже 0,6 → «покой» |
| `effort` | нет | сила жеста 0..1 (иначе берётся max(a, b)) |

Время кадра проставляется **при получении** — часы источника не важны. Если 300 мс нет кадров — упражнение замирает.

Принимаются и другие формы: `{ch:[a,b]}`, `{channels:[…]}`, `{emg:[…]}`, `[a,b]`, строка `"a b"`/`"a,b"`, `{class|label: …, prob|p: …}`. Номера каналов для A/B в многоканальном массиве задаются в `parseExternal(msg, {channelA, channelB})`.

**Когда 28.10 опубликуют эмулятор:** изменить только `src/input/bridge.js → parseExternal()` (+ тест в `tests/core.test.mjs`). Если эмулятор — программа с выводом в консоль, используйте `--stdin` без изменения кода игры.

## Транспорты

1. **WebSocket** — Настройки → Источник → «Внешний» → адрес `ws://IP:порт` → «Подключить».
2. **postMessage** (игра в iframe/WebView): `iframe.contentWindow.postMessage({type:'synergy-frame', a, b}, '*')`.
3. **JS API**: `window.Synergy.feed({a, b, gesture})`; `window.Synergy.useBridge('ws://…')`; `window.Synergy.state()`.
4. **Android**: в `MainActivity.pushFrame(a, b, gesture)` — вызвать из колбэка SDK/BLE протеза.

## Мост `bridge/ws_bridge.py` (Python 3.9+, без зависимостей)

```bash
python3 bridge/ws_bridge.py --demo                 # сценарий: A, B, коактивация
python3 bridge/ws_bridge.py --demo-gestures        # перебор 7 жестов
emulator_cli | python3 bridge/ws_bridge.py --stdin # любой поток "a b" или JSON по строке
pip install -r lab/requirements.txt && python3 bridge/ws_bridge.py --lab
                                                   # сырая 4-канальная ЭМГ → фильтр 20–450 Гц → признаки
                                                   # (RMS, MAV, WL, ZC, SSC) → LDA 7 жестов → игра
python3 bridge/ws_bridge.py --demo --host 0.0.0.0  # чтобы телефон в той же Wi-Fi видел мост
```

В режиме `--lab` площадки на экране игры управляют тем, какой жест синтезирует лаборатория (игра отправляет `{"type":"intent", …}`), а распознаёт его настоящий классификатор — с реальными ошибками.

## Калибровка

Настройки → «Калибровка датчиков»: 3 с покоя, 3 с комфортного сжатия (≈70 %), отдых, 3 с раскрытия. Сохраняются покой и комфортный максимум каждого канала (как «чувствительность датчика» в Motorica Start), предупреждения о слабом сигнале и перекрёстных помехах. Калибровка хранится отдельно для экранного эмулятора и внешнего источника.

## Bluetooth-датчики (v5)

Настройки → Источник «Внешний» → «Bluetooth-датчик (BLE UART)». Сервис Nordic UART `6e400001-…`, уведомления TX `6e400003-…`, строки `"a b\n"` / `"a,b\n"` / JSON — тот же `parseExternal()`. Куски по 20 байт склеиваются (`LineAssembler`), мусор без перевода строки > 512 символов отбрасывается, при обрыве — 3 попытки переподключения. После подключения обязательна калибровка (сырые единицы АЦП 0..4095). Прошивка-пример: `bridge/firmware/esp32_emg_ble/` (ESP32 + 2 × MyoWare 2.0, 50 Гц; **не компилировалась командой**). Web Bluetooth: Chrome/Edge на Android и ПК; не в iOS Safari и не в Android WebView — там `pushFrame()`.

## Нативный мост Android (v5)

`window.SynergyNative.speak(text, interrupt)`, `.stop()`, `.share(name, mime, text)` (системное «Поделиться» вместо скачивания — WebView не умеет blob-загрузки), `.print(title, html)` (PrintManager → «Сохранить как PDF»). Доступен только страницам из `android_asset` (внешняя навигация заблокирована).
