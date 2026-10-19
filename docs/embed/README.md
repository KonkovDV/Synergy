# Встраивание «Синергии» в приложение заказчика

Организатор просит, чтобы решение было «подготовлено с учётом возможности дальнейшей интеграции в стороннее приложение», а в кейсе перечислены Swift, Kotlin, Flutter, React Native, Unity и Unreal Engine. «Синергия» — офлайн-веб-модуль: любой из этих стеков открывает её в своём WebView (или в `iframe` на сайте), запускает упражнение, передаёт сигнал протеза и получает результат.

Формат взят у образца команды (ФинФениксы, `docs/onboarding`): общий контракт, чек-лист, руководство и пример для каждой платформы и честный раздел «Как проверено». Кадр сигнала и транспорты — [INTEGRATION.md](../INTEGRATION.md); код контракта — `src/services/host.js`.

| Платформа | Пример | Как «Синергия» слышит хост |
|---|---|---|
| Web (сайт, PWA) | [web/host.html](web/host.html) | `postMessage` между `iframe` и страницей |
| Android (Kotlin) | [android/SynergyHostActivity.kt](android/SynergyHostActivity.kt) | `addJavascriptInterface(obj, "SynergyHost")` с методом `onMessage` |
| iOS (Swift) | [ios/SynergyHostView.swift](ios/SynergyHostView.swift) | `userContentController.add(handler, name: "synergyHost")` |
| Flutter | [flutter/synergy_host.dart](flutter/synergy_host.dart) | `addJavaScriptChannel('SynergyHost', …)` |
| React Native | [react-native/SynergyHost.tsx](react-native/SynergyHost.tsx) | `onMessage` у `react-native-webview` |
| Unity | [unity/SynergyHost.cs](unity/SynergyHost.cs) | `WebViewObject.Init(cb: …)` плагина gree/unity-webview |
| Unreal | — | готового канала нет (см. ниже) |

## Контракт (протокол 1)

**Игра → хост.** Каждое сообщение — одна JSON-строка с полями `type`, `protocol: 1`, `version`. В сообщениях нет ответов о самочувствии и имени: сведения о здоровье покидают устройство только в отчёте, который человек сохраняет сам.

| `type` | Когда | Поля |
|---|---|---|
| `synergy:ready` | первый экран открыт; повторно — в ответ на `synergy-ping` | `onboarded` — пройдено ли знакомство с безопасностью; `games` — `[{ id, title, levels }]`: что можно запустить |
| `synergy:result` | каждое упражнение (кроме демо автопилота) | `at`, `game`, `level`, `scheme`, `retention`, `score`, `stars`, `durationS`, `skills` |
| `synergy:close` | человек закончил: «Вернуться в приложение» на итогах (`reason: "done"`) или «Назад» на главной «Синергии» (`reason: "back"`) | `reason` |

**Хост → игра.**

| Как | Что |
|---|---|
| адрес `index.html?game=grip&level=2` | открыть упражнение. На самом первом запуске сначала идут страницы знакомства и безопасности, затем — это упражнение |
| адрес `?embed=1` | встроена без упражнения (показывает «Вернуться в приложение») |
| `window.Synergy.start(game, level)` | то же из нативного кода (`evaluateJavascript`, `evaluateJavaScript`, `runJavaScript`, `injectJavaScript`, `EvaluateJS`). Возвращает `false`, если сначала идёт знакомство: упражнение откроется после него |
| `window.Synergy.feed({ a, b, gesture })` | кадр сигнала, значения 0…1 (`SignalFrame`) |
| `window.Synergy.back()` | системная кнопка «Назад»: пауза упражнения, шаг назад; `false` — уже на главной (и игра отправила `synergy:close`) |
| `postMessage({ type: 'synergy-start', game, level })` | запуск из страницы другого origin (вызвать `window.Synergy` ей нельзя) |
| `postMessage({ type: 'synergy-frame', a, b, gesture })` | кадр из страницы другого origin; первый кадр сам переключает источник на «Внешний», как `feed` |
| `postMessage({ type: 'synergy-ping' })` | спросить ещё раз `synergy:ready` (слушатель подключился поздно) |

Команды через `postMessage` принимаются только от встраивающей страницы, самой страницы или нативного `WebMessage` без окна-источника (RT-7, `trustedMessageSource`). Неизвестная игра и уровень вне диапазона отбрасываются так же, как в адресе.

