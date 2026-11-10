"""Documents of the upload (6.3.3): the organizers ask for the technical documentation and the report on the use of AI in
doc, docx or txt, readable and copyable (message of 10.11). Built by code from the documents of the repository, like the
deck: the source of truth stays in git (Markdown), the .docx files are rebuilt from it.

  submission/TECH_DOCS.md + docs/ARCHITECTURE.md (the principles) + docs/INTEGRATION.md + docs/TZ_COMPLIANCE.md
  + README.md («Границы проекта»)               → Synergy-<version>-tech-docs.docx
  submission/AI_REPORT.md                        → Synergy-<version>-ai-report.docx

Usage: python3 tools/build-docs.py [OUT_DIR]   (needs pandoc and python-docx; default: submission/)
6.3.4: the .docx files of the build are kept in submission/ — the team uploads them to the platform, and the jury finds
them in the repository beside their Markdown sources. Latin names: a file name outside ASCII is quoted by git and
mangled by some upload forms. The files of an earlier version are removed (the gate refuses them).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text("utf-8"))["version"]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "submission"
INK, ACCENT, HEAD_FILL = RGBColor(0x0B, 0x1D, 0x2B), RGBColor(0x0E, 0x7A, 0x55), "E8F7F0"
FONT = "Arial"


def read(rel: str) -> str:
    return (ROOT / rel).read_text("utf-8")


def section(text: str, start: str, stop: str | None = None) -> str:
    """The part of a Markdown text from the heading `start` up to the heading `stop` (or the end)."""
    i = text.index(start)
    j = text.index(stop, i + len(start)) if stop else len(text)
    return text[i:j]


def shift(text: str, by: int = 1) -> str:
    """Headings one level deeper: a document of the repository becomes a chapter of this one."""
    return re.sub(r"^(#{1,5}) ", lambda m: "#" * (len(m.group(1)) + by) + " ", text, flags=re.M)


def clean(text: str) -> str:
    """What only a web page shows: HTML comments, centred pictures and badges."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"^<p align=\"center\">.*?</p>\s*$", "", text, flags=re.M | re.S)
    return text


def tech_markdown() -> str:
    arch = read("docs/ARCHITECTURE.md")
    parts = [
        read("submission/TECH_DOCS.md"),
        "## 5. Архитектура\n\nИз `docs/ARCHITECTURE.md`: поток сигнала, слои и правила зависимостей, принципы, хранение. Журнал модулей по версиям — в самом файле.\n\n"
        + shift(section(arch, "## Поток сигнала", "## Модули по версиям"), 1),
        "## 6. Интеграция с приложением протеза\n\nИз `docs/INTEGRATION.md`: контракт кадра, поток СПППР по ТЗ, встраивание, транспорты, мост, калибровка.\n\n"
        + shift(section(read("docs/INTEGRATION.md"), "## Контракт кадра", "## Электробезопасность"), 1),
        "## 7. Соответствие ТЗ\n\n" + shift(re.sub(r"^# .*\n", "", read("docs/TZ_COMPLIANCE.md"), count=1), 1),
        # 6.3.3: the short «Границы проекта» of the README; the full register stays in LIMITS.md of the repository.
        "## 8. Границы проекта\n\n" + re.search(r"^## Границы проекта\n\n(.*?)(?=^## )", read("README.md"), re.S | re.M)[1],
    ]
    return clean("\n\n".join(parts))


def pandoc(markdown: str, out: Path, title: str, toc: bool) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "doc.md"
        # The title comes from the metadata; the first heading of the source is the title, so it is dropped here.
        src.write_text(re.sub(r"^# .*\n", "", markdown, count=1), "utf-8")
        args = ["pandoc", "-f", "gfm", "-t", "docx", "-o", str(out), "--metadata", f"title={title}",
                "--metadata", "lang=ru-RU", str(src)]
        if toc:
            args[1:1] = ["--toc", "--toc-depth=2"]
        subprocess.run(args, check=True)


