"""Whole pictures instead of collages (29.10.2026, docs/GAME_VISUALS.md §12, docs/REGEN.md).

The audit of 29.10 found pictures made of two or three separate pictures that read wrong: the Firebird with a thing laid
on it (a kokoshnik slid off the crest, a lantern hanging in the air, another light and scale), the hand of «Мастерская»
with a thing laid under its fingertips (the egg hung under the fingers, nothing held it), the hanging pinch, key and
point stitched from the arm of one picture and the hand of another, and the seven states of the task's gesture set drawn
by code as small dark hands. Each is generated again as ONE picture, by the team in an image generator, from the jobs
below: a prompt, the reference picture to attach (made here from the catalogue, so the design stays the same) and the
names the cells become.

  python tools/regen.py --refs DIR        the reference pictures, one per job (DIR/<job>.jpg)
  python tools/regen.py --docs            docs/REGEN.md and tools/regen-jobs.json (the prompts, the names)
  python tools/regen.py --import DIR      every DIR/<job>.png|jpg|webp: cut, keyed, matched to the catalogue, written
  python tools/regen.py --import DIR --flip hold-coin,hand-down-key   cells drawn as a left hand, mirrored

The key is the flat magenta of the other generated pictures (tools/import-generated.py unkey); a PNG with a real alpha
channel (a generator can give a transparent background) is taken as it is. Every picture is matched to what it replaces or
stands beside, so nothing jumps when it appears: a bird in its look on the nest of the bird without it (nest width,
centre and bottom), a hand holding a thing on the arm of the hanging hands (arm width and axis), a hanging grip on the
wrist band and the socket of the hanging hands. Prints what the game needs that it cannot measure itself.
Needs Python 3.10+, Pillow, NumPy.
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
SPEC = importlib.util.spec_from_file_location("import_generated", ROOT / "tools" / "import-generated.py")
GEN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GEN)
ART = GEN.ART
KEY = (255, 0, 255)

# ---------- the jobs ----------

HAND = ("a right-hand bionic prosthetic hand with a glossy white shell, matte dark graphite finger joints and fingertip pads, "
        "a small round softly glowing mint-green (#16E182) sensor light in the centre of the palm, a slim cyan (#25C2C4) band "
        "at the wrist and a white forearm socket")
STYLE = "Soft 3D clay render, rounded geometric shapes, studio lighting from the top left, clean and friendly, high detail."
PET_STYLE = ("Style: cute stylised 3D character illustration, soft clay and vinyl-toy render, smooth matte surfaces with a subtle soft "
             "feather texture, rounded shapes, pastel mint-teal palette with warm coral and gold accents, soft studio light from the "
             "top left, gentle ambient occlusion, high detail, friendly.")
BACKGROUND = ("Background: a perfectly flat solid magenta (#FF00FF) chroma-key colour in every cell and between the cells — no "
              "shadows on the background, no floor, no gradient, no grid lines, no frames, no reflections of the magenta on the "
              "subject, no text, no labels, no numbers, no logo, no watermark.")


def sheet(cols: int, rows: int) -> str:
    return (f"One landscape image, 3:2. A sheet of {cols * rows} pictures in a grid of {cols} columns × {rows} rows, each "
            "centred in its own equal cell. Every subject is complete, sits inside its cell with wide empty margins and never "
            "touches or crosses a cell border.")


# What each thing of the Firebird looks like (the gift pictures, public/art/gift-*.webp) and how it is worn.
THINGS = {
    "bow": ("a sky-blue ribbon bow with mint edges", "a small sky-blue ribbon bow with mint edges on the top of its head, at the side of its crest"),
    "wreath": ("a mint headband wreath of white and pale-yellow daisies and small sky-blue flowers",
               "a small mint wreath of white and pale-yellow daisies and tiny sky-blue flowers resting on its head around the base of its crest"),
    "star": ("a glossy golden five-point star with a soft glow", "a small glossy golden five-point star with a soft glow on its forehead, just above the eyes"),
    "kokoshnik": ("a mint-teal kokoshnik headdress: a tall rounded arch with golden swirl ornaments and small white pearls along its edge",
                  "a small mint-teal kokoshnik headdress with golden swirl ornaments and white pearls along its edge, standing upright on its head "
                  "in front of the crest, the crest feathers rising behind it"),
    "amulet": ("a round golden amulet with a teal enamel centre and a little golden four-petal flower, on a thin golden cord",
               "a round golden amulet with a teal enamel centre and a little golden flower on a thin golden cord around its neck, lying on its chest"),
    "beads": ("a string of small glossy beads in mint, sky blue and gold", "a necklace of small glossy mint, sky-blue and gold beads around its neck, lying on its chest"),
    "apples": ("three glossy golden-yellow apples with small mint leaves", "three small glossy golden-yellow apples with mint leaves lying on the front rim of the nest, in front of the bird"),
    "lantern": ("a small mint-teal lantern with a handle and a warm glowing cream light inside",
                "a small mint-teal lantern with a handle and a warm glowing light standing in the nest beside the bird, on the viewer's right"),
    "book": ("a small open book with cream pages, a mint-green cover and a little golden star on its bookmark",
             "a small open book with cream pages and a mint-green cover leaning on the front rim of the nest, on the viewer's left"),
}
STAGES = {
    "egg": ("egg", "the same egg", ["apples", "lantern", "book"]),
    "chick": ("chick", "the same newly hatched chick", ["bow", "wreath", "star", "kokoshnik", "apples", "lantern", "book"]),
    "fledgling": ("fledgling", "the same fledgling", ["bow", "wreath", "star", "kokoshnik", "amulet", "beads", "apples", "lantern", "book"]),
    "young": ("young firebird", "the same young firebird", ["bow", "wreath", "star", "kokoshnik", "amulet", "beads", "apples", "lantern", "book"]),
    "firebird": ("grown firebird", "the same grown firebird", ["bow", "wreath", "star", "kokoshnik", "amulet", "beads", "apples", "lantern", "book"]),
}
MOODS = ["happy", "waiting"]  # the rows of a sheet; asleep the bird takes its look off (ui/pictures.js)
# the chick every new player raises in the first days, the young bird of the demo profile (core/showcase.js)
FIRST_STAGES = ("chick", "young")
STAGE_RU = {"egg": "яйцо", "chick": "птенец", "fledgling": "подлёток", "young": "юная", "firebird": "жар-птица"}
THING_RU = {"bow": "бант", "wreath": "венок", "star": "звезда во лбу", "kokoshnik": "кокошник", "amulet": "оберег", "beads": "бусы",
            "apples": "молодильные яблоки", "lantern": "фонарик", "book": "азбука"}
WEARS = lambda look, stage: THINGS[look][1] if stage != "egg" else THINGS[look][1].replace("the bird", "the egg")  # noqa: E731

# The things of «Мастерская» (src/games/grip.js OBJECTS; tea is drawn in the cup) and how the hand holds each.
POWER = ("in a firm power grip: the four fingers wrap around it from the front and the sides, the fingertips curl under its middle "
         "and the thumb holds the other side, parts of it show between the fingers")
PINCH = "in a precision pinch between the tip of the thumb and the tip of the index finger, the other three fingers gently curled"
KEYGRIP = ("in a lateral key grip: the four fingers curled into the palm, the thing clamped between the pad of the thumb and the side of "
           "the bent index finger, most of it hanging below the hand")
HOLDS = [
    ("sponge", "the yellow kitchen sponge with a mint top", POWER), ("apple", "the red apple with a green leaf", POWER),
    ("egg", "the white egg", POWER + ", gently, without squeezing"), ("cup", "the white paper cup with a mint stripe", POWER),
    ("can", "the orange can with a white band", POWER), ("dumbbell", "the small grey dumbbell, held by its handle", POWER),
    ("cube", "the cornflower-blue toy cube", POWER), ("coin", "the golden coin with a star, held upright facing the viewer", PINCH),
    ("berry", "the raspberry", PINCH + ", without squeezing"), ("ring", "the chunky glossy yellow-orange toy ring", PINCH),
    ("card", "the light-blue bank card with a gold chip", KEYGRIP), ("key", "the golden key", KEYGRIP),
]

GESTURE_CELLS = [
    ("rest", "NEUTRAL — the hand upright on its socket, palm facing the viewer, relaxed: the fingers gently bent about forty degrees and "
             "loosely together, the thumb relaxed beside the index finger; no arrow"),
    ("flexion", "FLEXION — seen from the side, the thumb side towards the viewer, the forearm upright; the hand bent forward at the wrist "
                "about sixty degrees towards the palm side, the fingers relaxed and slightly curled; a curved arrow along the bend, "
                "pointing forward and down"),
    ("extension", "EXTENSION — seen from the side like the previous one; the hand bent backwards at the wrist about fifty degrees "
                  "towards the back of the hand, the fingers straight; a curved arrow along the bend, pointing back and down"),
    ("pronation", "PRONATION — the forearm lying horizontally and pointing to the right, seen from the side; the palm faces down to the "
                  "floor; a curved arrow wraps around the wrist and shows the palm turning down"),
    ("supination", "SUPINATION — like the previous one, but the palm faces up to the ceiling, as if a coin lay on it; a curved arrow "
                   "wraps around the wrist the other way and shows the palm turning up"),
    ("adduction", "ADDUCTION — the hand upright, palm facing the viewer, tilted sideways at the wrist about thirty degrees towards the "
                  "little finger, to the viewer's left (a right hand facing the viewer has its thumb on the viewer's right); a short "
                  "curved arrow beside the fingertips points to the left"),
    ("abduction", "ABDUCTION — like the previous one, but tilted towards the thumb, to the viewer's right; a short curved arrow beside "
                  "the fingertips points to the right"),
    ("coact", "COACTIVATION — the hand upright, palm facing the viewer, clenched into a firm fist; two thin glowing rings around the "
              "forearm socket just below the wrist band, one coral (#FF7A45) and one sky blue (#5AC8FA), both lit; no arrow"),
]


def gesture_job() -> dict:
    cells = "\n".join(f"{i + 1}) {text}." for i, (_, text) in enumerate(GESTURE_CELLS))
    return {
        "id": "tz-gestures", "priority": 1, "kind": "gestures", "grid": [4, 2],
        "title": "Жесты ТЗ: нейтраль, шесть движений кисти, коактивация",
        "why": "В наборе ТЗ (по умолчанию) шесть жестов из семи рисовались кодом — маленькие тёмные кисти со стрелками; коактивация в «Сейфе» — тоже.",
        "names": [f"gesture-{g}" for g, _ in GESTURE_CELLS],
        "ref": {"top": ["hand-rest", "hand-close", "hand-open"]},
        "attach": "Эталон: кисть игры стоя — покой, кулак, ладонь.",
        "prompt": (f"{sheet(4, 2)} The attached reference shows the bionic hand of the game: copy its design exactly in every cell — "
                   f"{HAND}. The same hand, the same size and the same light in every cell, shown from the forearm socket to the "
                   "fingertips. Each cell shows one wrist movement of a prosthesis training game; where it says so, a thick glossy "
                   "mint-green (#16E182) curved arrow with a rounded head floats beside the hand and shows the direction of the "
                   "movement — simple and bold, readable at 48 pixels. Top row, then bottom row, left to right:\n"
                   f"{cells}\n{STYLE} {BACKGROUND}"),
    }


def hold_jobs() -> list[dict]:
    jobs = []
    for n, part in enumerate((HOLDS[:6], HOLDS[6:])):
        things = "; ".join(f"{i + 1}) {what}, held {how}" for i, (_, what, how) in enumerate(part))
        jobs.append({
            "id": f"hold-{n + 1}", "priority": 1, "kind": "holds", "grid": [3, 2],
            "title": f"Мастерская: кисть держит предмет ({n + 1} из 2)",
            "why": "Кисть и предмет были двумя картинками: предмет висел под кончиками пальцев, пальцы его не обхватывали.",
            "names": [f"hold-{k}" for k, _, _ in part],
            "ref": {"top": ["hand-down-open", "hand-down-rest", "hand-down-close"], "bottom": [f"obj-{k}" for k, _, _ in part]},
            "attach": "Эталон: висящая кисть (ладонь, покой, кулак) и шесть предметов.",
            "prompt": (f"{sheet(3, 2)} The attached reference shows, in its top row, the bionic hand of the game hanging from above "
                       "(open, relaxed, fist) and, in its bottom row, the six things it holds. In every cell the SAME hand — "
                       f"{HAND} — hangs straight down from above: its white forearm socket enters exactly vertically from the top edge of "
                       "the cell, centred in the cell, the palm facing the viewer, the same size in every cell. The hand holds one thing, "
                       "copied exactly from the reference — its shape, colours and size next to the hand. Top row, then bottom row, left "
                       f"to right: {things}. The thing does not float: it is clearly held, the fingers in front of it where they wrap it. "
                       f"{STYLE} {BACKGROUND}"),
        })
    return jobs


def grip_job() -> dict:
    return {
        "id": "hang-grips", "priority": 2, "kind": "hang-grips", "grid": [3, 1],
        "title": "Мастерская: висящая кисть — щепоть, ключ, указательный",
        "why": "Эти три кисти склеены: предплечье от одной картинки, кисть ниже полосы — от другой.",
        "names": ["hand-down-pinch", "hand-down-key", "hand-down-point"],
        "ref": {"top": ["hand-down-open", "hand-down-rest", "hand-down-close"]},
        "attach": "Эталон: висящая кисть игры — ладонь, покой, кулак.",
        "prompt": ("One landscape image, 3:2. Premium product render of three identical right-hand bionic prosthetic hands hanging "
                   "straight down from above side by side in one row, fingers pointing down toward the floor, copied exactly from the "
                   "attached reference — the same design, the same size, the same straight front camera angle with the palm facing the "
                   "viewer, the same long white forearm socket entering from the top edge of the image; evenly spaced with wide empty "
                   "gaps between them, each fully visible down to the fingertips. Left hand: precision pinch — the tips of the thumb and "
                   "the index finger touch and form a small rounded ring, the middle, ring and little fingers gently curved and relaxed. "
                   "Middle hand: lateral key grip — the four fingers curled into the palm, the pad of the thumb pressed flat against the "
                   "side of the bent index finger, as when holding a key. Right hand: index point — the index finger straight and pointing "
                   f"down, the other three fingers curled into the palm, the thumb folded over the middle finger. Every hand: {HAND}. "
                   f"{STYLE} {BACKGROUND}"),
    }


def look_jobs() -> list[dict]:
    """Three looks of one stage per sheet: columns — the looks, rows — the overjoyed and the calm bird (asleep it takes
    its look off, ui/pictures.js). A last sheet with fewer looks fills its columns with second takes of the last one."""
    jobs = []
    for stage, (noun, same, looks) in STAGES.items():
        for n in range(0, len(looks), 3):
            three = looks[n:n + 3]
            cols = three + [three[-1]] * (3 - len(three))
            takes = len(three) < 3
            things = "; ".join(f"{['left', 'middle', 'right'][i]} — {THINGS[k][0]}" for i, k in enumerate(three))
            wears = "; ".join(f"{['left', 'middle', 'right'][i]} — with {WEARS(k, stage)}" for i, k in enumerate(cols))
            jobs.append({
                "id": f"pet-{stage}-{n // 3 + 1}", "priority": 1 if stage in FIRST_STAGES else 2, "kind": "looks", "grid": [3, 2],
                "title": f"Жар-птица в гнезде, {STAGE_RU[stage]}: " + ", ".join(THING_RU[k] for k in three),
                "why": "Вещь лежала на птице отдельной картинкой: другой свет и масштаб, кокошник съезжал с хохолка, фонарик висел в воздухе.",
                "names": [f"pet-{stage}-{m}-nest-{k}" if i < len(three) else "-" for m in MOODS for i, k in enumerate(cols)],
                "ref": {"top": [f"pet-{stage}-{m}-nest" for m in MOODS], "bottom": [f"gift-{k}" for k in three]},
                "attach": "Эталон: птица этой стадии в гнезде (радость, спокойная) и вещи листа.",
                "prompt": (f"{sheet(3, 2)} The attached reference shows, in its top row, {same} sitting in its nest — left: overjoyed with "
                           "its wings raised, right: awake and calm — and, in its bottom row, the things to wear: "
                           f"{things}. Copy the character, its nest, the two moods, the camera, the scale and the light EXACTLY from the "
                           f"reference. Top row: the overjoyed {noun} of the reference three times; bottom row: the calm {noun} of the "
                           f"reference three times. Each column wears one thing — {wears}"
                           + (" (the repeated columns are second takes of the same picture)" if takes else "") + ". "
                           "The thing is part of the picture, not a sticker: it sits naturally where it belongs, follows the shape of the "
                           "head or the chest, has the same soft light and shading as the bird and the right size for it; nothing else "
                           "changes. In every cell the nest is centred horizontally, has the same size (about 60 % of the cell width) and its "
                           f"bottom is at the same height, just above the bottom of the cell. {PET_STYLE} {BACKGROUND}"),
            })
    return jobs


def flight_jobs() -> list[dict]:
    jobs = []
    for stage in ("fledgling", "young", "firebird"):
        noun, same, _ = STAGES[stage]
        looks = ["bow", "wreath", "star", "kokoshnik", "amulet", "beads"]
        cells = "; ".join(f"{i + 1}) with {THINGS[k][1].replace(', lying on its chest', ' on its chest')}" for i, k in enumerate(looks))
        jobs.append({
            "id": f"fly-{stage}", "priority": 3, "kind": "flight", "grid": [3, 2],
            "title": f"Полёт: {STAGE_RU[stage]} в наряде",
            "why": "В «Полёте» вещь дорисовывалась на летящую птицу отдельной картинкой.",
            "names": [f"pet-{stage}-happy-{k}" for k in looks],
            "ref": {"top": [f"pet-{stage}-happy"], "bottom": [f"gift-{k}" for k in looks]},
            "attach": "Эталон: радостная птица этой стадии (крылья вверх) и шесть вещей.",
            "prompt": (f"{sheet(3, 2)} The attached reference shows, at the top, {same} overjoyed with its wings raised high, and below it six "
                       "things. In every cell copy the bird of the reference EXACTLY — the design, the pose with raised wings, the camera, "
                       f"the scale, the light — with one thing worn, the thing copied from the reference. Top row, then bottom row, left to "
                       f"right: {cells}. The thing is part of the picture, not a sticker: it sits naturally, follows the shape of the head or "
                       f"the chest and has the same soft light as the bird. No nest. {PET_STYLE} {BACKGROUND}"),
        })
    return jobs


def jobs() -> list[dict]:
    return [gesture_job(), *hold_jobs(), *look_jobs(), grip_job(), *flight_jobs()]


# ---------- the reference pictures ----------

def art(name: str) -> Image.Image:
    return Image.open(ART.OUT / f"{name}.webp").convert("RGBA")


def reference(job: dict, size=(1536, 1024)) -> Image.Image:
    """The pictures the job builds on, on the magenta of the sheet: the top row big, the bottom row (things) smaller."""
    W, H = size
    canvas = Image.new("RGB", size, KEY)
    rows = [r for r in (job["ref"].get("top"), job["ref"].get("bottom")) if r]
    heights = [H * (0.62 if len(rows) == 2 else 0.9), H * 0.3] if len(rows) == 2 else [H * 0.9]
    y = (H - sum(heights) - (24 if len(rows) == 2 else 0)) / 2
    for names, h in zip(rows, heights):
        pics = [art(n) for n in names]
        cell = W / max(3, len(pics)) if len(pics) > 1 else W / 3
        for i, pic in enumerate(pics):
            k = min((cell - 40) / pic.width, (h - 20) / pic.height)
            pic = ART.resize(pic, (max(1, round(pic.width * k)), max(1, round(pic.height * k))))
            # the bottom row of things sits under the columns of the top row (two things — under the left and right columns)
            n = len(pics)
            slots = [W / 2] if n == 1 else [W / 6, 5 * W / 6] if n == 2 else [cell * (i2 + 0.5) + (W - cell * n) / 2 for i2 in range(n)]
            cx = slots[i]
            canvas.paste(pic, (round(cx - pic.width / 2), round(y + (h - pic.height) / 2)), pic)
        y += h + 24
    return canvas


# ---------- the import ----------

def keyed(raw: bytes) -> np.ndarray:
    """RGBA: a picture with a real alpha channel as it is, else the magenta key divided out."""
    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "LA") or "transparency" in img.info:
        rgba = np.asarray(img.convert("RGBA"))
        if (rgba[..., 3] < 250).mean() > 0.05:
            return rgba
    return GEN.unkey(np.asarray(img.convert("RGB")))


def box(a: np.ndarray, min_px: int = 3) -> tuple[int, int, int, int] | None:
    """Rows and columns that hold the subject (a few stray key pixels are not the subject): y0, y1, x0, x1 (exclusive)."""
    rows = np.nonzero((a > 128).sum(1) >= min_px)[0]
    cols = np.nonzero((a > 128).sum(0) >= min_px)[0]
    if not len(rows) or not len(cols):
        return None
    return int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1


def trimmed(cell: np.ndarray) -> np.ndarray:
    b = box(cell[..., 3])
    assert b, "an empty cell"
    y0, y1, x0, x1 = b
    return cell[y0:y1, x0:x1]


def square(img: Image.Image, size: int, margin: float = 1.1) -> Image.Image:
    side = int(max(img.size) * margin)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return ART.resize(sq, (size, size))


def flipped(name: str, img: Image.Image, flips: set[str]) -> Image.Image:
    return img.transpose(Image.FLIP_LEFT_RIGHT) if name in flips else img


def import_gestures(manifest: dict, job: dict, raw: bytes, flips: set[str]):
    cells = GEN.grid_cells(keyed(raw), *job["grid"])
    for name, cell in zip(job["names"], cells):
        if name != "-":
            GEN.put(manifest, name, square(flipped(name, Image.fromarray(trimmed(cell), "RGBA"), flips), 256), raw)


def arm(a: np.ndarray, rows=(2, 30)) -> tuple[float, int]:
    """The axis and the width of a hanging arm: its top rows."""
    top = a[rows[0]:rows[1]] > 128
    cols = np.nonzero(top.any(0))[0]
    return (cols[0] + cols[-1]) / 2, int(cols[-1] - cols[0] + 1)


def components(mask: np.ndarray) -> list[np.ndarray]:
    """The 4-connected parts of a mask, biggest first, each as an array of flat indices."""
    h, w = mask.shape
    flat = mask.ravel().copy()
    parts = []
    for start in np.flatnonzero(flat):
        if not flat[start]:
            continue
        flat[start] = False
        stack, part = [int(start)], []
        while stack:
            i = stack.pop()
            part.append(i)
            y, x = divmod(i, w)
            for j in ((i - w) if y else -1, (i + w) if y < h - 1 else -1, (i - 1) if x else -1, (i + 1) if x < w - 1 else -1):
                if j >= 0 and flat[j]:
                    flat[j] = False
                    stack.append(j)
        parts.append(np.array(part))
    return sorted(parts, key=len, reverse=True)


def thing_mask(p: np.ndarray, band: int) -> np.ndarray:
    """The thing in a hand holding it: bright coloured pixels — the shell is white, the joints graphite, the palm light a
    small dot — away from the cyan wrist band; its big parts only, with the highlights they enclose. Empty when the thing
    is as pale as the shell (the egg, the cup, the dumbbell): then only the plain skin holds it whole (src/games/grip.js)."""
    rgb = p[..., :3].astype(np.float64) / 255
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    solid = p[..., 3] > 128
    m = solid & (sat > 0.24) & (mx > 0.35)
    h = len(p)
    m[max(0, band - h // 30):band + h // 30] = False  # the cyan band is not a thing
    parts = components(m)
    if not parts or len(parts[0]) < 0.015 * solid.sum():
        return np.zeros_like(m)
    keep = np.zeros(m.size, bool)
    for part in parts:
        if len(part) >= 0.2 * len(parts[0]):
            keep[part] = True
    m = keep.reshape(m.shape)
    # the highlights the thing encloses: everything the outside cannot reach
    out = ~m
    seen = np.zeros_like(m)
    seen[0, :] = out[0, :]; seen[-1, :] = out[-1, :]; seen[:, 0] = out[:, 0]; seen[:, -1] = out[:, -1]
    while True:
        grown = seen.copy()
        grown[1:] |= seen[:-1]; grown[:-1] |= seen[1:]; grown[:, 1:] |= seen[:, :-1]; grown[:, :-1] |= seen[:, 1:]
        grown &= out
        if (grown == seen).all():
            break
        seen = grown
    return ~seen & solid


def import_holds(manifest: dict, job: dict, raw: bytes, flips: set[str], centres: dict):
    ref = np.asarray(art("hand-down-rest"))
    H = ref.shape[0]
    _, ref_w = arm(ref[..., 3])
    cells = GEN.grid_cells(keyed(raw), *job["grid"])
    for name, cell in zip(job["names"], cells):
        if name == "-":
            continue
        img = flipped(name, Image.fromarray(trimmed(cell), "RGBA"), flips)
        a = np.asarray(img)[..., 3]
        cx, w = arm(a)
        k = ref_w / w
        big = ART.resize(img, (round(img.width * k), round(img.height * k)))
        half = max(cx * k, big.width - cx * k, ref.shape[1] / 2) + 4
        canvas = Image.new("RGBA", (int(np.ceil(half * 2)), big.height + 4), (0, 0, 0, 0))
        canvas.paste(big, (round(half - cx * k), 0))
        p = np.asarray(canvas)
        band = GEN.band_row(canvas)
        mask = thing_mask(p, band)
        if name in centres:
            ox, oy = centres[name][0] * canvas.width, centres[name][1] * canvas.height
        elif mask.any():
            ys, xs = np.nonzero(mask)
            ox, oy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        else:  # a pale thing: its centre a little above the lowest point of the picture, under the fingers
            b = box(p[..., 3])
            ox, oy = half, b[1] - 0.12 * H
        GEN.put(manifest, name, canvas, raw)
        if mask.any():
            obj = p.copy()
            obj[~mask, 3] = 0
            GEN.put(manifest, f"{name}-obj", Image.fromarray(obj, "RGBA"), raw)
        meta = [round(float(v), 4) for v in ((ox - half) / H, oy / H, canvas.width / H, canvas.height / H, band / canvas.height)]
        manifest.setdefault("holds", {})[name] = meta
        print(f"  {name}: thing at {meta[:2]}, picture {meta[2:4]}, band {meta[4]}" + ("" if mask.any() else "  (pale thing: no cut-out — only the plain skin holds it whole)"))


def import_hang_grips(manifest: dict, job: dict, raw: bytes, flips: set[str]):
    """Whole hanging grips laid on the hanging hands: the same wrist width, the band on the same row, the arm's own top rows
    stretched up to the top edge if it is shorter; fingers that reach past the frame make the hand a little smaller about the band."""
    ref_img = art("hand-down-rest")
    ref = np.asarray(ref_img)
    H, W = ref.shape[:2]
    rband = GEN.band_row(ref_img)
    rcx, _ = arm(ref[..., 3])
    rows = np.nonzero((ref[rband - 2:rband + 3, :, 3] > 128).any(0))[0]
    rww = rows[-1] - rows[0] + 1
    hands = GEN.cut(keyed(raw), len(job["names"]), True)
    for name, (img, _) in zip(job["names"], hands):
        img = flipped(name, img, flips)
        a = np.asarray(img)[..., 3] > 128
        band = GEN.band_row(img)
        cols = np.nonzero(a[band - 2:band + 3].any(0))[0]
        wx, ww = (cols[0] + cols[-1]) / 2, cols[-1] - cols[0] + 1
        k = rww / ww
        reach = (np.nonzero(a.any(1))[0][-1] - band) * k
        k *= min(1.0, (0.985 * H - rband) / reach)
        big = ART.resize(img, (round(img.width * k), round(img.height * k)))
        top = rband - round(band * k)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(big, (round(rcx - wx * k), top))
        if top > 0:  # a shorter arm: its first rows stretched up to the top edge (a plain white cylinder)
            strip = big.crop((0, 2, big.width, 5)).resize((big.width, top + 2))
            canvas.paste(strip, (round(rcx - wx * k), 0))
        GEN.put(manifest, name, canvas, raw, GEN.GRIP_QUALITY)
        light, bnd = GEN.marks(canvas)
        rr = np.nonzero((np.asarray(canvas)[..., 3] > 128).any(1))[0]
        print(f"  light {light}  band {bnd}  tip {rr[-1] / H:.3f}  (BIONIC.hang in src/render/bionic.js)")


def nest_geometry(p: np.ndarray) -> tuple[float, float, int]:
    twigs = ART.nest_mask(p)
    ty, tx = np.nonzero(twigs)
    assert len(tx) > 500, "no nest found"
    left, right = np.percentile(tx, [1, 99])
    a = p[..., 3] > 128
    cols = np.arange(p.shape[1])
    inside = (cols >= left) & (cols <= right)
    bottom = int(np.nonzero(a[:, inside].any(1))[0][-1])
    return (left + right) / 2, right - left, bottom


def body_geometry(p: np.ndarray) -> tuple[float, float, int]:
    b = box(p[..., 3])
    return (b[2] + b[3]) / 2, b[3] - b[2], b[1]


def matched(cell: np.ndarray, base: np.ndarray, geometry) -> tuple[Image.Image, bool]:
    """The cell scaled and moved so that its nest (or body) lies where the base picture has it, on the base's frame."""
    cx, w, bottom = geometry(cell)
    bx, bw, bb = geometry(base)
    k = bw / w
    img = Image.fromarray(cell, "RGBA")
    img = ART.resize(img, (max(1, round(img.width * k)), max(1, round(img.height * k))))
    frame = Image.new("RGBA", (base.shape[1], base.shape[0]), (0, 0, 0, 0))
    x, y = round(bx - cx * k), round(bb - bottom * k)
    frame.paste(img, (x, y))
    sub = box(cell[..., 3])
    clipped = y + sub[0] * k < 0 or x + sub[2] * k < 0 or x + sub[3] * k > base.shape[1]
    return frame, clipped


