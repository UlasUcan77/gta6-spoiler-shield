"""Render the extension icons (16/32/48/128) with Pillow.

Usage: python scripts/make_icons.py
Draws a gradient shield with an "eye-off" mark on a dark rounded tile,
supersampled for clean edges at small sizes.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
SS = 8  # supersampling factor

PINK = (236, 72, 153)
VIOLET = (139, 92, 246)
CYAN = (34, 211, 238)
BG = (13, 11, 26)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2):
    """Diagonal gradient image."""
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.5 + y / h * 0.5)
            px[x, y] = lerp(c1, c2, t)
    return img


def shield_polygon(cx, top, w, h, steps=40):
    """Classic heater shield: flat-ish top, curved sides meeting at a point."""
    pts = []
    half = w / 2
    # top edge with a slight dip in the middle
    pts.append((cx - half, top + h * 0.08))
    pts.append((cx, top))
    pts.append((cx + half, top + h * 0.08))
    # right side curve down to the tip
    for i in range(1, steps + 1):
        t = i / steps
        x = cx + half * (1 - t ** 2.2)
        y = top + h * 0.08 + (h * 0.92) * t
        pts.append((x, y))
    # left side back up
    for i in range(steps - 1, 0, -1):
        t = i / steps
        x = cx - half * (1 - t ** 2.2)
        y = top + h * 0.08 + (h * 0.92) * t
        pts.append((x, y))
    return pts


def render(size):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Rounded dark tile (skip padding for tiny sizes so the mark stays readable)
    pad = 0 if size <= 16 else int(S * 0.04)
    radius = int(S * 0.22)
    tile = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile).rounded_rectangle([pad, pad, S - pad - 1, S - pad - 1], radius=radius, fill=255)
    bg = Image.new("RGBA", (S, S), BG + (255,))
    img.paste(bg, (0, 0), tile)

    # Glow
    glow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glow)
    sw, sh = S * 0.62, S * 0.70
    gd.polygon(shield_polygon(S / 2, S * 0.15, sw, sh), fill=160)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.06))
    glow_color = Image.new("RGBA", (S, S), PINK + (255,))
    glow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_layer.paste(glow_color, (0, 0), glow)
    glow_mask = Image.new("L", (S, S), 0)
    glow_mask.paste(glow, (0, 0), tile)
    img.paste(glow_layer, (0, 0), glow_mask)

    # Shield with gradient
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(shield_polygon(S / 2, S * 0.15, sw, sh), fill=255)
    img.paste(gradient((S, S), PINK, VIOLET), (0, 0), mask)

    # Eye-off mark in white
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S * 0.47
    ew, eh = S * 0.40, S * 0.24
    lw = max(int(S * 0.045), SS)
    d.ellipse([cx - ew / 2, cy - eh / 2, cx + ew / 2, cy + eh / 2], outline=(255, 255, 255, 255), width=lw)
    pr = S * 0.05
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=(255, 255, 255, 255))
    # slash: dark cut underneath, white stroke on top
    sx0, sy0 = cx - ew * 0.48, cy + eh * 1.05
    sx1, sy1 = cx + ew * 0.48, cy - eh * 1.05
    d.line([sx0, sy0, sx1, sy1], fill=lerp(PINK, VIOLET, 0.5) + (255,), width=int(lw * 2.4))
    d.line([sx0, sy0, sx1, sy1], fill=(255, 255, 255, 255), width=lw)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size).save(OUT / f"icon{size}.png", optimize=True)
    render(512).save(OUT / "icon512.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
