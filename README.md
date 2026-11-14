# Jack's Image Vault — Windows image and media library

**Status:** Working Windows EXE built, Go updater tests passed, local ZIP patch installed and rolled back in an HTTP smoke test. **Live Windows/Google thumbnail verification has not been performed** in the build environment.

## Smart Collections (v2.1 development)

The **Smart Collections** navigation creates virtual albums dynamically from
the existing read-only Drive metadata. Suggested collections cover cats/animals,
aircraft/aviation, travel/places, reaction memes and GIFs. Membership uses
descriptions, tags, filename and category text already loaded from the Sheet.
It is deterministic local rule matching, **not a claim of AI recognition**.

Create up to 40 named custom collections with up to eight conditions each.
Choose **Any rule (OR)** or **Every rule (AND)**. Rule fields: text, filename,
description, tags, folder, category, known date on/after or on/before, file
type, and local favorite status. Results show a **Why here** explanation for
each matching media tile, and a collection can match zero files. Moving or
renaming a file does not create a duplicate, since matching always uses the
current Drive-ID-backed gallery. No file is moved, duplicated, renamed, or
deleted by collection management.

Custom rule definitions are kept in local browser storage **scoped to the
signed-in Drive account and Sheet**. Export and import a JSON backup using the
Smart Collections view. Imports validate schema, field types, size and
duplicate IDs/names, merge new rules only and preserve existing rules on
conflicts. Corrupt existing local storage is preserved rather than overwritten.
The backup contains rules and names, **not photos, tokens, or source file IDs**.
It remains your responsibility to back up local data before clearing browser
storage or changing devices.

New pure `src/smart-collections.js` and browser controller
`src/smart-controller.js` are embedded via their matching scripts in
`scripts/build-smart-collections.cjs` and
`scripts/build-smart-controller.cjs`. Existing updater builds still ship
only the allowed `web/app.js` browser script, not separate runtime modules.
This feature is **not yet in the published v2.0.11 Windows app**; it requires
a tested future v2.1 release.

## Search 2.0 (v2.1 development)

Search operates **entirely on the private media metadata already loaded in the
browser**, without sending search terms or photos to any other service.
Use quotes for a contiguous phrase and combine words across filenames, tags
and descriptions. Text results rank filename matches first, then tags,
descriptions, categories and folder names; select **Best match** in the sort
menu. Other sort choices remain available.

| Syntax | Example | Meaning |
| --- | --- | --- |
| Quoted phrase | `"blue balloon"` | Matches the exact phrase |
| Tag | `tag:cat` | Tags contain the term |
| Folder | `folder:"Memes/Cats"` | Folder contains the phrase |
| Media type | `type:image`, `type:video`, `type:pdf`, `type:gif` | Filters media types |
| Capture date | `after:2025-01-01 before:2025-12-31` | Inclusive known capture/filename date range; unknown dates excluded |
| Review state | `review:pending` | Uses the current local/source review state |
| Favorites | `favorite:true` | Only favorited files |

Multiple filters and terms combine with **AND**. Unsupported filter values show
an error and no results instead of silently returning unrelated files.
Diacritics are normalized for searching while preserving non-Latin scripts.
Folders and file names are never changed by the search.

**Saved searches** store up to 30 named search/filter presets in browser storage
for the current Google account and inventory Sheet. Existing local review notes
are completely separate. Delete a saved search to remove only the preset, never
an image. Like reviews and favorites, saved searches are **not synced across
devices**, and clearing browser site data will remove them.

The pure search implementation is `src/search-engine.js`; run
`node scripts/build-search-engine.cjs` to regenerate the patch-compatible
`web/app.js`, then run the same command with `--check` to verify consistency.
The search controls are part of the UI and are not included in v2.0.11 until a
separate, tested release is published.

## v2.1 development (work in progress)

