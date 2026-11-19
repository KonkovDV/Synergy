#!/usr/bin/env python3
"""Картинки и PDF презентации для «Моторики» — из самой колоды.   python3 tools/motorica-export.py [--no-pdf]

motorica/MOTUS-Lab-Motorica.pptx → motorica/MOTUS-Lab-Motorica.pdf          колода как есть (контакты — на слайде «Следующий шаг»)
                                 → motorica/slides/slide-NN.webp, -640.webp  слайды для сайта — из копии без телефона и почты
                                 → motorica/og.jpg                           1200 × 630, обложка для превью ссылок

Запускать после каждой сборки колоды (`node tools/motorica-deck.cjs`): `node tools/check-motorica.mjs` сверяет число
картинок с числом слайдов в slides.json, поэтому устаревшая картинка на сайт не попадёт.

Нужны LibreOffice (`soffice`), poppler (`pdftoppm`), Pillow и python-pptx. Шрифты колоды — Arial и Calibri: LibreOffice
подставляет метрически совместимые Liberation Sans и Carlito, переносы строк совпадают с PowerPoint.
В песочнице, где soffice не может открыть сокет, укажите OFFICE_HELPER — папку с office/soffice.py (run_soffice).
"""
import glob, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image
from pptx import Presentation

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'motorica'
DECK = OUT / 'MOTUS-Lab-Motorica.pptx'
CONTACT = re.compile(r'(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|[\w.+-]+@[\w-]+\.[a-z]{2,}', re.I)
SLIDE_W, THUMB_W = 1600, 640


def to_pdf(pptx, outdir):
    """soffice со своим одноразовым профилем: запущенный LibreOffice или сломанный профиль не мешают экспорту."""
    args = ['--headless', '--convert-to', 'pdf', '--outdir', str(outdir), str(pptx)]
    helper = os.environ.get('OFFICE_HELPER')
    if helper:
        sys.path.insert(0, helper)
        from office.soffice import run_soffice  # noqa: E402 — путь задаётся окружением
        run_soffice(args)
    else:
        profile = Path(tempfile.mkdtemp(prefix='lo-profile-'))
        try:
            subprocess.run(['soffice', f'-env:UserInstallation=file://{profile}', *args], check=True, capture_output=True, timeout=900)
        finally:
            shutil.rmtree(profile, ignore_errors=True)
    pdf = Path(outdir) / (Path(pptx).stem + '.pdf')
    if not pdf.exists():
        sys.exit(f'soffice не создал {pdf}')
    return pdf


def pages(pdf, outdir, width):
    """Каждая страница — PNG шириной `width` пикселей (слайд 13,333 дюйма: 120 dpi дают 1600 px)."""
    dpi = round(width / 13.333)
    subprocess.run(['pdftoppm', '-png', '-r', str(dpi), str(pdf), str(Path(outdir) / 'p')], check=True, capture_output=True)
    files = sorted(glob.glob(str(Path(outdir) / 'p-*.png')))
    return [Image.open(f).convert('RGB').resize((width, round(width * 9 / 16)), Image.LANCZOS) for f in files]


def without_contacts(src, dst):
    """Копия колоды для открытой страницы: строки с телефоном и почтой убираются, остальное не двигается.
    Контакты на сайте — один блок `contacts:begin … contacts:end` в motorica/index.html."""
    deck = Presentation(src)
    removed = 0
    for slide in deck.slides:
        for shape in list(slide.shapes):
            if shape.has_text_frame and CONTACT.search(shape.text_frame.text):
                shape._element.getparent().remove(shape._element)
                removed += 1
    deck.save(dst)
    return removed


def main():
    if not DECK.exists():
        sys.exit(f'нет {DECK.relative_to(ROOT)} — сначала node tools/motorica-deck.cjs')
    web = OUT / 'slides'
    web.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if '--no-pdf' not in sys.argv:
            (tmp / 'full').mkdir()
            shutil.copy(to_pdf(DECK, tmp / 'full'), OUT / 'MOTUS-Lab-Motorica.pdf')
            print('motorica/MOTUS-Lab-Motorica.pdf')

        public = tmp / 'MOTUS-Lab-Motorica-public.pptx'
        removed = without_contacts(DECK, public)
        if removed < 2:
            sys.exit(f'ожидались телефон и почта на слайде «Следующий шаг», убрано строк: {removed}')
        print('contacts removed for the site:', removed)
        (tmp / 'pub').mkdir()
        slides = pages(to_pdf(public, tmp / 'pub'), tmp / 'pub', SLIDE_W)
        for old in web.glob('slide-*.webp'):
            old.unlink()
        for i, im in enumerate(slides, 1):
            im.save(web / f'slide-{i:02d}.webp', 'WEBP', quality=84, method=6)
            im.resize((THUMB_W, round(THUMB_W * 9 / 16)), Image.LANCZOS).save(web / f'slide-{i:02d}-640.webp', 'WEBP', quality=80, method=6)
        print(f'motorica/slides: {len(slides)} slides')

        slides[0].crop((0, 30, SLIDE_W, 870)).resize((1200, 630), Image.LANCZOS).save(
            OUT / 'og.jpg', quality=85, optimize=True, progressive=True)
        print('motorica/og.jpg')


if __name__ == '__main__':
    main()
