# Графика игр: фирменный стиль «Моторики» и эффект «вау» (26.10.2026)

Документ задаёт, как нарисовано поле шести игр. Ниже — правила, откуда они взяты, что сделано в каждой игре и как это проверено.

## 1. Задание на поле

Поле «Мастерской», «Полёта», «Ритма», «Сейфа», «Двух рук» и «Проверки навыка», а также обратный отсчёт, выглядит как мобильная игра: объём, свет, глубина, живой ответ. Сцена узнаётся как «Моторика» без логотипа. Стиль — брошюра 2025 (`docs/DESIGN.md`) и правила реабилитационных игр.

**Язык бренда:**
- градиент «мятный → бирюзовый → голубой → синий → фиолетовый»;
- графитовые и белые поверхности;
- световые шлейфы и сферы со свечением, как на обложках и в «экосистеме» брошюры;
- мягкий 3D, как у иллюстраций игры;
- заголовки и числа — Unbounded, текст — Inter;
- бионическая кисть — графитовый корпус с мятной подсветкой.

**Не делаем:**
- не меняем правила, счёт, подсказки и геометрию, по которой игра судит;
- не закрываем задачу эффектами: нота, кольцо, окно силы и предмет читаются первыми;
- не наказываем эффектами: искры, вспышки и кольца — только за удачу;
- не мигаем всем полем. Вспышки — не чаще 3 в секунду (WCAG 2.3.1), пульс — только локально (XAG 118);
- не кладём текст на «грязный» фон. Подписи — на плашке или с обводкой, контраст не ниже 4,5:1;
- не берём картинки «Моторики», её логотип, фото и чужие ассеты. Только код и свои иллюстрации из `public/art`.

**Делаем:**
- три темы: светлая, тёмная, контрастная. В контрастной декор убран: чёрное поле, белые контуры;
- «Меньше движения» и слабый телефон (`FpsGuard`): анимированный декор стоит, задача движется;
- статичный фон рисуется один раз в кэш слоя, в кадре — только то, что меняется;
- каналы во всех темах: A — коралловый, B — синий, A+B — фиолетовый;
- кэш и градиенты не ломают безголовые тесты (холст-заглушка в Node).

**По играм:**
- «Мастерская» — бионическая мастерская;
- «Полёт» — небо со шлейфами ветра;
- «Ритм» — неоновая сцена с сеткой долей;
- «Сейф» — металлический сейф с наградой;
- «Две руки» — две кисти на столе;
- «Проверка навыка» — спокойный стенд без декора, который отвлекал бы от измерения.

**Считаем готовым, когда:**
- `npm test`, `test:ubi4`, `test:spr8`, `e2e:a11y`, `audit:layout` без ошибок;
- снимки «до и после» каждой игры во всех темах просмотрены глазами;
- кадр укладывается в бюджет среднего телефона;
- документы совпадают с тем, что нарисовано.

## 2. Откуда принципы

