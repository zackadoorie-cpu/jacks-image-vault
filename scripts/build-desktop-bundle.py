#!/usr/bin/env python3
"""Create a standalone optional WebView2 bundle, separate from updater patches."""
import argparse
import pathlib
import re
import zipfile

MAX_HOST_BYTES = 150 << 20

def make_bundle(version, server, host, output):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("invalid release version")
    if server.name != f"Jacks_Image_Vault_{version}.exe":
        raise ValueError("backend name/version mismatch")
    if host.name != "Jacks_Image_Vault_Desktop.exe":
        raise ValueError("invalid desktop host name")
    for path in (server, host):
        if not path.is_file() or not path.read_bytes().startswith(b"MZ"):
            raise ValueError(f"not a Windows EXE: {path}")
    if host.stat().st_size > MAX_HOST_BYTES:
        raise ValueError("desktop host unexpectedly large")
    output.parent.mkdir(parents=True, exist_ok=True)
    readme = (
        f"JACK'S IMAGE VAULT v{version} | WINDOWS DESKTOP PREVIEW\r\n"
        "1. Extract BOTH EXE files into the same folder.\r\n"
        "2. Double-click Jacks_Image_Vault_Desktop.exe for a real WebView2 window.\r\n"
        "3. Enter your Sheet ID and use Google Desktop OAuth -> system browser.\r\n"
        "4. Jacks_Image_Vault_VERSION.exe is your original Edge/Chrome fallback.\r\n"
        "Requirements: Windows 10/11 x64 and Microsoft Edge WebView2 Evergreen Runtime.\r\n"
        "No Google Drive files are moved or deleted.\r\n"
        "This ZIP is NOT an in-app Install local patch. Do not upload it there.\r\n"
        "If WebView2 is missing, use the regular EXE or install the official runtime:\r\n"
        "https://developer.microsoft.com/en-us/microsoft-edge/webview2/\r\n"
    ).replace("Jacks_Image_Vault_VERSION.exe", server.name)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        z.write(server, server.name)
        z.write(host, host.name)
        z.writestr("START_HERE.txt", readme)
    print(f"Prepared {output} with native WebView2 host and original launcher")

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--version", required=True)
    p.add_argument("--server", type=pathlib.Path, required=True)
    p.add_argument("--host", type=pathlib.Path, required=True)
    p.add_argument("--output", type=pathlib.Path, required=True)
    args=p.parse_args()
    make_bundle(args.version,args.server,args.host,args.output)
