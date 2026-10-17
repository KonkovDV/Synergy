# Как вносить изменения

1. Прочитайте `MEMORY.md` → `PLAN.md` → только файлы, относящиеся к задаче (`docs/ARCHITECTURE.md` — карта слоёв).
2. Принципы обязательны: **DRY** (параметры — `src/config.js`, словарь — `src/core/vocabulary.js`, формат кадров — `parseExternal()`), **KISS** (ванильный JS, без фреймворков), **SOLID** (новая игра = файл + строка в `registry.js`), **единый язык** (`docs/GLOSSARY.md`).
3. Сначала тест, затем код. Перед коммитом: `npm test` и `npm run build`; для UI — `node tests/e2e/v5.mjs` (сервер `python3 tools/serve.py --dist --port 8091`).
4. Никаких медицинских обещаний в текстах; метрики — «игровые».
5. Ветка → pull request по шаблону; CI должен быть зелёным.
6. Версии GitHub Actions обновляет Dependabot — проверяйте его PR.
