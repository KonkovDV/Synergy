#!/usr/bin/env python3
"""Corrects the two pictures of the wrist deviations of the task's gesture set (6.3.2, docs/AUDIT.md §61, docs/ART.md).

docs/REGEN.md asks for: ADDUCTION — a right hand, palm to the viewer (thumb on the viewer's right), tilted towards the
little finger (the viewer's left), the arrow pointing left; ABDUCTION — the same hand tilted towards the thumb, the
arrow pointing right. The generator returned something else, and nobody compared the pictures with the prompt:

  gesture-adduction (6.3.1): the thumb on the LEFT (another hand), tilted to the right, the arrow to the left;
  gesture-abduction (6.3.1): the thumb on the right, tilted to the LEFT, the arrow to the right, a stray speck of the
                             removed background 77 px away from the hand.

So each picture leaned against its own arrow, the «adduction» arrow pointed at the thumb while the cue under it said
«в сторону мизинца», and the pair showed two different hands. Until the pictures are generated again, they are rebuilt
from what the generator did give:

  adduction := the hand of the old «abduction» (thumb right, tilted to the little finger) + the old «adduction» arrow (←);
  abduction := the upright hand of gesture-rest turned about the wrist towards the thumb + the old «abduction» arrow (→).

The inputs are checked by SHA-256, so the script refuses to run on anything but the three files of 6.3.1 (pass --src with
a folder that holds them: a checkout of 6.3.1 or tools/.cache). Deterministic: the same inputs give the same bytes.

  python3 tools/fix-deviation-art.py --src <folder with the 6.3.1 pictures> [--out public/art] [--preview sheet.png]
"""
import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = {  # SHA-256 of the pictures of 6.3.1 (public/art/manifest.json)
    "gesture-rest": "d2dd879875e803a6b383796b65ed4fdb343a77d21f04125668668ecb21d87ffd",
    "gesture-adduction": "a75fbbd2bf303aa0e3a1123b5aab232ee22f11da5c2b586896f435e84f90ffa2",
    "gesture-abduction": "8e4b016cda645b58508c8e3e65c731df4bcbe634743b3c624eb452d2b39e38b0",
}
TILT_DEG = 15      # how far the upright hand is turned towards the thumb (the old pictures lean 10–15°)
ARROW_GAP = 4      # px kept between the arrow and the fingertips
WEBP_QUALITY = 84  # the «gesture-» role of tools/import-art.py


def load(folder: Path, name: str) -> np.ndarray:
    data = (folder / f"{name}.webp").read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != ORIGINALS[name]:
        sys.exit(f"{name}.webp is not the picture of 6.3.1 (sha256 {digest[:12]}…): pass --src with the original files")
    return np.array(Image.open(io.BytesIO(data)).convert("RGBA")).astype(np.float32)