def borders(table) -> None:
    pr = table._tbl.tblPr
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single"); e.set(qn("w:sz"), "4"); e.set(qn("w:space"), "0"); e.set(qn("w:color"), "B8C4CC")
        b.append(e)
    pr.append(b)


def shade(cell, fill: str) -> None:
    tc = cell._tc.get_or_add_tcPr()
    s = OxmlElement("w:shd")
    s.set(qn("w:val"), "clear"); s.set(qn("w:color"), "auto"); s.set(qn("w:fill"), fill)
    tc.append(s)


def polish(path: Path, subtitle: str) -> None:
    """Fonts, headings in the brand's green, tables with borders and a shaded header row that repeats on every page."""
    doc = Document(str(path))
    for style in doc.styles:
        if getattr(style, "font", None) is None:
            continue
        style.font.name = FONT
        rpr = style.element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:  # an lxml element without children is falsy: `or` would add a second one
            fonts = OxmlElement("w:rFonts")
            rpr.append(fonts)
        for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            fonts.set(qn(attr), FONT)
    doc.styles["Normal"].font.size = Pt(10.5)
    by_name = {s.name.lower(): s for s in doc.styles}  # pandoc names them «Heading 1»; python-docx looks up «heading 1»
    for name, size in (("Title", 22), ("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11.5), ("Heading 4", 10.5)):
        st = by_name.get(name.lower())
        if st is not None:
            st.font.size = Pt(size); st.font.bold = True
            st.font.color.rgb = INK if name == "Title" else ACCENT
    for sec in doc.sections:
        sec.left_margin = sec.right_margin = Cm(2)
        sec.top_margin = sec.bottom_margin = Cm(1.8)
    for table in doc.tables:
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        borders(table)
        width = table._tbl.tblPr.find(qn("w:tblW"))  # the whole width of the text, not the width of the words
        if width is None:
            width = OxmlElement("w:tblW"); table._tbl.tblPr.append(width)
        width.set(qn("w:type"), "pct"); width.set(qn("w:w"), "5000")
        for r, row in enumerate(table.rows):
            if r == 0:
                trpr = row._tr.get_or_add_trPr()
                h = OxmlElement("w:tblHeader"); h.set(qn("w:val"), "true"); trpr.append(h)
            for cell in row.cells:
                if r == 0:
                    shade(cell, HEAD_FILL)
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(2)
                    for run in p.runs:
                        run.font.size = Pt(8.5)
                        if r == 0:
                            run.font.bold = True
    # A line under the title: what this is and which build.
    title = next((p for p in doc.paragraphs if p.style.name == "Title"), None)
    if title is not None:
        para = doc.add_paragraph()
        para.add_run(subtitle).italic = True
        title._p.addnext(para._p)
    doc.save(str(path))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("Synergy-*-tech-docs.docx"):
        old.unlink()
    for old in OUT.glob("Synergy-*-ai-report.docx"):
        old.unlink()
    built = []
    tech = OUT / f"Synergy-{VERSION}-tech-docs.docx"
    # No field TOC: Word shows it empty until the fields are updated; the source carries a line of contents instead.
    pandoc(tech_markdown(), tech, f"«Синергия» {VERSION} — техническая документация", toc=False)
    polish(tech, f"Игра-тренажёр управления бионическим протезом по ЭМГ. Сборка {VERSION}. Собрано из репозитория: tools/build-docs.py")
    built.append(tech)
    ai = OUT / f"Synergy-{VERSION}-ai-report.docx"
    pandoc(clean(read("submission/AI_REPORT.md")), ai, f"«Синергия» {VERSION} — отчёт об использовании ИИ", toc=False)
    polish(ai, f"Перечень функций, план и отчёт о верификации. Сборка {VERSION}. Собрано из submission/AI_REPORT.md")
    built.append(ai)
    for f in built:
        print(f"{f} ({f.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
