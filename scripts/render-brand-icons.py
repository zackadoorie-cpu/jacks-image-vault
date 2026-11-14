#!/usr/bin/env python3
"""Render Jack's Vault's approved multicolor folder mark to app and Windows icons.

This does not read Drive photos or connect to Google. The SVG remains the
single source of truth. Run with: python3 scripts/render-brand-icons.py
Dependencies: CairoSVG 2.8.x and Pillow 11+.
"""
import argparse
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "web" / "icons" / "icon.svg"
OUT = ROOT / "web" / "icons"


def render(ico_path=None):
    import cairosvg
    from PIL import Image

    source = SOURCE.read_bytes()
    if b"<svg" not in source or b"folder" not in source:
        raise ValueError("Expected the multicolor Vault folder SVG")
    pngs = {}
    for size in (180, 192, 512):
        png = cairosvg.svg2png(bytestring=source, output_width=size, output_height=size)
        target = OUT / f"icon-{size}.png"
        target.write_bytes(png)
        pngs[size] = png
        print(f"Rendered {target.relative_to(ROOT)}")
    # Safe-zone-compliant PWA icon: complete logo is inset to 80%, with an
    # opaque matching ground so circle/squircle Android masks never cut it.
    maskable = Image.new("RGBA", (512, 512), (11, 20, 40, 255))
    mark = Image.open(BytesIO(pngs[512])).convert("RGBA").resize((408, 408), Image.Resampling.LANCZOS)
    maskable.alpha_composite(mark, (52, 52))
    maskable.convert("RGB").save(OUT / "icon-maskable-512.png", "PNG", optimize=True)
    print("Rendered web/icons/icon-maskable-512.png")
    if ico_path:
        ico_path = Path(ico_path)
        ico_path.parent.mkdir(parents=True, exist_ok=True)
        icon = Image.open(BytesIO(pngs[512])).convert("RGBA")
        icon.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32),
                                             (48, 48), (64, 64), (128, 128), (256, 256)])
        print(f"Rendered {ico_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ico", type=Path, help="Optional multi-size Windows ICO output")
    args = parser.parse_args()
    render(args.ico)
