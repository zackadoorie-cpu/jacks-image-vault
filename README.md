# Jack's Image Vault — Windows image and media library

**Status:** Working Windows EXE built, Go updater tests passed, local ZIP patch installed and rolled back in an HTTP smoke test. **Live Windows/Google thumbnail verification has not been performed** in the build environment.

## What changed

- Keep your existing Google OAuth web client and inventory Sheet ID. The new app runs on the same `http://localhost:8765` origin, so Chrome/Edge should retain your saved client and spreadsheet IDs. Tokens are memory-only: sign in again on a fresh browser page.
- Gallery thumbnails now use Google's signed thumbnail URL directly as an `<img>` without sending the OAuth bearer token to a third-party thumbnail host. The old implementation tried to fetch that URL with `Authorization` and hid errors, then downloaded whole originals.
- The app fetches metadata in a **bounded five-job queue**, only near the viewport. If a signed preview fails, it tries authenticated Drive media for originals up to **7 MB**, then displays a meaningful error and offers retries. Never more than five Google fetches run in the thumbnail queue concurrently.
- Added thumbnail progress, a Retry failed button, a modal retry button, a 96-image in-memory cache, and request timeouts.
- The native launcher serves built-in assets or a verified UI patch from `%LOCALAPPDATA%\JacksImageVault\releases\`. No Python needed to run the `.exe`.
- Added **Updates** in the gallery: public GitHub releases, local patch ZIPs, rollback, and restore built-in UI.
- The app checks the configured public GitHub repository at most once daily while open (on startup), but **never downloads or installs patches without your approval**.
- Shell-only service worker is network-first, so approved UI patches are visible after reload. No private Drive data is cached by the service worker.

## Live Drive indexing (v2.0.7)

**The Google Sheets inventory is a historical snapshot.** A file remains in that sheet until the sheet is separately updated, even when the file is deleted in Drive. Image Vault does **not** edit the sheet or Drive content. It instead reconciles the gallery against live read-only Drive results and reports differences.

- **Discovery:** On a full verification, the app verifies the parent chains of folders listed in the spreadsheet, identifies the existing `Memes` and `Jacks Photos` library roots, and walks their nested subfolders. It also includes supported media stored directly in those roots. It does **not** search unrelated parts of My Drive.
- **New folders:** Newly discovered nested folders and their images, GIFs, videos, and PDFs appear in the gallery without adding their IDs to the spreadsheet. Empty new albums appear in the collection selector.
- **Folder moves:** Stable Drive IDs preserve descriptions across folder renames. A folder moved out of the watched roots, or removed, is marked missing in Library Health and excluded from the verified live gallery.
- **Incremental sync:** Drive's changes cursor updates existing media; a folder create/move/rename event triggers a fresh directory scan. The app periodically verifies the full directory tree to correct gaps.
- **Index Health:** The dashboard clearly separates the **original spreadsheet count**, **verified live count**, **new files**, **missing files**, and folder discovery status. File differences are not automatically written back to Sheets.
- **Failure safety:** The directory scan is bounded (300 folders, 20,000 supported media items, max depth eight) and read-only. If any folder listing fails, the last verified gallery is preserved. On first connection only, the app can verify the original indexed folders as a fallback, clearly showing that discovery is incomplete.
- **Local metadata cache:** A bounded, account-specific metadata cache stores folder IDs, filenames, MIME types, size, and the changes cursor on your device, never file contents, Drive thumbnails, or OAuth tokens. Clear it from Library Health. The cache format is upgraded for v2.0.7, so the first verification may fetch the full tree again.

After upgrading through GitHub, open **Library Health → Discover & verify folders** once. Confirm the two watched roots, verify the new/missing counts, then test an album added after the original inventory was created.

## Install on Windows

1. **Close the old Image Vault process.** The v1 EXE keeps its small local server alive after its browser window closes. If v2 says the port is used by an old Image Vault, open Task Manager → Details and end the old `Jacks_Image_Vault.exe` process. Do not end unknown processes.
2. Download `Jacks_Image_Vault_v2.exe` and double-click it. Microsoft Edge or Google Chrome opens an app-style window at `http://localhost:8765/`.
3. If the **Updates** button does not appear, refresh twice. The prior service worker may need one navigation to update its cached app shell.
4. Use **Connect Drive**. Existing OAuth web client and sheet ID should be remembered for this origin if you previously selected **Remember**. If not, re-enter the same details.
5. Click **Explore gallery** and check that thumbnails appear. Some unsupported or very large images will show `Preview unavailable`; open or retry them individually.

The executable is **unsigned**. Windows SmartScreen may show a warning. Only run the download if you trust the source. For production distribution, code-sign the executable.

## Try the first local patch

