#!/usr/bin/env python3
"""Read-only release artifact verifier. No uploads or network requests."""
import argparse
import hashlib
import json
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from make_patch import ALLOWED, REQUIRED  # noqa: E402

MAX_ARCHIVE = 14 << 20
MAX_EXPANDED = 20 << 20


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(dist, version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("version must be three numbers")
    exe_name = f"Jacks_Image_Vault_{version}.exe"
    zip_name = "jacks-image-vault-patch.zip"
    expected = {exe_name, zip_name, "SHA256SUMS.txt"}
    files = {p.name for p in dist.iterdir() if p.is_file()}
    if files != expected:
        raise ValueError(f"unexpected release assets: missing={expected-files}, extra={files-expected}")
    exe = dist / exe_name
    if exe.stat().st_size < 1000 or exe.open("rb").read(2) != b"MZ":
        raise ValueError("Windows executable missing or invalid MZ signature")
    archive = dist / zip_name
    if archive.stat().st_size > MAX_ARCHIVE:
        raise ValueError("ZIP exceeds native updater size limit")
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [p.filename for p in entries]
        if len(names) != len(set(names)):
            raise ValueError("duplicate ZIP entry")
        if any(p.is_dir() or p.filename.startswith("/") or "\\" in p.filename or ".." in p.filename.split("/")
               for p in entries):
            raise ValueError("unsafe ZIP entry")
        if "vault-patch.json" not in names:
            raise ValueError("missing manifest")
        if any(not name.startswith("web/") and name != "vault-patch.json" for name in names):
            raise ValueError("unapproved archive entries")
        assets = {name[4:] for name in names if name != "vault-patch.json"}
        if not REQUIRED.issubset(assets) or not assets.issubset(ALLOWED):
            raise ValueError("ZIP does not match native updater allowlist")
        manifest = json.loads(z.read("vault-patch.json"))
        if manifest.get("schema") != 1 or manifest.get("version") != version:
            raise ValueError("manifest schema or version mismatch")
        if set(manifest.get("files", {})) != assets:
            raise ValueError("manifest asset list differs from ZIP")
        expanded = 0
        for name in assets:
            data = z.read("web/" + name)
            expanded += len(data)
            if len(data) > 6 << 20:
                raise ValueError(f"asset too large: {name}")
            if digest(data) != manifest["files"][name].lower():
                raise ValueError(f"checksum mismatch for {name}")
        if expanded > MAX_EXPANDED:
            raise ValueError("expanded ZIP exceeds native updater limit")
    expected_hashes = {name: digest((dist / name).read_bytes()) for name in [exe_name, zip_name]}
    recorded = {}
    for line in (dist / "SHA256SUMS.txt").read_text().splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            raise ValueError("malformed SHA256SUMS")
        name = parts[1].lstrip("*")
        if name in recorded:
            raise ValueError("duplicate checksum line")
        recorded[name] = parts[0]
    if recorded != expected_hashes:
        raise ValueError("published checksums do not match build artifacts")
    print(f"Verified {exe_name} and {zip_name} against native ZIP allowlist, SHA-256 and {version} manifest.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--dist", type=pathlib.Path, default=pathlib.Path("dist"))
    args = parser.parse_args()
    verify(args.dist, args.version)