def import_pets(manifest: dict, job: dict, raw: bytes, flips: set[str]):
    nested = job["kind"] == "looks"
    cells = GEN.grid_cells(keyed(raw), *job["grid"])
    for name, cell in zip(job["names"], cells):
        if name == "-":
            continue
        base_name = name.rsplit("-", 1)[0]
        base = np.asarray(art(base_name))
        cell = np.asarray(flipped(name, Image.fromarray(cell, "RGBA"), flips))
        frame, clipped = matched(cell, base, nest_geometry if nested else body_geometry)
        GEN.put(manifest, name, frame, raw, GEN.PET_QUALITY)
        if clipped:
            print(f"  {name}: the picture is wider or taller than the frame of {base_name} — cut at the edge, check it")


KINDS = {"gestures": import_gestures, "holds": import_holds, "hang-grips": import_hang_grips, "looks": import_pets, "flight": import_pets}


def import_dir(folder: Path, flips: set[str], centres: dict):
    manifest = json.loads((ART.OUT / "manifest.json").read_text("utf-8"))
    by_id = {j["id"]: j for j in jobs()}
    done = []
    for path in sorted(folder.iterdir()):
        job = by_id.get(path.stem)
        if not job or path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        print(f"{path.name}: {job['title']}")
        raw = path.read_bytes()
        if job["kind"] == "holds":
            import_holds(manifest, job, raw, flips, centres)
        else:
            KINDS[job["kind"]](manifest, job, raw, flips)
        done.append(job["id"])
    assert done, f"{folder}: no picture named after a job (docs/REGEN.md)"
    ART.write_catalogue(manifest)
    print(f"{len(done)} sheets; {len(manifest['items'])} pictures, {manifest['total_bytes'] / 1024 / 1024:.2f} MB")


