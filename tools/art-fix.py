"""The pictures the CV audit of public/art found wrong (6.3.0, 08.11.2026), and their repair, measured, not drawn by hand.

  python3 tools/art-fix.py          # list what is wrong; exit 1 if anything is
  python3 tools/art-fix.py --fix    # repair it, re-encode at the family's WebP quality, update the manifests

1. Specks: tiny parts cut off from the subject (a shadow or a background the matte left behind) that show as dark dots on
   a light card. A part counts when it is small (≤ MAX_PX), far from the subject (≥ FAR of the picture's size) and dull:
   dark (value < 0.2) or grey (saturation < 0.5 and value < 0.6). The sparks and embers of the Firebird and Mio are bright
   and saturated, and they stay.
2. Off centre: the pictures of the gestures are fitted to their canvas (the subject's box centred, 11 px from the edge)
   and drawn centred on a card. «Отведение» was fitted with a speck at its left edge, so its hand stood 15 % to the right
   of «Приведение».
3. «Разгибание»: the generated picture bent the hand 40° towards the palm (a flexion) under the arrow of an extension;
   tools/regen.py asked for «bent backwards … towards the back of the hand». The hand is turned about the back corner of
   the wrist to 60° of extension, the joint is filled by sweeping the wrist's top edge through the turn, the arrow is
   set above the joint, and the picture is fitted again. Only the generated file (its sha256) is changed, so a second
   run finds nothing.
Only the pixels of a repair change. Needs Pillow, numpy and opencv-python-headless.
"""
import hashlib, io, json, re, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "art"
MAX_PX, FAR = 120, 0.02
MARGIN = 11  # the gesture pictures: the subject's box 11 px from the canvas edge
# WebP quality of each family: tools/import-art.py ROLES, tools/import-generated.py QUALITY (hand-*) and 86 (hold-*)
QUALITY = {"pet-": 80, "mio-": 82, "game-": 82, "nav-": 86, "ico-": 84, "ach-": 84, "gift-": 84, "obj-": 84,
           "gesture-": 84, "skin-": 84, "empty-": 82, "hand-": 92, "hold-": 86}
# «Разгибание» as generated, and the turn that makes it an extension: the back corner of the wrist (x, y), degrees
# counter-clockwise, the arrow's shift (x, y); pixels of the 256 px picture
EXTENSION = {"sha256": "967a0be51fc517783f3676698faf36edc97eb2247ab9307067fd97b8bc924aa0",
             "pivot": (73, 127), "turn": 100, "arrow": (-28, -30)}


def specks(rgba: np.ndarray):
    a = rgba[:, :, 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 40).astype(np.uint8), connectivity=8)
    if n < 3:
        return []
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    dist = cv2.distanceTransform(1 - (lab == big).astype(np.uint8), cv2.DIST_L2, 3)
    out = []
    for k in range(1, n):
        if k == big or st[k, cv2.CC_STAT_AREA] > MAX_PX:
            continue
        m = lab == k
        if dist[m].min() < FAR * max(a.shape):
            continue
        rgb = rgba[:, :, :3][m].astype(float)
        hi, lo = rgb.max(1), rgb.min(1)
        sat, val = float(((hi - lo) / np.maximum(hi, 1)).mean()), float(hi.mean()) / 255
        if val < 0.2 or (sat < 0.5 and val < 0.6):
            out.append((m, int(st[k, 0]), int(st[k, 1]), int(st[k, cv2.CC_STAT_AREA])))
    return out


def clear_specks(rgba, sp):
    clear = np.zeros(rgba.shape[:2], np.uint8)
    for m, *_ in sp:
        clear |= m.astype(np.uint8)
    out = rgba.copy()
    out[:, :, 3][cv2.dilate(clear, np.ones((3, 3), np.uint8)).astype(bool)] = 0
    return out


def off_centre(name, rgba):
    """Whole pixels to move a gesture picture by so its subject's box is centred; 0 when it is (or another family)."""
    if not name.startswith("gesture-"):
        return 0
    xs = np.nonzero((rgba[:, :, 3] > 127).any(0))[0]
    d = round(rgba.shape[1] / 2 - (xs.min() + xs.max() + 1) / 2)
    return d if abs(d) > 3 else 0


def shift(rgba, d):
    out = np.zeros_like(rgba)
    if d < 0:
        out[:, :d] = rgba[:, -d:]
    else:
        out[:, d:] = rgba[:, :-d]
    return out


def premul(rgba):
    x = rgba.astype(np.float32)
    x[..., :3] *= x[..., 3:4] / 255
    return x


def over(dst, src):
    return src + dst * (1 - src[..., 3:4] / 255)