The v2.1 roadmap is tracked in [GitHub issue #12](https://github.com/zackadoorie-cpu/jacks-image-vault/issues/12).
The first foundation PR introduces a portable, versioned media record contract
with separate visual-evidence and date-provenance states. It is compatible with
the existing **read-only** Google Drive and Google Sheets workflows. **No v2.1
feature is released in the installed app until a separately tested release.**

The browser app remains one `web/app.js` file for updater compatibility. The
shared source for the pure contract is `src/media-contract.js`; use
`node scripts/build-media-contract.cjs` to regenerate the embedded browser
copy and `node scripts/build-media-contract.cjs --check` to verify consistency.
The CI and release checks reject stale generated content. Private Sheets,
photos, local backups and account identifiers must never be added to Git.

## What changed

- Keep your existing Google OAuth web client and inventory Sheet ID. The new app runs on the same `http://localhost:8765` origin, so Chrome/Edge should retain your saved client and spreadsheet IDs. Tokens are memory-only: sign in again on a fresh browser page.
- Gallery thumbnails now use Google's signed thumbnail URL directly as an `<img>` without sending the OAuth bearer token to a third-party thumbnail host. The old implementation tried to fetch that URL with `Authorization` and hid errors, then downloaded whole originals.
- The app fetches metadata in a **bounded five-job queue**, only near the viewport. If a signed preview fails, it tries authenticated Drive media for originals up to **7 MB**, then displays a meaningful error and offers retries. Never more than five Google fetches run in the thumbnail queue concurrently.
- Added thumbnail progress, a Retry failed button, a modal retry button, a 96-image in-memory cache, and request timeouts.
- The native launcher serves built-in assets or a verified UI patch from `%LOCALAPPDATA%\JacksImageVault\releases\`. No Python needed to run the `.exe`.
- Added **Updates** in the gallery: public GitHub releases, local patch ZIPs, rollback, and restore built-in UI.
- The app checks the configured public GitHub repository at most once daily while open (on startup), but **never downloads or installs patches without your approval**.
- Shell-only service worker is network-first, so approved UI patches are visible after reload. No private Drive data is cached by the service worker.

## Importing ChatGPT visual reviews (v2.0.9)

Review batches prepared in ChatGPT can be imported directly without replacing your existing local review records.

1. Download the **image_vault_reviewed_...json** file from ChatGPT.
2. Install v2.0.9 or newer, connect the same Google account, and open **Needs Review**.
3. Select **Import ChatGPT review batch** and choose the JSON file.
4. Review the match/skip count and confirm the local merge. Previous personal corrections take precedence. The app matches Drive file ID and exact filename, skips missing or renamed files, and never modifies source files or Sheets.
5. Open **Reviewed locally** to inspect the newly imported descriptions. Export a full backup if you'd like to preserve the combined work.

The app distinguishes previously reviewed images from genuinely unreviewed images. Historical labels such as *Visually inspected Phase 21*, *Renamed — verified*, and *Visual review: representative animated frame* count as source-reviewed if a visual description exists. An item flagged for missing capture dates, sensitive PDF review, or metadata-only verification remains pending. Representative frames don't prove full GIF/video motion.

This importer accepts a portable `image-vault-review-batch-v1` JSON file containing up to 500 visually inspected records per batch. A single unreviewed item is never automatically approved based on its filename, folder, or text metadata.

## Syncing completed visual reviews from Google Sheets

Choose **Sync Sheet + Drive** in the connected Windows app to fetch the latest
`Search Index`, `Manifest`, and `Folders` values before reconciling Drive
changes. This is a **read-only** refresh. It does not import public snapshots,
replace personal review edits, rename anything, or clear browser review storage.
A Sheets error leaves the previously loaded gallery untouched and displays an
error instead of falsely reporting a successful sync.

The visual-review classifier now uses **Manifest column T (Review status) and
column AC (Analysis method)** by Drive file ID. A verified photo with no EXIF
capture date is already visually reviewed, but its date exception stays in the
separate spreadsheet review queue. Frame-sampled video is acknowledged as a
preview review, not a claim that full motion or audio was inspected. PDF records
and videos with blocked decoding remain unresolved. A newly discovered Drive
file not yet indexed in the Sheet also remains in Needs Review.

The review queue recognizes newer source statuses such as
`Original Drive image visually verified` and `Visually verified against original
Drive image`. A description alone does not count as visual evidence. Missing
EXIF capture timestamps and near-duplicate decisions remain separate review
tasks in the spreadsheet; preview-only **videos** retain their limited visual-preview status, not
full-motion approval, and blocked videos remain pending for manual review. An explicitly deferred local review stays deferred until
you decide otherwise.

The **Discover & verify folders** action in Library Health remains a separate
full Drive-only scan. If the sheet's monitored folder IDs change, the sync
automatically requests a full Drive verification.

**Updating an installed EXE:** Changes merged into the GitHub repository do not
update the already running Windows application. Publish a new numbered GitHub
Release using the existing `Build and publish Image Vault update` workflow,
then open **Updates → Check GitHub → Install update** in the app. The app never
downloads or installs a release without your approval.

## Review workspace (v2.0.8)

The **Needs Review** view is now an actionable local review queue, not simply a filter for empty descriptions.

- **Needs attention:** Images lacking a description, new Drive files, and images explicitly marked not reviewed in the source spreadsheet.
- **Review later:** Defer an item without altering the original filename or metadata.
- **Reviewed locally:** Approve a verified description and optionally add tags. A nonempty description is required before completing a review.
- **Source-reviewed:** Items with descriptions and visual review status already recorded in the spreadsheet remain recognized as reviewed, without pretending you manually approved them. Select **All items** to view the full queue context.
- **Open an item** to edit its visual description and comma-separated personal tags. Choose **Approve & next**, **Save draft**, **Review later**, or **Reset local changes**. Unsaved edits prompt before navigating away.
- **Review counts:** The sidebar reflects outstanding and deferred items. The review toolbar shows your progress.
- **Persistent but private:** Personal reviews are stored in the Windows app's browser storage, keyed to the current Google account and inventory Sheet ID, not in the public repository or in Drive. The app never writes to Google Drive or modifies the inventory.
- **Backup:** Choose **Export review backup** to download a local JSON file, or **Import backup** after explicitly approving replacement of existing local reviews. The import verifies the account/Sheet and validates every entry before replacing anything. Save a backup before clearing browser site data or switching PCs.
- **Sync-safe:** Reviews track the original Drive file ID, so local descriptions survive files moving between discovered folders. Deleted files may still have preserved review notes for a future restore.

These are **manual reviews**, not AI-generated descriptions. Existing spreadsheet descriptions are kept as the original reference. New local corrections do not silently overwrite verified source descriptions.

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
