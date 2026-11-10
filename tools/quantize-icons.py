#!/usr/bin/env python3
"""Shrinks the raster icons after tools/rasterize-icons.mjs (5.12): libimagequant palette with dithering — the
gradients stay smooth (a plain 256-colour octree showed bands), the files get 3–4× smaller (APK and PWA).
Dev-only and optional: pip install imagequant pillow; then python3 tools/quantize-icons.py"""
import glob
import os

import imagequant
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..')
for f in glob.glob(os.path.join(root, 'android/res/mipmap-*/ic_launcher.png')) + glob.glob(os.path.join(root, 'public/icons/*.png')):
    before = os.path.getsize(f)
    q = imagequant.quantize_pil_image(Image.open(f).convert('RGBA'), dithering_level=1.0, max_colors=256, min_quality=80, max_quality=98)
    q.save(f, optimize=True)
    print(f'{os.path.relpath(f, root)}: {before} → {os.path.getsize(f)} B')