def repose_extension(rgba):
    """«Разгибание» bent back: the hand turned about the back corner of the wrist, the joint swept, the picture refitted."""
    K, P, n = 4, 120, rgba.shape[0]  # work at 4×, on a canvas 120 px wider on every side
    big = np.array(Image.fromarray(rgba, "RGBA").resize((n * K, n * K), Image.LANCZOS))
    c = np.zeros((big.shape[0] + 2 * P * K, big.shape[1] + 2 * P * K, 4), np.uint8)
    c[P * K:-P * K, P * K:-P * K] = big
    pm, (H, W) = premul(c), c.shape[:2]
    _, lab, st, _ = cv2.connectedComponentsWithStats((c[..., 3] > 40).astype(np.uint8), connectivity=8)
    main = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    arrow = cv2.dilate(((lab > 0) & (lab != main)).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    px, py = ((P + v) * K for v in EXTENSION["pivot"])
    rows = np.arange(H)[:, None]
    hand = (rows < py) & ~arrow

    def turn(layer, t):
        m = cv2.getRotationMatrix2D((px, py), float(t), 1.0)
        return np.clip(cv2.warpAffine(layer, m, (W, H), flags=cv2.INTER_CUBIC), 0, 255)

    edge = pm * (hand & (rows >= py - 3 * K))[..., None]
    joint = np.zeros_like(pm)
    for t in range(EXTENSION["turn"] + 1):
        joint = np.maximum(joint, turn(edge, t))
    body = over(over(pm * ((rows >= py) & ~arrow)[..., None], joint), turn(pm * hand[..., None], EXTENSION["turn"]))
    dx, dy = (v * K for v in EXTENSION["arrow"])
    moved = cv2.warpAffine(pm * arrow[..., None], np.float32([[1, 0, dx], [0, 1, dy]]), (W, H), flags=cv2.INTER_LINEAR)
    full = over(body, moved)
    ys, xs = np.nonzero(full[..., 3] > 8)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    s = min((n - 2 * MARGIN) * K / (x1 - x0), (n - 2 * MARGIN) * K / (y1 - y0))
    fit = np.float32([[s, 0, n * K / 2 - s * (x0 + x1) / 2], [0, s, n * K / 2 - s * (y0 + y1) / 2]])
    full = cv2.resize(np.clip(cv2.warpAffine(full, fit, (n * K, n * K), flags=cv2.INTER_LINEAR), 0, 255), (n, n),
                      interpolation=cv2.INTER_AREA)
    al = full[..., 3:4]
    rgb = np.where(al > 0.5, full[..., :3] * 255 / np.maximum(al, 1e-3), 0)
    return np.clip(np.dstack([rgb, al]), 0, 255).round().astype(np.uint8)


def main():
    fix = "--fix" in sys.argv
    manifest_path = ART / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf8"))
    found = changed = 0
    for f in sorted(ART.glob("*.webp")):
        img = Image.open(f)
        if img.mode != "RGBA":
            continue
        rgba, notes = np.array(img), []
        sp = specks(rgba)
        if sp:
            notes.append(", ".join(f"speck {px} px at ({x}, {y})" for _, x, y, px in sp))
            rgba = clear_specks(rgba, sp)
        d = off_centre(f.stem, rgba)
        if d:
            notes.append(f"{abs(d)} px off centre")
            rgba = shift(rgba, d)
        if f.stem == "gesture-extension" and hashlib.sha256(f.read_bytes()).hexdigest() == EXTENSION["sha256"]:
            notes.append("the hand bent towards the palm under the arrow of an extension")
            rgba = repose_extension(rgba)
        if not notes:
            continue
        found += len(notes)
        print(f"{f.stem}: " + "; ".join(notes))
        if not fix:
            continue
        q = next(v for k, v in QUALITY.items() if f.stem.startswith(k))
        buf = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=q, method=6, alpha_quality=90)
        data = buf.getvalue()
        f.write_bytes(data)
        item = manifest["items"][f.stem]
        item["bytes"], item["sha256"] = len(data), hashlib.sha256(data).hexdigest()
        changed += 1
    if changed:
        manifest["total_bytes"] = sum(v["bytes"] for v in manifest["items"].values())
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf8")
        js = ROOT / "src" / "ui" / "art-manifest.js"
        js.write_text(re.sub(r"export const ART_BYTES = \d+;", f"export const ART_BYTES = {manifest['total_bytes']};",
                             js.read_text("utf8")), "utf8")
    print(f"{found} finding(s){f', {changed} picture(s) repaired' if changed else ''}")
    sys.exit(1 if found and not fix else 0)


if __name__ == "__main__":
    main()
