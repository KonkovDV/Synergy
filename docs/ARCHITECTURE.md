# Архитектура

## Поток сигнала (один для игры, демо и тестов)

```
 Источник сигнала (SignalSource.sample(now) → SignalFrame)
 ├─ EmgEmulator ← площадки на экране / клавиатура / автопилот демо
 ├─ BridgeSource ← WebSocket · postMessage · window.Synergy.feed · Android pushFrame
 │
 ▼
 SignalPipeline (core/signal.js)
   readFrame → сторож 300 мс → калибровка → сглаживание → пороги с гистерезисом
   → коактивация (≥40 %, ≤350 мс) → схема: пороговая | пропорциональная | жесты
 ▼
 Intent {valid, command, intensity, level, a, b, gesture, confidence}
 ▼
 BionicHand (core/hand.js) — закон управления протезом (скорость ∝ сигналу, хват держится сам)
 ▼
 Game (games/*.js) — step(dt, intent, hand) · render(canvas) · result() · autopilot()
 ▼
 Progress (core/progress.js) — XP, серия, недельная цель, достижения, план дня, навыки
```

`GameRunner` (games/runner.js) выполняет один шаг этой цепочки. Его используют и экран игры, и headless-тесты: проверяется ровно то, во что играет человек.

## Слои и правила зависимостей

| Слой | Папка | Зависит от | Правило |
|---|---|---|---|
| Домен | `src/core` | только `config.js` | без DOM, детерминирован, покрыт тестами |
| Источники | `src/input` | core | один контракт `sample(now)` |
| Игры | `src/games` | core, render | общий базовый класс `Game`; каталог — `registry.js` |
| Отрисовка | `src/render` | — | процедурная графика, без ассетов |
| Сервисы | `src/services` | core | звук, вибрация, отчёты |
| UI | `src/ui` | всё выше | экраны = функции `(app, params) → {node, tick, cleanup}` |
| Композиция | `src/app.js` | всё | единственное место, где создаются объекты |

## Принципы (обязательные для команды и ИИ)

- **DRY:** параметры — только в `config.js`; словарь — только в `core/vocabulary.js`; формат внешних данных — только в `parseExternal()`; шаг цепочки — только в `GameRunner`.
- **KISS:** ванильный JS без фреймворков, Canvas 2D, ~3,5 тыс. строк; сборка одной командой.
- **SOLID:**
  - S — у каждого модуля одна причина меняться (пример: `CalibrationRecorder` только собирает калибровку);
  - O — новая игра = новый файл + строка в `registry.js`, остальной код не меняется;
  - L — любая игра заменяема в `GameRunner`, любой источник — в `SignalPipeline`;
  - I — источнику нужен только `sample(now)`, игре — `step/render/result/autopilot`;
  - D — планировщик (`core/progress.js`) получает каталог игр параметром, а не импортирует UI.
- **Ubiquitous language:** термины из `docs/GLOSSARY.md` одинаково звучат в коде, интерфейсе, документах и питче.

## Как добавить игру

1. `src/games/my-game.js`: `class MyGame extends Game` со `static id/title/skills/levels`, методы `step`, `render`, `autopilot`, `progress`, `scoreValue`, `skillScores`, `details`.
2. Строка в `GAMES` в `src/games/registry.js` (иконка, теглайн, «как играть»).
3. Тест появится автоматически: `tests/games.test.mjs` проходит все игры × уровни × схемы автопилотом.

## Хранение

`localStorage['synergy.v4']`: `{version, profile, settings, calibrations:{touch, bridge}, runs[]}`. Повреждённые данные сохраняются в `synergy.v4.corrupt`, не перезаписываются. Демо-прогоны не сохраняются. Никакой сети, аккаунтов и аналитики.

## v5: новые модули (те же правила слоёв)

| Модуль | Слой | Ответственность |
|---|---|---|
| `core/adaptive.js` | домен | challenge point: доля успехов за 4 попытки → `ease` ∈ [−1, 1], допуски ×(1 ± 0,3·ease); выключен в испытании без подсказки и в проверке (`static adaptive = false`) |
| `core/wellbeing.js` | домен | опрос (NRS-категории, усталость) → go/light/stop; признаки усталости по падению результата |
| `core/tutorial.js` | домен | шаги обучения: проверка намерения + удержание |
| `core/guidance.js` | домен | затухающая обратная связь: навык → доля попыток с живой шкалой; `Game.liveFeedback(i)` |
| `core/analytics.js` | домен | матрица ошибок жестов, история проверок |
| `core/showcase.js` | домен | синтетический профиль через `recordRun` (DRY: те же правила, что в игре) |
| `games/assess.js` | игры | «Проверка навыка» — фиксированный протокол, метрики Motion Test/TAC |
| `input/ble.js` | источники | Web Bluetooth NUS: сборка строк из уведомлений, переподключение 1/2/4 с → `BridgeSource.feed` |
| `services/voice.js` | сервисы | Web Speech / нативный TTS, троттлинг |
| `ui/checkin.js`, `ui/tutorial.js`, `ui/pin.js` | UI | экраны |
| `App.startPlan()` | композиция | поток плана дня (опрос → пункт плана); экраны не импортируют друг друга |

Темп игры: `GameRunner` передаёт игре `dt × speed`, кисть живёт в реальном времени. Нативный мост Android `window.SynergyNative`: `speak/stop/share/print`; сервисы используют его, если он есть (Liskov: тот же контракт, что у браузерных API).
