"""Imports the generated pictures of «Две руки» (5.32; docs/ART.md, the prompts and the model in docs/AI_USAGE.md).

Hands: one sheet with three hands in a row — rest, fist, open palm — on a flat magenta key. One sheet, not three
pictures: the three poses come out of the generator as one design, one scale and one light.

The key is divided out: a smooth surface is fitted to the clearly magenta pixels, alpha is how far a pixel is from
that surface towards the subject, the colour is unmixed, F = (C − (1 − a)·K) / a, and the magenta spill left on the
glossy edges is taken off. The hands are cut apart, stood on one baseline and one centre line (the socket), so the
game can cross-fade them in place. Prints where the palm light and the wrist band are, in fractions of the picture
(HAND_LIGHT in src/games/duo.js).

Rooms: the day and the night picture of the table (bg-duo-day, bg-duo-night), kept whole. Prints the back edge of the
table and its front light strip, in fractions of the height (ROOM in src/games/duo.js): the game lays the picture so
that the back edge falls on its table line.

Everything goes into the catalogue with the writer of tools/import-art.py.

Usage: python tools/import-duo.py [--hands SHEET.png --flip rest] [--day DAY.png] [--night NIGHT.png]
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
    """RGBA without the magenta key. «Magenta-ness» k = min(R, B) − G: the key ≈ 120–190, the hand ≤ 0."""
    p = rgb.astype(np.float64)
    h, w, _ = p.shape
    k = np.minimum(p[..., 0], p[..., 2]) - p[..., 1]
    ys, xs = np.nonzero(k > 90)
    pick = np.random.default_rng(1).choice(len(ys), min(20000, len(ys)), replace=False)
    ys, xs = ys[pick], xs[pick]
    basis = lambda x, y: np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)  # noqa: E731
    fit = basis(xs / w, ys / h)
    yy, xx = np.mgrid[0:h, 0:w]
    grid = basis(xx / w, yy / h)
    key = np.stack([grid @ np.linalg.lstsq(fit, p[ys, xs, c], rcond=None)[0] for c in range(3)], -1)
    k_key = np.minimum(key[..., 0], key[..., 2]) - key[..., 1]
    a = np.clip((k_key - k) / (k_key - 40), 0, 1)  # ≤ 40: a tint of the glossy shell, still the hand
    a[a < 0.04] = 0
    c = np.clip((p - (1 - a[..., None]) * key) / np.maximum(a[..., None], 1e-3), 0, 255)
    spill = np.clip(np.minimum(c[..., 0], c[..., 2]) - c[..., 1], 0, None)
    c[..., 0] -= spill * 0.95
    c[..., 2] -= spill * 0.95
    return np.dstack([c, a * 255]).astype(np.uint8)


def cut(rgba: np.ndarray) -> list[tuple[Image.Image, float]]:
    """The hands left to right, each cropped with the x of its socket centre (the mean of its bottom rows)."""
    a = rgba[..., 3] > 128
    cols = np.nonzero(a.any(0))[0]
    groups = np.split(cols, np.nonzero(np.diff(cols) > 8)[0] + 1)
    assert len(groups) == len(POSES), f"{len(groups)} hands on the sheet — expected {len(POSES)}"
    out = []
    for g in groups:
        x0, x1 = g[0] - 4, g[-1] + 5
        rows = np.nonzero(a[:, x0:x1].any(1))[0]
        y0, y1 = rows[0] - 4, rows[-1] + 5
        crop = rgba[y0:y1, x0:x1]
        bottom = crop[-40:-5, :, 3].astype(np.float64)
        out.append((Image.fromarray(crop, "RGBA"), float((bottom.sum(0) * np.arange(crop.shape[1])).sum() / bottom.sum())))
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
    """The back edge of the table (the biggest step of the row median between 58 and 70 % of the height) and its
    front light strip (the brightest row below it), in fractions of the height."""
    rows = np.median(np.asarray(img.convert("L")).astype(np.float64)[:, 40:-40], axis=1)
    h = len(rows)
    lo, hi = int(h * 0.58), int(h * 0.70)
    back = lo + int(np.argmax(np.abs(np.diff(rows[lo:hi]))))
    front = back + 20 + int(np.argmax(rows[back + 20:int(h * 0.9)]))
    return round(back / h, 3), round(front / h, 3)


def rooms(manifest: dict, pictures: dict[str, str]):
    for name, path in pictures.items():
        raw = Path(path).read_bytes()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        data = ART.webp(img, 76)
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": img.width, "h": img.height, "bytes": len(data), "alpha": False, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        print(f"{name:12s} {img.width}x{img.height} {len(data) / 1024:5.1f} KB  table back, front {edges(img)}")


def hands(manifest: dict, sheet: str, flip_arg: str, height_px: int):
    raw = Path(sheet).read_bytes()
    hands = cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))))
    flip = set(filter(None, flip_arg.split(",")))
    placed = []
    for pose, (img, cx) in zip(POSES, hands):
        if pose in flip:
            img, cx = img.transpose(Image.FLIP_LEFT_RIGHT), img.width - cx
        placed.append((pose, img, cx))
    half = max(max(cx, img.width - cx) for _, img, cx in placed)
    width, height = int(np.ceil(half * 2)), max(img.height for _, img, _ in placed)
    size = (round(width * height_px / height), height_px)
    for pose, img, cx in placed:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(img, (round(half - cx), height - img.height))  # one baseline, one centre line
        out = ART.resize(canvas, size)
        data = ART.webp(out, 84)
        name = f"hand-{pose}"
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
    args = ap.parse_args()
    manifest = json.loads((ART.OUT / "manifest.json").read_text("utf-8"))
    if args.hands:
        hands(manifest, args.hands, args.flip, args.height)
    rooms(manifest, {k: v for k, v in (("bg-duo-day", args.day), ("bg-duo-night", args.night)) if v})
    ART.write_catalogue(manifest)
    print(f"{len(manifest['items'])} pictures, {manifest['total_bytes'] / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
