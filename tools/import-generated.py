"""Imports the generated pictures of 5.32 — the bionic hands, the rooms of «Две руки» and «Мастерская», the basket
(docs/ART.md; the prompts and the model in docs/GAME_VISUALS.md §7–8, docs/AI_USAGE.md).

Hands: one sheet with three hands in a row — rest, fist, open palm — on a flat magenta key. One sheet, not three
pictures: the three poses come out of the generator as one design, one scale and one light.

The key is divided out: a smooth surface is fitted to the clearly magenta pixels, alpha is how far a pixel is from
that surface towards the subject, the colour is unmixed, F = (C − (1 − a)·K) / a, and the magenta spill left on the
glossy edges is taken off. The hands are cut apart, stood on one baseline and one centre line (the socket), so the
game can cross-fade them in place. Prints where the palm light and the wrist band are, in fractions of the picture
(HAND_LIGHT in src/games/duo.js).

Rooms: the day and the night picture of the table (bg-duo-*) and of the workbench (bg-grip-*), kept whole. Prints the
back edge of the table top and its front light strip, in fractions of the height (ROOM, WORKSHOP in src/render/): the
game lays the picture so that this line falls on its own table line or belt.

Props: one object on the key (prop-basket, prop-glider), cropped to itself.

Everything goes into the catalogue with the writer of tools/import-art.py.

Usage: python tools/import-generated.py [--hands SHEET.png --flip rest] [--hanging SHEET.png] [--day PNG] [--night PNG]
                                      [--workshop-day PNG] [--workshop-night PNG] [--basket PNG] [--glider PNG]
Needs Python 3.10+, Pillow, NumPy (no SciPy, no rembg: the key is a flat colour).
"""
from __future__ import annotations

import argparse
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
POSES = ("rest", "close", "open")  # left to right on the sheet
SPEC = importlib.util.spec_from_file_location("import_art", ROOT / "tools" / "import-art.py")
ART = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ART)


def unkey(rgb: np.ndarray) -> np.ndarray:
    """RGBA without the magenta key. «Magenta-ness» k = min(R, B) − G: the key ≈ 75–190 (the generator's magenta
    varies from sheet to sheet; measured on the border), the hand ≤ 0."""
    p = rgb.astype(np.float64)
    h, w, _ = p.shape
    k = np.minimum(p[..., 0], p[..., 2]) - p[..., 1]
    border = np.concatenate([k[:8].ravel(), k[-8:].ravel(), k[:, :8].ravel(), k[:, -8:].ravel()])
    k_border = float(np.median(border[border > 30]))
    sure, tint = min(90.0, 0.6 * k_border), min(40.0, 0.3 * k_border)  # clearly the key; a tint of the glossy shell
    ys, xs = np.nonzero(k > sure)
    pick = np.random.default_rng(1).choice(len(ys), min(20000, len(ys)), replace=False)
    ys, xs = ys[pick], xs[pick]
    basis = lambda x, y: np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)  # noqa: E731
    fit = basis(xs / w, ys / h)
    yy, xx = np.mgrid[0:h, 0:w]
    grid = basis(xx / w, yy / h)
    key = np.stack([grid @ np.linalg.lstsq(fit, p[ys, xs, c], rcond=None)[0] for c in range(3)], -1)
    k_key = np.minimum(key[..., 0], key[..., 2]) - key[..., 1]
    a = np.clip((k_key - k) / (k_key - tint), 0, 1)  # up to the tint: still the hand
    a[a < 0.04] = 0
    c = np.clip((p - (1 - a[..., None]) * key) / np.maximum(a[..., None], 1e-3), 0, 255)
    spill = np.clip(np.minimum(c[..., 0], c[..., 2]) - c[..., 1], 0, None)
    c[..., 0] -= spill * 0.95
    c[..., 2] -= spill * 0.95
    return np.dstack([c, a * 255]).astype(np.uint8)


def cut(rgba: np.ndarray, count: int, hang: bool) -> list[tuple[Image.Image, float]]:
    """The hands left to right, each cropped with the x of its socket centre: the mean of its bottom rows (a hand
    standing on its socket) or of its top rows (a hand hanging from an arm that leaves the top of the sheet)."""
    a = rgba[..., 3] > 128
    cols = np.nonzero(a.any(0))[0]
    groups = np.split(cols, np.nonzero(np.diff(cols) > 8)[0] + 1)
    assert len(groups) == count, f"{len(groups)} hands on the sheet — expected {count}"
    out = []
    for g in groups:
        x0, x1 = max(0, g[0] - 4), g[-1] + 5
        rows = np.nonzero(a[:, x0:x1].any(1))[0]
        y0, y1 = max(0, rows[0] - 4), rows[-1] + 5
        crop = rgba[y0:y1, x0:x1]
        end = crop[2:30, :, 3] if hang else crop[-40:-5, :, 3]
        end = end.astype(np.float64)
        out.append((Image.fromarray(crop, "RGBA"), float((end.sum(0) * np.arange(crop.shape[1])).sum() / end.sum())))
    return out


