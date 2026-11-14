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
    bundle_name = f"Jacks_Image_Vault_Desktop_Bundle_v{version}.zip"
    bundle_present = (dist / bundle_name).exists()
    expected = {exe_name, zip_name, "SHA256SUMS.txt"}
    if bundle_present:
        expected.add(bundle_name)
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
    if bundle_present:
        bundle = dist / bundle_name
        if bundle.stat().st_size > 150 << 20:
            raise ValueError("Desktop bundle is unexpectedly large")
        with zipfile.ZipFile(bundle) as desktop:
            members = desktop.infolist()
            names = [m.filename for m in members]
            expected_members = {exe_name, "Jacks_Image_Vault_Desktop.exe", "START_HERE.txt"}
            if len(names) != 3 or set(names) != expected_members:
                raise ValueError("Desktop bundle contains unknown or missing entries")
            if any(m.is_dir() or m.filename.startswith("/") or
                   "\\\\" in m.filename or ".." in m.filename.split("/") for m in members):
                raise ValueError("Unsafe desktop bundle entry")
            if digest(desktop.read(exe_name)) != digest(exe.read_bytes()):
                raise ValueError("Desktop bundle backend differs from standalone EXE")
            host = desktop.read("Jacks_Image_Vault_Desktop.exe")
            if not host.startswith(b"MZ") or len(host) < 1000:
                raise ValueError("Desktop bundle host is not a Windows executable")
            if len(host) > 150 << 20:
                raise ValueError("Desktop bundle host exceeds safe size")
            if "NOT an in-app" not in desktop.read("START_HERE.txt").decode("utf-8"):
                raise ValueError("Desktop bundle missing installation warning")
    asset_names = [exe_name, zip_name] + ([bundle_name] if bundle_present else [])
    expected_hashes = {name: digest((dist / name).read_bytes()) for name in asset_names}
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
