"""Imports the team's illustrations (5.16) into the product: cut-outs, light WebP files, launcher icons, the splash.

Source: the 144 PNG of the graphics package (docs/DESIGN.md §6 — one prompt, one file name; generated with AI, see
docs/AI_USAGE.md). The pictures are drawn on white. A picture that stands on a card gets an alpha matte: a neural
subject mask (rembg, `isnet-general-use`) keeps white parts of the subject opaque (Мио, the egg, the white shell of
the hand), and outside the mask the known white background is divided out (colour-to-alpha), so soft shadows,
glows and sparkles stay as semi-transparent colour and the picture reads on the dark theme too. Scenes — the
everyday tasks, covers, backgrounds — keep their own light background: white paper or a glass bottle on a cut-out
would vanish.

Outputs (committed; the regular build needs no image tools):
  public/art/<name>.webp          the pictures, sized for their place (×2–3 of the CSS size)
  public/art/manifest.json        name → size, bytes, SHA-256 of the file and of its source
  src/ui/art-manifest.js          the same for the app (generated)
  public/icons/icon-*.png         PWA icons (any, maskable, Apple touch)
  android/res/mipmap-*/           legacy and adaptive launcher icons; drawable-xxhdpi/splash_bird.png

Usage: python tools/import-art.py [--src DIR] [--only PREFIX] [--sheets DIR]
Needs Python 3.10+, Pillow, NumPy, SciPy, rembg (CPU); masks are cached in tools/.cache/art-masks.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "art"
CACHE = ROOT / "tools" / ".cache" / "art-masks"

# name prefix → (output size, mode, WebP quality). «cut» — alpha matte; «tile» — opaque, own background.
ROLES = [
    ("pet-", 512, "cut", 80),
    ("mio-", 320, "cut", 82),
    ("game-", 256, "cut", 82),
    ("nav-", 96, "cut", 86),
    ("ico-", 160, "cut", 84),
    ("ach-", 192, "cut", 84),
    ("gift-", 192, "cut", 84),
    ("obj-", 192, "cut", 84),
    ("gesture-", 192, "cut", 84),
    ("skin-", 192, "cut", 84),
    ("empty-", 384, "cut", 82),
    ("day-", 256, "tile", 80),
    ("cover-", (900, 675), "tile", 78),
    ("bg-nest-room", (720, 1080), "tile", 74),
    ("bg-hero", (1200, 450), "tile", 76),
]
SKIP = ("ref-", "splash", "app-icon-")


def role(name: str):
    for prefix, size, mode, q in ROLES:
        if name.startswith(prefix):
            return size, mode, q
    return None


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_session = None


def subject_mask(img: Image.Image, key: str) -> np.ndarray:
    """Soft subject mask 0..1 (cached by the SHA-256 of the source)."""
    global _session
    CACHE.mkdir(parents=True, exist_ok=True)
    hit = CACHE / f"{key}.png"
    if hit.exists():
        return np.asarray(Image.open(hit), dtype=np.float32) / 255.0
    from rembg import new_session, remove  # only when a mask is not cached

    _session = _session or new_session("isnet-general-use")
    mask = remove(img, session=_session, only_mask=True)
    mask.save(hit)
    return np.asarray(mask, dtype=np.float32) / 255.0


NOISE = 6.0  # grey levels: compression noise of an off-white background is not a shadow


def white_point(c: np.ndarray) -> float:
    """The background's white, from the frame's border (a few sources are 250–254, not 255)."""
    border = np.concatenate([c[:4].reshape(-1, 3), c[-4:].reshape(-1, 3), c[:, :4].reshape(-1, 3), c[:, -4:].reshape(-1, 3)])
    return float(np.clip(np.median(border.min(axis=1)), 235, 255))


def fill_shaded_holes(core: np.ndarray, d: np.ndarray, min_px: int = 150, min_shade: float = 4.0) -> np.ndarray:
    """The mask misses white surfaces inside an outline (a speech bubble, a clipboard, a speaker, a stopwatch face).
    An enclosed region that carries shading is such a surface; a flat one (mean < 4 grey levels — the inside of the
    empty star, the handle of the lantern) is the background seen through and stays transparent."""
    from scipy import ndimage  # here, not at the top: tools/import-duo.py reuses this file without SciPy
    lab, k = ndimage.label(~core)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    out = core.copy()
    for i in range(1, k + 1):
        if i in edge:
            continue
        r = lab == i
        if r.sum() >= min_px and d[r].mean() > min_shade:
            out |= r
    return out


def matte(rgb: np.ndarray, mask: np.ndarray) -> Image.Image:
    """Alpha matte on a known white background: max(subject core, colour-to-alpha), then F = (C − (1 − a)·W) / a."""
    from scipy import ndimage  # here, not at the top: tools/import-duo.py reuses this file without SciPy
    c = rgb.astype(np.float32)
    w = white_point(c)
    # The least alpha that explains the pixel over the background, with a dead zone for the noise.
    a_white = np.clip((w - c.min(axis=2) - NOISE) / (w - NOISE), 0, 1)
    core = fill_shaded_holes(mask > 0.5, w - c.min(axis=2))
    core = ndimage.binary_erosion(core, iterations=2)  # the mask's edge is soft and may overshoot
    a = np.clip(np.maximum(a_white, ndimage.gaussian_filter(core.astype(np.float32), 0.8)), 0, 1)
    fg = np.clip((c - (1 - a[..., None]) * w) / np.where(a > 1e-4, a, 1)[..., None], 0, 255)
    return Image.fromarray(np.dstack([fg, a * 255]).round().astype(np.uint8), "RGBA")


def resize(img: Image.Image, size) -> Image.Image:
    w, h = (size, size) if isinstance(size, int) else size
    if img.mode == "RGBA":  # premultiplied, or transparent pixels bleed a dark fringe into the edge
        return img.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    return img.resize((w, h), Image.LANCZOS)


def cover(img: Image.Image, size) -> Image.Image:
    """Scale to fill `size` and crop the centre (scenes keep their aspect)."""
    w, h = size
    k = max(w / img.width, h / img.height)
    big = img.resize((math.ceil(img.width * k), math.ceil(img.height * k)), Image.LANCZOS)
    x, y = (big.width - w) // 2, (big.height - h) // 2
    return big.crop((x, y, x + w, y + h))


def webp(img: Image.Image, q: int) -> bytes:
    buf = io.BytesIO()
    extra = {"alpha_quality": 90} if img.mode == "RGBA" else {}
    img.save(buf, "WEBP", quality=q, method=6, **extra)
    return buf.getvalue()


def png(img: Image.Image) -> bytes:
    """PNG for the launcher and PWA icons: a libimagequant palette with dithering where it is installed (gradients
    stay smooth, files 3–4× smaller — tools/quantize-icons.py of 5.12), else a plain optimised PNG."""
    try:
        import imagequant
        img = imagequant.quantize_pil_image(img.convert("RGBA"), dithering_level=1.0, max_colors=256, min_quality=80, max_quality=98)
    except (ImportError, RuntimeError):  # not installed, or 256 colours would not reach the quality floor
        pass
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


# ---------- what the Firebird wears: item boxes per picture ----------

# The eyes of the bird in each 512 px picture (left, right) — the anchor of the head: its centre, size (eye distance e)
# and tilt. Read from 2× crops with an 8 px grid (5.16); the open-eyed ones match a dark-blob detector within 3 px.
EYES = {
    "pet-chick-waiting": ((211, 196), (286, 197)), "pet-chick-happy": ((211.5, 153.5), (279, 163.5)), "pet-chick-rest": ((185, 240), (257.5, 215)),
    "pet-fledgling-waiting": ((197, 222), (287, 221)), "pet-fledgling-happy": ((194, 185), (273, 197.5)), "pet-fledgling-rest": ((156.5, 290), (229, 260)),
    "pet-young-waiting": ((166, 215), (240, 217)), "pet-young-happy": ((167.5, 189), (245, 203)), "pet-young-rest": ((137.5, 279), (225, 256.5)),
    "pet-young-wave": ((197, 211), (274, 222)), "pet-young-read": ((161, 220), (233, 227)), "pet-young-star": ((214, 263), (276, 272)),
    "pet-firebird-waiting": ((170, 172), (232, 178)), "pet-firebird-happy": ((174, 174), (245, 188)), "pet-firebird-rest": ((148, 294), (224, 256.5)),
    "pet-firebird-wave": ((180, 173), (243, 179)), "pet-firebird-read": ((182, 206), (247, 207)), "pet-firebird-star": ((191, 232), (231, 238)),
}
# A pose that covers a slot: the star is held above the head, the book covers the chest. The app shows the mood
# picture instead when something is worn there.
BLOCKED = {"star": {"head"}, "read": {"chest"}}
# Where an item sits: anchor (head top, brow, chest), offsets along the head's «up» and «right» and the width, in eye
# distances; rot — degrees on top of the head's tilt.
WEAR = {
    "bow": ("head", -0.05, 0.80, 1.05, 18), "wreath": ("head", 0.02, 0.0, 2.3, 0), "star": ("brow", 0.0, 0.0, 0.62, 0),
    "kokoshnik": ("head", 0.40, 0.0, 2.35, 0), "amulet": ("chest", 0.14, 0.0, 1.2, 0), "beads": ("chest", 0.45, 0.0, 1.8, 0),
}
SLOT = {"bow": "head", "wreath": "head", "star": "head", "kokoshnik": "head", "amulet": "chest", "beads": "chest"}
# Things of the nest, by the ground under the bird (frame fractions): dx, dy of the box centre, width. The nest of
# twigs is drawn behind the bird with its bowl on the ground (its picture fills the middle 60 % of the square).
NEST = {"twigs": (0.0, None, None), "apples": (-0.33, -0.075, 0.28), "lantern": (0.34, -0.105, 0.25), "book": (-0.31, -0.07, 0.27)}


def ground(img: Image.Image):
    """Centre of the ground under the subject (the contact shadow counts: a jumping bird's nest is on the floor)."""
    a = np.asarray(img.getchannel("A"), dtype=np.float32) / 255.0
    ys, xs = np.nonzero(a > 0.3)
    bottom = ys.max()
    low = ys > bottom - 0.05 * a.shape[0]
    body = np.nonzero(a > 0.85)
    lower = body[0] > body[0].min() + 0.6 * (body[0].max() - body[0].min())
    span = (body[1][lower].max() - body[1][lower].min()) / a.shape[1]
    return float(xs[low].mean() / a.shape[1]), float(bottom / a.shape[0]), float(span)


def pet_layout(name: str, img: Image.Image) -> dict:
    """Boxes [centre x %, centre y %, width %, rotation°] of every item that this picture can wear."""
    s = img.width
    gx, gy, span = ground(img)
    out = {}
    clamp = lambda v, w: min(max(v, w / 2 + 1.0), 100 - w / 2 - 1.0)
    for item, (dx, dy, w) in NEST.items():
        w = w if w else min(0.8, max(0.5, span * 1.3))
        dy = dy if dy is not None else 0.01 - 0.30 * w
        out[item] = [round(clamp((gx + dx) * 100, w * 100), 1), round(min((gy + dy) * 100, 100 - w * 50 - 0.5), 1), round(w * 100, 1), 0]
    if name not in EYES:
        return out
    (x1, y1), (x2, y2) = EYES[name]
    cx, cy, e = (x1 + x2) / 2, (y1 + y2) / 2, math.hypot(x2 - x1, y2 - y1)
    tilt = math.degrees(math.atan2(y2 - y1, x2 - x1))
    ux, uy = math.sin(math.radians(tilt)), -math.cos(math.radians(tilt))
    rx, ry = -uy, ux
    anchor = {"head": 1.05, "brow": 0.5, "chest": -1.55}
    blocked = BLOCKED.get(name.split("-")[-1], set())
    stage = name.split("-")[1]
    for item, (at, du, dr, w, rot) in WEAR.items():
        if SLOT[item] in blocked or (SLOT[item] == "chest" and stage == "chick"):
            continue
        k = anchor[at] + du
        px, py = cx + ux * k * e + rx * dr * e, cy + uy * k * e + ry * dr * e
        out[item] = [round(px / s * 100, 1), round(py / s * 100, 1), round(w * e / s * 100, 1), round(tilt + rot, 1)]
    return out


def outfit_preview(names: list[str], path: Path):
    """QA: every pet picture with three outfits (not committed)."""
    outfits = [("bow", "amulet", "twigs"), ("wreath", "beads", "apples"), ("kokoshnik", "lantern"), ("star", "book")]
    tile = 256
    sheet_img = Image.new("RGB", (tile * len(outfits), tile * len(names)), "white")
    for row, name in enumerate(names):
        pet = Image.open(OUT / f"{name}.webp").convert("RGBA")
        layout = MANIFEST_LAYOUT[name]
        for col, outfit in enumerate(outfits):
            frame = Image.new("RGBA", pet.size, (233, 248, 242, 255))
            def put(item):
                cx, cy, w, rot = layout[item]
                g = Image.open(OUT / f"gift-{item}.webp").convert("RGBA")
                side = max(1, round(w / 100 * pet.width))
                g = resize(g, side).rotate(-rot, resample=Image.BICUBIC, expand=True)
                frame.alpha_composite(g, (round(cx / 100 * pet.width - g.width / 2), round(cy / 100 * pet.height - g.height / 2)))
            if "twigs" in outfit and "twigs" in layout:
                put("twigs")  # behind the bird
            frame.alpha_composite(pet)
            for item in outfit:
                if item != "twigs" and item in layout:
                    put(item)
            sheet_img.paste(frame.convert("RGB").resize((tile, tile), Image.LANCZOS), (col * tile, row * tile))
        ImageDraw.Draw(sheet_img).text((4, row * tile + 4), name, fill=(0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet_img.save(path, quality=88)


MANIFEST_LAYOUT: dict[str, dict] = {}


# ---------- launcher icons and the splash ----------

def fit_in_circle(fg: Image.Image, radius: float) -> Image.Image:
    """Scales the foreground so that every visible pixel lies within a centred circle of `radius` × side."""
    a = np.asarray(fg.getchannel("A"), dtype=np.float32) / 255.0
    ys, xs = np.nonzero(a > 0.08)
    s = fg.width
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2  # centre the visible part
    far = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()
    k = radius * s / far
    small = resize(fg, max(1, round(s * k)))
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.alpha_composite(small, (round(s / 2 - cx * k), round(s / 2 - cy * k)))
    return out


def rounded(img: Image.Image, r: float) -> Image.Image:
    m = Image.new("L", (img.width * 4, img.height * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, m.width - 1, m.height - 1], radius=r * m.width, fill=255)
    out = img.convert("RGBA")
    out.putalpha(m.resize(img.size, Image.LANCZOS))
    return out


def icons(src: Path, report: dict):
    fg = Image.open(src / "app-icon-foreground.png").convert("RGBA")
    bg = Image.open(src / "app-icon-background.png").convert("RGB")
    size = fg.width
    # Adaptive icon (API 26+): 108 dp layers; the mask may cut everything outside the 66 dp circle → radius 0.30.
    adaptive_fg = fit_in_circle(fg, 0.30)
    # Maskable PWA icon: safe zone is the circle of radius 40 % → 0.36 with a margin.
    full = lambda r: Image.alpha_composite(bg.convert("RGBA"), fit_in_circle(fg, r))
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    res = ROOT / "android" / "res"
    for d, k in densities.items():
        write(res / f"mipmap-{d}" / "ic_launcher_foreground.png", png(resize(adaptive_fg, round(108 * k))))
        write(res / f"mipmap-{d}" / "ic_launcher_background.png", png(resize(bg, round(108 * k))))
        write(res / f"mipmap-{d}" / "ic_launcher.png", png(rounded(resize(full(0.40), round(48 * k)), 0.22)))
    write(res / "mipmap-anydpi-v26" / "ic_launcher.xml", (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n').encode())
    icons_dir = ROOT / "public" / "icons"
    write(icons_dir / "icon-192.png", png(rounded(resize(full(0.40), 192), 0.22)))
    write(icons_dir / "icon-512.png", png(rounded(resize(full(0.40), 512), 0.22)))
    write(icons_dir / "icon-maskable-512.png", png(resize(full(0.34), 512).convert("RGB")))
    write(icons_dir / "icon-180.png", png(resize(full(0.40), 180).convert("RGB")))  # iOS rounds the corners itself
    write(icons_dir / "icon-48.png", png(rounded(resize(full(0.42), 48), 0.22)))  # favicon
    # Splash (pre-Android 12 window background): the bird of splash.png, cut out, 96 dp at xxhdpi.
    sp = Image.open(src / "splash.png").convert("RGB")
    mask = subject_mask(sp, sha256((src / "splash.png").read_bytes()))
    bird = matte(np.asarray(sp), mask)
    bbox = bird.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    side = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    pad = side * 0.58
    crop = bird.crop((round(cx - pad), round(cy - pad), round(cx + pad), round(cy + pad)))
    write(res / "drawable-xxhdpi" / "splash_bird.png", png(resize(crop, 288)))
    report["icons"] = {"adaptive": "android/res/mipmap-*/ic_launcher_{foreground,background}.png", "pwa": ["icon-48", "icon-180", "icon-192", "icon-512", "icon-maskable-512"], "splash": "android/res/drawable-xxhdpi/splash_bird.png"}


# ---------- QA sheets (not committed) ----------

def sheet(items: list[tuple[str, Image.Image]], path: Path, tile=200):
    cols = 6
    rows = math.ceil(len(items) / cols)
    out = Image.new("RGB", (cols * tile * 2, rows * (tile + 18)), (255, 255, 255))
    d = ImageDraw.Draw(out)
    for i, (name, im) in enumerate(items):
        x, y = (i % cols) * tile * 2, (i // cols) * (tile + 18)
        small = resize(im.convert("RGBA"), tile) if im.width == im.height else resize(im.convert("RGBA"), (tile, round(tile * im.height / im.width)))
        for j, colour in enumerate([(11, 26, 42), (230, 251, 242)]):
            cell = Image.new("RGBA", (tile, tile), colour + (255,))
            cell.alpha_composite(small.crop((0, 0, tile, min(tile, small.height))))
            out.paste(cell.convert("RGB"), (x + j * tile, y))
        d.text((x + 4, y + tile + 2), name, fill=(0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, quality=88)


def write_catalogue(manifest: dict):
    """Writes public/art/manifest.json and the generated src/ui/art-manifest.js (tools/import-duo.py uses it too)."""
    manifest["items"] = dict(sorted(manifest["items"].items()))
    manifest["total_bytes"] = sum(v["bytes"] for v in manifest["items"].values())
    manifest["generator"] = ("tools/import-art.py (rembg isnet-general-use + colour-to-alpha on white, Pillow WebP); "
                             "hand-*, bg-duo-*: tools/import-duo.py (colour-to-alpha on a magenta key; the rooms whole)")
    manifest["layout"] = dict(sorted(manifest.get("layout", {}).items()))
    MANIFEST_LAYOUT.update(manifest["layout"])
    write(OUT / "manifest.json", (json.dumps(manifest, ensure_ascii=False, indent=1) + "\n").encode())
    entries = ",\n".join(f"  '{k}': [{v['w']}, {v['h']}, {1 if v['alpha'] else 0}]" for k, v in manifest["items"].items())
    boxes = ",\n".join(f"  '{k}': {{ {', '.join(f'{i}: {b}' for i, b in v.items())} }}" for k, v in manifest["layout"].items())
    write(ROOT / "src" / "ui" / "art-manifest.js", (
        "// Generated by tools/import-art.py — do not edit. The pictures of public/art/: name → [width, height, alpha].\n"
        f"export const ART = Object.freeze({{\n{entries},\n}});\n"
        f"export const ART_BYTES = {manifest['total_bytes']};\n"
        "// What the Firebird wears, per picture: item → [centre x %, centre y %, width %, rotation°]. A missing item —\n"
        "// the pose covers its slot (the star above the head, the book on the chest) or the stage has not opened it.\n"
        f"export const PET_LAYOUT = Object.freeze({{\n{boxes},\n}});\n").encode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.environ.get("SYNERGY_GRAPHICS", str(ROOT.parent / "SYNERGY_GRAPHICS")))
    ap.add_argument("--only", default="")
    ap.add_argument("--sheets", default="")
    args = ap.parse_args()
    src = Path(args.src)
    names = sorted(p.stem for p in src.glob("*.png"))
    assert len(names) >= 140, f"{src}: {len(names)} pictures — expected the package of 144"
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {"items": {}}
    qa: dict[str, list] = {}
    for name in names:
        if name.startswith(SKIP) or not name.startswith(args.only):
            continue
        r = role(name)
        assert r, f"no role for {name}"
        size, mode, q = r
        raw = (src / f"{name}.png").read_bytes()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if mode == "cut":
            out = resize(matte(np.asarray(img), subject_mask(img, sha256(raw))), size)
        else:
            out = resize(img, size) if isinstance(size, int) else cover(img, size)
        data = webp(out, q)
        write(OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": mode == "cut", "sha256": sha256(data), "source": sha256(raw)}
        if name.startswith("pet-"):
            manifest.setdefault("layout", {})[name] = pet_layout(name, out)
        qa.setdefault(name.split("-")[0], []).append((name, Image.open(io.BytesIO(data))))
        print(f"{name:28s} {mode:4s} {out.width}x{out.height} {len(data) / 1024:6.1f} KB")
    if not args.only or args.only.startswith(("app-icon", "splash")):
        icons(src, manifest)
    write_catalogue(manifest)
    if args.sheets:
        for group, items in qa.items():
            sheet(items, Path(args.sheets) / f"{group}.jpg")
        outfit_preview([n for n in manifest["layout"] if n in EYES], Path(args.sheets) / "outfits.jpg")
    print(f"{len(manifest['items'])} pictures, {manifest['total_bytes'] / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