def components(mask: np.ndarray):
    """8-connected components of a boolean mask, largest first: [(area, labels == i)]. No OpenCV: a flood fill is enough."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    out, current = [], 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if labels[y0, x0]:
            continue
        current += 1
        stack, area = [(y0, x0)], 0
        labels[y0, x0] = current
        while stack:
            y, x = stack.pop()
            area += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not labels[yy, xx]:
                        labels[yy, xx] = current
                        stack.append((yy, xx))
        out.append((area, current))
    return [(area, labels == i) for area, i in sorted(out, reverse=True)]


def mint(img: np.ndarray) -> np.ndarray:
    """The mint green of the arrows and of the palm light (not the cyan of the wrist band: there blue ≥ green)."""
    r, g, b, a = (img[..., i] for i in range(4))
    return (a > 120) & (g > b + 18) & (g > 170) & (r < 190) & (g - r > 50)


def split(img: np.ndarray):
    """(the figure — the largest piece, the arrow — the mint piece detached from it), each an RGBA layer."""
    parts = components(img[..., 3] > 16)
    figure = parts[0][1]
    green = mint(img)
    arrow = next(m for area, m in parts[1:] if area > 100 and (m & green).sum() > 0.5 * area)
    layer = lambda m: img * m[..., None]
    return layer(figure), layer(arrow)


def bbox(layer: np.ndarray, level: float = 16):
    ys, xs = np.nonzero(layer[..., 3] > level)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def over(dst: np.ndarray, src: np.ndarray) -> np.ndarray:
    """`src` over `dst` (straight alpha, 0…255 floats)."""
    sa, da = src[..., 3:4] / 255, dst[..., 3:4] / 255
    oa = sa + da * (1 - sa)
    rgb = np.where(oa > 0, (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6), 0)
    return np.concatenate([rgb, oa * 255], axis=-1)


def shift(layer: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(layer)
    h, w = layer.shape[:2]
    xs0, xs1 = max(0, dx), min(w, w + dx)
    ys0, ys1 = max(0, dy), min(h, h + dy)
    out[ys0:ys1, xs0:xs1] = layer[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def rotate(layer: np.ndarray, deg: float, pivot) -> np.ndarray:
    """Turns a layer clockwise on the screen by `deg` about `pivot` (x, y); premultiplied bicubic, so no fringe."""
    pm = layer.copy()
    pm[..., :3] *= pm[..., 3:4] / 255
    img = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA")
    # PIL turns counter-clockwise for a positive angle; `center` is the fixed point.
    turned = np.array(img.rotate(-deg, resample=Image.BICUBIC, center=pivot)).astype(np.float32)
    alpha = turned[..., 3:4]
    turned[..., :3] = np.where(alpha > 0, turned[..., :3] * 255 / np.maximum(alpha, 1e-6), 0)
    return np.clip(turned, 0, 255)


def band_top(img: np.ndarray):
    """The cyan wrist band: (its top row, its centre x)."""
    r, g, b, a = (img[..., i] for i in range(4))
    band = (a > 200) & (r < 130) & (b >= g - 8) & (b > 150) & (g > 120)
    area, m = components(band)[0]
    ys, xs = np.nonzero(m)
    return int(ys.min()), float(xs.mean())


def place_arrow(figure: np.ndarray, arrow: np.ndarray, side: int) -> np.ndarray:
    """
    Puts the arrow beside the fingertips on the side it points to (`side` −1 left, +1 right): as low as it goes without
    coming within ARROW_GAP of the hand, over the outer third of the hand's top.
    """
    ax0, ay0, ax1, ay1 = bbox(arrow)
    aw, ah = ax1 - ax0, ay1 - ay0
    piece = arrow[ay0:ay1, ax0:ax1]
    fx0, fy0, fx1, fy1 = bbox(figure)
    solid = figure[..., 3] > 16
    h, w = solid.shape
    # most of the arrow is outside the hand's outline on its side: beside the fingertips, not on top of them
    x = (fx0 - round(aw * 0.6)) if side < 0 else (fx1 - round(aw * 0.4))
    x = int(min(max(x, 2), w - aw - 2))
    best = 2
    for y in range(2, fy0 + 26):  # not lower than the fingertips of the hand's outer side
        y0, y1 = max(0, y - ARROW_GAP), min(h, y + ah + ARROW_GAP)
        x0, x1 = max(0, x - ARROW_GAP), min(w, x + aw + ARROW_GAP)
        if solid[y0:y1, x0:x1].any():
            break
        best = y
    out = np.zeros_like(figure)
    out[best:best + ah, x:x + aw] = piece
    return out


def lower_figure(figure: np.ndarray, room: int = 10) -> np.ndarray:
    """The figure a little lower, as far as the square lets it: room over the fingertips for the arrow."""
    return shift(figure, 0, max(0, min(room, figure.shape[0] - 2 - bbox(figure)[3])))


def centre(img: np.ndarray) -> np.ndarray:
    """The picture's content in the middle of the square, horizontally (the old pair sat 21 and 47 px off it)."""
    x0, _, x1, _ = bbox(img)
    return shift(img, round((img.shape[1] - (x0 + x1)) / 2), 0)