1. Download `jacks-image-vault-patch.zip` (the accompanying v2.0.1 sample patch).
2. In the **v2 EXE**, choose **Updates → Install a local patch → Choose File → Verify & install ZIP**.
3. Approve installation. The app validates the archive, SHA-256 hashes, version number and allowed file paths, then reloads. The version label should become **2.0.1**.
4. Choose **Roll back one version** to restore the previous built-in version **2.0.0**, or **Restore built-in UI** from the same dialog.

Patches replace only the **web interface files** (HTML, CSS, JS, icons, and service worker). They **cannot modify the Go EXE or native updater code**. Native changes still require a new EXE. Patch installation **does not change Google Drive files, OAuth settings or favorites**. It will reload the page, so you may need to sign in again.

## Configure GitHub release updates (no Git commands required)

The repository is set up at [zackadoorie-cpu/jacks-image-vault](https://github.com/zackadoorie-cpu/jacks-image-vault).

1. Open [GitHub Actions → Build and publish Image Vault update](https://github.com/zackadoorie-cpu/jacks-image-vault/actions/workflows/release.yml).
2. Choose **Run workflow**, keep branch **main**, enter a version newer than the installed app, e.g. **2.0.1**, and confirm **Run workflow**.
3. The workflow tests the app, builds a Windows EXE, produces a validated `jacks-image-vault-patch.zip`, and publishes a GitHub Release with checksums.
4. Wait for the workflow to show a green check, then inspect the download links under [Releases](https://github.com/zackadoorie-cpu/jacks-image-vault/releases). If the workflow fails, inspect its job logs; do not assume a release exists.
5. In the installed v2 app, open **Updates**, enter `zackadoorie-cpu/jacks-image-vault`, choose **Save repository**, and then **Check GitHub**. Select **Install update** and approve if a newer release is available.

Use a new version number for each publication. The existing `v2.0.0` app cannot offer an update to itself; start with `2.0.1`. Later source updates should be reviewed and tested before publishing `2.0.2`, and so on.

The repository is **public**, but Drive images and inventory are not included. **Never upload private photo files, spreadsheet exports, OAuth access tokens, Google client secrets, or personal settings.**

The app accesses public GitHub releases over HTTPS; a GitHub access token is not required. SHA-256 checksums protect against accidental corruption but do not authenticate a malicious or compromised release publisher. Install updates only from a repository you control and trust.

### Future patches generated in ChatGPT

Keep the source ZIP. To make a new patch, update its `web/` files and use the bundled Python standard-library tool (Python is for creating patch ZIPs, **not** required on your Windows computer to run the app):

```bash
python3 make_patch.py --version 2.0.2 --web web --output jacks-image-vault-patch.zip --notes "Thumbnail fixes"
```

Use **Updates → Install a local patch** for the result, or attach it to a GitHub release with tag `v2.0.2` and filename `jacks-image-vault-patch.zip`.

## Troubleshooting

- **Old EXE still owns port 8765:** use Task Manager to stop the previous launcher, then start the v2 EXE.
- **Missing Updates button after replacement:** reload the browser after the service worker update.
- **New version reports preview unavailable:** the tile shows a retry affordance. Open it and select Retry preview; some files are too large or incompatible with browser formats.
- **Patch broken:** Updates → Roll back / Restore built-in. If the update interface itself is broken, close the process and run `Jacks_Image_Vault_v2.exe --rollback` or `--repair` from a Command Prompt. Do not run these commands in Python's `>>>` prompt.
- **GitHub says no release:** the repository must be public, have a published release with a numeric `vX.Y.Z` tag, and contain the expected patch ZIP asset.
- **Reconnect Drive after patch:** expected after reload, because OAuth access tokens aren't persisted to disk.
- **Preserve app state:** avoid clearing site data for `http://localhost:8765`; that would erase remembered OAuth IDs and local favorites. Ordinary updates do not clear site data.

## Security design

- Google requests only GET with `spreadsheets.readonly` and `drive.readonly` scopes.
- OAuth bearer tokens are never put in query strings, GitHub requests, release packages, service worker caches, local storage, or updater HTTP endpoints.
- The patch engine checks ZIP filenames, path traversal, symlinks, required files, complete SHA-256 hashes, version increases, and maximum size. It writes to the per-user app folder, atomically switches active versions, and allows rollback.
- Update mutations require an in-session random header token and exact localhost host/origin. Remote GitHub calls are restricted to public GitHub HTTPS hosts.
- Each browser session must approve Google sign-in separately. No sharing settings are altered.

## Test coverage

- `go test -v ./...` verifies valid/invalid patches, corrupted checksums, ZIP traversal, version comparison, persistence, rollback, reset, local HTTP host/origin guards, and the app shell being served from the installed patch.
- An actual local HTTP smoke test successfully applied `v2.0.1`, served its patched HTML, and rolled back to bundled `v2.0.0`.
- `node --check web/app.js` passed. A full Windows-run test and a live authenticated Drive thumbnail test still need to be done on the user's PC.
