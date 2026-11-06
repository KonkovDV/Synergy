# Архитектура

## Поток сигнала (один для игры, демо и тестов)

```
 Источник сигнала (SignalSource.sample(now) → SignalFrame)
 ├─ EmgEmulator ← площадки на экране / клавиатура / автопилот демо
 ├─ BridgeSource ← WebSocket · postMessage · window.Synergy.feed · Android pushFrame
 │    parseExternal: кадр {a, b, gesture?} · снимок Motorica Start v1 · Sensor_levels
 │                   · пороги протеза [A, B] (5.29: getLatestThresholds, open/close_ch_num) — не кадр
 ▼
 SignalPipeline (core/signal.js)
   readFrame → сторож 300 мс (жест после обрыва — с покоя) → калибровка
   (+ RestTracker: подстройка покоя, только внешний источник) → сглаживание
   → порог включения каждого канала: порог игры или порог протеза через калибровку (thresholdShares, 5–90 %)
   → гистерезис → коактивация (≥40 %, ≤350 мс) → схема: пороговая | пропорциональная | жесты
 ▼
 Intent {valid, command, intensity, level, a, b, on: [A, B], gesture, confidence}
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
| Источники | `src/input` | core | один контракт `sample(now)`; экранные площадки и клавиатура эмулятора — это UI (`ui/controls.js`) |
| Игры | `src/games` | core, render | общий базовый класс `Game`; каталог — `registry.js` |
| Отрисовка | `src/render` | — | процедурная графика, без ассетов |
| Сервисы | `src/services` | core, render | звук, вибрация, отчёты |
| UI | `src/ui` | всё выше | экраны = функции `(app, params) → {node, tick, cleanup}` |
| Композиция | `src/app.js` | всё | единственное место, где создаются объекты |

**Правила слоёв проверяются кодом** (функция пригодности архитектуры): `tests/architecture.test.mjs` разбирает каждый импорт и падает при нарушении; второй тест не пускает в домен `document`, `window`, `navigator`, `localStorage`, `AudioContext`.

## Принципы (обязательные для команды и ИИ)

- **DRY:** параметры — только в `config.js`; словарь и **набор жестов** — только в `core/vocabulary.js` (производные: `ACTIVE_GESTURES`, `CLOSING_GESTURES`, `COMMAND_POSE`, `GRIP_NAME`, `gestureLegend()`; страж — `tests/vocabulary.test.mjs`, учебная замена — `tools/gesture-drill.mjs`); формат внешних данных — только в `parseExternal()`; шаг цепочки — только в `GameRunner`; путаницы жестов — только в `GESTURE_CONFUSION`.
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

`localStorage['synergy.v4']`: `{version, profile, settings, calibrations:{touch, bridge, bridge-left, bridge-right}, runs[]}`; набор жестов — `localStorage['synergy.gestureSet']`. Повреждённые данные сохраняются в `synergy.v4.corrupt`, не перезаписываются. Демо-прогоны не сохраняются. Никакой сети, аккаунтов и аналитики.

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

## v5.3: новые модули

| Модуль | Слой | Ответственность |
|---|---|---|
| `core/calibration.js → RestTracker` | домен | ко-адаптивная калибровка: покой следует за дрейфом в подтверждённом покое, сдвиг ограничен; флаг «пора перекалибровать». `SignalPipeline` получает трекер параметром (D), `App` решает, когда он нужен (`restAdaptationAllowed`) |
| `core/confusion.js` | домен | строка весов путаниц жестов и взвешенный выбор — общие для эмулятора и демо-профиля |
| `core/fps.js` | домен | страж кадров: EMA реального времени кадра → «упрощённая графика» |
| `games/assess.js → FITTS, fittsId` | игры | блок Фиттса в проверке навыка: ID, время движения, пропускная способность, эффективность пути |
| `tests/bundle.test.mjs` | тесты | собирает весь бандл: синтаксис и импорты UI проверяются в `npm test` |
| `tests/submission.test.mjs` | тесты | ворота сдачи проверяются на временной копии с подложенными ошибками |

Темп игры: `GameRunner` передаёт игре `dt × speed`, кисть живёт в реальном времени. Нативный мост Android `window.SynergyNative`: `speak/stop/share/print`; сервисы используют его, если он есть (Liskov: тот же контракт, что у браузерных API).

## v5.13: новые модули (те же правила слоёв)

| Модуль | Слой | Ответственность |
|---|---|---|
| `core/pet.js` (расширен) | домен | причина настроения (`petState().reason`), реакции (`PET_ANIMATIONS`, `petReaction`, `petTap`), места и вещи (`PET_SLOTS`, `PET_ITEMS`, `wornItems`, `autoEquip`, `equipItem`, `cleanOutfit`), `petName()` |
| `core/missions.js` | домен | цели от Жар-птицы: словарь условий (`MISSION_KINDS`), `validMission` (решает, что может быть целью), предложения недели, шаг по прогону, награда с потолком. Каталог игр — параметром (D) |
| `core/tours.js` | домен | подсказки-туры данными: триггер, версия, шаги по якорям; `TourSession` (пропуск шагов без якоря, возобновление, завершение и пропуск), `pendingTour`, `mergeTours`, `tourProblems` |
| `ui/tour.js` | UI | карточка тура над панелью, кольцо вокруг якоря `data-tour`, фокус, Esc/«Назад», пауза при уходе с экрана |
| `ui/goals.js` | UI | экран «Цели» |
| `ui/art.js → petItemsArt` | UI | вещи птицы SVG-кодом по якорям стадий; группы `fb-bird`, `fb-eyes`, `fb-tail` для CSS-анимаций |
| `tests/rules.test.mjs` | тесты | `docs/GAME_RULES.md` = код: константы, примеры, списки |

Где живёт состояние: надетое и активная цель — в профиле (`profile.pet`, `profile.mission`; это прогресс человека), туры — в настройках (`settings.tours`; это «как приложение ведёт себя для человека», сбрасывается кнопкой «Показать подсказки снова»). Всё проверяется при загрузке копии, как любое поле (`core/storage.js`). `App.go()` после монтирования экрана спрашивает тур этого экрана (`startTour`); `App.handleBack()` сначала закрывает подсказку.

## v5.14: новые модули (те же правила слоёв)

| Модуль | Слой | Ответственность |
|---|---|---|
| `ui/nest.js` | UI | гнездо — раздел Жар-птицы: сцена с аурой, путь роста, наряды, достижения и подарки, облик протеза |
| `ui/petcard.js` | UI | птица-кнопка и её облачко, общие для главной и гнезда (ответы по очереди — `core/pet.js petTap`) |
| `ui/faq.js`, `core/faq.js` | UI / домен | «Спросить Мио»: вопросы — `<details>`, ответы — данные с числами из `config.js` |
| `core/everyday.js` | домен | «Дело дня в быту»: каталог, задание по дате (детерминированно), проверка id из копии |
| `core/pet.js` (расширен) | домен | причина `back` («С возвращением», `PET.comebackDays`), лестница празднований `CELEBRATION` |
| `core/progress.js` (расширен) | домен | `shiftDay`, `daysSinceTraining`, `weekCompare` (неделя к неделе) |
| `core/tutorial.js` (расширен) | домен | шаги блокировки протеза со временем `settings.lockHoldS` (`LOCK` в `config.js`) |
| `services/host.js` | сервис | встраивание в приложение заказчика: `parseLaunch` (недоверенный URL), `resultMessage` (без самочувствия), `notifyHost` (только на названный origin) |
| `services/report.js` (расширен) | сервис | период отчёта (`REPORT_PERIODS`, `periodKeys`, `periodSummary`) |
| `ui/art.js → evolution` | UI | церемония роста: два рисунка и свет; анимации — CSS, «Меньше движения» — кроссфейд |
| `tests/v514.test.mjs` | тесты | всё перечисленное, плюс линтер текстов, плюралы, property-тесты (seed), ссылки документов |

Где живёт состояние: «дело дня» — в записи дня профиля (`profile.days[день].everyday`, самоотчёт, проверяется при загрузке копии); «есть протез / жду» и время блокировки — в настройках (`prosthesis`, `lockHoldS`, правила в `SETTINGS_RULES`); период отчёта — только в памяти экрана. `App` читает параметры встраивания при старте (`this.launch`) и после сохранения упражнения отдаёт сводку хосту.

## v5.15: новые модули (те же правила слоёв)

| Модуль | Слой | Что делает |
|---|---|---|
| `services/host.js` (расширен) | сервис | протокол встраивания 1: `readyMessage`, `closeMessage`, `parseHostCommand` (команды хоста проверяются как адрес), `hostChannel` (нативный канал WebView любого стека из кейса), `isEmbedded` |
| `app.js` (расширен) | композиция | `pendingLaunch` (упражнение хоста — после знакомства), `onHostCommand` (только `trustedMessageSource`), `hostSource` (сигнал хоста без WebSocket), `notifyReady`, `closeToHost`; `embedded` — по запуску или по каналу в момент сообщения |
| `input/bridge.js` (расширен) | ввод | `CONNECT_TIMEOUT_MS`: «висящее» соединение сбрасывается; статус `unreachable`, пока мост ни разу не ответил; обработчик ошибки снимается до `close()` (рекурсия в undici) |
| `core/primer.js` | домен | «Азбука протеза»: темы и карточки данными (числа — из `config.js`, хваты — из `vocabulary.js`), прочитано / проверка / лучший результат, `primerMastered`, `cleanPrimer` для копии |
| `ui/primer.js` | UI | экран «Азбуки»: список тем, карточка-кнопка с ответом внутри, проверка с объяснением |
| `core/wellbeing.js` (расширен) | домен | `SAFETY_RULES` с `SAFETY_VERSION` и `safetyOutdated` — один список для онбординга и повторного чтения |
| `docs/embed/` | документы | руководство и примеры хостов: Web (проверен e2e), Kotlin (скомпилирован), Swift, Flutter, React Native (типы проверены), Unity |


## v5.16: иллюстрации (те же правила слоёв)

| Модуль | Слой | Что делает |
|---|---|---|
| `public/art/*.webp`, `public/art/manifest.json` | ресурсы | каталог команды: размер, байты, SHA-256 файла и исходника, рамки вещей птицы. В 5.16 их было 137, в каталоге 6.2 — 244 (`docs/evidence.json`) |
| `ui/art-manifest.js` | UI (сгенерирован) | `ART` — имя → ширина, высота, альфа; `PET_LAYOUT` — рамки вещей на каждой картинке птицы. Пишет `tools/import-art.py`, руками не правится |
| `ui/pictures.js` | UI | `picture()` — `<img>` с классом `art` (те же правила размеров, что у рисунков) и запасным рисунком при ошибке загрузки; `petPicture()` — слои птицы (гнездо за ней, птица с вещами одной группой `fb-bird`, вещи гнезда впереди); `petPictureName()` — поза уступает надетой вещи, у спящей в гнезде оберег остаётся под птицей; `loadSprites()` при старте без комнат, комнату игры грузит `roomPictures` при входе; адрес картинки — data URI автономного файла, `art/` сборки или `public/art/` исходников |
| `ui/art.js` (расширен) | UI | прежние `mio`, `gameArt`, `badgeArt`, `firebird` сначала берут картинку, рисунок — запасной; новые `achievementArt`, `giftArt`, `skinArt`, `gestureArt`, `dayArt`, `sectionArt`, `coverArt` |
| `render/fx.js` (26.10) | отрисовка | свет бренда на холсте: безопасные градиенты (заглушка без `addColorStop` → сплошной цвет), свечение, мягкая тень, глянцевая сфера, световые шлейфы, искры-звёздочки, стеклянная плашка; `cachedLayer` — статичный фон сцены рисуется один раз на размер, тему и плотность пикселей (без `document` — прямо в кадр). Спецификация — `docs/GAME_VISUALS.md` |
| `render/sprites.js` | отрисовка | реестр спрайтов холста: UI загружает картинки и передаёт сюда, игра рисует спрайт, только когда он готов (`drawSprite` → `false` — рисуй кодом). Отрисовка по-прежнему не знает ни адресов, ни DOM |
| `games/grip.js`, `games/safe.js`, `ui/tutorial.js` (расширены) | игры, UI | предметы «Мастерской», кисть жеста на карточке «Сейфа» и в фазе покоя, замок «Первых шагов» — спрайты; разбитый предмет и жест без картинки — рисунок кодом |
| `tools/import-art.py` | инструмент | пакет PNG → вырезка (маска rembg + colour-to-alpha), WebP по ролям, каталог, рамки вещей по глазам птицы, иконки PWA и APK, заставка; контактные листы для просмотра (`--sheets`) |
| `tools/build.mjs` (расширен) | сборка | `dist/art/` в офлайн-кэше сервис-воркера; в автономном файле — `window.SYNERGY_ART` с data URI |
| `android/res` (расширен) | оболочка | адаптивная иконка (`mipmap-anydpi-v26`), заставка в теме окна `Synergy` (день и ночь), WebView прозрачен до первой отрисовки |

## v5.27–v5.29: что изменилось в потоке (те же правила слоёв)

| Где | Что | Почему |
|---|---|---|
| `core/signal.js` | сторож сбрасывает жест в покой; `thresholdShares()` и `channelThresholds()` — свой порог у каждого канала; `intent.on` | протез не исполняет жест до обрыва; пороги протеза от хоста (`docs/INTEGRATION.md`) |
| `input/bridge.js` | `trustedMessageSource(…, hostOrigin)`; разбор порогов; `BridgeSource.thresholds` (меняются местами с каналами, переживают пересоздание источника) | RT-13; пороги — не кадр и не трогают сторож |
| `app.js` | `prosthesisThresholds()`, `switchOn()`: пороги протеза только для живого внешнего источника и при включённой настройке; силы игр — выше большего порога; `stopForPain()`; `sensorsPaused()` — раздражённая кожа всегда | один источник решения для конвейера, игры, экрана и записи упражнения |
| `core/calibration.js` | «плоский» канал и дрожь покоя — по устойчивому шуму покоя (`CALIBRATION_QUALITY`) | источник со смещением калибруется |
| `tools/evidence.mjs`, `tools/check-submission.mjs` | отпечаток кода у прогонов e2e; версия `CITATION.cff` | доказательства относятся к тому коду, который сдаётся |
| `input/bridge.js`, `ui/widgets.js` (`bridgeLine`) | имена обучения UBI4 — синонимы поз; класс не из набора — кадр покоя с меткой; таблица имён без прототипа | чужой класс не выглядит обрывом связи; разбор не отдаёт служебные объекты (RT-14) |
| `tools/supply-chain.mjs`, `tools/pip-hashes.py` | правила цепочки поставки как проверка, вызываемая воротами; hash пакетов лаборатории | правило, которое держится на памяти, однажды нарушат |

## v5.30: митап 21.10, наборы жестов, две руки, платформы (те же правила слоёв)

```
 BridgeSource ── parseExternal: {…, side} · {left, right} · {sides: …} · probs (СППР)
   ├─ sample()          → кадр ведущей стороны (один протез — как раньше)
   └─ sampleSide(side)  → кадр левой или правой руки
 GameRunner(source, quality?) ── SignalQualityMonitor.push(frame) → verdict на экране, summary() в запись упражнения
 DuoRunner(sources{left,right}, pipelines, hands, qualities) → intent.sides → DuoGame
```

| Где | Что | Точка расширения |
|---|---|---|
| `core/gesture-set.js` | выбор набора жестов до загрузки модулей: адрес → настройки → окружение → «Синергия» | новый набор — запись в `GESTURE_SETS` (`core/vocabulary.js`) и id в `GESTURE_SET_IDS` |
| `core/vocabulary.js` | `GESTURE_SETS` (Синергия, UBI4), `GESTURE_CLASS_ORDER`, `GESTURE_SEQUENCE`, команда `wrist` | порядок классов набора = порядок вероятностей СППР |
| `input/bridge.js` | `decodeProbabilities` (массив или «имя → p», argmax, выравнивание по классам); сторона кадра; `bySide`, `sideState`, `sampleSide`; метка + распределение | новый формат СППР — одна функция |
| `core/hands.js` | `SIDES`, `controlHand()` (кнопки под здоровую руку), `sideOf()` | третий режим раскладки — одна функция |
| `core/signalquality.js` | `SignalQualityMonitor`: помехи, скачки, застывший канал, упор; `QUALITY`, `QUALITY_TIPS`; `runSignalIssues`, `cleanSignalIssues`, `signalIssueSummary` | новый признак — детектор в `issues()` и строка в `QUALITY_TIPS` |
| `games/runner.js` | `GameRunner.quality`; `DuoRunner` — по конвейеру, кисти и сторожу на руку | игра на две руки — `static bimanual = true` |
| `games/duo.js` | «Две руки»: карточки команд для каждой руки, навык разделения | новые карточки — `DUO_PROMPTS` |
| `app.js` | `liveFrames()` — упражнение читает текущий внешний источник каждый кадр; `qualityMonitor()`; `calibrationKey()` (`bridge-left`, `bridge-right`) | — |
| `core/progress.js` | `sessionTopUp()` — ещё одно упражнение, если активной игры меньше `SESSION.activeMin[0]` | — |
| `ui/controls.js`, `styles/app.css` | кнопки под руку (`data-hand`), пары кнопок «Двух рук», подсказка клавиш на компьютере, две колонки игры в широком окне | — |
| `android/…/MainActivity.java` | `launchQuery()`: extras и `synergy://play` → проверенный запрос + `self=1` | новый параметр запуска — шаблон в двух оболочках и в `parseLaunch` |
| `ios/` | SwiftUI + WKWebView: `SynergyNative` с теми же методами, что у Android (`speak`, `stop`, `haptic`, `share`, `print`, `nightMode`), `LaunchRequest` | новый нативный метод — в обеих оболочках, тест сверяет списки |

**Почему так.** Набор жестов выбирается до загрузки модулей, потому что из него выводятся константы во многих модулях (позы, легенда, путаницы, хваты): переключение перезагружает страницу, и в памяти никогда нет двух наборов. Два протеза — это две стороны одного источника, а не два источника: хост «Моторики» держит одно соединение, а протез сам знает свою сторону. Тренер качества сигнала стоит в `GameRunner`, а не в экране: его видят и тесты, и запись упражнения.

### v6.1 — ответы организаторов 04.11

| Где | Что | Точка расширения |
|---|---|---|
| `core/vocabulary.js` | `TZ2` — те же объекты жестов набора ТЗ (нейтраль, сгибание, разгибание); `SPPPR_SETS` — наборы, чьи классы — словари СПППР | новый словарь СПППР — ещё один набор в `SPPPR_SETS` |
| `core/spppr.js` | `SPPPR_DICTIONARIES` (из `SPPPR_SETS`), строгий разбор по словарю, `stats.classes`, `dictionaryName()`, `dictionaryNote()` | — |
| `input/spppr-emulator.js` | словарь устройства `classes`: маска `known` на производство, утечку, сбой и шум | — |
| `core/channeluse.js` | `ChannelUse` (входы в команды A, B, коактивацию; секунды), `channelBalance()` (перекос `CHANNEL_BALANCE.dominance`), `balanceByGame()`, `cleanUses()` | — |
| `games/runner.js` | `GameRunner.uses`, `DuoRunner.sideUses` — счёт, пока упражнение идёт; одно место для всех игр | — |
| `games/safe.js` | `dealBalanced()` для схем с каналами, `dealFree()` (раздача 6.0.0) для схемы жестов | — |
| `games/flight.js` | строгое чередование колец сторон; сторона рампы и волны по зерну; `mirrorAlt()` | — |
| `input/bridge.js` | `{ hello }` в `parseExternal`, `BridgeSource.listens`; `sendIntent()` — доставка намерения на соединение | — |
| `ui/play.js` | `bridgeControls()` — площадки под внешним источником только для источника, который их читает | — |
| `services/host.js` | `side`, `thresholds` в `parseLaunch`; `channelsMessage()`, поле `channels` в `synergy:result` | новый ключ запуска — шаблон в трёх местах (страница, `MainActivity.launchQuery`, `LaunchRequest`), тест сверяет |


### v6.2 — поток 10 Гц и скринкаст

| Где | Что | Точка расширения |
|---|---|---|
| `core/spppr.js` | `SppprDecoder.datedStart()` — начало серии сырых пакетов команды (один чужой пакет внутри — прощённый шум); `onsetTs`; кадр несёт `since` (часы МК + смещение) и `packetMs` (медиана интервалов, переживает сброс статистики) | решения декодера не меняются: дата — только для тех, кто судит время |
| `core/signal.js` | `readFrame` берёт `since` и `packetMs` только у кадра декодера и в разумных пределах; `fromGesture` кладёт их в намерение | — |
| `games/rhythm.js` | `streamEventLag()` — задержка события по дате, `streamWaitLag()` — сколько нота ждёт на этом потоке; без даты — `RHYTHM_LATENCY_S` | другая игра на время — те же две функции |
| `input/spppr-emulator.js` | `streamProfile(realism, rateHz)`, `rateHz` у эмулятора и драйвера; `advanceTo()` — сокращение по времени опроса; выброс по полной строке путаниц | новая частота — значение в `STREAM_RATES_HZ` (`config.js`) |
| `input/spppr-source.js` | `OnScreenEmulator.rateHz` — смена частоты начинает счётчики потока заново | — |
| `tools/screencast.mjs`, `tools/screencast-plan.mjs` | скринкаст: запись телефона 430 × 932, сцена 1920 × 1080 в ffmpeg, `.srt` и главы; раскадровка — данные, проверяемые тестом | новая сцена — строка в `SCENES` и действие в `ACT` |