def adduction(a_old: np.ndarray, b_old: np.ndarray) -> np.ndarray:
    figure, _ = split(a_old)   # thumb on the right, tilted towards the little finger: what the prompt asked for
    figure = lower_figure(figure)
    _, arrow = split(b_old)    # points left
    return centre(over(figure, place_arrow(figure, arrow, -1)))


def abduction(rest: np.ndarray, a_old: np.ndarray) -> np.ndarray:
    figure = components(rest[..., 3] > 16)[0][1]
    rest = rest * figure[..., None]
    top, cx = band_top(rest)
    hand = rest.copy()
    hand[top:] = 0
    # the base of the palm goes on a little under the band, so the turn opens no gap on the side that rises
    for y in range(top, min(top + 12, hand.shape[0])):
        hand[y] = rest[top - 1] * (rest[top - 1, :, 3:4] > 16)
    lower = rest.copy()
    lower[:top - 1] = 0
    turned = rotate(hand, TILT_DEG, (cx, top + 1))
    body = lower_figure(over(turned, lower))
    _, arrow = split(a_old)    # points right
    return centre(over(body, place_arrow(body, arrow, +1)))


def encode(img: np.ndarray) -> bytes:
    out = np.clip(img, 0, 255).astype(np.uint8)
    out[out[..., 3] < 8] = 0  # no invisible leftovers
    buf = io.BytesIO()
    Image.fromarray(out, "RGBA").save(buf, "WEBP", quality=WEBP_QUALITY, method=6, alpha_quality=90)
    return buf.getvalue()


def preview(path: Path, pictures: dict):
    """The pictures side by side on a light and a dark ground, twice the size — for the eye."""
    names = list(pictures)
    tile = 256 * 2
    sheet = Image.new("RGB", (tile * len(names), tile * 2), (0, 0, 0))
    for row, ground in enumerate(((236, 241, 245), (16, 26, 36))):
        for col, name in enumerate(names):
            im = Image.open(io.BytesIO(pictures[name])).convert("RGBA").resize((tile, tile), Image.LANCZOS)
            bg = Image.new("RGBA", im.size, ground + (255,))
            bg.alpha_composite(im)
            sheet.paste(bg.convert("RGB"), (col * tile, row * tile))
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", type=Path, required=True, help="folder with gesture-rest/adduction/abduction.webp of 6.3.1")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "art")
    ap.add_argument("--preview", type=Path, help="write a contact sheet of the result here")
    args = ap.parse_args()
    rest, add_old, abd_old = (load(args.src, n) for n in ("gesture-rest", "gesture-adduction", "gesture-abduction"))
    made = {"gesture-adduction": encode(adduction(abd_old, add_old)), "gesture-abduction": encode(abduction(rest, abd_old))}
    args.out.mkdir(parents=True, exist_ok=True)
    for name, data in made.items():
        (args.out / f"{name}.webp").write_bytes(data)
        print(f"{name}.webp: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")
    manifest_path = args.out / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text("utf-8"))
        for name, data in made.items():
            item = manifest["items"][name]
            manifest["total_bytes"] += len(data) - item["bytes"]
            item.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            item["fixed"] = "tools/fix-deviation-art.py (6.3.2): tilt towards the arrow, one hand in both pictures"
        manifest_path.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=1) + "\n").encode())
        print("manifest.json updated")
        # the generated catalogue of the app carries the total too (tools/import-art.py writes it; tests/v516 compares)
        catalogue = ROOT / "src" / "ui" / "art-manifest.js"
        if args.out.resolve() == (ROOT / "public" / "art").resolve() and catalogue.exists():
            text = catalogue.read_text("utf-8")
            catalogue.write_text(re.sub(r"export const ART_BYTES = \d+;", f"export const ART_BYTES = {manifest['total_bytes']};", text), "utf-8")
            print("src/ui/art-manifest.js: ART_BYTES updated")
    if args.preview:
        preview(args.preview, {"gesture-rest": (args.src / "gesture-rest.webp").read_bytes(), **made})
        print(f"preview: {args.preview}")


if __name__ == "__main__":
    main()