| Принцип | Источник | Как читаем |
|---|---|---|
| Обратная связь «с соком» улучшает опыт, но в меру | Kao, 2020, *Entertainment Computing* 34: четыре версии одной игры. Средний и высокий «сок» выиграли у нуля и у крайнего по опыту, мотивации, времени игры и результату ([пересказ](https://improbable.com/tag/rpg/), [обзор](https://arxiv.org/pdf/2011.09201)) | Эффекты средние: свечение, искры и кольцо за удачу. Без тряски экрана и без вспышек на всё поле |
| Визуальные украшения меняют опыт игрока | Hicks, Gerling, Dickinson, Vanden Abeele, CHI PLAY 2019, «Juicy Game Design» ([dblp](https://dblp.org/pid/52/5340)) | Украшение не должно отнимать чувство управления. Kao et al., CHI 2024: усиление, мешающее чувству агентности, снижало оценки |
| Игры для протеза часто ради вовлечения, а не переноса | Garske et al., 2021, «Serious Games Are Not Serious Enough for Myoelectric Prosthetics» ([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8663510/)) | Графика обслуживает задачу протеза: окно силы, кольцо высоты, доля такта. Декор — только фон |
| Вспышки и мерцание | WCAG 2.3.1; Xbox Accessibility Guidelines 118 | Пульс доли — только у кругов попадания, без мигания поля |
| Цвет не единственный носитель | WCAG 1.4.1 | Буквы A и B, место слева и справа, подписи |
| Узнаваемый стиль заказчика | брошюра «Моторики» 2025 (`docs/DESIGN.md` §1) | Шлейфы, сферы, градиент, графит, Unbounded и Inter |

## 3. Визуальный язык игрового поля

- **Свет.** Сцены освещены сверху слева: блик на объёмных предметах и мягкая контактная тень снизу. Свечение — радиальный градиент, а не `shadowBlur`: он дорогой на слабых телефонах.
- **Глубина.** Задний план (стена, небо, сцена) статичен и кэширован. Средний план (лента, холмы, дорожки) движется медленно. Передний — задача и кисть.
- **Шлейфы.** Неоновые ленты брошюры: ветер в «Полёте», горизонт сцены в «Ритме», стена мастерской. В светлой теме приглушены, в тёмной ярче.
- **Сферы.** Глянцевые шары в градиенте бренда: ноты «Ритма», ручка сейфа, подсветка кисти.
- **Кисть.** Графитовый корпус с бликом, суставы светлее, на ладони мятный светодиод: чем сильнее хват, тем ярче. В тёмной теме корпус светлее, чтобы читался на поле.
- **Шрифты на холсте.** Числа, отсчёт и вердикты — Unbounded, подписи — Inter. Шрифты уже загружены страницей. Если их нет, остаётся системный.
- **Удача.** Ударное кольцо в цвете события и искры-звёздочки. Ошибка — без эффектов: слово и метка на шкале, как с 5.17.

## 4. Игры

| Игра | Было | Стало |
|---|---|---|
| «Мастерская» | плоская стена со случайными кругами, серый пол на треть поля, плоская оранжевая корзина | светлая мастерская с окном света и шлейфом на стене. Графитовый верстак с мятной полосой занимает низ поля. Резиновая лента с металлическими роликами. Лоток бренда с подсветкой, когда пора отпускать. Под кистью тень и луч сканера к предмету. Шкала силы из стекла с градиентом. 26.10, ночь: стена и верстак — сгенерированная мастерская днём и ночью, лента лежит на верстаке у его световой кромки. Кисть — сгенерированная, висит на руке сверху и кулаком закрывается над предметом. Корзина — сгенерированная (§8) |
| «Полёт» | плоское небо, кружки облаков, тонкие эллипсы колец | рассветное небо с солнечным ореолом, объёмные облака, три слоя холмов. Ночью — северное сияние в цветах бренда. Кольца — объёмный тор с бликом. Потоки ветра — светящиеся ленты. След — градиентный шлейф. «Покой» — на плашке. 26.10, ночь: пока у птицы нет крыльев, летит сгенерированный игрушечный планер в цветах бренда (§8) |
| «Ритм» | белые полупрозрачные полосы, плоские кружки нот | неоновая сцена с прожекторами и шлейфом у горизонта. Стеклянные дорожки с подсветкой цвета канала. Сетка долей: такт ярче. Ноты — глянцевые сферы, длинные — светящиеся капсулы, A+B — фиолетовая плашка. Круги попадания с ореолом и ударной волной |
| «Сейф» | плоский бирюзовый квадрат | металлический сейф с фаской, заклёпками и петлями. Циферблат с делениями и указателем, золотая ручка с бликом. Лампы кода — светодиоды. Открытый сейф светится изнутри монетами |
| «Две руки» | кисти у нижнего края, пустая середина | 26.10, вечер: сгенерированная комната — днём светлая, ночью тёмная, глянцевый стол с мятной кромкой. Бионические кисти — сгенерированные картинки трёх поз (покой, кулак, ладонь), корпус в цвете облика игрока, отражение в столе, свет ладони при команде. На карточке те же кисти, маленькие (§7) |
| «Проверка навыка» | карточка в верхней половине, пустой низ | карточка по центру поля, кольцо удержания вокруг жеста в градиенте бренда, «Протез видит» на плашке. Без декора: это измерение |
| Обратный отсчёт | белый круг и зелёная дуга | стеклянный круг, дуга в градиенте бренда, цифра Unbounded |

## 5. Доступность и производительность

- **Контрастная тема:** чёрное поле, белые контуры, без шлейфов, сфер и текстур. Цвета каналов — из контрастной палитры.
- **«Меньше движения» и слабый телефон:** шлейфы, облака, звёзды и ударные кольца стоят. Ноты, кольца и предметы движутся: это задача.
- **Кэш слоёв.** Фон каждой сцены рисуется в закадровый холст один раз на размер поля, тему и плотность пикселей. В Node, где нет `document`, рисуется прямо в холст-заглушку. Кэш держит два слоя: игра на экране и ещё один на смену темы. Слой — полноэкранный растр, около 6 МБ при плотности 2,5. Выход с экрана игры очищает кэш (`docs/AUDIT.md` §49 GX-1).
- **Тесты.** Безопасные градиенты: если заглушка не умеет `addColorStop`, рисуется сплошным цветом.

## 6. Как проверено (26.10.2026)

- **Снимки до и после.** Все шесть игр в светлой, тёмной и контрастной темах, в книжной (390 × 844) и альбомной (844 × 390) ориентации, Playwright + Chromium. Ошибок JS нет. Находки снимков исправлены: подпись предмета на корзине, «не тест Box and Blocks» на плашке хвата, удерживаемая нота на круге, ножки сейфа в контрастной теме.
- **Ревью кода** по диффу нашло десять пунктов, все исправлены:
  - коридор потока в контрастной теме;
  - одно кольцо на попадание вместо двух;
  - пульс доли в контрастной теме;
  - плашки по ширине слов при увеличенном тексте;
  - красная зона шкалы поверх окна;
  - общие `drawLamp` и `holdRing` вместо трёх копий;
  - `roundRect` в одном месте;
  - ореол искры без градиента на кадр.
- **Тесты** (`tests/visuals.test.mjs`):
  - каждая игра рисуется во всех трёх темах, с «Меньше движения» и без, в книжной и альбомной;
  - градиент без `addColorStop` даёт сплошной цвет;
  - кэш слоя рисуется один раз на ключ, размер и плотность;
  - удерживаемая нота стоит на линии;
  - поворот искры — свой генератор; место и размер по-прежнему берут четыре числа генератора игры, как до 5.32;
  - фирменные шрифты первыми.
- **Прогоны:**
  - `npm test` — 425 тестов, 424 прошли, 1 пропущен, 0 упали;
  - `test:ubi4` — 0 упали; `test:spr8` — все уровни не ниже двух звёзд; `drill:gestures` — OK;
  - `e2e:a11y` — 0 ошибок JS, 0 нарушений axe на 33 + 10 состояниях;
  - `audit:layout` — 1824 сочетания, 0 находок.
- **Кадр** — `docs/AUDIT.md` §47: на пессимистичном стенде новая графика не тяжелее старой, кроме «Двух рук» (+10 %, на границе разброса).
- **Не проверено:** реальные телефоны (OLED, яркое солнце, слабый GPU), впечатление пользователей протезов и детей — плейтест.

## 7. Сгенерированные картинки «Двух рук» (26.10.2026, вечер)

Отзыв команды на снимок «Двух рук»: кисти на столе нарисованы кодом из прямоугольников, а «Покой» на карточке читается как кулак. Решение — картинки генератора, как иллюстрации 5.16.

- **Генератор:** Figma AI (`generate_image`), модель `gemini-3.1-flash-image`, файл в черновиках аккаунта команды. Четыре генерации: два листа кистей (взят второй — у первого «покой» почти не отличался от раскрытой ладони), комната днём, комната ночью.
- **Кисти — один лист, а не три картинки:** три позы выходят одного дизайна, масштаба и света, и их можно плавно сменять на одном месте. Поза модели кисти выбирает две ближайшие картинки (ладонь → покой → кулак). Одна из двух всегда непрозрачна, поэтому кисть не просвечивает на полпути (`handBlend`, тест).
- **Фон кистей — пурпурный ключ.** Белый корпус на белом фоне не вырезать без нейросетевой маски, а пурпурного в кисти нет. Ключ вычитается по гладкой поверхности фона, цвет края восстанавливается, пурпурный отсвет на глянце снимается (`tools/import-generated.py`).
- **Облик игрока.** Корпус выше манжеты умножается на пастель цвета облика, как на картинках обликов в гнезде. Гильза остаётся белой. Проверены «Графит», «Коралл» и «Космос».
- **Комната** кладётся так, чтобы задняя кромка стола на картинке совпала с линией стола игры при любой форме экрана. Кисти стоят на столешнице, подписи — под световой кромкой, отражение не заходит за неё. В контрастной теме комнаты нет: чёрное поле и белая линия.
- **Вес этого вывоза:** кисти 8–15 КБ, комнаты 8 и 13 КБ. Весь набор тогда был 1,53 МБ. Полный размер листа и бюджет 3,5 МБ — §10: набор сейчас 1,89 МБ.

Промпты (дословно):

| Картинка | Промпт |
|---|---|
| `hand-rest`, `hand-close`, `hand-open` (лист 2) | Premium product render of three identical right-hand bionic prosthetic hands standing upright side by side in one row, same design, same size, same straight front camera angle with the palm facing the viewer, evenly spaced with wide empty gaps between them, each fully visible from fingertips to the flat bottom of the socket. Left hand: relaxed neutral resting hand — all four fingers gently bent about forty degrees at every joint so the fingertips curve forward toward the viewer, fingers loosely together, thumb relaxed and slightly bent beside the index finger; it is half-closed, clearly neither an open palm nor a fist. Middle hand: tightly closed fist with the thumb across the fingers. Right hand: fully open palm, all five fingers straight and spread wide. Every hand has a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist, and a short white forearm socket with a flat bottom. Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, clean and friendly, high detail. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no reflections of the background colour, no text, no logo, no watermark. |
| `bg-duo-day` | Vertical background for a mobile game, soft premium 3D render. An empty bright modern rehabilitation studio seen straight on: in the lower third a wide glossy white table top seen slightly from above, its front edge perfectly straight and horizontal across the whole image at about sixty percent of the height, with a thin softly glowing mint-green (#16E182) light strip along that edge; the table surface is clean, smooth and reflective, fading to light grey towards the bottom. Behind it a calm out-of-focus wall in very light airy tones with gentle mint, cyan and violet gradient light and two soft flowing neon light trails, mint-green and violet, passing behind the table. Calm, clean, lots of empty space in the upper half, shallow depth of field, gentle daylight from the top left. Nothing on the table, no people, no hands, no objects, no text, no logo, no watermark. |
| `bg-duo-night` | Vertical background for a mobile game, soft premium 3D render, night mood. An empty modern rehabilitation studio at night seen straight on: in the lower third a wide glossy dark graphite-navy table top seen slightly from above, its front edge perfectly straight and horizontal across the whole image at about sixty percent of the height, with a thin brightly glowing mint-green (#16E182) light strip along that edge; the table surface is smooth and reflective, mirroring the lights faintly, fading to near black towards the bottom. Behind it a calm out-of-focus wall in deep navy and indigo (#0B1430, #140B24) with soft glows of mint, cyan and violet light and two flowing neon light trails, mint-green and violet, passing behind the table. Calm and clean, lots of dark empty space in the upper half, shallow depth of field. Nothing on the table, no people, no hands, no objects, no text, no logo, no watermark. |

Первый лист отличался только описанием левой кисти: «relaxed resting pose, fingers softly curved and slightly apart, clearly not a fist». Получилась почти раскрытая ладонь, поэтому взят второй лист. У него левая кисть вышла левой рукой — инструмент зеркалит её (`--flip rest`).

## 8. Вся графика в одном стиле (26.10.2026, ночь)

Запрос команды: перерисовать по той же схеме всё, что выглядит бедно, — элементы, кнопки, детали, графику. Схема та же, что в §7: генератор, вырезка ключа, каталог, код, снимки во всех темах.

**Аудит экранов.** Сняты все экраны в светлой и тёмной теме (390 × 844). Главная находка — кисть. Это главный герой продукта, а в «Мастерской», «Первых шагах» и на площадках A и B её рисовал код из прямоугольников. Дальше по заметности:
- плоский графитовый верстак и корзина «Мастерской»;
- пустое кольцо калибровки;
- плитки «Прогресса» без картинок;
- серые закрытые уровни;
- маленький планер «Полёта» из трёх кривых.

Остальное — иллюстрации 5.16, обложки, гнездо, «Ритм», «Сейф» — уже в одном мягком 3D и не менялось.

**Принципы:**
- **Один персонаж на всех экранах.** Кисть та же на столе «Двух рук», в мастерской, в «Первых шагах», в кольце калибровки и на площадках. Это эвристика согласованности Нильсена № 4 и принцип подобия гештальта: одинаковое читается как одно ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Красивое кажется удобнее.** Эффект эстетики и удобства: Kurosu & Kashimura, CHI 1995, doi:10.1145/223355.223680 ([обзор NN/g](https://www.nngroup.com/articles/aesthetic-usability-effect/)). Поэтому качество картинки — не украшение, а часть доверия к тренажёру. Но задача остаётся главной: картинки декоративны (`aria-hidden`), смысл несут слова (WCAG 1.1.1).
- **Глубина из токенов.** Тени и блики взяты из `--shadow-*` и `--grad-*`. Тёмная тема следует за ними сама, контрастная остаётся плоской. Текст лежит на сплошной поверхности, контраст ≥ 4,5:1 проверяют те же тесты (WCAG 1.4.3).
- **Движение короткое и выключаемое.** Нажатие — 120 мс. «Меньше движения» выключает всё (`:root.rm`).

**Что сделано:**
- `render/bionic.js` — одна кисть из картинок для всех: стоит на гильзе или висит на руке. Поза модели выбирает две ближайшие картинки, корпус в цвете облика, ладонь светится. Висящая кисть подбирает высоту так, что кончики пальцев ложатся на предмет, а рука продолжается до верха поля. Щепоть, указательный, ключ и «класс» этими тремя картинками не показать: их рисует прежняя модель кисти.
- «Мастерская»: сгенерированная мастерская днём и ночью, световая кромка верстака на линии ленты, сгенерированная корзина.
- «Первые шаги»: та же студия и кисть, что в «Двух руках», с отражением в столе.
- Калибровка: в кольце стоит кисть шага — покой, кулак, покой, ладонь.
- Площадки A и B: кулак на A, ладонь на B. При нажатии кисть приподнимается и светится цветом канала.
- «Прогресс»: на плитках картинки команды — календарь, гантель, песочные часы, огонь.
- Уровни: стеклянная плитка с ободком, закрытая — матовая с пунктиром, рекомендованная — со светлым кольцом.
- Полоса сигнала: глубже, с внутренней тенью. У отметок прежние места.
- «Полёт»: сгенерированный планер вместо нарисованного, пока у птицы нет крыльев.

**Генераторы.** Кисти, мастерская и корзина сделаны той же моделью Figma AI, что в §7 (`gemini-3.1-flash-image`). Иллюстрации 5.16 команда делала в ChatGPT 6. Поэтому планер сгенерирован моделью GPT в том же Figma AI (`gpt-image-2.5-sunburst`): так он ближе к набору команды. Всего пять генераций: лист висящих кистей, мастерская днём и ночью, корзина, планер. Все приняты с первой попытки.

| Картинка | Промпт (дословно) |
|---|---|
| `hand-down-open`, `hand-down-rest`, `hand-down-close` | Premium product render of three identical right-hand bionic prosthetic hands hanging straight down from above side by side in one row, fingers pointing down toward the floor, same design, same size, same straight front camera angle with the palm facing the viewer, evenly spaced with wide empty gaps between them, each fully visible from the flat top edge of the forearm socket at the top down to the fingertips. Left hand: fully open, all five fingers straight and spread, pointing down. Middle hand: relaxed neutral pose — all four fingers gently bent about forty degrees at every joint so the fingertips curve toward the viewer, fingers loosely together, thumb relaxed beside the index finger; half-closed, clearly neither open nor a fist. Right hand: tightly closed fist pointing down, thumb across the fingers. Every hand has a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist, and a short white forearm socket above the wrist with a flat top edge. Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, clean and friendly, high detail. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no reflections of the background colour, no text, no logo, no watermark. |
| `bg-grip-day` | Vertical background for a mobile game, soft premium 3D render. An empty bright modern bionic workshop seen straight on. In the lower third a long dark graphite workbench spans the whole width: its flat top edge is perfectly straight and horizontal across the whole image at about seventy percent of the height, with a thin softly glowing mint-green (#16E182) light strip along the top edge; the front of the bench below it is smooth matte graphite with two wide shallow drawers with slim mint handles and soft reflections, fading darker towards the bottom. Behind it a calm out-of-focus light wall in airy white and pale mint tones with a subtle dotted pegboard texture, gentle mint, cyan and violet gradient light and two soft flowing neon light trails, mint-green and violet, across the wall. Lots of calm empty space in the upper two thirds, shallow depth of field, daylight from the top left. Nothing on the bench, no tools, no people, no hands, no objects, no text, no logo, no watermark. |
| `bg-grip-night` | The same scene at night: the bench light strip and the drawer handles glow brightly, the wall is deep navy and indigo (#0B1430, #140B24) with soft glows of mint, cyan and violet and the two neon trails; dark empty space in the upper two thirds, fading to near black at the bottom (otherwise the day prompt word for word). |
| `prop-basket` | Premium product render of one empty open-top storage crate basket, wide and low, seen straight from the front at eye level so its top rim is a straight horizontal line, the inside not visible. Glossy mint-to-teal (#16E182 to #1FD0A6) plastic body with rounded corners, slightly tapered toward the bottom, two rows of rounded rectangular slots on the front, a thicker light mint rim with a soft highlight along the top, small rounded feet. Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, clean and friendly, high detail, centred with wide empty margins. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no reflections of the background colour, no text, no logo, no watermark. |
| `prop-glider` | A cute glossy toy glider plane flying to the right, seen from the side and slightly from above, nose pointing right: a rounded white body like a smooth pebble, two swept mint-green to teal (#16E182 to #1FD0A6) wings, a small coral (#FF7A45) nose cone and tail fin, a tiny dark round cockpit window with a white highlight, soft mint light under the wings. Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, friendly, high detail, centred with wide empty margins. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no motion lines, no reflections of the background colour, no text, no logo, no watermark. |

**Как проверено:** снимки всех экранов до и после в светлой и тёмной теме, «Мастерская» и «Полёт» в трёх темах. Тест рисует «Мастерскую», «Две руки» и «Полёт» со всеми загруженными картинками в трёх темах и двух ориентациях. Тесты каталога, контраста, раскладки и axe. Новые картинки этого вывоза весили 113 КБ, весь набор — 1,64 МБ. Полное качество и текущий вес — §10.

## 9. Система компонентов: каждая кнопка, линия и состояние (26.10.2026, ночь)

Второй запрос команды: «каждый элемент, каждую кнопку, каждую линию — максимально качественно, с учётом мировых практик и SOTA». Слой 5.12 уже задавал облик: кнопки-таблетки, бенто-карточки, градиенты брошюры. Не хватало системы. Нажатие выглядело одинаково везде, у полос и кнопок не было глубины, линии были жёсткими, шеврон раздела был символом шрифта. Новое — один слой в конце `styles/app.css`, только на токенах. Рамка верхней панели и полоса 16 px всё же сдвинули площадку жеста на альбомном экране 320 px; это поправлено в §53, и линтер раскладки после правки чист.

| Решение | Практика | Как сделано |
|---|---|---|
| Состояния нажатия | Material 3, state layers: наведение и нажатие — полупрозрачный слой цвета содержимого поверх элемента ([m3.material.io](https://m3.material.io/foundations/interaction/states/state-layers)) | Слой — внутренняя тень на весь элемент: 4 % при наведении, 10 % при нажатии. Ни размер, ни позиционирование детей не меняются. Нажатая кнопка опускается на 1 px |
| Тактильные кнопки | M3 Expressive: форма и движение показывают, что можно нажать | Светлая верхняя кромка и мягкое основание внутри главной кнопки. Пружинное нажатие 120 мс |
| Стекло | Apple HIG, «Materials»: размытый материал отделяет панели от содержимого, не пряча его ([developer.apple.com](https://developer.apple.com/design/human-interface-guidelines/materials)) | Верхняя панель, круглые кнопки, нижняя навигация и всплывающие сообщения размывают то, что прокручивается под ними |
| Читаемость важнее эффекта | Критика стекла: текст поверх просвечивающего фона теряет контраст (NN/g о glassmorphism, [nngroup.com](https://www.nngroup.com/articles/glassmorphism/)) | Плотность стекла 84–90 %: снимки показали, что при 82 % под подписями навигации просвечивал текст страницы. При «Меньше прозрачности» (`prefers-reduced-transparency`), в контрастной теме и при системных цветах — сплошной фон |
| Тонкие линии | Иерархия тоном, а не толщиной: hairline-разделители | Рамки карточек, строк плана, панели игры и полосы сигнала — 1 px из цвета линии с прозрачностью |
| Шеврон раздела | Иконка не должна зависеть от шрифта | Символ «▾» заменён нарисованным шевроном, как у вопросов к Мио. Он поворачивается при открытии |
| Переключатель и поля | Глубина показывает, что утоплено, а что выпукло | У трека переключателя утопленный край, у ручки тень. Поля ввода слегка утоплены, сегменты выпуклые на утопленной дорожке |
| Типографика | `text-wrap: balance` и `pretty` — базовая линия браузеров 2024–2026 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap)) | Заголовки разбиты на равные строки, в абзацах нет одинокого последнего слова. Старые движки правило пропускают |
| Доступность | WCAG 2.2: 1.4.3, 1.4.11, 2.4.13 | Под текстом прежние сплошные цвета, тесты контраста не менялись и прошли. Кольцо фокуса прежнее — 3 px с отступом. В контрастной теме нет теней и стекла. Нажатие там — белая рамка |

**Проверено:** снимки всех экранов до и после в светлой и тёмной теме (390 × 844), тесты дизайна (контраст, плитки, тёмная тема одним набором значений), axe и линтер раскладки. **Не проверено:** стоимость размытия на слабом Android WebView. Стекло — пять небольших панелей, но кадр с ним на телефоне не мерился. Если кадр просядет, сплошной фон включает системная настройка «Меньше прозрачности».

## 10. Качество против веса: почему был лимит и какой он теперь (26.10.2026, ночь)

Вопрос команды: «почему ограничения на размер? Делай красивое яркое приложение с отличной графикой».

- **Откуда лимит.** Площадка принимает архив до 30 МБ: репозиторий с историей плюс APK и автономный HTML. Картинка лежит в архиве около 4,3 раза: в дереве, в истории, в APK и в HTML, где base64 добавляет треть. Бюджет 2 МБ на набор ставился с запасом, когда архив был 27 МБ — до чистки истории 19.10. Замер 26.10: около 20 МБ из 30.
- **Что изменилось:**
  - сгенерированные картинки — в полном размере листа и с качеством WebP 92: кисти 438 × 635 и 364 × 686 вместо 221 × 320 и 212 × 400, корзина 640 px, планер 480 px. Весь набор — 1,89 МБ;
  - бюджет набора — 3,5 МБ, сгенерированной картинки — 160 КБ, автономного HTML — 6 МБ (`tests/v516.test.mjs`);
  - холст игры рисуется с плотностью до 3, было до 2,5: картинки резкие на экранах 3×. Слабый телефон по-прежнему падает до 1,5 (FpsGuard);
  - комнаты ярче: насыщенность +30 % днём и +12 % ночью при импорте (`VIVID` в `tools/import-generated.py`). Генератор отдавал их бледными, а мятный на белом на улице выцветает;
  - фон страниц ярче: три фирменных свечения — мятное, голубое, фиолетовое — за карточками. Это только декор, поверхности под текстом прежние, тесты контраста прошли;
  - корпус кисти в облике «Графит» — светлое серебро, близкое к белому глянцу картинок: серый корпус на светлой сцене смотрелся тускло. Графит остаётся в суставах и подушечках пальцев. Цветные облики не менялись.
- **Иллюстрации 5.16** (птица, Мио, значки) пережаты инструментом команды из её пакета. Пакета (`SYNERGY_GRAPHICS`, оригиналы ChatGPT) в репозитории нет. Если команда его даст, `tools/import-art.py` выгрузит их крупнее в рамках нового бюджета.


## 11. Птица в гнезде, кисть в каждом хвате, первые кадры (26–27.10.2026)

Запросы команды: «птенец в гнезде очень криво сидит (больше гнезда!)», «гнездо расползлось, предметы не на месте — можешь перегенерировать, а не делать слайды из разных элементов в один криво?», «все взаимодействия перепроверить, даже самые редкие», «начальные кадры сделать очень красивыми». Набор 5.16 команда делала в ChatGPT 6, модель GPT Astra.

**Почему не склейка.** Птицы набора 5.16 нарисованы без гнезда, «радость» — прыжок. Гнездо подкладывалось снизу: прыгающая птица висела над ним, у гнезда был свой свет и масштаб. Подгонка размеров и вырезанный передний край гнезда только маскировали шов. Поэтому с надетым «Гнездом из веток» птица — своя картинка, сгенерированная целиком: птица сидит в гнезде (`pet-*-nest`, 21 картинка). Без гнезда остаются картинки команды.

**Как сделано:**
- Четыре листа 3 × 2 моделью GPT в Figma AI (`gpt-image-2.5-sunburst`, ближе всего к набору команды): яйцо и птенец, подлёток, юная, жар-птица. Один лист — одна стадия, поэтому у стадии один дизайн. «Радость» в гнезде — поднятые крылья вместо прыжка.
- `tools/import-generated.py --pets` вырезает пурпурный ключ, режет лист по пустым полосам и нормирует каждую картинку по гнезду: прутья находит по цвету (`nest_mask`), гнездо — 62 % ширины кадра, дно — на 95 % высоты у всех 21. Гнездо не «гуляет», пока птица растёт, и не прыгает, когда его надевают.
- Глаза — по двум самым тёмным пятнам лица, три спящие птицы размечены по увеличенным кадрам (`EYES` в `tools/import-art.py`). Вещи на голову ложатся по глазам, как у картинок команды. Вещь на груди поднимается над прутьями и при необходимости чуть уменьшается; у спящей птицы грудь в гнезде, и оберег остаётся под ней, а не висит на прутьях.
- WebP 80: архив площадки принимает ≈ 6 МБ, картинка ложится в него ≈ 4,3 раза (`docs/ART.md`, «Бюджет»).
- Движение: птица в гнезде — одна картинка, и прыжок поднял бы гнездо. Она подпрыгивает на месте — сжатие и растяжение от дна гнезда (`fb-nest-perk`), взмах покачивает гнездо (`fb-nest-rock`), как персонаж в «домике» мобильных игр.

**Кисть в каждом хвате.** В «Мастерской» на щепоти и ключе белая кисть сменялась тёмной кистью из фигур. Висящие хваты сгенерированы листом той же кисти (`gemini-3.1-flash-image`) и наложены на висящую кисть: предплечье и полоса — её собственные (одинаковы во всех позах), кисть ниже полосы — новая, в масштабе того же запястья (`--hang-grips`). Точка захвата (`BIONIC.hang.grasp`) ставит монету, ягоду, карту и ключ между большим и указательным пальцами. Стоящие хваты (щепоть, указательный, ключ, «Класс», «Указатель», «Сгиб большого пальца») взяты с листов картинок жестов (`--stand-grips`).

**Старая кисть 5.16** на значках «Мастерской», «Первых шагов» и «Дела дня», на трёх плитках «Дела дня» и на обложке «Ваш протез» заменена той же белой кистью. Кубик и кольцо «Мастерской» — объёмные картинки вместо плоских фигур; кубик приведён к цвету игры #5A8DFF (`--hue`).

**Первые кадры.** Заставка до запуска скрипта: значок, «Синергия», «тренажёр протеза» (app shell — пустой экран после заставки APK был до 2 с). Первая страница знакомства — три пункта «картинка, жирный заголовок, строка» (Apple HIG «Onboarding») и обложка не выше 26 % экрана: всё помещается на 390 × 844.

**Не сделано:** фоны «Полёта», «Ритма» и «Сейфа» днём и ночью. С ними архив подошёл бы к 30 МБ; в играх остаются нарисованные фоны (`coverScene` возьмёт картинки, когда они появятся). Решение за командой: освободить место (презентация организатора в git, APK и HTML файлами выпуска) — тогда фоны можно сгенерировать по готовым промптам.

| Картинка | Модель | Промпт (дословно) |
|---|---|---|
| `pet-egg-*-nest`, `pet-chick-*-nest` | `gpt-image-2.5-sunburst` | A character sheet for a cosy mobile game: six pictures in a grid of 3 columns × 2 rows on one image, each in its own equal cell. The same character design, the same nest, the same camera, the same scale and the same light in every cell. In every cell the nest is centred horizontally, has the same size (about 60 % of the cell width) and its bottom sits at the same height, just above the bottom of the cell; every figure is complete, fits inside its cell with wide empty margins and never touches or crosses a cell border. The nest: a round, cosy, shallow woven nest of smooth caramel-orange twigs (#C9773A to #E59A55), like a small wicker bowl, seen from the front and a little from above; the character sits INSIDE it — the lower part of its body and its feet are hidden behind the front rim of the nest, and the tail feathers fan out behind the nest. Style: cute stylised 3D character illustration, soft clay and vinyl-toy render, smooth matte surfaces with a subtle soft feather texture, rounded shapes, pastel mint-teal palette with warm coral and gold accents, soft studio light from the top left, gentle ambient occlusion, high detail, friendly. Background: a perfectly flat solid magenta (#FF00FF) chroma-key background in every cell and between the cells, no shadows on the background, no floor, no grid lines, no frames, no reflections of the background colour on the character, no text, no labels, no logo, no watermark. Top row — an EGG standing upright in the nest, its lower third hidden behind the front rim: a glossy cream-white egg (#F6EEDF) with one wide mint-teal (#7ED6C1) zigzag band around its lower half and tiny scattered gold and sky-blue dots. Left: calm, softly lit. Middle: glowing warm golden from inside, with a thin glowing golden crack line and three small golden four-point sparkles around it. Right: asleep — a small pale-blue crescent moon and two tiny pale-blue stars float above it. Bottom row — a newly hatched CHICK in the nest, sitting in the lower half of its cracked eggshell (the same cream shell with the mint zigzag), the shell inside the nest: a tiny round mint-teal (#6FD3C3) chick with a cream belly, huge glossy dark-brown eyes with white highlights, soft pink blush cheeks, a small orange beak, a little coral-orange flame tuft on top of its head and tiny mint wings. Left: awake, looking at the viewer with big round curious eyes, wings tucked in. Middle: overjoyed — eyes closed in happy upward arcs, beak open in a laugh, both tiny wings raised high, three small golden four-point sparkles around. Right: asleep, curled down in the shell, eyes closed in calm downward arcs, a small pale-blue crescent moon and two tiny pale-blue stars above. |
| `pet-fledgling-*-nest` (верхний ряд) | `gpt-image-2.5-sunburst` | A character sheet for a cosy mobile game: six pictures in a grid of 3 columns × 2 rows on one image, each in its own equal cell. The same character design, the same nest, the same camera, the same scale and the same light in every cell. In every cell the nest is centred horizontally, has the same size (about 60 % of the cell width) and its bottom sits at the same height, just above the bottom of the cell; every figure is complete, fits inside its cell with wide empty margins and never touches or crosses a cell border. The nest: a round, cosy, shallow woven nest of smooth caramel-orange twigs (#C9773A to #E59A55), like a small wicker bowl, seen from the front and a little from above; the character sits INSIDE it — the lower part of its body and its feet are hidden behind the front rim of the nest, and the tail feathers fan out behind the nest. Style: cute stylised 3D character illustration, soft clay and vinyl-toy render, smooth matte surfaces with a subtle soft feather texture, rounded shapes, pastel mint-teal palette with warm coral and gold accents, soft studio light from the top left, gentle ambient occlusion, high detail, friendly. Background: a perfectly flat solid magenta (#FF00FF) chroma-key background in every cell and between the cells, no shadows on the background, no floor, no grid lines, no frames, no reflections of the background colour on the character, no text, no labels, no logo, no watermark. Both rows show the same FLEDGLING; the second row is a second take of the same three pictures: a round, plump mint-teal (#6FD3C3) bird with a big cream belly with a soft scalloped feather texture, huge glossy dark-brown eyes with white highlights, pink blush cheeks, a small orange beak, a crest of three coral-to-golden flame feathers, short mint wings with sky-blue tips and a small fan tail of sky-blue peacock feathers with golden-orange eye spots. Left: awake, sitting upright in the nest, looking at the viewer with big round eyes and a small friendly smile, wings folded. Middle: overjoyed — eyes closed in happy upward arcs, beak open in a laugh, both wings raised high and spread, three small golden four-point sparkles around. Right: asleep, curled down into the nest with its head resting on its wing, eyes closed in calm downward arcs, a small pale-blue crescent moon and two tiny pale-blue stars above. |
| `pet-young-*-nest` | `gpt-image-2.5-sunburst` | A character sheet for a cosy mobile game: six pictures in a grid of 3 columns × 2 rows on one image, each in its own equal cell. The same character design, the same nest, the same camera, the same scale and the same light in every cell. In every cell the nest is centred horizontally, has the same size (about 60 % of the cell width) and its bottom sits at the same height, just above the bottom of the cell; every figure is complete, fits inside its cell with wide empty margins and never touches or crosses a cell border. The nest: a round, cosy, shallow woven nest of smooth caramel-orange twigs (#C9773A to #E59A55), like a small wicker bowl, seen from the front and a little from above; the character sits INSIDE it — the lower part of its body and its feet are hidden behind the front rim of the nest, and the tail feathers fan out behind the nest. Style: cute stylised 3D character illustration, soft clay and vinyl-toy render, smooth matte surfaces with a subtle soft feather texture, rounded shapes, pastel mint-teal palette with warm coral and gold accents, soft studio light from the top left, gentle ambient occlusion, high detail, friendly. Background: a perfectly flat solid magenta (#FF00FF) chroma-key background in every cell and between the cells, no shadows on the background, no floor, no grid lines, no frames, no reflections of the background colour on the character, no text, no labels, no logo, no watermark. The YOUNG FIREBIRD in all six cells: a mint-teal (#6FD3C3) bird a little taller and more elegant than a chick, a cream chest with a soft scalloped feather texture, huge glossy dark-brown eyes with white highlights, pink blush cheeks, a small orange beak, a crest of three tall flame feathers from coral to golden, mint wings with sky-blue tips and a wide fan tail of sky-blue peacock feathers with golden-orange eye spots rising behind the nest. Top row — left: awake, sitting upright, looking at the viewer with a small friendly smile, wings folded; middle: overjoyed — eyes closed in happy upward arcs, beak open in a laugh, both wings raised high and spread, three small golden four-point sparkles around; right: asleep, curled down into the nest with its head resting on its wing, eyes closed in calm downward arcs, a small pale-blue crescent moon and two tiny pale-blue stars above. Bottom row — left: waving hello with one wing raised high (the wing on the viewer's left), the other wing folded, a big smile; middle: reading — holding a small open mint-green book with a little golden star on its cover in both wings in front of its chest, looking at the viewer with a gentle smile; right: proud — holding a big glossy golden five-point star high above its head in both raised wings, smiling. |
| `pet-firebird-*-nest` | `gpt-image-2.5-sunburst` | A character sheet for a cosy mobile game: six pictures in a grid of 3 columns × 2 rows on one image, each in its own equal cell. The same character design, the same nest, the same camera, the same scale and the same light in every cell. In every cell the nest is centred horizontally, has the same size (about 60 % of the cell width) and its bottom sits at the same height, just above the bottom of the cell; every figure is complete, fits inside its cell with wide empty margins and never touches or crosses a cell border. The nest: a round, cosy, shallow woven nest of smooth caramel-orange twigs (#C9773A to #E59A55), like a small wicker bowl, seen from the front and a little from above; the character sits INSIDE it — the lower part of its body and its feet are hidden behind the front rim of the nest, and the tail feathers fan out behind the nest. Style: cute stylised 3D character illustration, soft clay and vinyl-toy render, smooth matte surfaces with a subtle soft feather texture, rounded shapes, pastel mint-teal palette with warm coral and gold accents, soft studio light from the top left, gentle ambient occlusion, high detail, friendly. Background: a perfectly flat solid magenta (#FF00FF) chroma-key background in every cell and between the cells, no shadows on the background, no floor, no grid lines, no frames, no reflections of the background colour on the character, no text, no labels, no logo, no watermark. The grown FIREBIRD in all six cells: an elegant mint-teal (#6FD3C3) bird with a cream chest with a soft scalloped feather texture, huge glossy dark-brown eyes with white highlights, pink blush cheeks, a small orange beak, a tall fiery crest of coral, orange and golden flame feathers, mint wings with sky-blue tips and a large, wide fan tail of sky-blue peacock feathers with golden-orange eye spots rising behind the nest; a faint warm golden glow around it and a few tiny golden sparkle dots. Top row — left: awake, sitting upright, looking at the viewer with a small friendly smile, wings folded; middle: overjoyed — eyes closed in happy upward arcs, beak open in a laugh, both wings raised high and spread, three small golden four-point sparkles around; right: asleep, curled down into the nest with its head resting on its wing, eyes closed in calm downward arcs, a small pale-blue crescent moon and two tiny pale-blue stars above. Bottom row — left: waving hello with one wing raised high (the wing on the viewer's left), the other wing folded, a big smile; middle: reading — holding a small open mint-green book with a little golden star on its cover in both wings in front of its chest, looking at the viewer with a gentle smile; right: proud — holding a big glossy golden five-point star high above its head in both raised wings, smiling. |
| `hand-down-pinch`, `-key`, `-point` (отражены: большой палец справа, как у висящей кисти) | `gemini-3.1-flash-image` | Premium product render of three identical right-hand bionic prosthetic hands hanging straight down from above side by side in one row, fingers pointing down toward the floor, same design, same size, same straight front camera angle with the palm facing the viewer, evenly spaced with wide empty gaps between them, each fully visible from the flat top edge of the forearm socket at the top down to the fingertips. Left hand: precision pinch — the tips of the thumb and the index finger touch and form a small rounded ring, the middle, ring and little fingers gently curved and relaxed. Middle hand: lateral key grip — the four fingers curled into the palm, the pad of the thumb pressed flat against the side of the bent index finger, as when holding a key. Right hand: index point — the index finger straight and pointing down, the other three fingers curled into the palm, the thumb folded over the middle finger. Every hand has a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist, and a short white forearm socket above the wrist with a flat top edge. Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, clean and friendly, high detail. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no reflections of the background colour, no text, no logo, no watermark. |
| `game-grip`, `game-tutorial`, `ico-everyday` | `gemini-3.1-flash-image` | Three separate icon illustrations side by side in one row with wide empty gaps between them, the same soft 3D clay style, the same light, each centred in its third. The same bionic hand in all three: a right-hand bionic prosthetic hand with a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist and a short white forearm socket with a flat end. Left: the hand hanging from above, fingers down, gently holding a small cream egg between its fingertips over a small low open mint-green (#16E182 to #1FD0A6) plastic crate basket. Middle: the hand standing upright on its socket, palm facing the viewer, fingers open, the palm light glowing, two small glowing dots on the socket — one coral (#FF7A45), one sky blue (#5AC8FA). Right: the hand holding a mint-green (#16E182) ceramic mug by its body, a thin wisp of steam above the mug. Studio lighting from the top left, soft highlights, clean and friendly, high detail. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no shadows on the background, no floor, no reflections of the background colour, no text, no logo, no watermark. |
| `day-apple`, `day-bag`, `day-paper` | `gemini-3.1-flash-image` | Three separate square illustrations side by side in one row on a pure white background with wide white gaps between them, the same soft 3D clay style and light. The same bionic hand in all three: a right-hand bionic prosthetic hand with a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist and a short white forearm socket with a flat end. Left: the hand reaching down and taking a shiny red apple out of a white bowl. Middle: the hand hanging down and holding the handles of a light-blue fabric tote bag. Right: the hand pressing a sheet of white paper flat on a table while a red pencil draws a mint-green wavy line on it. Studio lighting from the top left, soft contact shadows on the white ground, clean and friendly, high detail, no people, no other hands, no text, no logo, no watermark. |
| `cover-prosthesis` | `gpt-image-2.5-sunburst` | A friendly soft 3D clay illustration for the onboarding of a prosthesis training game, 4:3 composition. On the left a modern smartphone standing upright, its screen showing a simple bright game: a small mint-green bird flying through a coral ring over soft hills, a mint progress bar at the bottom. On the right, slightly in front, the bionic hand waving hello with the palm facing the viewer: a right-hand bionic prosthetic hand with a glossy white shell, matte dark graphite finger joints and fingertip pads, a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band at the wrist and a short white forearm socket with a flat end. A few small floating sparkles, soft mint and lavender light trails behind them. Background: a soft pale mint (#E6F8F1) gradient with gentle light from the top left. Clean, calm, premium, lots of empty space at the edges, no people, no text, no logo, no watermark. |
| `obj-cube`, `obj-ring` | `gemini-3.1-flash-image` | Two toy objects side by side in one row with a wide empty gap between them, the same soft 3D clay style, the same size, seen from the front and a little from above. Left: a smooth wooden toy cube with softly rounded edges and corners, painted glossy cornflower blue (#5A8DFF), a faint wood grain showing through the paint. Right: a chunky glossy golden-yellow (#F2C14E) plastic ring from a stacking toy, like a thick rounded doughnut, standing upright and seen slightly from above so its round hole is clearly visible. Studio lighting from the top left, soft highlights, a soft contact shadow directly under each object, clean and friendly, high detail. Isolated on a perfectly flat solid magenta (#FF00FF) chroma-key background, no floor, no reflections of the background colour, no text, no logo, no watermark. |

## 12. Цельные картинки вместо коллажей (29.10.2026)

Запрос команды: «перепроверить всю графику — очень часто элемент из 2–3 деталей выглядит неправильно; не делать коллаж из 2–3 предметов, а перегенерировать его заново». Генерация — у команды, в ChatGPT (Image 2.5): у этой сессии генератора картинок нет (подключение Figma не открылось). Здесь — аудит, код, который берёт цельную картинку, задания с промптами и импорт одной командой.

**Аудит.** Сняты гнездо и все нарядные сочетания птицы (4 стадии × 3 настроения × 13 нарядов), «Мастерская» по кадрам, «Сейф» и площадки в схеме жестов, «Первые шаги». Склейки, которые читаются неправильно:

| Где | Из чего склеено | Как выглядело | Решение |
|---|---|---|---|
| Птица в наряде (гнездо, главная, итоги, «Полёт») | птица + картинка подарка по рамке от глаз | кокошник сидит на половине хохолка и съезжает, венок и бант — наклейки, фонарик висит у хвоста, свет и масштаб чужие | одна вещь — одна цельная картинка `pet-<стадия>-<happy/waiting>-nest-<вещь>`; птица носит гнездо и **один** наряд; спящая птица наряд снимает |
| «Мастерская», предмет в руке | висящая кисть + картинка предмета | яйцо висит под кончиками пальцев, пальцы его не обхватывают | `hold-<предмет>`: кисть, которая держит предмет, одной картинкой |
| «Мастерская», смена позы | две картинки кисти полупрозрачно | при пропорциональном сжатии видны два набора пальцев — столько, сколько держится сила | наплыв только в средней пятой части пути: всегда видна ближняя картинка (код) |
| «Мастерская», предмет в корзине | корзина, потом предмет | сданное яйцо лежит поверх передней стенки | передняя стенка рисуется поверх сданного предмета (код) |
| Висящие щепоть, ключ, указательный | предплечье одной картинки + кисть другой | шов на полосе запястья, разный свет | лист `hang-grips` — три кисти целиком |
| Жесты набора ТЗ (по умолчанию) | кисть кода + стрелки | шесть жестов из семи и коактивация — маленькие тёмные кисти из фигур среди белых сгенерированных | лист `tz-gestures`: 8 пиктограмм, стрелка — часть картинки |

**Почему один наряд.** Три места сразу (голова, грудь, рядом) дают 5 × 5 × 3 сочетания на каждую стадию и настроение — сгенерировать каждое целиком нельзя, а склейка и есть ошибка. Один наряд — одна картинка на вещь. Решение проще и для человека: меньше выбора в меню, которое ведут здоровой рукой. Старые резервные копии читаются: гнездо остаётся, первая надетая вещь становится нарядом (`cleanOutfit`, тест).

**Почему спящая без наряда.** Свернувшаяся птица с наложенной вещью выглядела хуже всего, а цельные спящие картинки добавили бы треть набора. Спящая птица — картинка настроения без всего, «на ночь наряд снимают».

**Как код выбирает картинку.**
- Птица: цельная картинка наряда — сначала позы, потом настроения; если её ещё нет, вещь накладывается, как раньше (`petPictureName`, `petThings`). В «Полёте» летит цельная `pet-<стадия>-happy-<вещь>`, иначе — прежний холст с наложенной вещью.
- Кисть с предметом: пока предмет в руке (захват с контактом и перенос), рисуется `hold-<предмет>` так, что центр предмета стоит там, где его держит игра; рука над картинкой продолжается вверх, как у висящих кистей (`drawHeld`). Корпус ниже полосы запястья — в цвете облика, а предмет, вырезанный из той же картинки (`hold-<предмет>-obj`), кладётся поверх без тонировки: коралловая кисть, а не коралловое яйцо. Белые предметы (яйцо, стаканчик, гантель) по цвету от корпуса не отделить — их цельная картинка показывается только в облике «Графит» (почти белом); в цветных обликах остаются две картинки. Горячий чай остаётся рисунком: он наклоняется и проливается.
- Карточки «Сейфа» и «Проверки навыка»: картинка жеста; команда двух каналов — одна и та же картинка в любом наборе (кулак, ладонь, коактивация `gesture-coact`). В наборе ТЗ «сжатие» — это сгибание запястья, а карточка просит сжать кисть.

**Задания.** `tools/regen.py` — один источник: 20 листов (`docs/REGEN.md`, создаётся `--docs`), эталон каждого листа из каталога (`--refs`) и импорт (`--import ПАПКА`). Промпты держат стиль §7–11: та же кисть, тот же пурпурный ключ, тот же стиль птицы. К каждому листу прикладывается эталон, поэтому дизайн берётся с картинок игры, а не из слов. Лист птицы — три вещи × два настроения, кисть с предметами — 3 × 2, жесты — 4 × 2.

**Импорт подгоняет картинку к тому, что она заменяет**, чтобы при смене ничего не прыгало:
- птица в наряде — по гнезду своей картинки без наряда: ширина, центр, дно (`nest_mask`);
- кисть с предметом — по руке висящих кистей: ширина и ось предплечья; печатает, где предмет и полоса запястья (`HOLD_LAYOUT` в каталоге);
- висящий хват — по полосе запястья и ширине кисти висящих кистей, верх руки дотягивается до края кадра;
- жест — по своей рамке, на квадрат 256 px.
Сетка листа режется по пустым полосам (`grid_cells`), PNG с настоящей прозрачностью берётся как есть. Ячейку, нарисованную левой рукой, отражает `--flip имя`; неверно найденный центр предмета задаёт `--centre имя=x,y`.

**Очередь и вес.** Первая очередь — жесты ТЗ, кисть с предметами, наряды птенца и юной птицы (стадия демо-профиля): 9 листов, около 1,4 МБ. Вторая — наряды подлётка, жар-птицы и яйца, висящие хваты; третья — птица в наряде в «Полёте». Всё вместе — около 3,2 МБ. Бюджет тестов на цельные картинки — 1,5 МБ сверх набора 3,5 МБ. Почему так: каждый мегабайт картинок ложится в архив сдачи около 4 раз, а история `main` уже около 25 МБ (замер 29.10: `git rev-list --objects main --filter=blob:limit=10m | git pack-objects`) — в ней лежат APK и автономный HTML версии 5.16. Вторую очередь — когда команда решит, как сдавать (ссылка на GitLab по ТЗ или архив) и освободит место.

**Как проверено.** Импорт прогнан на синтетических листах из картинок каталога: жесты, кисть с предметами, наряды юной птицы, висящие хваты, полёт. Гнездо наряда совпало с гнездом без наряда, предмет найден, вырезка предмета не цепляет суставы и огонёк ладони. Бледные предметы вырезки не получили, как задумано. Тесты: `tests/regen.test.mjs` (задания ↔ код, промпты в документе, `drawHeld` кладёт предмет на место), `tests/pet.test.mjs` (гнездо и один наряд, старые копии), `tests/v516.test.mjs` (выбор картинки, спящая без наряда, бюджет). **Не проверено:** настоящие листы ChatGPT — их ещё нет; после импорта нужны снимки экранов во всех темах, как в §7–11.
