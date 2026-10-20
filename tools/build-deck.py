"""Pitch deck of «Синергия» from the repository (5.16, the practice of the team's repositories: the deck is built by
code from the source of truth). Text and voice — the slide table of docs/PITCH.md; numbers — from the build
(tests, APK, the one-file HTML, the pictures); pictures — public/art and docs/screenshots.

Usage: python tools/build-deck.py [OUT.pptx]   (needs python-pptx and Pillow; default: ../Synergy-<version>-pitch.pptx)
The deck stays outside git: it is rebuilt from what is in git.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text("utf-8"))["version"]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / f"Synergy-{VERSION}-pitch.pptx"

NAVY, INK, MUTED, BG, CARD, MINT, TEAL, CORAL, WHITE = "0B1D2B", "05101A", "4F5B66", "F3F5F7", "FFFFFF", "16E182", "1FD0A6", "FF7A45", "FFFFFF"
HEAD, BODY = "Arial Black", "Calibri"
W, H = 13.333, 7.5


def rgb(h):
    return RGBColor.from_string(h)


def slides_from_pitch():
    """Rows of the «Слайды» table: number, title, visual, voice, proof."""
    rows = []
    for line in (ROOT / "docs" / "PITCH.md").read_text("utf-8").splitlines():
        m = re.match(r"^\| (\d+) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$", line)
        if m:
            clean = lambda s: re.sub(r"\*\*|`", "", s).strip()
            rows.append({"n": int(m[1]), "title": clean(m[2]), "visual": clean(m[3]), "voice": clean(m[4]), "proof": clean(m[5])})
    assert len(rows) == 10, f"docs/PITCH.md: {len(rows)} slides, expected 10"
    return rows


def numbers():
    # 5.17: docs/evidence.json is the one source of the numbers (tools/evidence.mjs); measured again only without it.
    ev_path = ROOT / "docs" / "evidence.json"
    if ev_path.exists():
        ev = json.loads(ev_path.read_text("utf-8"))
        if ev.get("version") == VERSION and ev.get("tests") and ev.get("apk"):
            return {"tests": ev["tests"]["total"], "apk_kb": ev["apk"]["kb"], "html_mb": round(ev["html"]["bytes"] / 1024 / 1024, 1) if ev.get("html") else None,
                    "art": ev["art"]["pictures"], "art_mb": round(ev["art"]["bytes"] / 1024 / 1024, 2),
                    "a11y": ev.get("a11y"), "layout": ev.get("layout")}
    tests = None
    try:
        files = [str(p) for p in sorted((ROOT / "tests").glob("*.test.mjs"))]
        out = subprocess.run(["node", "--test", "--test-reporter=tap", *files], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout
        tests = int(re.search(r"^# tests (\d+)", out, re.M)[1])
    except Exception:
        pass
    apk = ROOT / "release" / f"Synergy-{VERSION}.apk"
    html = ROOT / "release" / "synergy-standalone.html"
    art = json.loads((ROOT / "public" / "art" / "manifest.json").read_text("utf-8"))
    return {
        "tests": tests, "apk_kb": round(apk.stat().st_size / 1024) if apk.exists() else None,
        "html_mb": round(html.stat().st_size / 1024 / 1024, 1) if html.exists() else None,
        "art": len(art["items"]), "art_mb": round(art["total_bytes"] / 1024 / 1024, 2),
    }


def png(path: Path, max_side=1400) -> io.BytesIO:
    im = Image.open(path)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    if max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    buf.seek(0)
    return buf


def art(name):
    return png(ROOT / "public" / "art" / f"{name}.webp")


def shot(name):
    return png(ROOT / "docs" / "screenshots" / f"{name}.jpg", 1600)


class Deck:
    def __init__(self):
        self.p = Presentation()
        self.p.slide_width, self.p.slide_height = Inches(W), Inches(H)
        self.blank = self.p.slide_layouts[6]

    def slide(self, bg, notes=""):
        s = self.p.slides.add_slide(self.blank)
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = rgb(bg)
        if notes:
            s.notes_slide.notes_text_frame.text = notes
        return s

    @staticmethod
    def box(s, x, y, w, h, fill, radius=0.12, line=None):
        shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        shp.adjustments[0] = radius
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
        if line:
            shp.line.color.rgb = rgb(line)
            shp.line.width = Pt(1.25)
        else:
            shp.line.fill.background()
        shp.shadow.inherit = False
        return shp

    @staticmethod
    def text(s, x, y, w, h, runs, size=18, color=INK, font=BODY, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.1):
        tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = anchor
        paras = runs if isinstance(runs, list) else [runs]
        for i, para in enumerate(paras):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = align
            p.line_spacing = spacing
            p.space_after = Pt(6)
            for chunk in (para if isinstance(para, tuple) else (para,)):
                if isinstance(chunk, dict):
                    t, o = chunk["t"], chunk
                else:
                    t, o = chunk, {}
                r = p.add_run()
                r.text = t
                r.font.size = Pt(o.get("size", size))
                r.font.bold = o.get("bold", bold)
                r.font.name = o.get("font", font)
                r.font.color.rgb = rgb(o.get("color", color))
        return tb

    @staticmethod
    def picture(s, data, x, y, w=None, h=None):
        return s.shapes.add_picture(data, Inches(x), Inches(y), Inches(w) if w else None, Inches(h) if h else None)

    def phone(self, s, name, x, y, h, label=None, dark=False):
        """A screenshot in a rounded frame (the motif of the deck): 390 × 844 phones."""
        w = h * 390 / 844
        self.box(s, x - 0.06, y - 0.06, w + 0.12, h + 0.12, "0B1D2B" if not dark else "1B2A37", radius=0.09)
        pic = self.picture(s, shot(name), x, y, w, h)
        if label:
            self.text(s, x - 0.2, y + h + 0.12, w + 0.4, 0.4, label, size=13, color=MUTED if not dark else "C9D6E0", bold=True, align=PP_ALIGN.CENTER)
        return pic

    def title(self, s, t, color=INK, sub=None, subcolor=MUTED, y=0.45):
        self.text(s, 0.6, y, W - 1.2, 0.9, t, size=32, color=color, font=HEAD)
        if sub:
            self.text(s, 0.6, y + 0.95, W - 1.2, 0.5, sub, size=16, color=subcolor)

    def proof(self, s, t, color=MUTED):
        self.text(s, 0.6, H - 0.5, W - 1.2, 0.3, f"Проверить: {t}", size=11, color=color)


def build():
    rows = slides_from_pitch()
    n = numbers()
    d = Deck()
    v = {r["n"]: r for r in rows}

    # 1 — title (dark): the Firebird and Мио.
    s = d.slide(NAVY, v[1]["voice"])
    d.picture(s, art("pet-firebird-happy"), 7.2, 0.7, h=6.0)
    d.picture(s, art("mio-hello"), 6.1, 4.5, h=2.2)
    d.text(s, 0.7, 1.7, 6.2, 1.2, "Синергия", size=60, color=WHITE, font=HEAD)
    d.text(s, 0.7, 3.0, 5.8, 1.4, "Игра-тренажёр управления бионическим протезом кисти: дома, до протеза и между визитами к специалисту", size=20, color="C9D6E0")
    d.text(s, 0.7, 4.7, 5.5, 0.5, "Команда SYNERGY · геймджем «Моторика: Код движения»", size=14, color=MINT, bold=True)
    d.text(s, 0.7, 6.6, 6, 0.3, f"Версия {VERSION} · офлайн: APK, PWA, один HTML", size=12, color="8FA2B2")

    # 2 — the problem: a big number.
    s = d.slide(BG, v[2]["voice"])
    d.title(s, "Протез есть — управлять трудно")
    d.box(s, 0.6, 1.7, 5.6, 4.6, CARD)
    d.text(s, 0.95, 2.0, 5.0, 1.6, "44 %", size=96, color=CORAL, font=HEAD)
    d.text(s, 0.95, 3.75, 5.0, 1.2, "отказались от протеза верхней конечности в небольшой австрийской выборке (25 ответивших)", size=18)
    d.text(s, 0.95, 5.15, 5.0, 0.9, "Salminger 2022 — малая выборка, не обобщаем", size=13, color=MUTED)
    d.box(s, 6.6, 1.7, 6.1, 2.15, CARD)
    d.text(s, 6.95, 1.95, 2.4, 1.0, "≈ 23 %", size=44, color=TEAL, font=HEAD)
    d.text(s, 9.3, 2.05, 3.2, 1.6, "взрослых и ≈ 35 % детей отказываются от электрических протезов (обзор Biddiss & Chau 2007)", size=15)
    d.box(s, 6.6, 4.15, 6.1, 2.15, CARD)
    d.picture(s, art("ico-calibration"), 6.85, 4.4, h=1.6)
    d.text(s, 8.7, 4.45, 3.8, 1.7, "Первые недели решают, а занятия со специалистом редки. Нужна тренировка, которую можно делать дома — без перегрузки и без чувства вины.", size=15)
    d.proof(s, v[2]["proof"])

    # 3 — the same control law: signal → hand → object.
    s = d.slide(BG, v[3]["voice"])
    d.title(s, "Тренируем то же, что делает протез", sub="Перенос требует сходства задачи (обзор Garske 2021) — у нас тот же закон управления")
    steps = [("ico-sensor", "Сигнал A и B", "две мышцы — два канала; сила — высота сигнала"), ("gesture-fist", "Кисть", "скорость ∝ сигналу, хват держится сам, B ослабляет"),
             ("obj-egg", "Предмет", "не раздавить яйцо, удержать банку, сменить хват A+B")]
    for i, (pic, head, body) in enumerate(steps):
        x = 0.6 + i * 4.25
        d.box(s, x, 2.2, 3.85, 4.1, CARD)
        d.picture(s, art(pic), x + 1.0, 2.45, h=1.85)
        d.text(s, x + 0.3, 4.45, 3.25, 0.5, head, size=22, font=HEAD, align=PP_ALIGN.CENTER)
        d.text(s, x + 0.3, 5.05, 3.25, 1.2, body, size=15, color=MUTED, align=PP_ALIGN.CENTER)
        if i < 2:
            d.text(s, x + 3.86, 3.6, 0.4, 0.6, "→", size=30, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
    d.proof(s, v[3]["proof"])

    # 4 — four games.
    s = d.slide(BG, v[4]["voice"])
    d.title(s, "4 игры × 8 уровней × 3 схемы", sub="Две ЭМГ-кнопки (пороговый и пропорциональный режим) и 7 жестов — во всех играх")
    for i, (name, label) in enumerate([("v516-play-grip", "Мастерская — сила хвата"), ("v516-play-flight", "Полёт — точная сила"), ("v516-play-rhythm", "Ритм — вовремя"), ("v516-play-safe", "Сейф — серия жестов")]):
        d.phone(s, name, 0.95 + i * 3.1, 1.95, 4.55, label)
    d.proof(s, v[4]["proof"])

    # 5 — the demo (dark).
    s = d.slide(NAVY, v[5]["voice"])
    d.title(s, "Демо — 2 минуты на телефоне", color=WHITE, sub="Онбординг → гнездо Жар-птицы → план дня → итоги с наградами", subcolor="C9D6E0")
    hero = ROOT / "docs" / "screenshots" / "v516-hero.jpg"
    with Image.open(hero) as im:
        hh = 4.75; hw = hh * im.width / im.height  # by height: the whole strip between the subtitle and the footnote
    d.picture(s, png(hero, 2000), (W - hw) / 2, 1.95, h=hh)
    d.text(s, 0.6, H - 0.55, W - 1.2, 0.3, "Без датчиков: встроенный эмулятор ЭМГ. Для показа — «Настройки → Данные → Демо-профиль»", size=12, color="8FA2B2")

    # 6 — come back: plan, coach, the Firebird.
    s = d.slide(BG, v[6]["voice"])
    d.title(s, "10 минут в день — и хочется вернуться")
    d.phone(s, "v5-02-home", 0.8, 1.45, 4.85, "План дня")
    d.phone(s, "v5-16-nest", 3.75, 1.45, 4.85, "Гнездо Жар-птицы")
    items = [("ico-plan", "План дня с интервальным повторением; сложность держит успех около 75 %, подсказки затухают по мере роста"),
             ("ico-streak", "Серию не ломает ни отдых, ни день боли; «С возвращением» — без упрёка"),
             ("pet-young-star", "Жар-птица растёт от дней с тренировкой, носит подарки за достижения и никогда не грустит"),
             ("mio-joy", "Тренер Мио — совет текстом; музыка в «Ритме»")]
    for i, (pic, t) in enumerate(items):
        y = 1.6 + i * 1.32
        d.box(s, 6.85, y, 5.85, 1.15, CARD)
        d.picture(s, art(pic), 7.0, y + 0.1, h=0.95)
        d.text(s, 8.1, y + 0.17, 4.45, 0.9, t, size=14, anchor=MSO_ANCHOR.MIDDLE)
    d.proof(s, v[6]["proof"])

    # 7 — growth each week.
    s = d.slide(BG, v[7]["voice"])
    d.title(s, "Рост виден каждую неделю")
    d.phone(s, "v5-09-check-results", 0.8, 1.45, 4.85, "Проверка навыка")
    d.phone(s, "v516-results", 3.75, 1.45, 4.85, "Итоги упражнения")
    d.box(s, 6.85, 1.6, 5.85, 4.95, CARD)
    d.picture(s, art("game-check"), 7.1, 1.85, h=1.3)
    d.text(s, 8.6, 1.95, 3.9, 1.2, "Раз в неделю — проверка с фиксированным протоколом", size=18, font=HEAD)
    d.text(s, 7.15, 3.4, 5.3, 2.9, [
        "Доля выполненных, время выбора, точность.",
        "Игровая пропускная способность — по мотивам теста Фиттса.",
        "Отчёт для специалиста — печать, PDF, CSV за 7, 30 или 90 дней.",
        ({"t": "Это игровые метрики, а не клинический тест.", "bold": True},),
    ], size=15)
    d.proof(s, v[7]["proof"])

    # 8 — safe and for everyone.
    s = d.slide(BG, v[8]["voice"])
    d.title(s, "Безопасно и для всех")
    d.phone(s, "v516-onboarding-safety", 0.8, 1.45, 4.85, "Правила безопасности")
    cards = [("ico-checkin", "Вопрос о боли и усталости", "с датчиками — и о коже: обычный план, короткий или отдых"),
             ("ico-access", "Для всех", "без касания, озвучивание, текст до 200 %, контраст, любая ориентация"),
             ("ico-lock", "Только на телефоне", "без аккаунта, сервера и аналитики; не медицинское изделие"),
             ("ico-done", "Автоаудит доступности", "0 нарушений axe на 28 светлых и 10 тёмных состояниях")]
    for i, (pic, head, body) in enumerate(cards):
        x, y = 3.85 + (i % 2) * 4.45, 1.6 + (i // 2) * 2.5
        d.box(s, x, y, 4.2, 2.3, CARD)
        d.picture(s, art(pic), x + 0.2, y + 0.2, h=0.95)
        d.text(s, x + 1.35, y + 0.25, 2.7, 0.9, head, size=16, font=HEAD, anchor=MSO_ANCHOR.MIDDLE)
        d.text(s, x + 0.25, y + 1.25, 3.75, 1.0, body, size=14, color=MUTED)
    d.proof(s, v[8]["proof"])

    # 9 — ready for the emulator: one frame format, numbers of this build.
    s = d.slide(BG, v[9]["voice"])
    d.title(s, "Готово к вашему эмулятору", sub="Один формат кадра для эмулятора, датчиков и протеза; набор 7 жестов — в одном файле")
    d.box(s, 0.6, 2.1, 5.4, 2.0, NAVY)
    d.text(s, 0.95, 2.4, 4.8, 1.5, ['{ "a": 0.42, "b": 0.05,', '  "gesture": "fist" }'], size=20, color=MINT, font="Consolas")
    d.text(s, 0.6, 4.35, 5.4, 1.9, [
        "WebSocket, postMessage, Bluetooth, Android pushFrame().",
        "Встраивание: хосты Web, Kotlin, Swift, Flutter, React Native, Unity.",
        "Замену жестов проверяет учебный прогон.",
    ], size=15)
    stats = [(f"{n['tests']}" if n["tests"] else "—", "тестов, включая модель новичка"), (f"{n['apk_kb']} КБ" if n["apk_kb"] else "—", "APK со всеми иллюстрациями"),
             (f"{n['art']}", f"иллюстраций, {str(n['art_mb']).replace('.', ',')} МБ"), ("0", "нарушений axe")]
    for i, (big, small) in enumerate(stats):
        x, y = 6.5 + (i % 2) * 3.15, 2.1 + (i // 2) * 2.15
        d.box(s, x, y, 2.95, 1.95, CARD)
        d.text(s, x + 0.25, y + 0.25, 2.5, 0.9, big, size=34, color=TEAL, font=HEAD)
        d.text(s, x + 0.25, y + 1.15, 2.5, 0.7, small, size=13, color=MUTED)
    d.text(s, 6.5, 6.45, 6.1, 0.4, "Это симуляция, не пользователи протеза: людей проверит плейтест", size=12, color=MUTED)
    d.proof(s, v[9]["proof"])

    # 10 — next: a pilot (dark).
    s = d.slide(NAVY, v[10]["voice"])
    d.picture(s, art("pet-firebird-star"), 8.6, 1.0, h=5.6)
    d.text(s, 0.7, 0.7, 8, 0.9, "Дальше: пилот с реабилитологами «Моторики»", size=30, color=WHITE, font=HEAD)
    steps = [("1", "Эмулятор и набор жестов 28.10", "одна функция адаптера, один файл жестов"), ("2", "Плейтест с пользователями", "протокол готов, результатов пока нет — не выдумываем"),
             ("3", "Пилот: SHAP, ACMC, время ношения, SUS", "с контрольной группой «только тестирование» (урок Maas 2024)")]
    for i, (num, head, body) in enumerate(steps):
        y = 2.0 + i * 1.45
        d.box(s, 0.7, y, 7.4, 1.25, "142A3B")
        d.text(s, 0.95, y + 0.22, 0.6, 0.8, num, size=30, color=MINT, font=HEAD)
        d.text(s, 1.7, y + 0.18, 6.2, 0.5, head, size=18, color=WHITE, bold=True)
        d.text(s, 1.7, y + 0.66, 6.2, 0.5, body, size=14, color="C9D6E0")
    d.text(s, 0.7, 6.65, 7.5, 0.4, "Нужны: эмулятор организатора и пользователи для плейтеста", size=14, color=MINT, bold=True)

    d.p.core_properties.title = f"Синергия {VERSION} — питч"
    d.p.core_properties.author = "Команда SYNERGY"
    d.p.save(OUT)
    print(f"{OUT} ({OUT.stat().st_size // 1024} KB), {len(d.p.slides)} slides, numbers: {n}")


if __name__ == "__main__":
    build()
