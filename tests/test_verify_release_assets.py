import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from make_patch import create_patch, REQUIRED

spec = importlib.util.spec_from_file_location("verify_release_assets", ROOT / "scripts" / "verify-release-assets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.web = self.root / "web"
        self.web.mkdir()
        self.dist = self.root / "dist"
        self.dist.mkdir()
        self.version = "2.1.6"
        for name in REQUIRED:
            p = self.web / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(("fixture " + name).encode())
        self.exe = self.dist / f"Jacks_Image_Vault_{self.version}.exe"
        self.exe.write_bytes(b"MZ" + b"test-executable" * 100)
        self.archive = self.dist / "jacks-image-vault-patch.zip"
        create_patch(self.web, self.version, self.archive)
        self.refresh_sums()

    def refresh_sums(self):
        names = [self.exe.name, self.archive.name]
        optional = self.dist / f"Jacks_Image_Vault_Desktop_Bundle_v{self.version}.zip"
        if optional.is_file():
            names.append(optional.name)
        lines = []
        for name in names:
            digest = hashlib.sha256((self.dist / name).read_bytes()).hexdigest()
            lines.append(digest + "  " + name)
        (self.dist / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n")

    def test_valid_release_manifest_matches_native_allowlist(self):
        module.verify(self.dist, self.version)

    def test_external_checksum_mismatch_fails(self):
        self.exe.write_bytes(self.exe.read_bytes() + b"tampered")
        with self.assertRaisesRegex(ValueError, "published checksums"):
            module.verify(self.dist, self.version)

    def test_inner_asset_checksum_mismatch_fails_even_if_outer_zip_checksum_updated(self):
        contents = {}
        with zipfile.ZipFile(self.archive) as z:
            for n in z.namelist():
                contents[n] = z.read(n)
        contents["web/app.js"] += b"modified"
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in contents.items():
                z.writestr(name, data)
        self.refresh_sums()
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            module.verify(self.dist, self.version)

    def test_wrong_manifest_version_fails(self):
        contents = {}
        with zipfile.ZipFile(self.archive) as z:
            for n in z.namelist():
                contents[n] = z.read(n)
        manifest = json.loads(contents["vault-patch.json"])
        manifest["version"] = "2.9.9"
        contents["vault-patch.json"] = json.dumps(manifest).encode()
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in contents.items():
                z.writestr(name, data)
        self.refresh_sums()
        with self.assertRaisesRegex(ValueError, "version mismatch"):
            module.verify(self.dist, self.version)

    def create_desktop_bundle(self):
        spec = importlib.util.spec_from_file_location(
            "build_desktop_bundle", ROOT / "scripts/build-desktop-bundle.py"
        )
        bundle_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bundle_module)
        host = self.root / "Jacks_Image_Vault_Desktop.exe"
        host.write_bytes(b"MZ" + b"synthetic-desktop-exe" * 100)
        bundle = self.dist / f"Jacks_Image_Vault_Desktop_Bundle_v{self.version}.zip"
        bundle_module.make_bundle(self.version, self.exe, host, bundle)
        self.refresh_sums()
        return bundle

    def test_valid_optional_desktop_bundle(self):
        bundle = self.create_desktop_bundle()
        with zipfile.ZipFile(bundle) as z:
            self.assertEqual(set(z.namelist()), {
                self.exe.name, "Jacks_Image_Vault_Desktop.exe", "START_HERE.txt"
            })
        module.verify(self.dist, self.version)

    def test_desktop_bundle_rejects_mismatched_backend(self):
        bundle = self.create_desktop_bundle()
        with zipfile.ZipFile(bundle) as z:
            assets = {name: z.read(name) for name in z.namelist()}
        assets[self.exe.name] += b"tampered-backend"
        with zipfile.ZipFile(bundle, "w") as z:
            for name, data in assets.items():
                z.writestr(name, data)
        self.refresh_sums()
        with self.assertRaisesRegex(ValueError, "bundle backend differs"):
            module.verify(self.dist, self.version)

    def test_desktop_bundle_rejects_unexpected_member(self):
        bundle = self.create_desktop_bundle()
        with zipfile.ZipFile(bundle, "a") as z:
            z.writestr("extra_user_data.json", '{"secret":"no"}')
        self.refresh_sums()
        with self.assertRaisesRegex(ValueError, "unknown or missing entries"):
            module.verify(self.dist, self.version)

    def test_unexpected_asset_rejected(self):
        with zipfile.ZipFile(self.archive, "a") as z:
            z.writestr("web/private-photo.jpg", b"should never publish")
        self.refresh_sums()
        with self.assertRaisesRegex(ValueError, "native updater allowlist"):
            module.verify(self.dist, self.version)


if __name__ == "__main__":
    unittest.main()
