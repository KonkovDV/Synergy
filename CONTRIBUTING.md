# Как вносить изменения

1. Прочитайте `MEMORY.md` → `PLAN.md` → только файлы, относящиеся к задаче (`docs/ARCHITECTURE.md` — карта слоёв).
2. Принципы обязательны: **DRY** (параметры — `src/config.js`, словарь — `src/core/vocabulary.js`, формат кадров — `parseExternal()`), **KISS** (ванильный JS, без фреймворков и новых зависимостей в продукте), **SOLID** (новая игра = файл + строка в `registry.js`), **единый язык** (`docs/GLOSSARY.md`).
3. Сначала тест, который падает на старом коде, затем код.
4. Никаких медицинских обещаний в текстах; метрики — «игровые». Утверждение о статье — только после сверки с её страницей (`PLAN.md` C.2.8).
5. Ветка → pull request по шаблону; CI должен быть зелёным. Версии GitHub Actions обновляет Dependabot — проверяйте его PR.

## Готово, когда

| Что изменили | Что прогнать |
|---|---|
| Любой код | `npm test` |
| Набор жестов, мост, игры, словарь | `npm run test:ubi4` — тот же набор тестов на наборе UBI4 |
| Оболочки Android и iOS (`android/`, `ios/`) | `node --test tests/v530.test.mjs` — методы `SynergyNative` и правила ссылок совпадают; Swift собирает `.github/workflows/ios.yml` на macOS |
| Экран, стиль или `index.html` | ещё `npm run build`, `npm run e2e:a11y`, `npm run audit:layout`. Скрипты сами поднимают сервер. Ворота сверяют отпечаток кода у этих прогонов: прогон до правки не засчитывается |
| Набор жестов | `npm run drill:gestures` |
| Встраивание на Kotlin или React Native | `npm run verify:embed` |
| Зависимость, workflow или скрипт загрузки | `npm run check:supply-chain`; Python лаборатории — версия в `lab/requirements.txt`, затем `python3 tools/pip-hashes.py` |
| Числа в документах | `node tools/set-test-count.mjs`, затем `node tools/evidence.mjs` |
| Выпуск | раздел B.F `PLAN.md`: версия во всех местах, включая `CITATION.cff`; APK; `npm run pack` |

Перед pull request: `node tools/check-submission.mjs --draft` — без ошибок. Предупреждения о пустом `AUTHORS.md`, дате первого коммита и отладочной подписи APK ожидаемы до сдачи.
