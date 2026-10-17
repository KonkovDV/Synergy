# Компоненты третьих лиц

Распространяемый Продукт (`release/`, сборка `dist/`) **не содержит** кода, шрифтов, изображений и звуков третьих лиц: графика и звук генерируются кодом, шрифт — системный, эмодзи рисует шрифт устройства.

Инструменты разработки (используются только при сборке и проверке, в Продукт не входят):

| Компонент | Лицензия | Назначение |
|---|---|---|
| esbuild | MIT | сборка JS (`npm run build`) |
| Playwright | Apache-2.0 | e2e-тесты (`tests/e2e`) |
| aapt2 из apktool-lib 3.0.3 | Apache-2.0 | сборка APK |
| dalvik-dx 16.0.1 | Apache-2.0 | сборка APK (DEX) |
| Robolectric android-all 10 | Apache-2.0 | проверка сигнатур Android API (`VERIFY_API=1`) |
| NumPy, SciPy, scikit-learn | BSD-3-Clause | лаборатория `lab/` (необязательно) |
| ESP32 Arduino core (BLEDevice) | Apache-2.0 / LGPL-2.1 (части ядра) | прошивка-пример `bridge/firmware/` (собирается пользователем) |

Платформенные API (WebView, Web Bluetooth, Web Speech, TextToSpeech, PrintManager) используются через интерфейсы ОС и браузера.