**Нативный канал без «клея».** Хосту не нужно внедрять скрипт: «Синергия» сама находит канал своего WebView — первый из списка, и каждое сообщение уходит в него один раз:

1. `window.SynergyHost.onMessage(json)` — Android, `addJavascriptInterface`;
2. `window.SynergyHost.postMessage(json)` — Flutter (`JavaScriptChannel` на Android и iOS) или Android-интерфейс с методом `postMessage`;
3. `window.webkit.messageHandlers.synergyHost.postMessage(json)` — iOS, `WKScriptMessageHandler`;
4. `window.ReactNativeWebView.postMessage(json)` — React Native;
5. `window.Unity.call(json)` — плагин WebView для Unity (gree/unity-webview).

Хост 5.14 с одним методом `SynergyHost.onResult(json)` по-прежнему получает результаты. Кроме канала, каждое сообщение — событие `CustomEvent` с тем же именем на `document` и `postMessage` родительскому окну, **только** на origin из параметра `?host=https://…` (на `*` не отправляется никогда).

## Чек-лист правильной интеграции

1. Соберите веб-версию (`npm run build`) и положите `dist/` в ресурсы приложения: Android — `assets/synergy/`, iOS — папка `synergy` в бандле, Flutter — `assets/synergy/`. Или откройте свой https-адрес с PWA.
2. Включите JavaScript и `localStorage` (DOM storage): прогресс человека хранится в странице.
3. Разрешите звук без касания (`mediaPlaybackRequiresUserGesture = false`, `mediaTypesRequiringUserActionForPlayback = []`): музыка «Ритма» и сигналы.
4. Не уводите WebView на чужие адреса (`shouldOverrideUrlLoading`): игра офлайн и никуда не ходит.
5. Подпишитесь на канал своей платформы (таблица выше), разбирайте JSON и проверяйте `protocol === 1`.
6. Запускайте упражнение адресом `?game=` или после `synergy:ready` — `Synergy.start(game, level)`. Знакомство с безопасностью при первом запуске не пропускается: это правило продукта.
7. Передавайте сигнал протеза `Synergy.feed` на каждом кадре SDK (20–100 Гц). Первый кадр сам включает источник «Внешний»; WebSocket по сохранённому адресу при запуске хостом не набирается (пока человек сам не введёт адрес в настройках). Если кадры перестали приходить на 300 мс, упражнение замирает: это не ошибка человека.
8. Кнопку «Назад» отдавайте `Synergy.back()`; на `synergy:close` закрывайте экран «Синергии».
9. Голос и «Поделиться» отчётом в WebView без Web Speech и загрузок — по желанию: объект `window.SynergyNative` с методами `speak`, `stop`, `share`, `print`, как в нашем APK (`android/src/ru/synergy/trainer/MainActivity.java`).

## Web (сайт, PWA)

[web/host.html](web/host.html) — страница другого origin со встроенной игрой: принимает только сообщения origin игры, строит кнопки упражнений из `synergy:ready`, шлёт кадры «Демо-сигналом» (замените на свой SDK), на `synergy:close` скрывает игру.

```js
const GAME = new URL('https://example.org/synergy/index.html');
frame.src = `${GAME}?game=flight&level=1&host=${encodeURIComponent(location.origin)}`;
addEventListener('message', e => {
  if (e.origin !== GAME.origin || e.source !== frame.contentWindow) return;
  if (e.data?.type === 'synergy:result') save(e.data);
});
frame.contentWindow.postMessage({ type: 'synergy-frame', a: 0.4, b: 0 }, GAME.origin);
```

## Android (Kotlin)

[android/SynergyHostActivity.kt](android/SynergyHostActivity.kt) — `Activity` только на API платформы (AndroidX не нужен): `WebView` из `assets/synergy`, интерфейс `SynergyHost` с `onMessage` (вызывается в потоке binder — интерфейс переводится в `runOnUiThread`), `pushFrame(a, b)` для колбэка SDK, «Назад» через `Synergy.back()`, `finish()` на `synergy:close`. Тот же механизм (`addJavascriptInterface`, `evaluateJavascript`) работает в нашем APK.

## iOS (Swift)