# ---------- the documents ----------

PRIORITY = {1: "Сначала", 2: "Потом", 3: "Если останется время"}


def markdown(all_jobs: list[dict]) -> str:
    out = ["# Перегенерация составных картинок (29.10.2026)", "",
           "Создано `python tools/regen.py --docs`; не править руками. Почему и как устроено — docs/GAME_VISUALS.md §12.", "",
           "**Как делать.** Один лист — одно сообщение генератору изображений: приложите эталон листа и вставьте промпт целиком. "
           "Эталоны делает `python tools/regen.py --refs ПАПКА` (файл `<лист>.jpg`). Готовую картинку сохраните под именем листа "
           "(`tz-gestures.png`, `hold-1.png` …) в одну папку и выполните `python tools/regen.py --import ПАПКА`. Или загрузите "
           "листы в отдельную ветку `art-inbox` (не в main: лист весит 2–3 МБ и остался бы в истории архива) — импорт — той же командой `python tools/regen.py --import`.", "",
           "**Бюджет.** Первая очередь — около 1,4 МБ картинок, это предел тестов (`tests/v516.test.mjs`). Вторая и третья — ещё "
           "около 1,8 МБ: каждый мегабайт картинок ложится в архив сдачи около 4 раз (docs/ART.md, «Бюджет»). Их — когда в архиве "
           "будет место.", "",
           "**Проверка листа перед импортом.** Фон — ровный пурпурный; ячейки не касаются друг друга; в каждой ячейке то, что "
           "сказано; кисть правая, ладонь к зрителю; у птицы тот же дизайн, что на эталоне. Неудачную ячейку можно пропустить: "
           "в коде останется прежний вид.", "",
           f"Листов: {len(all_jobs)}, картинок: {sum(1 for j in all_jobs for n in j['names'] if n != '-')}.", ""]
    for pr in (1, 2, 3):
        group = [j for j in all_jobs if j["priority"] == pr]
        if not group:
            continue
        out += [f"## {PRIORITY[pr]} ({len(group)})", ""]
        for j in group:
            names = [n for n in j["names"] if n != "-"]
            out += [f"### `{j['id']}` — {j['title']}", "", f"Зачем: {j['why']}", "", f"Приложить: {j['attach']}", "",
                    f"Сетка {j['grid'][0]} × {j['grid'][1]}, ячейки слева направо, сверху вниз → " + ", ".join(f"`{n}`" for n in names), "",
                    "```text", j["prompt"], "```", ""]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", help="write the reference picture of every job into this folder")
    ap.add_argument("--docs", action="store_true", help="write docs/REGEN.md and tools/regen-jobs.json")
    ap.add_argument("--import", dest="folder", help="import every sheet of this folder named after its job")
    ap.add_argument("--flip", default="", help="names of cells drawn as a left hand: mirrored")
    ap.add_argument("--centre", action="append", default=[], metavar="NAME=X,Y", help="where the thing is in a hold picture (fractions), if found wrong")
    args = ap.parse_args()
    all_jobs = jobs()
    if args.refs:
        out = Path(args.refs)
        out.mkdir(parents=True, exist_ok=True)
        for j in all_jobs:
            reference(j).save(out / f"{j['id']}.jpg", quality=90)
        print(f"{len(all_jobs)} reference pictures in {out}")
    if args.docs:
        ART.write(ROOT / "docs" / "REGEN.md", markdown(all_jobs).encode())
        ART.write(ROOT / "tools" / "regen-jobs.json", (json.dumps(all_jobs, ensure_ascii=False, indent=1) + "\n").encode())
        print(f"docs/REGEN.md, tools/regen-jobs.json: {len(all_jobs)} jobs")
    if args.folder:
        centres = {n: [float(v) for v in xy.split(",")] for n, xy in (c.split("=") for c in args.centre)}
        import_dir(Path(args.folder), set(filter(None, args.flip.split(","))), centres)


if __name__ == "__main__":
    main()
