#!/usr/bin/env python3
"""The pictures of the pitch, made from the deck itself.   python3 tools/pitch-export.py [--no-pdf]

pitch/Synergy-pitch.pptx  →  pitch/Synergy-pitch.pdf             the deck as presented (contacts on slide 12)
pitch/Synergy-pitch-appendix.pptx → pitch/Synergy-pitch-appendix.pdf and pitch/web/appx-NN.webp  the appendices П1–П8
                          →  pitch/web/slide-NN.webp, -640.webp  the slides of the site, from a copy without the
                                                                 phone and the e-mail
                          →  pitch/web/og.jpg                    1200 × 630, slide 1 without the QR codes
                          →  pitch/preview.jpg                   all slides on one sheet, for pitch/README.md

17.11.2026, audit G9: the site showed pictures of the slides that nothing rebuilt, so a corrected slide could stay old
on the site. After any change of the deck run this script; `npm run check:pitch` then compares the count of the pictures
with the slides.

Needs LibreOffice (`soffice`), poppler (`pdftoppm`), Pillow and python-pptx; the fonts of pitch/fonts are installed into
the user's font folder on the first run (Linux, fontconfig).
"""
import glob, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

ROOT = Path(__file__).resolve().parent.parent
PITCH = ROOT / 'pitch'
DECK = PITCH / 'Synergy-pitch.pptx'
APPX = PITCH / 'Synergy-pitch-appendix.pptx'
CONTACT = re.compile(r'(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|[\w.+-]+@[\w-]+\.[a-z]{2,}', re.I)
SLIDE_W, THUMB_W = 1600, 640


def fonts():
    """Unbounded and Inter for LibreOffice: without them it substitutes and the lines break elsewhere."""
    home = Path.home() / '.local/share/fonts/synergy-pitch'
    if home.exists() or sys.platform != 'linux':
        return
    home.mkdir(parents=True)
    for f in (PITCH / 'fonts').glob('*.ttf'):
        shutil.copy(f, home)
    subprocess.run(['fc-cache', '-f', str(home)], check=False, capture_output=True)


def to_pdf(pptx, outdir):
    """soffice with its own throwaway profile: a running LibreOffice or a broken profile cannot stop the export."""
    profile = Path(tempfile.mkdtemp(prefix='lo-profile-'))
    try:
        subprocess.run(['soffice', f'-env:UserInstallation=file://{profile}', '--headless', '--convert-to', 'pdf',
                        '--outdir', str(outdir), str(pptx)], check=True, capture_output=True, timeout=600)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    return Path(outdir) / (Path(pptx).stem + '.pdf')


def pages(pdf, outdir, width):
    """Every page as PNG `width` pixels wide (13.333 in slides: 120 dpi gives 1600 px)."""
    dpi = round(width / 13.333)
    subprocess.run(['pdftoppm', '-png', '-r', str(dpi), str(pdf), str(Path(outdir) / 'p')], check=True, capture_output=True)
    files = sorted(glob.glob(str(Path(outdir) / 'p-*.png')))
    return [Image.open(f).convert('RGB').resize((width, round(width * 9 / 16)), Image.LANCZOS) for f in files]


def without_contacts(src, dst):
    """A copy of the deck for the public site: the line with the phone and the e-mail goes, the lines under it move up."""
    deck = Presentation(src)
    removed = 0
    for slide in deck.slides:
        for shape in list(slide.shapes):
            if not shape.has_text_frame or not CONTACT.search(shape.text_frame.text):
                continue
            gap = shape.height + Emu(int(0.04 * 914400))
            for other in slide.shapes:   # the lines below it in the same column close the gap
                if other is not shape and other.left == shape.left and other.top > shape.top:
                    other.top -= gap
            shape._element.getparent().remove(shape._element)
            removed += 1
    deck.save(dst)
    return removed


def without_codes(src, dst):
    """A copy whose slides carry no QR codes: the picture for link previews needs only the cover."""
    deck = Presentation(src)
    for slide in deck.slides:
        for shape in list(slide.shapes):
            if shape.name.startswith('!!qr'):
                shape._element.getparent().remove(shape._element)
    deck.save(dst)


def main():
    fonts()
    web = PITCH / 'web'
    web.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if '--no-pdf' not in sys.argv:
            shutil.copy(to_pdf(DECK, tmp), PITCH / 'Synergy-pitch.pdf')
            print('pitch/Synergy-pitch.pdf')

        public = tmp / 'public.pptx'
        print('contacts removed for the site:', without_contacts(DECK, public))
        (tmp / 'pub').mkdir()
        slides = pages(to_pdf(public, tmp / 'pub'), tmp / 'pub', SLIDE_W)
        for old in web.glob('slide-*.webp'):
            old.unlink()
        for i, im in enumerate(slides, 1):
            im.save(web / f'slide-{i:02d}.webp', 'WEBP', quality=82, method=6)
            im.resize((THUMB_W, round(THUMB_W * 9 / 16)), Image.LANCZOS).save(web / f'slide-{i:02d}-640.webp', 'WEBP', quality=78, method=6)
        print(f'pitch/web: {len(slides)} slides')

        clean = tmp / 'clean.pptx'
        without_codes(public, clean)
        (tmp / 'og').mkdir()
        cover = pages(to_pdf(clean, tmp / 'og'), tmp / 'og', SLIDE_W)[0]
        cover.crop((0, 30, SLIDE_W, 870)).resize((1200, 630), Image.LANCZOS).save(web / 'og.jpg', quality=85, optimize=True, progressive=True)
        print('pitch/web/og.jpg')

        if APPX.exists():                     # the appendices: PDF as it is, pictures for the site
            (tmp / 'ap').mkdir()
            pdf = to_pdf(APPX, tmp / 'ap')
            if '--no-pdf' not in sys.argv:
                shutil.copy(pdf, PITCH / 'Synergy-pitch-appendix.pdf')
            for old in web.glob('appx-*.webp'):
                old.unlink()
            appx = pages(pdf, tmp / 'ap', SLIDE_W)
            for i, im in enumerate(appx, 1):
                im.save(web / f'appx-{i:02d}.webp', 'WEBP', quality=82, method=6)
                im.resize((THUMB_W, round(THUMB_W * 9 / 16)), Image.LANCZOS).save(web / f'appx-{i:02d}-640.webp', 'WEBP', quality=78, method=6)
            print(f'pitch/Synergy-pitch-appendix.pdf, pitch/web: {len(appx)} appendix slides')

        tw, th, g = 600, 338, 14
        rows = (len(slides) + 2) // 3
        sheet = Image.new('RGB', (tw * 3 + g * 4, th * rows + g * (rows + 1)), (236, 241, 245))
        for k, im in enumerate(slides):
            r, c = divmod(k, 3)
            sheet.paste(im.resize((tw, th), Image.LANCZOS), (g + c * (tw + g), g + r * (th + g)))
        sheet.save(PITCH / 'preview.jpg', quality=84, optimize=True, progressive=True)
        print('pitch/preview.jpg')


if __name__ == '__main__':
    main()