[ios/SynergyHostView.swift](ios/SynergyHostView.swift) — `UIViewRepresentable` для SwiftUI: `WKWebView` с `loadFileURL`, обработчик `synergyHost`, запуск упражнения после `synergy:ready`, `pushFrame`. Обработчик снимается в `dismantleUIView`: контроллер держит его сильной ссылкой.

## Flutter

[flutter/synergy_host.dart](flutter/synergy_host.dart) — виджет на `webview_flutter` 4.x: `addJavaScriptChannel('SynergyHost')`, `loadFlutterAsset`, запуск после `synergy:ready`, `pushFrame` через `runJavaScript`. Файлы `assets/synergy/` перечислите в `pubspec.yaml`.

## React Native

[react-native/SynergyHost.tsx](react-native/SynergyHost.tsx) — компонент на `react-native-webview`: `onMessage`, запуск через `injectJavaScript` после `synergy:ready`, `pushFrame` через `ref`. Адрес веб-сборки (`uri`) — файл в бандле или ваш https.

## Unity

[unity/SynergyHost.cs](unity/SynergyHost.cs) — `MonoBehaviour` на плагине gree/unity-webview: у Unity нет своего WebView на Android и iOS. Мост плагина `window.Unity.call(text)` — один из каналов, которые «Синергия» знает, поэтому `Init(cb: …)` получает все сообщения; запуск и кадры — `EvaluateJS`. Данные разбирает `JsonUtility` (лишние поля пропускает). Некоторые версии плагина определяют `window.Unity.call` на iOS только скриптом: пример в `ld:` (страница загружена) определяет его, если нет, и шлёт `synergy-ping` — «Синергия» отвечает `synergy:ready` уже через этот канал (канал ищется при каждом сообщении, а не один раз при старте). Сверьте с версией плагина, которая у вас стоит.

## Unreal

Готового канала нет: виджет WebBrowser исполняет команды (`ExecuteJavascript` → `Synergy.start`, `Synergy.feed`), а обратный путь (`BindUObject`) движок поддерживает не на всех платформах. Если заказчику нужен Unreal, канал добавляется одной функцией `hostChannel()` в `src/services/host.js` — после проверки на устройстве.

## Как проверено

| Платформа | Проверка | Что не проверено |
|---|---|---|
| Web | **выполнено** `node tests/e2e/embed.mjs`: два сервера — два origin; хост получает `synergy:ready` (не пройдено знакомство), человек проходит знакомство внутри `iframe`, открывается упражнение из адреса, хост шлёт кадры — источник сам переключается на «Внешний», приходит `synergy:result` без самочувствия, «Вернуться в приложение» даёт `synergy:close`, `synergy-start` открывает другое упражнение; чужой origin сообщений не получает | Safari |
| Android | **скомпилировано** Kotlin 2.1.21 против Android API 29 (android-all, Robolectric — тот же jar, которым `VERIFY_API=1` сверяет заглушки APK) | на устройстве не запускался |
| iOS | **не компилировалось**: в среде сборки нет Swift. Написано по документированным API WebKit (`WKScriptMessageHandler`, `loadFileURL`) | всё |
| Flutter | **не компилировалось**: в среде нет Flutter SDK. Написано по API `webview_flutter` 4.x | всё |
| React Native | **типы проверены** `tsc --noEmit --strict` против `react-native-webview` 14.0.1 и `react-native` 0.87.1 | на устройстве не запускался |
| Unity | **не компилировалось**: в среде нет Unity и .NET. Написано по API gree/unity-webview (`WebViewObject.Init`, `EvaluateJS`) | всё |
| Unreal | примера нет | — |

Повторить проверки Android и React Native: `npm run verify:embed` (`tools/verify-embed.sh`: kotlinc и типы — с закреплёнными версиями и SHA-256, кэш `tools/.cache`); Web — `npm run build && npm run e2e:embed`.

Для всех платформ канал проверен юнит-тестом на поддельных окнах (`tests/v515.test.mjs`): каждый из пяти каналов получает каждое сообщение ровно один раз, хост 5.14 с `onResult` получает только результаты, ошибка или враждебный объект хоста не ломают игру. Встраивание в настоящий Motorica Start или ATTILAN не проверено: их SDK и формат данных не опубликованы. Если хост ждёт другой формат, правится одна функция — `resultMessage()`.