def marks(img: Image.Image) -> tuple[list[float], float]:
    """The palm light (centre, fractions) and the wrist band (y, fraction) of a hand picture."""
    p = np.asarray(img).astype(np.int32)
    r, g, b, a = (p[..., i] for i in range(4))
    light = (a > 200) & (g > 170) & (g - r > 45) & (b < g + 10)
    band = (a > 200) & (b > 140) & (g > 140) & (r < 120)
    ly, lx = np.nonzero(light)
    by = np.nonzero(band)[0]
    return [round(float(lx.mean()) / img.width, 3), round(float(ly.mean()) / img.height, 3)], round(float(np.median(by)) / img.height, 3)


def edges(img: Image.Image) -> tuple[float, float]:
    """The back edge of the table top (the biggest step of the row median between 58 and 70 % of the height; the
    rooms of «Две руки») and its front light strip (the most mint row, green minus red, between 60 and 85 %), in
    fractions of the height."""
    p = np.asarray(img.convert("RGB")).astype(np.float64)[:, 40:-40]
    rows = np.median(p.mean(axis=2), axis=1)
    mint = np.median(p[..., 1] - p[..., 0], axis=1)
    h = len(rows)
    lo, hi = int(h * 0.58), int(h * 0.70)
    back = lo + int(np.argmax(np.abs(np.diff(rows[lo:hi]))))
    front = int(h * 0.6) + int(np.argmax(mint[int(h * 0.6):int(h * 0.85)]))
    return round(back / h, 3), round(front / h, 3)


def rooms(manifest: dict, pictures: dict[str, str]):
    for name, path in pictures.items():
        raw = Path(path).read_bytes()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        data = ART.webp(img, 76)
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": img.width, "h": img.height, "bytes": len(data), "alpha": False, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        print(f"{name:12s} {img.width}x{img.height} {len(data) / 1024:5.1f} KB  table back, front {edges(img)}")


def prop(manifest: dict, name: str, path: str, width: int):
    raw = Path(path).read_bytes()
    rgba = unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")))
    a = rgba[..., 3] > 128
    ys, xs = np.nonzero(a)
    crop = Image.fromarray(rgba[max(0, ys.min() - 4):ys.max() + 5, max(0, xs.min() - 4):xs.max() + 5], "RGBA")
    out = ART.resize(crop, (width, round(crop.height * width / crop.width)))
    data = ART.webp(out, 84)
    ART.write(ART.OUT / f"{name}.webp", data)
    manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": True, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
    print(f"{name:14s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB")


def hands(manifest: dict, sheet: str, flip_arg: str, height_px: int, prefix: str = "hand-", poses=POSES, hang: bool = False):
    raw = Path(sheet).read_bytes()
    hands = cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))), len(poses), hang)
    flip = set(filter(None, flip_arg.split(",")))
    placed = []
    for pose, (img, cx) in zip(poses, hands):
        if pose in flip:
            img, cx = img.transpose(Image.FLIP_LEFT_RIGHT), img.width - cx
        placed.append((pose, img, cx))
    half = max(max(cx, img.width - cx) for _, img, cx in placed)
    width, height = int(np.ceil(half * 2)), max(img.height for _, img, _ in placed)
    size = (round(width * height_px / height), height_px)
    for pose, img, cx in placed:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(img, (round(half - cx), 0 if hang else height - img.height))  # one baseline (or top), one centre line
        out = ART.resize(canvas, size)
        data = ART.webp(out, 84)
        name = f"{prefix}{pose}"
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": True, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        light, band = marks(out)
        print(f"{name:12s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB  light {light}  band {band}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hands", help="the sheet of three hands on magenta")
    ap.add_argument("--flip", default="", help="poses drawn as a left hand (thumb on the right): mirrored to a right hand")
    ap.add_argument("--height", type=int, default=320)
    ap.add_argument("--day")
    ap.add_argument("--night")
    ap.add_argument("--hanging", help="the sheet of three hands hanging from an arm (open, rest, fist) on magenta: «Мастерская»")
    ap.add_argument("--workshop-day")
    ap.add_argument("--workshop-night")
    ap.add_argument("--basket")
    ap.add_argument("--glider")
    args = ap.parse_args()
    manifest = json.loads((ART.OUT / "manifest.json").read_text("utf-8"))
    if args.hands:
        hands(manifest, args.hands, args.flip, args.height)
    if args.hanging:
        hands(manifest, args.hanging, "", 400, "hand-down-", ("open", "rest", "close"), hang=True)
    rooms(manifest, {k: v for k, v in (("bg-duo-day", args.day), ("bg-duo-night", args.night),
                                       ("bg-grip-day", args.workshop_day), ("bg-grip-night", args.workshop_night)) if v})
    if args.basket:
        prop(manifest, "prop-basket", args.basket, 256)
    if args.glider:
        prop(manifest, "prop-glider", args.glider, 192)
    ART.write_catalogue(manifest)
    print(f"{len(manifest['items'])} pictures, {manifest['total_bytes'] / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
