# Jack's Image Vault v2.0 — Windows launcher and update system

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

## Configure GitHub release updates

1. Create a **public** repository, for example `your-user/jacks-image-vault`. Only the app-shell source code is published. **Do not upload a private manifest, a Drive export, personal photos, your spreadsheet ID, OAuth access tokens, or client secrets.**
2. Upload the contents of this source folder to your repository. The included `.github/workflows/release.yml` automatically builds the EXE and local patch ZIP after you push a version tag, then publishes a GitHub Release.
3. For an initial release, tag the source `v2.0.0`. To publish a new update, change your UI files, then create a new tag, e.g. `v2.0.1`. Example commands:

   ```bash
   git add .
   git commit -m "Improve Image Vault thumbnails"
   git tag v2.0.1
   git push origin main --tags
   ```

4. Wait for GitHub Actions to complete and verify the Release contains an asset called **`jacks-image-vault-patch.zip`**.
5. In Image Vault → **Updates**, enter `your-user/jacks-image-vault`, choose **Save repository**, and **Check GitHub**. When a newer valid release is available, choose **Install update** and approve it.

The app uses the public GitHub API. Private repository release downloads are not supported; no GitHub personal access token is required or stored. Requests go only to GitHub's HTTPS endpoints. File hashes are verified against the ZIP manifest and GitHub's release asset digest when present. These checks detect accidental corruption, but **do not provide publisher authentication against a compromised GitHub release or malicious patch author**. Install only releases from a repository you control and trust.

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
