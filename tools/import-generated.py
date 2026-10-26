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

Icons of the same hand (26.10, night — one prosthesis on every screen): the gesture pictures (gesture-*) cut from the
sheets of poses, the picture of the hand (ico-hand) and the skins (skin-*) from the open hand of the standing sheet. An
icon is the hand down to just under the wrist band, centred on a square. A skin is that hand with its shell multiplied
by the same pastel of the skin colour the games use (render/bionic.js skinTint): the nest shows the hand of the game.

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
from PIL import Image, ImageEnhance

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


# Colour grade of the rooms: the generator renders them pale; the brand's light is vivid (the day a little more —
# airy mint on white washes out on a phone in daylight).
VIVID = {"day": 1.3, "night": 1.12}
QUALITY = 92  # 5.32: full native size and a high WebP quality — the archive has room (docs/GAME_VISUALS.md §10)


def rooms(manifest: dict, pictures: dict[str, str]):
    for name, path in pictures.items():
        raw = Path(path).read_bytes()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = ImageEnhance.Color(img).enhance(VIVID["night" if name.endswith("night") else "day"])
        data = ART.webp(img, QUALITY)
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": img.width, "h": img.height, "bytes": len(data), "alpha": False, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        print(f"{name:12s} {img.width}x{img.height} {len(data) / 1024:5.1f} KB  table back, front {edges(img)}")


def prop(manifest: dict, name: str, path: str, width: int):
    raw = Path(path).read_bytes()
    rgba = unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")))
    a = rgba[..., 3] > 128
    ys, xs = np.nonzero(a)
    crop = Image.fromarray(rgba[max(0, ys.min() - 4):ys.max() + 5, max(0, xs.min() - 4):xs.max() + 5], "RGBA")
    out = ART.resize(crop, (width, round(crop.height * width / crop.width))) if width < crop.width else crop
    data = ART.webp(out, QUALITY)
    ART.write(ART.OUT / f"{name}.webp", data)
    manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": True, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
    print(f"{name:14s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB")


# render/draw.js SKIN_COLORS[*].light of the light theme; the games mix it with white (render/bionic.js skinTint)
SKIN_LIGHT = {"graphite": "#6b7a88", "sky": "#8fb8ff", "coral": "#ffab9f", "mint": "#7fe6cb", "gold": "#f7d47d", "neon": "#c4a1ff", "cosmos": "#4b5fb8"}


def mixed(hex_a: str, hex_b: str, t: float) -> np.ndarray:
    a = np.array([int(hex_a[i:i + 2], 16) for i in (1, 3, 5)], np.float64)
    b = np.array([int(hex_b[i:i + 2], 16) for i in (1, 3, 5)], np.float64)
    return a + (b - a) * t


def band_row(img: Image.Image) -> int:
    p = np.asarray(img).astype(np.int32)
    band = (p[..., 3] > 200) & (p[..., 2] > 140) & (p[..., 1] > 140) & (p[..., 0] < 120)
    return int(np.median(np.nonzero(band)[0]))


def icon(img: Image.Image, size: int, tint: np.ndarray | None = None) -> Image.Image:
    """The hand down to just under its wrist band, centred on a square `size` wide; the shell multiplied by `tint`."""
    p = np.asarray(img).astype(np.float64)
    band = band_row(img)
    if tint is not None:
        p[:band, :, :3] *= tint / 255.0
    a = p[..., 3] > 16
    rows = np.nonzero(a.any(1))[0]
    bottom = min(len(p), band + int(0.06 * (band - rows[0])))
    cols = np.nonzero(a[rows[0]:bottom].any(0))[0]
    crop = Image.fromarray(np.clip(p, 0, 255).astype(np.uint8)[rows[0]:bottom, cols[0]:cols[-1] + 1], "RGBA")
    side = int(max(crop.size) * 1.12)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return ART.resize(square, (size, size))


def put(manifest: dict, name: str, out: Image.Image, raw: bytes, quality: int = QUALITY):
    data = ART.webp(out, quality)
    ART.write(ART.OUT / f"{name}.webp", data)
    manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": True, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
    print(f"{name:20s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB")


