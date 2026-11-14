#!/usr/bin/env python3
"""Generate the Windows Desktop host ICO from the approved Vault PNG.

The icon is a build artifact, not a committed binary. Never handles user photos.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
icon = Image.open(ROOT / "web/icons/icon-512.png").convert("RGBA")
path = ROOT / "windows-host/app.ico"
path.parent.mkdir(parents=True, exist_ok=True)
icon.save(path, format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(f"Windows host icon: {path}")
