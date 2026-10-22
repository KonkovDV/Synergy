# «Синергия» для iPhone и iPad

Та же игра, что в APK и PWA: собранный `dist/` внутри приложения, офлайн, без аккаунта. Оболочка на Swift (SwiftUI + WKWebView) — одна из платформ, которые «Моторика» назвала на митапе 21.10.2026.

## Что даёт оболочка сверх браузера

| Возможность | В Safari на iPhone | В приложении |
|---|---|---|
| Голос подсказок | зависит от системы | `AVSpeechSynthesizer`, русский голос |
| Вибрация | нет (`navigator.vibrate` в iOS не работает) | `UINotificationFeedbackGenerator`, `UIImpactFeedbackGenerator` |
| Тёмная тема по системе | да | да, и при смене темы на ходу |
| «Поделиться» отчётом и копией | скачивание | системное окно «Поделиться» |
| Печать отчёта специалисту | печать страницы | AirPrint и «Сохранить в PDF» |
| Подтверждения («Сбросить калибровку?») | да | `UIAlertController` |
| Ссылка на упражнение | — | `synergy://play?game=grip&level=2&gestures=ubi4` |

Страница обращается к этим возможностям через `window.SynergyNative` — тот же объект, что даёт APK (`android/src/…/MainActivity.java`). В JS нет ветки для iOS: `tests/v530.test.mjs` сверяет, что методы у двух оболочек одни и те же.

## Сборка

Нужны Mac с Xcode 16+, Node 18+ и [XcodeGen](https://github.com/yonaskolb/XcodeGen) 2.44+.

```bash
npm ci && npm run build                          # dist/ — игра, которую приложение кладёт в себя
xcodegen generate --spec ios/project.yml         # ios/Synergy.xcodeproj (не хранится в git)
open ios/Synergy.xcodeproj                       # Signing & Capabilities → ваша команда Apple ID → Run
```

Без Mac: workflow `.github/workflows/ios.yml` (запуск вручную или по тегу `v*`) собирает приложение для симулятора без подписи, запускает его, открывает ссылку на «Две руки» и сохраняет снимки экрана.

## На телефон и в TestFlight

1. В Xcode у цели Synergy задать свою команду (`DEVELOPMENT_TEAM`) и, если нужно, свой `PRODUCT_BUNDLE_IDENTIFIER`.
2. Подключить iPhone, выбрать его и нажать Run (бесплатный Apple ID — на 7 дней).
3. TestFlight: Product → Archive → Distribute App → App Store Connect. Нужен платный аккаунт разработчика.

## Без установки: PWA

Safari → «Поделиться» → «На экран „Домой“». Игра открывается без адресной строки и работает без сети (service worker). Нет вибрации и системного «Поделиться» — для них нужно приложение.

## Датчики на iPhone

В iOS нет Web Bluetooth, поэтому есть три пути:
- сигнал с компьютера по сети: мост `bridge/ws_bridge.py` или эмулятор организатора, `ws://адрес:8765` в «Источник сигнала»;
- приложение протеза как хост: Motorica Start на iOS кладёт снимок в общую группу приложений, читать её может только приложение с подписью «Моторики» (`docs/RESEARCH.md` §19). Хост встраивает игру по примеру `docs/embed/ios/SynergyHostView.swift`;
- экранный эмулятор — без датчиков.

## Как проверено

На стенде без macOS Swift не компилируется. Проверено:
- Тестами: методы `SynergyNative` у iOS и Android совпадают; правила ссылок совпадают с Android; версия в `project.yml` равна версии игры (ворота сдачи).
- Сборкой в CI на macOS — когда workflow запущен.
