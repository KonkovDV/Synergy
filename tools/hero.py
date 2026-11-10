"""The picture at the top of README.md (6.3.4): four screens of this build side by side — the cover, the training mode,
a game with the EMG emulator at the bottom of the screen, the results of a level. The screens are the JPEGs the browser
checks write to docs/screenshots (npm run e2e, npm run e2e:a11y), so the picture is rebuilt after them:

  python3 tools/hero.py        → docs/screenshots/hero.jpg   (needs Pillow)

The picture of 5.16 stayed in the README through 6.3.3 and showed a default scheme and texts the build no longer had.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SHOTS = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
SCREENS = ["v5-01-onboarding.jpg", "v5-03-tutorial.jpg", "11-grip-demo.jpg", "20-results.jpg"]
GAP, PAD, RADIUS, BACK = 36, 40, 34, (236, 242, 246)


def phone(path: Path) -> Image.Image:
    """A screen with rounded corners on a soft shadow."""
    shot = Image.open(path).convert("RGB")
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.width - 1, shot.height - 1], RADIUS, fill=255)
    card = Image.new("RGB", (shot.width + 2 * PAD, shot.height + 2 * PAD), BACK)
    shadow = Image.new("L", card.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle([PAD, PAD + 10, PAD + shot.width, PAD + shot.height + 10], RADIUS, fill=90)
    card.paste((150, 165, 178), mask=shadow.filter(ImageFilter.GaussianBlur(14)))
    card.paste(shot, (PAD, PAD), mask)
    return card


def main() -> None:
    cards = [phone(SHOTS / name) for name in SCREENS]
    width = sum(c.width for c in cards) - (len(cards) - 1) * (2 * PAD - GAP)
    out = Image.new("RGB", (width, max(c.height for c in cards)), BACK)
    x = 0
    for card in cards:
        out.paste(card, (x, 0))
        x += card.width - (2 * PAD - GAP)
    target = SHOTS / "hero.jpg"
    out.save(target, quality=86, optimize=True)
    print(f"{target} {out.width}×{out.height}, {target.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