def gesture_icons(manifest: dict, sheet: str, names: list[str], flips: set[str], size: int = 256):
    """Gesture pictures from a sheet of standing hands: `names` left to right, «-» skips a hand."""
    raw = Path(sheet).read_bytes()
    for name, (img, _) in zip(names, cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))), len(names), False)):
        if name == "-":
            continue
        put(manifest, f"gesture-{name}", icon(img.transpose(Image.FLIP_LEFT_RIGHT) if name in flips else img, size), raw)


def hand_family(manifest: dict, sheet: str):
    """From the standing sheet (rest — a left hand, fist, open): gesture-rest/fist/open, ico-hand and the seven skins."""
    raw = Path(sheet).read_bytes()
    rest, fist, palm = [img for img, _ in cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))), 3, False)]
    rest = rest.transpose(Image.FLIP_LEFT_RIGHT)
    for name, img in (("rest", rest), ("fist", fist), ("open", palm)):
        put(manifest, f"gesture-{name}", icon(img, 256), raw)
    put(manifest, "ico-hand", icon(palm, 192), raw)
    for skin, light in SKIN_LIGHT.items():
        put(manifest, f"skin-{skin}", icon(palm, 256, mixed(light, "#ffffff", 0.78 if skin == "graphite" else 0.5)), raw)


def icons(manifest: dict, sheet: str, names: list[str], sizes: list[int]):
    """Objects on the magenta key, left to right, each centred on a transparent square (game-*, ico-*)."""
    raw = Path(sheet).read_bytes()
    for name, size, (img, _) in zip(names, sizes, cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))), len(names), False)):
        side = int(max(img.size) * (1.35 if name.startswith("obj-") else 1.08))  # a Workshop object fills ~¾ of its square, as obj-* of 5.16
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        put(manifest, name, ART.resize(square, (size, size)), raw)


