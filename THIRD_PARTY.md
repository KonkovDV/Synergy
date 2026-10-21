# Компоненты третьих лиц

Распространяемый Продукт (`release/`, сборка `dist/`) **не содержит** кода, изображений и звуков третьих лиц. Звук генерируется кодом, эмодзи в интерфейсе нет (5.11–5.12). Иллюстрации 5.16 (`public/art/`) — картинки команды, созданные генератором изображений по её промптам (`docs/AI_USAGE.md`, `docs/LEGAL.md` §6); чужих изображений среди них нет. Единственное, что входит в Продукт от третьих лиц, — шрифты под открытой лицензией (5.12):

| Компонент | Лицензия | Где |
|---|---|---|
| Unbounded (The Unbounded Project Authors) | SIL Open Font License 1.1, без зарезервированных имён | `public/fonts/unbounded-*.woff2` — подмножество: латиница, кириллица, насыщенность 500–800 |
| Inter (The Inter Project Authors) | SIL Open Font License 1.1, без зарезервированных имён | `public/fonts/inter-*.woff2` — подмножество: латиница, кириллица, насыщенность 400–800 |

Текст лицензии распространяется вместе со шрифтами (`public/fonts/OFL.txt`, в сборке — `dist/fonts/OFL.txt`, в APK — `assets/www/fonts/OFL.txt`); шрифты не продаются отдельно (OFL, п. 1).

Инструменты разработки (используются только при сборке и проверке, в Продукт не входят):

| Компонент | Лицензия | Назначение |
|---|---|---|
| esbuild | MIT | сборка JS (`npm run build`) |
| Playwright | Apache-2.0 | e2e-тесты (`tests/e2e`) |
| axe-core 4.13.0 | MPL-2.0 | автоаудит доступности в e2e (`tests/e2e/v5.mjs`); в Продукт не входит, исходники не изменялись |
| aapt2 из apktool-lib 3.0.3 | Apache-2.0 | сборка APK |
| dalvik-dx 16.0.1 | Apache-2.0 | сборка APK (DEX) |
| Robolectric android-all 10 | Apache-2.0 | проверка сигнатур Android API (`VERIFY_API=1`) |
| NumPy, SciPy, scikit-learn | BSD-3-Clause | лаборатория `lab/` (необязательно); NumPy и SciPy — ещё и импорт графики |
| rembg 2.0 | MIT | маска объекта при импорте графики (`tools/import-art.py`, 5.16); в Продукт не входит |
| модель IS-Net `isnet-general-use` (DIS) | лицензию модели сверить перед коммерческим запуском | скачивается rembg при первом импорте; в Продукт не входят ни модель, ни маски — только готовые WebP |
| Pillow | MIT-CMU (HPND) | чтение PNG и запись WebP при импорте графики |
| ESP32 Arduino core (BLEDevice) | Apache-2.0 / LGPL-2.1 (части ядра) | прошивка-пример `bridge/firmware/` (собирается пользователем) |

Платформенные API (WebView, Web Bluetooth, Web Speech, TextToSpeech, PrintManager) используются через интерфейсы ОС и браузера.

Формат снимка Motorica Start (5.21) взят из открытого кода Motorica Kart ([HakerFromRussia-XD/1_game_stk](https://github.com/HakerFromRussia-XD/1_game_stk), GPL-3.0). Это сведения для совместимости, не код: ни строки этого проекта в «Синергии» нет (`docs/LEGAL.md` §1).
