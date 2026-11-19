#!/usr/bin/env python3
"""Excel-модель экономического эффекта для «Моторики» — с живыми формулами.   python3 tools/motorica-model.py [--check]

→ motorica/MOTUS-Lab-Motorica-model.xlsx: «Параметры» (база 2025 и допущения A1–A6), «Сценарии» (2027–2031, три сценария),
  «Чувствительность» (L1 2031 года при изменении одного параметра), «Источники».

Формулы те же, что в tools/motorica-deck.cjs (MODEL), и числа на слайдах 15–16 и в приложениях П1–П2 должны совпасть
с пересчётом книги. `--check` пересчитывает книгу в LibreOffice и сверяет итоги с motorica/slides.json.
Синий шрифт — вводимые значения: меняйте их, остальное пересчитается. Нужны openpyxl и, для --check, LibreOffice.
"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.defined_name import DefinedName

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'motorica'
BOOK = OUT / 'MOTUS-Lab-Motorica-model.xlsx'
SLIDES = OUT / 'slides.json'

INPUT = Font(name='Calibri', size=11, color='0000FF')
BOLD = Font(name='Calibri', size=11, bold=True)
HEAD = Font(name='Calibri', size=11, bold=True, color='FFFFFF')
TITLE = Font(name='Calibri', size=14, bold=True)
NOTE = Font(name='Calibri', size=10, italic=True, color='56616D')
NAVY = PatternFill('solid', fgColor='071019')
MINT = PatternFill('solid', fgColor='E2F8EC')
CARD = PatternFill('solid', fgColor='F3F5F7')
LINE = Side(style='thin', color='DCE3E8')
BOX = Border(left=LINE, right=LINE, top=LINE, bottom=LINE)
WRAP = Alignment(wrap_text=True, vertical='top')
MLN = '#,##0;(#,##0);"–"'
MLN1 = '#,##0.0;(#,##0.0);"–"'
MLN2 = '#,##0.00'
PCT = '0%'
PCT1 = '0.0%'

# Имя, подпись, значение, формат, единица, источник или статус
PARAMS = [
    ('Rev2025', 'Выручка группы 2025', 7115, MLN, 'млн ₽', 'IR-брошюра «Моторики» 2025'),
    ('ULShare', 'Доля протезов рук в выручке', 0.68, PCT, '', 'IR-брошюра 2025'),
    ('ULUnits', 'Протезов рук продано', 2600, MLN, 'шт.', 'IR-брошюра 2025: 1 800 бионических + 800 активных'),
    ('Margin', 'Маржа EBITDA', 0.26, PCT, '', 'IR-брошюра 2025'),
    ('Payroll', 'Фонд оплаты труда', 2000, MLN, 'млн ₽', 'IR-брошюра 2025'),
    ('Heads', 'Штат', 777, MLN, 'чел.', 'IR-брошюра 2025'),
    ('Patients', 'Пациентов в год на сопровождении', 3600, MLN, 'чел.', 'IR-брошюра 2025'),
    ('Repeat', 'A1 · Доля повторных продаж', 0.55, PCT, '', 'допущение: «большинство продаж — повторные пациенты» (IR)'),
    ('Period', 'A2 · Срок замены протеза', 3, '0', 'лет', 'норма 1–3 года, приказ Минтруда № 107н'),
    ('Loyalty', 'A3 · Возврат при замене', 0.8, PCT, '', 'допущение'),
    ('Premium', 'A6 · Разница цены флагмана', 1.0, MLN2, 'млн ₽', 'допущение; точная цена — у «Моторики»'),
    ('HoursFTE', 'Рабочих часов на ставку в год', 1800, MLN, 'ч', 'норма рабочего времени'),
]
DERIVED = [
    ('ULRev', 'Выручка протезов рук', '=Rev2025*ULShare', MLN, 'млн ₽'),
    ('ASP', 'Выручка на протез', '=ULRev/ULUnits', MLN2, 'млн ₽'),
    ('NewUsers', 'Новые пользователи в год', '=ULUnits*(1-Repeat)', MLN, 'чел.'),
    ('FTECost', 'Стоимость ставки в год', '=Payroll/Heads', MLN2, 'млн ₽'),
    ('PerUserYear', 'Выручка в год на удержанного пользователя', '=ASP*Loyalty/Period', MLN2, 'млн ₽'),
    ('CycleRev', 'Выручка за цикл замены на удержанного', '=ASP*Loyalty', MLN2, 'млн ₽'),
    ('CycleEbitda', 'EBITDA за цикл замены на удержанного', '=CycleRev*Margin', MLN2, 'млн ₽'),
    ('BERev', 'Окупаемость 10 млн ₽ затрат: удержанных, по выручке', '=10/CycleRev', MLN1, 'чел.'),
    ('BEEbitda', 'Окупаемость 10 млн ₽ затрат: удержанных, по EBITDA', '=10/CycleEbitda', MLN1, 'чел.'),
    ('BEShare', 'То же, доля новых пользователей года', '=BEEbitda/NewUsers', PCT1, ''),
]
# Сценарий: охват тренажёром (A4), снижение отказов (A5), сдвиг к флагманам (A6), часы специалиста на пациента
SCEN = [('Консервативный', 0.3, 0.05, 0.01, 1), ('Базовый', 0.5, 0.10, 0.02, 2), ('Оптимистичный', 0.7, 0.15, 0.04, 3)]
YEARS = [2027, 2028, 2029, 2030, 2031]
RAMP = [0.2, 0.4, 0.6, 0.8, 1.0]
COLS = 'BCDEF'
BLOCK0, BLOCK = 12, 8          # блок базового сценария начинается в строке 20, итог по годам — строка 23


def cell(ws, ref, value, font=None, fmt=None, fill=None, border=True, align=None):
    c = ws[ref]
    c.value = value
    if font:
        c.font = font
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    if border:
        c.border = BOX
    if align:
        c.alignment = align
    return c


def header(ws, row, labels, start='A'):
    col = ord(start)
    for t in labels:
        cell(ws, f'{chr(col)}{row}', t, HEAD, fill=NAVY, align=Alignment(vertical='center', wrap_text=True))
        col += 1


def name(wb, key, ref):
    wb.defined_names[key] = DefinedName(key, attr_text=ref)


def build():
    wb = Workbook()
    p = wb.active
    p.title = 'Параметры'
    cell(p, 'A1', 'Модель экономического эффекта: MOTUS Lab для ГК «Моторика»', TITLE, border=False)
    cell(p, 'A2', 'Млн ₽, если не указано иное. Синий — вводимые значения; база 2025 года заморожена, рост рынка не учтён.', NOTE, border=False)
    header(p, 4, ['Параметр', 'Значение', 'Ед.', 'Источник или статус'])
    r = 5
    for key, label, value, fmt, unit, src in PARAMS:
        cell(p, f'A{r}', label)
        cell(p, f'B{r}', value, INPUT, fmt)
        cell(p, f'C{r}', unit)
        cell(p, f'D{r}', src, align=WRAP)
        name(wb, key, f"'Параметры'!$B${r}")
        r += 1
    r += 1
    header(p, r, ['Расчётная величина', 'Значение', 'Ед.', 'Формула'])
    r += 1
    for key, label, formula, fmt, unit in DERIVED:
        cell(p, f'A{r}', label)
        cell(p, f'B{r}', formula, None, fmt, MINT)
        cell(p, f'C{r}', unit)
        cell(p, f'D{r}', formula[1:].replace('*', ' × ').replace('/', ' / '), NOTE)
        name(wb, key, f"'Параметры'!$B${r}")
        r += 1
    for col, w in zip('ABCD', (52, 14, 8, 62)):
        p.column_dimensions[col].width = w
    p.freeze_panes = 'A5'

    s = wb.create_sheet('Сценарии')
    cell(s, 'A1', 'Сценарии 2027–2031: дополнительная выручка и EBITDA, млн ₽', TITLE, border=False)
    cell(s, 'A2', 'L1 — удержание: каждый год добавляется когорта удержанных, они возвращаются за заменой. L2 — сдвиг к флагманам с разгоном 20–100 %. L3 — экономия времени специалистов.', NOTE, border=False)
    header(s, 3, ['Сценарий', 'A4 · Охват тренажёром', 'A5 · Снижение отказов', 'A6 · Сдвиг к флагманам', 'Часы специалиста на пациента'])
    for i, (label, reach, drop, mix, hours) in enumerate(SCEN):
        row = 4 + i
        cell(s, f'A{row}', label, BOLD)
        for col, v, fmt in (('B', reach, PCT), ('C', drop, PCT), ('D', mix, PCT), ('E', hours, '0')):
            cell(s, f'{col}{row}', v, INPUT, fmt)
    cell(s, 'A8', 'Год', BOLD)
    cell(s, 'A9', 'Номер года программы', BOLD)
    cell(s, 'A10', 'Разгон сдвига к флагманам', BOLD)
    for k, col in enumerate(COLS):
        cell(s, f'{col}8', YEARS[k], HEAD, '0', NAVY)
        cell(s, f'{col}9', k + 1, INPUT, '0')
        cell(s, f'{col}10', RAMP[k], INPUT, PCT)
    for i, (label, *_rest) in enumerate(SCEN):
        r, b = 4 + i, BLOCK0 + BLOCK * i
        cell(s, f'A{b}', f'{label} сценарий', HEAD, fill=NAVY)
        for col in COLS:
            cell(s, f'{col}{b}', None, fill=NAVY)
        rows = [
            ('L1 · удержание, выручка', lambda c: f'={c}$9*NewUsers*$B${r}*$C${r}*PerUserYear', MLN, None),
            ('L2 · сдвиг к флагманам, выручка', lambda c: f'={c}$10*$D${r}*ULUnits*Premium', MLN, None),
            ('Дополнительная выручка', lambda c: f'={c}{b + 1}+{c}{b + 2}', MLN, MINT),
        ]
        for k, (lab, f, fmt, fill) in enumerate(rows, 1):
            cell(s, f'A{b + k}', lab, BOLD if fill else None, fill=fill)
            for col in COLS:
                cell(s, f'{col}{b + k}', f(col), BOLD if fill else None, fmt, fill)
        cell(s, f'A{b + 4}', 'Дополнительная выручка 2027–2031', BOLD)
        cell(s, f'B{b + 4}', f'=SUM(B{b + 3}:F{b + 3})', BOLD, MLN, MINT)
        cell(s, f'A{b + 5}', 'L3 · высвобождено ставок специалистов')
        cell(s, f'B{b + 5}', f'=Patients*$E${r}/HoursFTE', None, MLN1)
        cell(s, f'A{b + 6}', 'L3 · экономия, млн ₽ в год')
        cell(s, f'B{b + 6}', f'=B{b + 5}*FTECost', None, MLN)
        cell(s, f'A{b + 7}', 'EBITDA 2031: (L1 + L2) × маржа + L3', BOLD)
        cell(s, f'B{b + 7}', f'=F{b + 3}*Margin+B{b + 6}', BOLD, MLN, MINT)
    s.column_dimensions['A'].width = 42
    for col in COLS:
        s.column_dimensions[col].width = 16
    s.freeze_panes = 'B4'

    t = wb.create_sheet('Чувствительность')
    cell(t, 'A1', 'Чувствительность: L1 базового сценария в 2031 году при изменении одного параметра, млн ₽', TITLE, border=False)
    cell(t, 'A2', 'Остальные параметры — как на листе «Параметры» и в строке «Базовый» листа «Сценарии».', NOTE, border=False)
    header(t, 4, ['Параметр', 'Ниже', 'Выше', 'L1 при «ниже»', 'L1 в базе', 'L1 при «выше»'])
    reach, drop = 'Сценарии!$B$5', 'Сценарии!$C$5'
    sens = [
        ('Снижение отказов', 0.05, 0.15, PCT, lambda v: f'=5*NewUsers*{reach}*{v}*ASP*Loyalty/Period'),
        ('Охват тренажёром', 0.3, 0.7, PCT, lambda v: f'=5*NewUsers*{v}*{drop}*ASP*Loyalty/Period'),
        ('Срок замены, лет', 3, 2, '0', lambda v: f'=5*NewUsers*{reach}*{drop}*ASP*Loyalty/{v}'),
        ('Возврат при замене', 0.6, 0.9, PCT, lambda v: f'=5*NewUsers*{reach}*{drop}*ASP*{v}/Period'),
        ('Доля повторных продаж', 0.65, 0.45, PCT, lambda v: f'=5*ULUnits*(1-{v})*{reach}*{drop}*ASP*Loyalty/Period'),
    ]
    for i, (label, lo, hi, fmt, f) in enumerate(sens):
        row = 5 + i
        cell(t, f'A{row}', label)
        cell(t, f'B{row}', lo, INPUT, fmt)
        cell(t, f'C{row}', hi, INPUT, fmt)
        cell(t, f'D{row}', f(f'B{row}'), None, MLN)
        cell(t, f'E{row}', f"=Сценарии!F{BLOCK0 + BLOCK + 1}", None, MLN, MINT)
        cell(t, f'F{row}', f(f'C{row}'), None, MLN)
    t.column_dimensions['A'].width = 30
    for col in 'BCDEF':
        t.column_dimensions[col].width = 15

    q = wb.create_sheet('Источники')
    cell(q, 'A1', 'Источники и оговорки', TITLE, border=False)
    notes = [
        'IR-брошюра МК АО «Группа Моторика» 2025 (ENG): выручка, доли, продажи, маржа, ФОТ, штат, пациенты.',
        'Biddiss E, Chau T. Prosthet Orthot Int 2007;31(3):236–257 — отказ от протезов руки 23–35 % (электрические, взрослые и дети).',
        'Приказ Минтруда России № 107н от 05.03.2021 — сроки пользования протезами (1–3 года).',
        'Допущения A1–A6 помечены на листе «Параметры» и «Сценарии»; их проверяет пилот и уточняет «Моторика» своими данными.',
        'Не учтены: рост рынка (база 2025 года заморожена), нижние конечности, центры «Моторика ОРТО», нейротех, экспорт, сервис L4 и опционы L5.',
        'Модель — иллюстрация масштаба, а не прогноз выручки «Моторики». Формулы совпадают с tools/motorica-deck.cjs.',
    ]
    for i, n in enumerate(notes, 3):
        cell(q, f'A{i}', n, align=WRAP, border=False)
    q.column_dimensions['A'].width = 120

    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False
    OUT.mkdir(exist_ok=True)
    wb.save(BOOK)
    print(BOOK.relative_to(ROOT))


def recalculated(book, tmp):
    """Значения формул после пересчёта LibreOffice (openpyxl сам формулы не считает)."""
    args = ['--headless', '--convert-to', 'xlsx', '--outdir', str(tmp), str(book)]
    helper = os.environ.get('OFFICE_HELPER')
    if helper:
        sys.path.insert(0, helper)
        from office.soffice import run_soffice  # noqa: E402
        run_soffice(args)
    else:
        profile = Path(tempfile.mkdtemp(prefix='lo-profile-'))
        try:
            subprocess.run(['soffice', f'-env:UserInstallation=file://{profile}', *args], check=True, capture_output=True, timeout=600)
        finally:
            shutil.rmtree(profile, ignore_errors=True)
    return load_workbook(Path(tmp) / book.name, data_only=True)


def check():
    model = json.loads(SLIDES.read_text())['model']
    with tempfile.TemporaryDirectory() as tmp:
        wb = recalculated(BOOK, tmp)
    s = wb['Сценарии']
    bad = []
    for i, key in enumerate(('cons', 'base', 'opt')):
        b = BLOCK0 + BLOCK * i
        ref = model['scenarios'][key]
        got = [s[f'{c}{b + 3}'].value for c in COLS]
        for y, (x, want) in enumerate(zip(got, ref['total'])):
            if x is None or abs(x - want) > 0.01:
                bad.append(f'{key} {YEARS[y]}: книга {x}, колода {want}')
        for cellref, want, label in ((f'B{b + 4}', ref['cum'], 'сумма'), (f'B{b + 7}', ref['ebitda2031'], 'EBITDA 2031'), (f'B{b + 5}', ref['fte'], 'ставки')):
            x = s[cellref].value
            if x is None or abs(x - want) > 0.01:
                bad.append(f'{key} {label}: книга {x}, колода {want}')
    if bad:
        sys.exit('Книга и колода расходятся:\n  ' + '\n  '.join(bad))
    base = BLOCK0 + BLOCK
    print(f'model ok: базовый сценарий 2031 — {s[f"F{base + 3}"].value:.0f} млн ₽, 2027–2031 — {s[f"B{base + 4}"].value:.0f} млн ₽')


if __name__ == '__main__':
    if '--check' in sys.argv:
        check()
    else:
        build()