def tiles(manifest: dict, sheet: str, names: list[str], size: int):
    """Scenes on their own white (the everyday tasks, day-*): split by the white gaps, each on a white square."""
    raw = Path(sheet).read_bytes()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    p = np.asarray(img).astype(np.int32)
    ink = (255 * 3 - p.sum(axis=2)) > 36  # anything but the white, shadows included
    cols = np.nonzero(ink.any(0))[0]
    groups = np.split(cols, np.nonzero(np.diff(cols) > 12)[0] + 1)
    assert len(groups) == len(names), f"{len(groups)} scenes on the sheet — expected {len(names)}"
    for name, g in zip(names, groups):
        rows = np.nonzero(ink[:, g[0]:g[-1] + 1].any(1))[0]
        crop = img.crop((g[0], rows[0], g[-1] + 1, rows[-1] + 1))
        side = int(max(crop.size) * 1.12)
        square = Image.new("RGB", (side, side), (255, 255, 255))
        square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        out = ART.resize(square, (size, size))
        data = ART.webp(out, 86)
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": False, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        print(f"{name:20s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB")


def cover(manifest: dict, name: str, path: str, size=(900, 675)):
    """An onboarding cover (cover-*): its own background, cut to 4 : 3."""
    raw = Path(path).read_bytes()
    out = ART.cover(Image.open(io.BytesIO(raw)).convert("RGB"), size)
    data = ART.webp(out, 86)
    ART.write(ART.OUT / f"{name}.webp", data)
    manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": False, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
    print(f"{name:20s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB")


# The Firebird in its nest of twigs (26.10): with the nest worn, the bird is one picture — the nest is no longer laid
# under the team's bird (a jumping bird hung over it, the nest came from another light). A sheet of 3 × 2 on the key
# per stage (one design per stage); every picture is scaled so that the nest has one width and one bottom line on all
# of them — the nest does not change as the bird grows, and turning the nest on does not move the bird's frame.
NEST_W, NEST_FLOOR, PET_SIZE = 0.62, 0.95, 512
# 26.10: the archive of the platform holds ≈ 6 MB more and a picture lands in it ≈ 4.3 times (docs/ART.md, «Бюджет»):
# the 21 birds in their nests at WebP 80 (≈ 20 KB each, the team's birds are 17–48 KB), the grips of the hanging hand at 85
PET_QUALITY, GRIP_QUALITY = 80, 85


def grid_cells(rgba: np.ndarray, cols: int = 3, rows: int = 2) -> list[np.ndarray]:
    """The cells of a sheet, cut along the emptiest column and row near each expected border."""
    a = rgba[..., 3].astype(np.float64)
    h, w = a.shape
    def cuts(profile, n, size):
        out = [0]
        for i in range(1, n):
            lo, hi = int(size * (i / n - 0.08)), int(size * (i / n + 0.08))
            out.append(lo + int(np.argmin(profile[lo:hi])))
        return out + [size]
    xs, ys = cuts(a.sum(0), cols, w), cuts(a.sum(1), rows, h)
    return [rgba[ys[r]:ys[r + 1], xs[c]:xs[c + 1]] for r in range(rows) for c in range(cols)]


def pets(manifest: dict, sheets: list[tuple[str, str]]):
    """`sheets` — (PNG, six names in reading order, «-» for a cell to skip). One nest width for all the pictures:
    the widest that lets every subject fit its frame."""
    cells = []
    for path, names in sheets:
        raw = Path(path).read_bytes()
        rgba = unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")))
        for name, cell in zip(names.split(","), grid_cells(rgba)):
            if name == "-":
                continue
            alpha = cell[..., 3] > 128
            ys, xs = np.nonzero(alpha)
            twigs = ART.nest_mask(cell)
            ty, tx = np.nonzero(twigs)
            assert len(tx) > 500, f"{name}: no nest found"
            left, right = np.percentile(tx, [1, 99])
            cols = (xs >= left) & (xs <= right)
            bottom = ys[cols].max()
            cells.append((name, cell, raw, (left + right) / 2, right - left, bottom, xs.min(), xs.max(), ys.min()))
    # the widest nest that keeps every subject 2 px inside its frame
    fit = min(min((NEST_FLOOR * PET_SIZE - 2) / (bottom - top), (PET_SIZE / 2 - 2) / max(cx - x0, x1 - cx)) * nw / PET_SIZE
              for _, _, _, cx, nw, bottom, x0, x1, top in cells)
    width = min(NEST_W, fit)
    print(f"nest width {width:.3f} of the frame (asked {NEST_W}, fits {fit:.3f})")
    for name, cell, raw, cx, nw, bottom, *_ in cells:
        k = width * PET_SIZE / nw
        img = Image.fromarray(cell, "RGBA")
        img = ART.resize(img, (max(1, round(img.width * k)), max(1, round(img.height * k))))
        frame = Image.new("RGBA", (PET_SIZE, PET_SIZE), (0, 0, 0, 0))
        frame.paste(img, (round(PET_SIZE / 2 - cx * k), round(NEST_FLOOR * PET_SIZE - bottom * k)))  # clipped to the frame
        put(manifest, name, frame, raw, PET_QUALITY)


def grips(manifest: dict, sheet: str, names: list[str], hang: bool):
    """The grips whose fingers disagree (26.10: a pinch, a point, a key… — the Workshop and the tutorial showed the
    drawn hand for them), from another sheet of the same hand, each laid onto the pictures of its kind
    (hand-down-* hanging, hand-* standing): scaled to the same socket width, its wrist band on the same row and its
    socket — a plain white cylinder — stretched to the same flat end, so a cross-fade from the open hand keeps the
    band, the tint and the socket in place. A name with «!» in front is mirrored (drawn as a left hand), «-» skips a
    hand. Prints the palm light and the fingertip line (BIONIC in src/render/bionic.js)."""
    raw = Path(sheet).read_bytes()
    ref = Image.open(ART.OUT / f"hand-{'down-' if hang else ''}rest.webp").convert("RGBA")
    W, H = ref.size

    def socket(img):  # the socket's flat end, its centre and width a few rows inside it
        a = np.asarray(img.getchannel("A")) > 128
        rows = np.nonzero(a.any(1))[0]
        end, step = (int(rows[0]), 1) if hang else (int(rows[-1]), -1)
        near = sorted((end + step * 3, end + step * (3 + max(4, img.height // 40))))
        cols = np.nonzero(a[near[0]:near[1]].any(0))[0]
        return (cols[0] + cols[-1]) / 2, cols[-1] - cols[0] + 1, end
    rcx, rw, rend = socket(ref)
    rband = band_row(ref)
    gap = round(0.03 * H) * (-1 if hang else 1)  # the socket starts this far past the band
    for name, (img, _) in zip(names, cut(unkey(np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))), len(names), hang)):
        if name == "-":
            continue
        if name.startswith("!"):
            name, img = name[1:], img.transpose(Image.FLIP_LEFT_RIGHT)
        cx, w, end = socket(img)
        k = rw / w
        big = ART.resize(img, (round(img.width * k), round(img.height * k)))
        dy = rband - band_row(big)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(big, (round(rcx - cx * k), dy))
        # the socket from just past the band to its end, stretched onto the reference's
        cut_row, own_end = rband + gap, round(end * k) + dy
        lo, hi = sorted((cut_row, own_end))
        part = Image.new("RGBA", (W, hi - lo + 1), (0, 0, 0, 0))
        part.paste(big, (round(rcx - cx * k), dy - lo))
        tlo, thi = sorted((cut_row, rend))
        canvas.paste((0, 0, 0, 0), (0, 0, W, thi + 1) if hang else (0, tlo, W, H))
        canvas.paste(ART.resize(part, (W, thi - tlo + 1)), (0, tlo))
        put(manifest, name, canvas, raw, GRIP_QUALITY if hang else QUALITY)
        light, band = marks(canvas)
        rows = np.nonzero((np.asarray(canvas.getchannel("A")) > 128).any(1))[0]
        tip = rows[-1] if hang else rows[0]
        print(f"  light {light}  band {band}  tip {tip / H:.3f}  scale {k:.3f}")


def open_loop(manifest: dict, name: str = "gift-amulet", seed=(0.49, 0.26)):
    """The cord loop of the amulet was filled white in the 5.16 picture: on the bird's chest it read as a white blot.
    The white inside the loop (the region connected to `seed`) becomes transparent; its 3 px edge is unmixed from white."""
    raw = (ART.OUT / f"{name}.webp").read_bytes()
    p = np.asarray(Image.open(io.BytesIO(raw)).convert("RGBA")).astype(np.float64)
    h, w = p.shape[:2]
    lo, hi = p[..., :3].min(axis=2), p[..., :3].max(axis=2)
    hole = ((lo > 150) & (hi - lo < 40)) | (p[..., 3] < 8)  # the white fill and its grey shading; the cord is gold
    region = np.zeros((h, w), bool)
    region[round(seed[1] * h), round(seed[0] * w)] = True
    while True:  # flood fill inside the cord
        grown = region.copy()
        grown[1:] |= region[:-1]; grown[:-1] |= region[1:]; grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= hole
        if (grown == region).all():
            break
        region = grown
    if region[0].any() or region[-1].any() or region[:, 0].any() or region[:, -1].any():
        raise SystemExit(f"{name}: the loop is open — the fill reached the edge")
    near = region.copy()
    for _ in range(3):
        near[1:] |= near[:-1].copy(); near[:-1] |= near[1:].copy(); near[:, 1:] |= near[:, :-1].copy(); near[:, :-1] |= near[:, 1:].copy()
    edge = near & ~region
    f = np.where(edge, np.clip((lo - 90) / 165, 0, 0.97), 0)  # how much of an edge pixel is the fill: gold has little blue
    p[..., :3] = np.where(edge[..., None], (p[..., :3] - 255 * f[..., None]) / (1 - f[..., None]), p[..., :3])
    p[..., 3] *= 1 - f
    p[region, 3] = 0
    put(manifest, name, Image.fromarray(np.clip(p, 0, 255).astype(np.uint8), "RGBA"), raw)
    print(f"{name}: {int(region.sum())} px of the loop opened, {int(edge.sum())} edge px unmixed")


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
    size = (round(width * height_px / height), height_px) if 0 < height_px < height else (width, height)  # never upscale
    for pose, img, cx in placed:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(img, (round(half - cx), 0 if hang else height - img.height))  # one baseline (or top), one centre line
        out = ART.resize(canvas, size) if size != canvas.size else canvas
        data = ART.webp(out, QUALITY)
        name = f"{prefix}{pose}"
        ART.write(ART.OUT / f"{name}.webp", data)
        manifest["items"][name] = {"w": out.width, "h": out.height, "bytes": len(data), "alpha": True, "sha256": ART.sha256(data), "source": ART.sha256(raw)}
        light, band = marks(out)
        print(f"{name:12s} {out.width}x{out.height} {len(data) / 1024:5.1f} KB  light {light}  band {band}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hands", help="the sheet of three hands on magenta")
    ap.add_argument("--flip", default="", help="poses drawn as a left hand (thumb on the right): mirrored to a right hand")
    ap.add_argument("--height", type=int, default=0, help="output height of the standing hands; 0 — the sheet's own size")
    ap.add_argument("--day")
    ap.add_argument("--night")
    ap.add_argument("--hanging", help="the sheet of three hands hanging from an arm (open, rest, fist) on magenta: «Мастерская»")
    ap.add_argument("--workshop-day")
    ap.add_argument("--workshop-night")
    ap.add_argument("--basket")
    ap.add_argument("--glider")
    ap.add_argument("--family", help="the standing sheet again: gesture-rest/fist/open, ico-hand, skin-*")
    ap.add_argument("--open-loop", action="store_true", help="make the white inside the amulet's cord transparent")
    ap.add_argument("--hang-grips", nargs=2, metavar=("SHEET", "NAMES"), help="hanging hands in other grips: hand-down-pinch,hand-down-key,…")
    ap.add_argument("--stand-grips", nargs=2, action="append", metavar=("SHEET", "NAMES"), help="standing hands in other grips: hand-pinch,…, «!» — mirror, «-» — skip")
    ap.add_argument("--pets", nargs=2, action="append", metavar=("SHEET", "NAMES"),
                    help="the bird in its nest: a 3 × 2 sheet on magenta, six names (pet-young-wave-nest …) or «-»")
    ap.add_argument("--icons", nargs=3, metavar=("SHEET", "NAMES", "SIZES"), help="objects on magenta → square icons")
    ap.add_argument("--tiles", nargs=3, metavar=("SHEET", "NAMES", "SIZE"), help="scenes on white → square tiles (day-*)")
    ap.add_argument("--cover", nargs=2, metavar=("NAME", "PNG"), help="an onboarding cover, 4 : 3")
    ap.add_argument("--scene", nargs=2, action="append", metavar=("NAME", "PNG"), help="a whole-field game scene (bg-flight-day …)")
    ap.add_argument("--gestures", nargs=3, action="append", metavar=("SHEET", "NAMES", "FLIP"),
                    help="a sheet of standing hands, their gesture ids left to right («-» skips), ids drawn as left hands")
    args = ap.parse_args()
    manifest = json.loads((ART.OUT / "manifest.json").read_text("utf-8"))
    if args.hands:
        hands(manifest, args.hands, args.flip, args.height)
    if args.hanging:
        hands(manifest, args.hanging, "", 0, "hand-down-", ("open", "rest", "close"), hang=True)
    rooms(manifest, {k: v for k, v in (("bg-duo-day", args.day), ("bg-duo-night", args.night),
                                       ("bg-grip-day", args.workshop_day), ("bg-grip-night", args.workshop_night)) if v})
    if args.basket:
        prop(manifest, "prop-basket", args.basket, 640)
    if args.glider:
        prop(manifest, "prop-glider", args.glider, 480)
    if args.family:
        hand_family(manifest, args.family)
    if args.open_loop:
        open_loop(manifest)
    if args.pets:
        pets(manifest, args.pets)
    if args.hang_grips:
        grips(manifest, args.hang_grips[0], args.hang_grips[1].split(","), True)
    for sheet, names in args.stand_grips or []:
        grips(manifest, sheet, names.split(","), False)
    if args.icons:
        icons(manifest, args.icons[0], args.icons[1].split(","), [int(x) for x in args.icons[2].split(",")])
    if args.tiles:
        tiles(manifest, args.tiles[0], args.tiles[1].split(","), int(args.tiles[2]))
    if args.cover:
        cover(manifest, *args.cover)
    if args.scene:
        rooms(manifest, dict(args.scene))
    for sheet, names, flip in args.gestures or []:
        gesture_icons(manifest, sheet, names.split(","), set(flip.split(",")) - {"-"})
    ART.write_catalogue(manifest)
    print(f"{len(manifest['items'])} pictures, {manifest['total_bytes'] / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
