# Компоненты третьих лиц

Распространяемый Продукт (`release/`, сборка `dist/`) **не содержит** кода, изображений и звуков третьих лиц. Звук генерируется кодом, эмодзи в интерфейсе нет (5.11–5.12). Иллюстрации 5.16 (`public/art/`) — картинки команды, созданные генератором изображений по её промптам (`docs/AI_USAGE.md`, `docs/LEGAL.md` §6); чужих изображений среди них нет. Единственное, что входит в Продукт от третьих лиц, — шрифты под открытой лицензией (5.12):

| Компонент | Лицензия | Где |
|---|---|---|
| Unbounded (The Unbounded Project Authors) | SIL Open Font License 1.1, без зарезервированных имён | `public/fonts/unbounded-*.woff2` — подмножество: латиница, кириллица, насыщенность 500–800 |
| Inter (The Inter Project Authors) | SIL Open Font License 1.1, без зарезервированных имён | `public/fonts/inter-*.woff2` — подмножество: латиница, кириллица, насыщенность 400–800 |

Текст лицензии распространяется вместе со шрифтами (`public/fonts/OFL.txt`, в сборке — `dist/fonts/OFL.txt`, в APK — `assets/www/fonts/OFL.txt`); шрифты не продаются отдельно (OFL, п. 1).

Инструменты разработки (используются только при сборке и проверке, в Продукт не входят). Версии закреплены, как описано ниже:

| Компонент | Версия | Лицензия | Назначение |
|---|---|---|---|
| esbuild | 0.28.2 | MIT | сборка JS (`npm run build`) |
| Playwright | 1.56.1 | Apache-2.0 | e2e-тесты (`tests/e2e`); в CI ставится без сохранения в `package.json` |
| axe-core | 4.14.0 | MPL-2.0 | автоаудит доступности в e2e (`tests/e2e/v5.mjs`); исходники не изменялись |
| aapt2 из apktool-lib | 3.0.3 | Apache-2.0 | сборка APK |
| dalvik-dx | 16.0.1 | Apache-2.0 | сборка APK (DEX) |
| Robolectric android-all | 10 (5803371) | Apache-2.0 | проверка сигнатур Android API (`VERIFY_API=1`, `npm run verify:embed`) |
| Kotlin compiler | 2.1.21 | Apache-2.0 | компиляция примеров хоста `docs/embed/android` (`npm run verify:embed`) |
| TypeScript; React, React Native, react-native-webview, @types/react | 5.9.3; 19.2.3, 0.87.1, 14.0.1, 19.1.1 | Apache-2.0; MIT | проверка типов примера `docs/embed/react-native` во временной папке (`npm run verify:embed`) |
| NumPy | 2.5.4 | BSD-3-Clause (в колёсах также части под 0BSD, MIT, Zlib, CC0-1.0) | лаборатория `lab/` (необязательно); NumPy и SciPy — ещё и импорт графики |
| SciPy; scikit-learn; joblib, threadpoolctl, cloudpickle | 1.18.1; 1.9.1; 1.6.0, 3.7.0, 3.1.2 | BSD-3-Clause | лаборатория `lab/` и её зависимости |
| narwhals | 2.27.1 | MIT | зависимость scikit-learn |
| rembg | 2.0 | MIT | маска объекта при импорте графики (`tools/import-art.py`, 5.16) |
| модель IS-Net `isnet-general-use` (DIS) | — | лицензию модели сверить перед коммерческим запуском | скачивается rembg при первом импорте; в Продукт не входят ни модель, ни маски — только готовые WebP |
| Pillow | — | MIT-CMU (HPND) | чтение PNG и запись WebP при импорте графики |
| ESP32 Arduino core (BLEDevice) | — | Apache-2.0 / LGPL-2.1 (части ядра) | прошивка-пример `bridge/firmware/` (собирается пользователем) |
| XcodeGen | 2.44.1 | MIT | проект iOS из `ios/project.yml` (5.30); в CI скачивается и сверяется по SHA-256 (`.github/workflows/ios.yml`) |
| SwiftUI, WebKit, AVFoundation, UIKit | iOS SDK | Apple SDK | оболочка iPhone и iPad (`ios/`); входят в iOS, в репозитории их нет |

Платформенные API (WebView, WKWebView, Web Bluetooth, Web Speech, TextToSpeech, AVSpeechSynthesizer, PrintManager, UIPrintInteractionController) используются через интерфейсы ОС и браузера.

## Как закреплены версии (5.29)

Правила проверяет `npm run check:supply-chain` (`tools/supply-chain.mjs`), его же вызывают ворота сдачи. Подложенные ошибки — `tests/supplychain.test.mjs`.

- npm: только точные версии в `package.json`, зависимостей времени выполнения у Продукта нет; `package-lock.json` (v3) — каждый пакет из реестра npm с `integrity` sha512; `npm ci --ignore-scripts` во всех задачах CI.
- GitHub Actions: каждое действие закреплено SHA коммита, у каждого workflow верхний `permissions` с наименьшими правами, `checkout` без сохранённого токена.
- Dependabot: новые версии предлагаются через 7 дней после выхода (`cooldown`), исправления безопасности — без задержки.
- Python: `lab/requirements.txt` — точные версии и hash каждого файла PyPI (`tools/pip-hashes.py`), pip ставит в режиме проверки hash.
- Загрузки скриптов сборки (`tools/build-apk.sh`, `tools/verify-embed.sh`) сверяются по SHA-256.
- Выпуск: SBOM в формате CycloneDX и подписанное происхождение сборки (`.github/workflows/release.yml`).

## Сведения, взятые из чужого кода

Формат снимка Motorica Start (5.21) взят из открытого кода Motorica Kart ([HakerFromRussia-XD/1_game_stk](https://github.com/HakerFromRussia-XD/1_game_stk), GPL-3.0). Это сведения для совместимости, не код: ни строки этого проекта в «Синергии» нет (`docs/LEGAL.md` §1).

Открытый репозиторий Motorica Start ([HakerFromRussia-XD/2_Android_bluetooth_master_stradivary](https://github.com/HakerFromRussia-XD/2_Android_bluetooth_master_stradivary)) файла лицензии не содержит, значит, лицензия на его код не выдана. Из него взяты только сведения для совместимости (5.29): имя метода `getLatestThresholds()` и смысл его ответа, значения экрана настроек, имена классов обучения жестам и подписи его экрана — как синонимы в `GESTURE_ALIASES` (`src/input/bridge.js`). Код, изображения и анимации не копировались (`docs/RESEARCH.md` §18–19).

Набор UBI4 (5.30) взят оттуда же как сведения: имена классов, их номера (`GESTURES_ID`), последовательность обучения (`GESTURE_SEQUENCE`) и какие жесты относятся к запястью. Позы пальцев для рисунка и все русские подписи сделаны командой.
