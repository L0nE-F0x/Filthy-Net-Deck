"""Generate og-image.png for social previews (1200x630)."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "og-image.png"
ICON = ROOT / "app-icon.png"

W, H = 1200, 630

INK_950 = (5, 6, 4)
ACID = (184, 240, 0)
ACID_BRIGHT = (212, 255, 58)
GOLD_LIGHT = (232, 197, 106)
FOAM = (242, 244, 234)
MUTED = (154, 163, 138)


def load_font(candidates: list[str], size: int) -> ImageFont.ImageFont:
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def soft_orb(
    size: tuple[int, int],
    cx: int,
    cy: int,
    radius: int,
    color: tuple[int, int, int],
    peak_alpha: int,
) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    steps = 48
    for i in range(steps, 0, -1):
        t = i / steps
        a = int(peak_alpha * (t**2))
        rr = int(radius * t)
        ld.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(*color, a))
    return layer.filter(ImageFilter.GaussianBlur(radius=36))


def main() -> None:
    img = Image.new("RGBA", (W, H), (*INK_950, 255))

    # Atmosphere - keep glows away from title area
    img = Image.alpha_composite(img, soft_orb((W, H), 210, 340, 420, ACID, 55))
    img = Image.alpha_composite(img, soft_orb((W, H), 1040, 500, 380, (212, 168, 75), 45))
    img = Image.alpha_composite(img, soft_orb((W, H), 900, 80, 260, (92, 107, 42), 35))

    # Subtle grid
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 48
    for x in range(0, W, step):
        gd.line([(x, 0), (x, H)], fill=(184, 240, 0, 12), width=1)
    for y in range(0, H, step):
        gd.line([(0, y), (W, y)], fill=(184, 240, 0, 12), width=1)
    img = Image.alpha_composite(img, grid)

    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle([0, 0, 8, H], fill=(*ACID, 230))

    # Icon
    icon = Image.open(ICON).convert("RGBA")
    icon_size = 380
    icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    ix, iy = 70, (H - icon_size) // 2 - 8

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = 18
    sd.rounded_rectangle(
        [ix - pad, iy - pad, ix + icon_size + pad, iy + icon_size + pad],
        radius=48,
        fill=(0, 0, 0, 130),
    )
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))

    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle(
        [ix - 10, iy - 10, ix + icon_size + 10, iy + icon_size + 10],
        radius=44,
        fill=(23, 26, 18, 210),
        outline=(*ACID, 100),
        width=2,
    )
    img = Image.alpha_composite(img, frame)
    img.paste(icon, (ix, iy), icon)

    draw = ImageDraw.Draw(img, "RGBA")

    bold = [
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
    ]
    regular = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    title_font = load_font(bold, 72)
    tag_font = load_font(bold, 38)
    body_font = load_font(regular, 28)
    chip_font = load_font(bold, 20)
    small_font = load_font(regular, 22)
    badge_font = load_font(bold, 18)

    tx, ty = 500, 118
    mid = "\u00b7"  # middle dot

    # Eyebrow — spell out both platforms clearly (X crops tight previews)
    draw.text(
        (tx, ty),
        f"FREE  {mid}  WINDOWS + MACOS  {mid}  MTG ARENA",
        font=chip_font,
        fill=ACID,
    )

    # Live dot
    draw.ellipse([tx - 18, ty + 8, tx - 6, ty + 20], fill=(52, 211, 153, 255))

    draw.text((tx, ty + 40), "Filthy Net Deck", font=title_font, fill=FOAM)
    draw.text((tx, ty + 128), "Netdeck dirty. Climb clean.", font=tag_font, fill=ACID_BRIGHT)

    # Feature callout badge — bump with each marketed release
    badge_text = f"NEW  {mid}  v1.5.0  {mid}  BREW LAB"
    badge_pad_x, badge_pad_y = 14, 8
    bb = draw.textbbox((0, 0), badge_text, font=badge_font)
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    bx, by = tx, ty + 182
    draw.rounded_rectangle(
        [bx, by, bx + bw + badge_pad_x * 2, by + bh + badge_pad_y * 2],
        radius=8,
        fill=(23, 26, 18, 235),
        outline=(*ACID, 200),
        width=1,
    )
    draw.text((bx + badge_pad_x, by + badge_pad_y - 1), badge_text, font=badge_font, fill=ACID_BRIGHT)

    lines = [
        "Daily Standard & Pioneer meta.",
        "Brew Lab: clinic your list vs ranked peers.",
        "No AI · real board staples only.",
        f"No Alchemy {mid} 100% local {mid} free Win + macOS.",
    ]
    dy = ty + 236
    for line in lines:
        draw.text((tx, dy), line, font=body_font, fill=MUTED)
        dy += 36

    # Bottom bar
    draw.rectangle([0, H - 56, W, H], fill=(10, 11, 8, 245))
    draw.rectangle([0, H - 56, W, H - 54], fill=(*ACID, 200))
    draw.text((70, H - 40), "v1.5.0  ·  Windows + macOS", font=small_font, fill=MUTED)
    draw.text((tx, H - 40), "filthy-net-deck.netlify.app", font=small_font, fill=GOLD_LIGHT)

    final = img.convert("RGB")
    final.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {final.size} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
