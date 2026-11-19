# Предложение руководству ГК «Моторика»

«Освоение протеза как продукт» — презентация MOTUS Lab, ноябрь 2026: единый цифровой контур обучения, измерения и управления протезом от ЭМГ и СПППР до ИИ-очков и нейроинтерфейсов, с расчётом эффекта для выручки и IPO.

| Что | Файл |
|---|---|
| Сайт презентации | https://konkovdv.github.io/Synergy/motorica/ (публикуется из ветки `main`) |
| Колода, 34 слайда: 20 основных на 25 минут и 14 приложений | [`MOTUS-Lab-Motorica.pptx`](MOTUS-Lab-Motorica.pptx), [`MOTUS-Lab-Motorica.pdf`](MOTUS-Lab-Motorica.pdf) |
| План сотрудничества: боли «Моторики» по её документам, рабочие пакеты, этапы и ворота, первые 90 дней | [`PLAN.md`](PLAN.md), на сайте — [plan.html](https://konkovdv.github.io/Synergy/motorica/plan.html) |
| Модель экономического эффекта с формулами | [`MOTUS-Lab-Motorica-model.xlsx`](MOTUS-Lab-Motorica-model.xlsx) |
| Текст слайдов, заметки, источники и числа модели | [`slides.json`](slides.json) — пишет генератор колоды, читает генератор сайта |

## Как пересобрать

Колода, PDF, картинки слайдов, модель и страница собираются из одного источника, поэтому после правки текста повторите всю цепочку:

```bash
npm i --no-save pptxgenjs@3.12.0 sharp@0.34.4 react-icons@5.5.0 react@18.3.1 react-dom@18.3.1 qrcode@1.5.4
```

```bash
node tools/motorica-deck.cjs
```

```bash
python3 tools/motorica-export.py
```

```bash
python3 tools/motorica-model.py && python3 tools/motorica-model.py --check
```

```bash
node tools/motorica-site.mjs && npm run check:motorica && npm run check:motorica-page
```

- `tools/motorica-deck.cjs` — текст, модель эффекта (`MODEL`) и вёрстка; пишет PPTX и `slides.json`. Шрифты Arial и Calibri: LibreOffice подставляет метрически совместимые Liberation Sans и Carlito, поэтому переносы на стенде совпадают с PowerPoint.
- `tools/motorica-export.py` — PDF колоды, слайды для сайта (`slides/`) из копии без телефона и почты, `og.jpg`. Нужны LibreOffice, poppler, Pillow и python-pptx.
- `tools/motorica-model.py` — Excel-книга с именованными ячейками; `--check` пересчитывает её в LibreOffice и сверяет итоги со слайдами.
- `tools/motorica-site.mjs` — `index.html`, `plan.html` (из `PLAN.md`) и `sw.js`; у ссылок на файлы `?v=` с хэшем содержимого.

## Правила

- Числа «Моторики» — только из открытой отчётности: IR-брошюра и годовой отчёт за 2025 год, финансовые результаты I полугодия 2026 года. Допущения модели помечены A1–A6 (слайд П1) и проверяются пилотом.
- Модель — иллюстрация масштаба, а не прогноз выручки компании: база 2025 года заморожена, рост рынка и направления сверх протезов рук не учтены.
- Контакты — на слайде «Следующий шаг» и в одном блоке страницы между `contacts:begin` и `contacts:end`; проверка `check:motorica` не пропустит их в другом месте.
- Страница не индексируется (`noindex`), без внешних запросов (CSP `default-src 'self'`), работает без скрипта и офлайн.
