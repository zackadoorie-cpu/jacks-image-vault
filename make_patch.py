#!/usr/bin/env python3
"""Build a UI-only Jack's Image Vault patch ZIP (Python stdlib only).

Usage:
  python make_patch.py --version 2.0.2 --web web --output jacks-image-vault-patch.zip \
      --notes "Thumbnail improvements"

This tool hashes every allowed asset, writes a manifest, and builds the ZIP.
Never include private Drive photos, Google access tokens, OAuth secrets, or inventory exports.
"""
import argparse, hashlib, io, json, pathlib, re, zipfile

ALLOWED = {
    "index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest", "robots.txt",
    "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png",
    "icons/icon-512.png", "icons/icon-maskable-512.png",
}
REQUIRED = {"index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest"}


def create_patch(web_dir, version, output, notes=""):
    web_dir = pathlib.Path(web_dir)
    output = pathlib.Path(output)
    if not re.fullmatch(r"v?\d+\.\d+\.\d+", version):
        raise ValueError("Version must be MAJOR.MINOR.PATCH")
    files = {}
    for path in sorted(web_dir.rglob("*")):
        if path.is_file():
            rel = path.relative_to(web_dir).as_posix()
            if rel not in ALLOWED:
                raise ValueError("Unexpected file in web folder: " + rel)
            files[rel] = path.read_bytes()
    if not REQUIRED.issubset(files):
        raise ValueError("Missing required assets: " + str(REQUIRED - files.keys()))
    manifest = {
        "schema": 1, "version": version.lstrip("v"), "notes": notes,
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=8) as zipout:
        zipout.writestr("vault-patch.json", json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8"))
        for name, data in files.items():
            zipout.writestr("web/" + name, data)
    print(f"Created {output} ({output.stat().st_size:,} bytes)")
    print("Archive SHA-256:", hashlib.sha256(output.read_bytes()).hexdigest())
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--web", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--notes", default="")
    args = parser.parse_args()
    create_patch(args.web, args.version, args.output, args.notes)
