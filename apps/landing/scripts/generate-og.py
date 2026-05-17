#!/usr/bin/env python3
"""Generate apps/landing/public/og-default.png — 1200x630 social card."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og-default.png"
# Pillow can't load WOFF2 directly, so we use OS-installed look-alikes
# (NimbusMono / NimbusSans) for the build-time card. Once a designed PNG
# is dropped into public/og-default.png it overrides this script entirely.
FONT_SANS = Path("/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf")
FONT_MONO = Path("/usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Bold.otf")

WIDTH, HEIGHT = 1200, 630
BG = (12, 12, 14)
FG = (245, 245, 245)
MUTED = (160, 160, 170)
ACCENT = (200, 200, 210)

WORDMARK = "MOZART"
TAGLINE_LINES = [
    "Agents play the notes.",
    "Mozart helps you conduct the masterpiece.",
]
FOOTER = "mozart.build"


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    # woff2 is not directly readable by Pillow; fall back to default if missing.
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError:
        return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Subtle border so the card reads as a contained surface on light feeds.
    border = (32, 32, 36)
    draw.rectangle([(0, 0), (WIDTH - 1, HEIGHT - 1)], outline=border, width=2)

    wordmark_font = load_font(FONT_MONO, 96)
    tagline_font = load_font(FONT_SANS, 56)
    footer_font = load_font(FONT_MONO, 28)

    # Wordmark (top-left padded)
    draw.text((80, 80), WORDMARK, font=wordmark_font, fill=FG)

    # Tagline (vertically centered, left-aligned)
    line_height = 76
    block_height = line_height * len(TAGLINE_LINES)
    y = (HEIGHT - block_height) // 2 + 20
    for line in TAGLINE_LINES:
        draw.text((80, y), line, font=tagline_font, fill=FG)
        y += line_height

    # Footer (bottom-left)
    draw.text((80, HEIGHT - 80), FOOTER, font=footer_font, fill=MUTED)

    # Save as compressed PNG
    img.save(OUT, format="PNG", optimize=True)
    size_kb = OUT.stat().st_size // 1024
    print(f"wrote {OUT} ({size_kb}kb)")


if __name__ == "__main__":
    main()
