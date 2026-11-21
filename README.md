# Jack's Image Vault — Windows image and media library

## v2.2.7 — Gallery Cleanup and Keyboard Polish

Retires the v2.2.6 Jump Navigator entirely (markup, JavaScript, styles and
events); the standard gallery, density slider, lazy-loading, Quick Peek,
Manual Albums, and video streaming remain unchanged. Manual Load more now
keeps keyboard focus after a batch replaces the control. The grid/list button
has an accurate hover title, and Back to top respects reduced-motion settings.
No new controls, Google scopes or Drive/Sheet writes. Browser regression tests
cover a synthetic 10,000-file gallery and no Jump Navigator in any result size.
See [v2.2.7 notes](docs/v2.2-phase7-rollback-gallery-polish.md).

## v2.2.6 — Phase 7: Jump Navigator for Large Galleries (superseded by v2.2.7)

Browse extensive filtered collections without manually loading every batch.
A compact navigator appears only for galleries with over 96 matching results.
Use a result number, slider, or First/Middle/Last shortcuts. Turbo Gallery
keeps a bounded number of mounted tiles and lazy thumbnail fetches while
navigating a synthetic 10,000-file collection. Existing sort, filters,
read-only Drive access, video playback and account controls are unchanged.
See [Phase 7](docs/v2.2-phase7-gallery-jump-navigator.md).

## v2.2.5 — Manual Album Quick Actions

Rename manual albums without losing membership, add or remove individual files
in Quick Peek or full media details, and open album management from the gallery.
Removing the current album item keeps the viewer open and refreshes after close.
All actions are private, account-scoped local changes, without Google writes or
new media downloads. See [Phase 6](docs/v2.2-phase6-album-quick-actions.md).

## v2.2.4 — Manual Albums + Bulk Selection

Organize selected gallery images, videos and PDFs into your own private
manual albums without moving or renaming anything in Google Drive.
Select individual files, currently displayed tiles or all results of a
filtered search. Browse an album, remove members, and back up or import
the private album definitions as validated JSON (file IDs and album names,
never the media itself). Albums are scoped to the verified Drive account and
configured spreadsheet.

This release also hardens the gallery More actions menu so programmatic
scroll and focus do not prematurely close it. Existing Quick Peek, Compare,
video streaming, Google sign-in, rename approval and Sheet safety rules
remain unchanged.

See [Phase 5 design, privacy and limits](docs/v2.2-phase5-manual-albums.md).
v2.2.4 includes a versioned UI patch ZIP, Windows EXE, and desktop bundle
only after independent Chromium, Windows, updater and artifact checks.

## v2.2.3 — Quick Peek + Compare Mode

Space on any focused gallery preview opens a keyboard-navigable Quick Peek
of its existing thumbnail. Side-by-side Compare Mode uses two explicitly
selected cached previews, with no automatic originals or video playback.
The existing full viewer stays available for video playback, image details
and local review. Account disconnect clears transient comparison selections.

See [Phase 4 scope, privacy and test plan](docs/v2.2-phase4-quick-peek-compare.md).
v2.2.3 ships with a versioned UI patch ZIP, Windows EXE and desktop bundle,
all subject to the independent release browser, Windows and integrity gates.

## v2.2.2 — Review Center 2.0

Review Inbox now offers a guided start into pending visual reviews. The Needs
Review page distinguishes local notes from source-verified evidence, with
accessible progress, quick status filters, a current-selection starter, and
position context in the review dialog. JSON imports and backups remain in
a disclosure. Existing local review persistence, undo, Drive and Sheet write
approvals are unchanged.

See [Phase 3 scope and safeguards](docs/v2.2-phase3-review-center.md).
v2.2.2 packages the merged, green-tested feature with independent release
checks, a versioned patch ZIP, Windows EXE, desktop bundle and SHA-256 sums.

## v2.2.1 — Phase 2 Gallery Polish

Phase 2 refines the gallery without expanding Google Drive access: visible
active-filter chips, clearer queued/loading/ready/unavailable thumbnail states,
lightweight reduced-motion-aware loading affordances, and playback feedback for
video buffering, seeking and errors. Private-media loading remains bounded,
all established Drive and Sheet approval controls are unchanged, and existing
video streaming and native Windows host paths remain intact.

See [Phase 2 changes and safety plan](docs/v2.2-phase2-gallery-polish.md).
The v2.2.1 release is built from the merged and green Phase 2 source.
The versioned UI patch, native Windows EXE, and self-contained desktop
bundle are published after independent Chromium, Windows and security checks.

## v2.2.0 — Phase 1 UI Makeover

A focused visual update reorganizes the sidebar while retaining all 17
destinations, standardizes local SVG icons, consolidates optional account
controls, simplifies Home with expandable diagnostics, and moves secondary
collection and saved-search tools into a gallery disclosure. Search, sort,
media type, grid/list and the existing five-step density slider remain visible.
Browsing is read-only by default; approved renames and Sheet writes still
require separate explicit consent. This work does not change thumbnail
prefetch, streaming, OAuth scopes, remote data, or the native updater.

See [Phase 1 UI scope and test plan](docs/v2.2-phase1-ui-makeover.md).
For the versioned patch ZIP, Windows EXE, desktop bundle and public SHA-256
checksums, see the GitHub Releases page (v2.2.0). Existing Windows
installations with the v2.1.46+ native host can apply the UI patch ZIP;
the full bundle is also available for a clean Windows install.

## v2.1.49 — Five-step gallery density slider and Micro tiles

The gallery's truncated size dropdown has been replaced with an accessible **five-step slider**, ordered **Large → Comfortable → Compact → Ultra Compact → Micro**. The active density label is always visible, keyboard Home/End and arrow keys work, the layout updates smoothly, and the existing local preference key keeps older settings intact. Preferences now lists Large first and adds Micro last. The surrounding filter toolbar wraps cleanly on narrow screens instead of cutting off the selected label.

The new **Micro** option uses roughly 82px previews (74px on small screens) to fit more media per row than Ultra Compact, while preserving the tile's open, more-actions and favorite controls. Extra descriptions and folder labels are hidden only on the smallest tile style, not removed from detail views. Large-library virtualization uses a matching fixed **146px** Micro row, leaving the cache, thumbnail prefetch, Drive read-only scope and authenticated thumbnail concurrency unchanged.

Chromium tests check monotonic tile column counts, real slider input and keyboard accessibility, preference persistence, Micro details/actions, mobile widths and the 10,000-item virtual gallery. The change is entirely in HTML/CSS/JS and needs only the normal UI patch ZIP on an existing v2.1.48 Windows installation.

## v2.1.48 — Instant visible gallery preview queue

The gallery now **queues every tile already visible on the screen as soon as it is rendered**, without depending on IntersectionObserver notifications or the first scroll. Tiles within roughly 320 pixels of the viewport are queued next to make downward scrolling smoother, while distant rows remain lazy and the 10,000-item virtual gallery keeps its small DOM window. New rows appended by auto-load also enter the viewport queue immediately. A frame-throttled scroll/resize check prioritizes newly visible rows before preloading nearby items.

All on-screen thumbnails are *scheduled* together in top-to-bottom order, not fetched without limits: at most **eight authenticated Drive metadata requests** run simultaneously, and the v2.1.47 small MP4/WebM poster fallback still decodes **one video at a time** with a strict **5 MiB** automatic original limit. This change does not download the entire collection, disable cancellation or size limits, persist raw media, or write to Google Drive/Sheets.

The new real Chromium regression creates 90 synthetic records, intentionally suppresses IntersectionObserver callbacks, confirms that every visible tile is queued immediately before any scroll, distant tiles remain untouched, scrolling queues the next visible region, and no more than eight network requests are active. Linux stress/Go safety tests and Windows WebView2/updater tests remain required. **UI-only update**: v2.1.46+ desktop hosts may use the standard v2.1.48 patch ZIP, with no new native installer required.

## v2.1.47 — Blank video gallery preview repair

The earlier streaming releases did not fix blank **gallery cards**: the gallery tried Drive's `thumbnailLink` first and, unlike images, treated a missing or rejected **video** thumbnail as final. In this release, visible MP4/WebM cards with indexed originals up to **5 MiB** attempt a single bounded authenticated download and generate a JPEG of the first decodable frame **locally**. Auto poster decoders are limited to **one at a time**, respect logout/cancellation, and use the existing temporary, evictable thumbnail cache. Files over 5 MiB are not downloaded automatically. Open details → **Generate thumbnail** (12 MiB existing limit), or **Play**, for larger files.

The new Chromium regression fixture verifies an actual synthetic WebM produces a visible thumbnail on the video tile, and that a 6 MiB file is not downloaded in the background. No private user video bytes, thumbnails, changes to Drive metadata or Sheets edits are published. This fixes missing posters, **not evidence that every codec and upstream Drive stream will play**. If playback still fails after selecting Play, use the explicit media error in the opened viewer to report the separate issue. The change is UI-only and does not modify the native server, encrypted saved sign-in, or rename approval workflows.

## v2.1.46 hotfix — small videos and portable desktop upgrades

The v2.1.45 streaming feature only handled MP4/WebM above 32 MiB. Files under that size still used the older Blob-only path, including an overly strict MP4 header check and an early container-only codec rejection. **v2.1.46 attempts protected native streaming for every video size**. A small (≤32 MiB) video can retry once via a bounded, authenticated in-memory download if the native host is unavailable or playback fails. Native Google Drive byte-range requests for small media also accept a verified, bounded full response if Drive ignores Range. Other commonly indexed containers (QuickTime, M4V, Ogg and Matroska) may be attempted, but codecs must still be supported by the browser.

The desktop Windows launcher no longer refuses to start when older `Jacks_Image_Vault_*.exe` files remain in the same extracted folder. It selects the highest correctly formatted version without touching older files. **Install the full v2.1.46 Desktop Bundle, including its updated `Jacks_Image_Vault_Desktop.exe` and its versioned backend, not just the patch ZIP.** Close earlier running launchers before upgrading if port 8765 belongs to an older process. Your existing Google authorization and files are not deleted, renamed or moved by this update.

CI now decodes a real fabricated 590-byte VP8 WebM with native video streaming **and** the legacy small-file fallback. A thumbnail marked unavailable does not prove playback failure; open the media viewer and select Play to test it. Unsupported codecs or inaccessible Google Drive originals still show an explicit error and can be opened in Drive.

See [native streaming and regression safeguards](docs/phase12c-large-media.md).

## Phase 12C — Large videos and original photos (v2.1.45)

Large MP4/WebM videos stream in the player through a temporary, protected Windows loopback server ticket instead of downloading an entire file into a Blob. HTML5 seeking and pause are available subject to browser codec and Google Drive Range support. Larger animated GIFs stream on demand, and JPEG/PNG/WebP photos offer **Full resolution** with Fit/±Zoom controls. Small-file playback and the existing 12 MiB storyboard cap remain unchanged. Access tokens and private contents are never persisted or sent to GitHub. The original Google files and Sheets are read-only throughout this feature.

**A full v2.1.45 Windows EXE or Desktop Bundle is necessary for native streaming. A UI-only patch applied to the old v2.1.44 launcher cannot add the server endpoint.** Read [Phase 12C security, size and format limits](docs/phase12c-large-media.md).

## Phase 12B — Fingerprint evidence audit (v2.1.44)

Similarity Lab now reads existing `Manifest!V:W` SHA-256 and first-frame pHash values into a **read-only, account-bound** audit, rather than relying only on matching filenames and sizes. It shows recorded versus live-session evidence, missing fingerprints, malformed values, byte-equality leads, and separate perceptual candidates. User-approved batches of up to 25 original JPEG/PNG/WebP images (8 MiB each, 48 MiB per batch) compute SHA-256 in memory after a live ID/name/MIME/size/version preflight and readback. Cancel, clear, disconnect, and Sheet refresh protect session isolation; the process never writes hashes, media, metadata, or filenames to Google. Unsupported and unscanned files remain explicitly incomplete. See [Phase 12B safeguards and test plan](docs/phase12b-fingerprint-audit.md).

## Phase 10H — Smart Rename Queue (planned v2.1.35)

**Filename Review → Smart Rename Queue** now reads reviewed `Manifest!R` proposals
directly from the read-only Google Sheet snapshot. Select 1–25 names, preview
the exact live Drive IDs, file versions, rename permissions, complete sibling
folder names, original Manifest/index IDs, and Search Index formulas.
Only after explicit batch approval and separate *temporary* Drive metadata
and Sheets editing consent does the app process selected files sequentially.

Each completed file has a verified **name-only Drive PATCH**, an independent
read-back, and exactly one **Manifest AD** update whose existing Search
Index C ARRAYFORMULA is verified. No original Manifest C, descriptions, tags,
file contents or formulas are modified.

Progress is kept in an account-and-Sheet-bound local write-ahead journal,
with a status per file. Partial or uncertain updates stop the queue and are
**never retried automatically**. A verified Drive change awaiting a Sheet
write can be reconciled individually with a new authorization. Synced
changes provide an individual **Preview undo** and a separate confirmed
Drive restoration plus Manifest AD synchronization. The legacy one-file
rename and Activity & Undo screens remain available.

The batch still has a real non-atomic interval between Google Drive and
Google Sheets, plus no cross-editor compare-and-swap. Live rechecks limit
the window but cannot provide transaction isolation. Existing Windows
read-only saved login is unchanged. **No Google data is changed by
installing the patch or simply selecting names.**

See [Phase 10H design and recovery limits](docs/phase10h-smart-rename-queue.md).

## Phase 10G — Filename Plan Import & Guided Queue (v2.1.34)

A saved filename proposal JSON **is not** a ChatGPT visual-review
batch. Previously, selecting a filename export in the visual-review
importer produced the confusing “Expected a review batch containing
1–500 visual reviews” error. Phase 10G recognizes the two supported
export formats (Filename Review and Video Rename Desk) and directs
valid filename plans to their own **Filename Review → Import filename
plan (JSON)** queue.

Import checks the connected Google account/Sheet, each exact Drive ID,
original filename, MIME, Manifest row, folder, previously reviewed
evidence, Windows-safe extension, and cross-file name collisions.
Only 1–25 valid proposals are accepted. A plan is held in private
session memory and presents one item at a time via **Prepare next
imported filename**. Nothing is automatically renamed or written to
Sheets. A separate, verified Drive rename/undo and Manifest AD
reconciliation are still required for every file.

When the user accidentally selects a filename plan through **Import
visual reviews (JSON)**, the app detects its schema and offers to
import it into the correct local queue instead of misclassifying it.
Invalid, stale or wrong-account plans fail closed. Clearing local
staging also clears the imported queue; export a copy to reload later.

See [Phase 10G safety notes](docs/phase10g-filename-plan-import.md).

## Phase 10F — Guided reviewed Sheet filename rollout (v2.1.33)

**Filename Review** now exposes a dedicated **Manifest R** filter plus
**Prepare next Sheet proposal**. One reviewed, conflict-free suggestion
is staged locally at a time. A staged selection is never silently
replaced, and each real Drive rename still uses the separate live
metadata preflight, temporary Google edit grant, explicit confirmations,
one-file PATCH and read-back/undo history. There is no bulk rename.

**Video Rename Desk** adds a handoff to the exact reviewed filename,
without importing another local draft or writing to Drive. The user can
then visit **Sheet Approvals** to reconcile a *verified* Drive rename into
the source-only **Manifest AD** cell, leaving the calculated **Search
Index C** formula intact.

Reviewed **photo** proposals from Manifest R are supported when no
EXIF camera capture date is available; descriptive names never invent
timestamps. The live Sheet now contains 30 new proposals (25 videos,
five photos). These are still proposals, not renamed Drive files.
Windows saved login and default read-only access remain unchanged.

See [Phase 10F workflow and safeguards](docs/phase10f-guided-sheet-rename.md).

## Phase 10E — Formula-safe filename reconciliation and Sheet proposals (v2.1.32)

**Corrected an important Phase 10D assumption:** the live inventory's
`Search Index!C2` is an **ARRAYFORMULA**, not a writable filename cell.
Reconciliation now writes **only `Manifest!AD` (Current filename)** for
one verified Drive rename or undo. Search Index column C refreshes through
its original formula. Read-only preview checks live Drive ID, name, MIME,
parent and version, exact Manifest/Search Index ID and effective filename,
and the existing formula anchors before and after the one-cell update.
It stops rather than overwriting any formula or another editor's value.

The app now also **loads `Manifest!R` proposals** when building its Video
Library, Rename Desk and Filename Review screens. The newly staged video
titles appear as suggestions while the actual Drive originals remain
unchanged until an independently approved rename. Reviewed proposals are
not presented as completed renames. There are no changes to Windows
Stay Signed In, default read-only scopes or any media contents.

See [Phase 10E safety notes](docs/phase10e-formula-safe-reconciliation.md).

## Phase 10D — Original reconciliation implementation (v2.1.31, superseded by 10E)

A new independent panel in **Sheet Review Approvals** locates recent
**verified** Drive filename changes in your account-bound private Activity
history. It previews the exact Drive filename plus the old filename in
**Manifest!C** and **Search Index!C**, and verifies both rows' Drive
identities (**Manifest!D**, **Search Index!K**) against the real Drive file.
On one individually approved item, it writes *only* those two column-C
cells in a single Sheet update after separate temporary Google Sheets
permission and two user confirmations. A post-write read checks both
cells and the Drive file, while an uncertain write is never retried
automatically. Newly staged filenames alone cannot trigger a Sheet write.

The workflow is restricted to one file at a time, uses the already
working temporary Sheets authorization, and leaves the Windows encrypted
read-only sign-in alone. See
[Phase 10D safety details](docs/phase10d-filename-reconciliation.md).
It neither renames Drive files nor modifies reviewed descriptions, tags,
statuses, photos or video contents.

## Phase 10C — Safe Rename Undo (planned v2.1.30)

**Activity & Undo** now offers **Preview Drive rename undo** for a verified
one-file Drive rename in the private, account-and-Sheet-bound history.
A read-only preflight checks the exact recorded current name, file ID,
parent folder, MIME, edit permission, version and all sibling filenames
for a collision with the original name. A separate temporary, restricted
Google `drive.metadata` authorization and two confirmations are required
before a single name-only PATCH, followed by independent read-back.

Older or uncertain changes to the same file block replay of previous
history. Verified undo marks the original rename undone and records its
own activity entry. The Google Sheet is never modified. No token is
persisted or reused for the Windows Stay Signed In session. The native
OAuth broker from the **full v2.1.29 Windows Desktop Bundle** remains
required; this stage adds no new native authorization endpoint.

Read [the Phase 10C safety notes](docs/phase10c-safe-rename-undo.md)
before trying a real undo. No real user's Google files are modified by tests.

## Phase 10B — Explicit Google Drive rename (v2.1.29)

Filename Review now offers a separate, one-file-at-a-time **Verify one
staged Drive rename** workflow. It checks the live Drive file, stable
Manifest ID/row, original name, parent folder, MIME, version, edit rights
and all known sibling filenames. Before the name-only PATCH, it requires
a clearly disclosed temporary Google Drive metadata edit authorization
and two explicit confirmations, followed by live read-back verification.
The Google "drive.metadata" scope is restricted and covers file metadata
across the account, not only this one file. The app deliberately limits
its own operation to the single chosen filename. Temporary edit tokens
are not stored. No delete, move, trash, Sheet update or media-content
change is implemented. The Windows read-only Stay Signed In grant remains
unchanged.

IMPORTANT: **Install the full v2.1.29 Windows Desktop Bundle once** to
receive the new protected rename OAuth endpoint. A UI-only patch on the
old native EXE does not enable the rename authorization. The Google
Sheet's indexed name may remain old until separately reindexed.
See docs/phase10b-guarded-drive-rename.md.


## Phase 10A — Intelligent Filename Review (v2.1.28)

A new **Intelligent Filename Review** workspace merges meme, photo and video
filename candidates in one private queue. Memes use reviewed tags, videos
use existing reviewed title metadata, and photos use strict **EXIF capture
date/time** from Manifest!P (Search Index!H), not filename-derived dates or
Drive upload/modified timestamps. Date-only EXIF evidence is labeled
explicitly; a nonexistent capture time is never invented. Proposed names
preserve the original extension and undergo Windows filename, same-folder
collision and competing-proposal checks. Up to 25 individually staged
proposals may be exported as a private **unapplied** JSON plan. There is
**no Google Drive rename, Sheet edit, new OAuth permission or background
write** in this release. Windows DPAPI auto-login remains unchanged.
See docs/phase10a-intelligent-filename-review.md.


## Phase 9B-4 — Unified Library Desk (v2.1.27)

The new **Library Desk** unifies the read-only status of Review Inbox,
Rename Desk, Sheet Approvals, and Activity & Undo. Search up to 20,000
loaded records by filename, Drive ID, folder, or Manifest row, inspect
the indexed Sheet values next to local reviews, and see evidence-based
filename proposals and recorded undo eligibility without navigating
through five screens. Buttons route to existing guarded read-only
previews. Google Sheet writes still require separate authorization,
preflight, and two explicit confirmations. No Drive renames, browser
credential changes, background writes or new Google scopes.
See docs/phase9b4-unified-library-desk.md.


## Phase 9B-3 — Conflict-safe approved Sheet undo (v2.1.26)

Verified Sheet approvals now retain individual bounded before-and-after
snapshots for each Manifest row. Activity & Undo offers Preview Sheet undo
after a fresh live comparison. A separate temporary Sheets authorization,
identity checks and two confirmations are required to restore the original
M/N/T cells of that row. Other rows are not changed, and any newer edit
blocks an undo. Older count-only approvals cannot be reconstructed. No
background writes, Drive mutations or Windows auto-login changes are made.


## Phase 9D — Windows Power Tools (v2.1.25)

Ctrl+K opens a searchable keyboard command palette with bounded private filename matches, safe navigation and explicit read-only verification. Gallery tiles offer right-click and keyboard-accessible actions (Open, local Favorite, Copy filename, Open in Drive); nothing silently renames, deletes or edits Google content. The sidebar can be resized with pointer or arrow keys; only its width is persisted in browser profile storage. Native WebView2 remembers window size and maximized state in a separate local non-secret settings record. All Google sign-in/DPAPI storage paths are unchanged. See docs/phase9d-windows-power-tools.md.


## Phase 9C — Vault Pulse (v2.1.23)

The homepage gains read-only description and visual-review coverage, verified
Sheet-to-Drive differences, folder failures, priority recommendations, and
recent actions from the private on-device Activity ledger. Sheet differences
are never represented as dated Drive events. No new Google permissions or
background write actions are introduced.


## Phase 9B-2 — Sheet Approvals and Windows saved sign-in

**Windows auto-login:** An explicitly approved Desktop OAuth login can save a
read-only refresh grant encrypted for the current Windows user; subsequent
launches can reconnect without another Google browser round-trip. A saved
grant is forgotten on Disconnect or via the connection settings. A first
login after upgrading is required because previous builds never requested
offline access.

**Sheet Approvals:** Stage locally reviewed records with exact Manifest
before/after previews and a final approval. A temporary, separately granted
Sheets editing token is used only to write Manifest descriptions, tags and
review statuses after live Drive-ID and row checks. No Drive file renames,
moves or deletions. No spreadsheet auto-write on startup; Sheet-edit grants
are never stored. An uncertain write is not retried automatically.

[Security and verification details](docs/phase9b2-sheet-approval-and-windows-login.md).

## Phase 9B-1 — Activity & Local Undo

A new **Activity & Undo** section under **Review & Health** records recent
read-only inventory loads, local review saves and resets, review imports,
exported rename proposals and cleared staging, isolated to your Drive account
and configured Sheet. Save a local review note, then undo it only if the current
note still matches the recorded result. More recent changes are protected.

The browser-local journal is limited to 120 entries / 480 KiB, supports
private export and explicit clear, and does not store Google tokens or media
bytes. Exported logs can include private local review descriptions and tags.

**App-update rollback has not changed.** Drive/Sheet write-back and undo of
remote changes are not enabled by this release; current Google permissions
remain read-only. See [Activity & Undo safety details](docs/phase9b-activity-local-undo.md).

## Phase 9A — Turbo Gallery Engine (next release)

Large galleries now render through a **bounded, two-way virtual tile window**.
Once a filtered collection exceeds 320 items, Image Vault keeps at most 32
overscanned rows of cards in the DOM while retaining the full result order.
Offscreen space is represented by measured-layout row spacers, so you can
scroll down and back up without permanently accumulating thousands of cards.
The existing automatic Load More and manual Load More preferences still govern
how many records are browsable, and previous browsing positions are preserved.

Existing GIF, WebM, MP4, image and PDF playback, reviews, favorites, saved
searches and sorting are unchanged. Nearby thumbnail requests remain
intersection-observed and at most five run concurrently. A new in-memory LRU
limits thumbnail entries to **96 and 48 MiB**, whichever comes first; evicted
object URLs are released. Fast lookup by file ID avoids repeated full-library
searches while requesting thumbnails.

The app is still **read-only** to Google Drive and Google Sheets. This update
does not add any rename or write-back permissions. Your existing
**Roll back one version** and **Restore built-in UI** continue to work. A
separate library Activity & Undo history belongs to the future Smart Library
Manager 2.0 phase, where each approved write will need an explicit reversible
audit record and conflict detection.

Chromium CI scroll-tests 10,000 entirely synthetic media records, checks
that the DOM remains bounded, reverses scrolling and verifies filtering.
Other unit tests validate row-spacer geometry and the thumbnail cache budget.
There is no live Drive access in these performance tests.

## Optional native WebView2 Windows window (desktop preview)

The release now offers a separate **Desktop Bundle ZIP** containing a
self-contained WebView2 Windows host and the matching Go server. Extract both
EXEs together and open `Jacks_Image_Vault_Desktop.exe` for a real standalone
window with a Vault icon and Windows taskbar identity. The established
`Jacks_Image_Vault_VERSION.exe` launcher still opens Edge/Chrome as before.

The native window uses the existing *system-browser* Desktop OAuth PKCE
bridge, not Google's prohibited embedded authorization flow. On first use,
enter your Sheet ID in the new Windows desktop setup area; no Web OAuth client
ID is needed inside the embedded profile. WebView2 Evergreen Runtime is
required, but the packaged host includes its own .NET runtime.

**Do not use the Desktop Bundle ZIP as an in-app UI patch.** Download the
separate small `jacks-image-vault-patch.zip` asset for that purpose.

See [native WebView2 installation and security notes](docs/webview2-desktop-preview.md).
The desktop host is opt-in; release builds and existing settings remain
compatible.

## Optional native Google OAuth bridge (Windows beta)

In **Google Drive setup**, Windows EXE users can opt into a separate
**Desktop application** OAuth client. This opens authorization in the OS
browser, uses a random localhost callback with PKCE S256 + one-time state,
and supplies the existing gallery only a short-lived read-only Drive/Sheets
access token. The existing Google web sign-in remains the default.

No account password, authorization code, Desktop client secret or refresh
token is saved. This beta does not support automatic Desktop reconnect. It
requires a Google Cloud **Desktop app** OAuth client in addition to the
existing Web app client and a newly built native EXE. Full WebView2 hosting
is still future work, not included in this phase.

See [Desktop OAuth setup and security notes](docs/desktop-oauth-bridge.md).

## Windows desktop window integration (next phase)

The native launcher now recognizes certain **verified Microsoft Edge installed-app
shortcuts**, so Windows can use the PWA's own taskbar/app identity and current
Edge Google login. It verifies the exact local Vault URL, trusted Edge
executable, and Web App ID before running a shortcut; if recognition fails,
the existing Edge/Chrome window opens as before. Shortcut locations can vary
across Edge versions, so this is intentionally best-effort.

The backend also supports an internal `--serve-only` mode for later native
desktop hosting. This mode is not required for ordinary use.

A full WebView2 replacement is **not enabled**: Google forbids OAuth sign-in
inside embedded WebViews. Changing the authentication approach needs a separate
system-browser OAuth broker and testing. See
[Windows native window roadmap](docs/windows-native-window-roadmap.md).

## Windows integration: recoverable shortcuts and browser-window lifecycle (v2.1.16)

The install panel now distinguishes **Windows launcher setup** from an optional
Edge/Chrome browser-app installation. In a newly built Windows EXE, open
**Install app → Set up Windows shortcuts** and confirm the native Windows dialog.
The native installer then:

- Copies the running signed-or-unsigned launcher (unchanged bytes) to a
  versioned per-user location, `%LOCALAPPDATA%\\Programs\\JacksImageVault\\`,
  and verifies its SHA-256. An existing different executable is **not overwritten**.
- Creates or updates `Jack's Image Vault.lnk` on the current user's Desktop
  (including OneDrive redirected Desktop locations) and in the Start Menu.
  Each shortcut points to the **versioned EXE with the embedded four-color icon**.
  A shortcut belonging to a different app is never replaced.
- Keeps the same localhost origin and browser profile for the existing Google
  OAuth flow and on-device settings. No Drive or Sheets writes, elevated privileges,
  registry changes, scheduled tasks, or auto-start entries are made.

The feature uses a nonce-checked, same-origin POST endpoint plus a separate
Windows confirmation. A browser-only preview or an older EXE cannot expose the
native setup action. UI-only ZIP patches **cannot add the native installer**;
download a newly built EXE first. To refresh the shortcuts after a newer native
release, run that EXE and choose **Set up Windows shortcuts** again; older
versioned EXEs remain for manual recovery.

**Taskbar:** The EXE shortcut starts the localhost server, not the browser
window. For the running Vault window to have its own app icon and taskbar group,
open `http://localhost:8765/` in a normal Edge browser tab while the
native EXE is running, install the browser app, then use `edge://apps` →
**Details → Pin to taskbar**. The browser app is still browser-hosted, not a
WebView2 replacement. **A pinned PWA cannot start the localhost server by
itself.** Start the native EXE from its Windows shortcut after a full shutdown,
then use the PWA pin for its distinct running-window identity.

**Window shutdown:** App documents now send nonce-authenticated heartbeats.
When the last registered app window closes, the native server releases
localhost after a 15-second reload grace. Crashed/browser-killed documents
eventually expire by a four-minute heartbeat TTL. The server does not
auto-shutdown when an older patched UI or synthetic test never registered,
preventing accidental data loss on unsupported clients. Closing only the
browser window in older native releases may still leave the EXE running.

**Recoverable setup:** The Desktop and Start Menu shortcuts are staged and
preflight-checked together. Existing valid shortcuts are backed up and a
private journal tracks incomplete commits. Ordinary setup failures restore
both prior shortcuts, while the next run repairs a crash interrupted between
updates. If shortcut setup fails, a newly copied EXE is cleaned up only when
the bytes match the source. User-owned unrelated shortcuts remain untouched.
The tests explicitly simulate both a mid-commit failure and a process crash.

Windows setup can also be invoked manually as `Jacks_Image_Vault_VERSION.exe --windows-setup`.
The setup is entirely optional and makes no change merely by opening the panel.

## Multicolor folder branding and Daylight contrast (next UI release)

**New app mark.** The sidebar, browser tab and PWA reference one clean folder/photo
symbol with Google's familiar green, yellow, blue and red around a dark frame.
The scalable `web/icons/icon.svg` is the source of truth. The release build
renders 180/192/512px PNG icons, a safe-zone PWA icon, and a multiresolution
Windows ICO; the ICO is compiled into the **newly built Windows executable**.
Existing desktop EXEs do not change their Windows Explorer icon from a UI-only
patch; install the newer EXE if you want that resource updated. The app's
browser-chrome favicon and sidebar logo are updated by an ordinary UI patch.

To regenerate icon outputs locally, install CairoSVG 2.8.2 and Pillow 11+,
then run `python3 scripts/render-brand-icons.py --ico build/Jacks_Image_Vault.ico`.
The generated PWA PNG assets are included automatically in verified release ZIPs.
The Windows EXE build also uses `x86_64-w64-mingw32-windres` to embed the ICO.

**Palette consistency.** Collection search, progress pills, navigation indicators,
review panels and related controls now follow the active palette instead of
retaining black or charcoal legacy styles. Daylight Pearl includes a readable
transparent search input inside its light collection-search wrapper. Browser
tests cover the known regression without accessing private images or accounts.
No Google Drive or Google Sheet permissions or files are changed.

## Vault Home 3.0, palettes and Google reconnect (released in v2.1.11)

**Home makeover.** The landing screen now has a visual gallery-inspired hero,
read-only connection status, live description coverage, quick actions for Video
Library, Rename Desk, Smart Collections and Library Health, and counts for
videos, folders, favorites and items needing review. All counts come from the
current in-memory, authenticated library, not a static public sample. Description
coverage is *not* proof that the original files or videos are fully verified.

**Appearance.** App preferences offer Midnight Violet, Deep Ocean, Ember Glow,
Evergreen and Daylight Pearl (light mode). Choosing a palette previews it live.
Cancel or Escape reverts to the saved theme, while Save persists the palette
locally across ordinary app updates. The selection does not leave the device
or change any Google Drive files.

**Google connection.** The old code forced a new Google consent prompt on
every Connect click. A returning user now requests the existing read-only
grant without forcing consent; Google may still show account or permission
prompts. Opt-in **Try reconnecting automatically** in App preferences after
a successful verified connection to store only the OAuth client ID, configured
Sheet ID and Drive account permission ID, not access tokens, refresh tokens,
credentials or passwords. At the next app launch, one silent Google token
request uses an existing browser/Google grant, provided the browser permits
it. The token is held only in memory. The Drive account ID is revalidated
**before any Sheet read**. Any failed, blocked or different-account attempt
falls back to **Connect Drive** with a readable message.

Some browsers or Google policy require a user gesture for Google OAuth, and
some Windows app WebView sessions may not share browser cookies. There is no
guarantee of password-free unattended login, and no refresh-token or service
backend is introduced. Explicit Disconnect disables startup reconnect, revokes
the current access token through Google when supported, clears in-memory media
and the stored account binding. Changing OAuth Client or Sheet clears that
binding too. All calls remain read-only; no extra OAuth scopes.

**Testing:** Linux Go/JS regression tests, native Windows EXE install and
rollback, Chromium synthetic-Google E2E for opt-in and wrong-account refusal,
theme persistence/revert and responsive home layouts. Do not publish this
feature until all gates are green.

## Video Rename Desk and UI refinements (released in v2.1.10)

**What's new:** Video Library has an on-device title/tag/folder search box and
a direct path to **Rename Desk** under the grouped Review & Health sidebar.
Use `Alt+5` to open it. The Rename Desk displays a searchable, paginated
list of videos, source-review labels, a current-versus-proposed filename editor,
same-folder collision warnings, and explicit individual staging. Export at most
25 staged video changes as a locally downloaded JSON approval plan with the
exact original filename, Drive ID, Manifest row and intended undo name.

**Safety boundary:** This is a **planning and UI** PR, NOT permission to
rename the Drive files. Exports and staging are non-mutating, stored only
in session memory, and automatically cleared when disconnected. No
`spreadsheets` or `drive` write scope is introduced. Actual renaming
and undo require separate verified, user-approved Drive and Sheet
operations. The detailed protocol is at
[Video Rename Desk safeguards](docs/video-rename-desk.md).

## Compact sidebar and readable video titles (released in v2.1.9)

- The sidebar uses native, keyboard-operable Library, Explore Tools and Review
  & Health sections. Command Center remains directly accessible, all prior
  `data-view` destinations and keyboard shortcuts remain. Expanded group
  preferences stay on the local device and have no account or file identifiers.
  Keyboard shortcuts reopen the matching collapsed group.
- In Video Library, **Readable titles** is the default. For timestamp-like
  filenames, it constructs a display-only title from existing visual review
  tags or, where tags are insufficient, an excerpt from the existing visual
  description. It does not download any video or generate new visual evidence.
- The original Drive filename is shown beneath a suggested title, with an
  explicit **Drive name unchanged** label. Select **Original Drive filenames**
  to switch back to the exact file names at any time. Already descriptive
  filenames continue to be shown naturally.
- This feature **does not rename Drive files** or edit the Google Sheet. Actual
  filename changes require a separate explicit approval and verified rename
  journal, consistent with Phase 8D. This implementation is independent of
  Phase 8B Sheet write-back.
- Run `node --test tests/video-titles.test.cjs`, full JS/Go suites, browser E2E,
  mobile and Windows smoke, and source-bundle parity before releasing.

## Phase 8A: Smart Review Inbox (released in v2.1.7)

The new **Review Inbox** is an optional read-only screen that groups live new
Drive IDs, unfinished visual reviews, deferred items, and reviewed meme images
with opaque filenames. Filename suggestions use **already reviewed tags**, not
new visual analysis or any external AI service. They are editable **dry-run
previews only**, with same-folder duplicate, extension, unsafe character and
Windows reserved-name checks. The existing image detail viewer remains the
place to inspect images and save **device-local** review drafts.

The first implementation deliberately does not request Sheets/Drive write
scopes, update the Manifest, rename files, create approval history or perform
undo. The separate next milestones will add opt-in Sheet writeback with
account/Sheet/file-ID/row/field conflict checks, user confirmation and
recoverable audits. Actual Drive renaming requires its own explicit scope
and protections. The existing historical Review Queue for EXIF/duplicates is
not modified. See [Phase 8 roadmap](docs/phase8-smart-library-manager.md)
for the audited column mapping, formula-boundary limitations, risks,
milestones and acceptance tests.

Run `node --test tests/review-inbox.test.cjs` and both
`scripts/build-review-inbox*.cjs --check` checks. The CI Chromium run uses
synthetic accounts and library metadata only. Merged in PR #35 and released as v2.1.7 after Linux, Windows and
Chromium browser tests passed. Future write-back features remain separate.


**Status (2026-11-14):** **v2.1.11 is the latest published release**, including the opt-in Google silent reconnect attempt, redesigned Vault Home dashboard, five color palettes including Daylight Pearl, plus the v2.1.10 review-only Video Rename Desk. Google may still require manual confirmation; no access tokens are saved. Video filename plans remain unapplied, and Drive/Sheets retain read-only OAuth scopes. Phase 8B/8D actual write-back and verified renaming require separate explicit approval.

## Phase 7: updater HTTP 403 recovery and release hardening (included in v2.1.6)

**Why:** Older Windows EXEs ask `api.github.com/repos/OWNER/REPO/releases/latest` for public release metadata. If that endpoint returns HTTP 403, the older native updater fails before it can invoke its existing release-ZIP download fallback. The repository can be public and have valid releases even when this API call is blocked.

- **Native discovery fallback:** For API 403/401/429/5xx and unreachable API requests, the new Windows executable consults the official public `https://github.com/OWNER/REPO/releases/latest` redirect. It accepts only an exact same-repository HTTPS release-tag URL with a three-number version. An off-repository redirect or malformed version fails closed.
- **Truthful provenance:** When the release tag comes from the public page, the app explicitly says the ZIP asset is *not independently listed*. Installation remains a separate confirmation and verifies the downloaded ZIP schema, allowlist, SHA-256 hashes and matching release version before updating any file.
- **Manual fallback at all times:** Updates displays a vetted link to the repository's public releases page even when both native network paths fail. Download `jacks-image-vault-patch.zip` in a browser, then select **Verify & install ZIP**. No credentials, Google images or OAuth scopes are sent to GitHub.
- **Native fix requires a new EXE:** The ZIP replaces only `web/` UI files. Installing a ZIP onto an older `v2.1.5 · patched` executable cannot update its Go updater. Install the upcoming new **Windows EXE** after publication to receive the native 403 recovery code; leave the old executable closed to avoid port 8765 conflicts.
- **New EXE beats stale local patches:** If a previous ZIP-installed UI is older than the native EXE's built-in version, the native app now serves its newer bundled UI on restart and retains old patch files without activating them. Rollback cannot silently downgrade below the bundled interface. A non-error notice explains the preference; newly installed patches can still be rolled back or redone.
- **Release gates:** Publishing now requires fabricated Playwright browser tests, Go and JavaScript regressions, real Windows EXE startup smoke, a versioned ZIP with an exact built-in asset allowlist, both inner and published SHA-256 checksums, and version/release preflight. Invalid or pre-existing version tags are rejected.
- **Recovery:** A failed ZIP install must leave the current UI in place. The native app retains a previous UI state for rollback, or can restore its bundled baseline. User browser settings and Drive media are outside these installer operations.

Test with `go test ./...`, `node --test tests/*.test.cjs`, `python3 -m unittest discover -s tests -p 'test_verify_release_assets.py'`, both workflow CI environments and a hands-on Windows upgrade/restart/rollback. Phase 7 has **not** been released just because its GitHub PR passes. No private files belong in any public release.
## Phase 6: Command Center, accessibility and browser E2E (included in v2.1.5)

The Overview screen is now a **Command Center** that separates data sources, evidence
and operational states rather than reporting guessed live totals.

- **Sheet snapshot:** The number of media records loaded from the latest authorized
  Sheets read, labeled as such with the session-local load timestamp.
- **Verified Drive:** Live file counts and differences appear only after complete
  folder verification with no outstanding folder failures, discovery errors, or
  in-flight scans. Partial scans, cached metadata and failed checks cannot be
  mistaken for a fresh full verification.
- **Sync evidence:** Last attempt, last successful Drive sync in this browser
  session, last change check and last full verification are separate. Even quiet
  background errors remain visible until the next successful check. The user can
  initiate a safe Sheet+Drive refresh or full Drive metadata rescan.
- **Review and media:** Local review queue status, four separate video visual
  evidence levels, and browser preview failure/queue telemetry are presented
  without claiming that posters or playback events verify full video or audio.
- **Keyboard and accessibility:** A skip link, accessible heading and status
  regions, visible focus styles, native dialog focus handling and return,
  keyboard-help modal, Alt+1/2/3/4 navigation, ? for shortcut help, / for search,
  small-screen layouts and reduced-motion scrolling.
- **Privacy:** Original Google Drive files, Google Sheets and OAuth scopes are
  unchanged. No background uploads, deletions, renames, or recording of private
  image content. Only fabricated Drive and Sheets records are allowed in the
  Playwright browser test.

Run `node --test tests/command-center.test.cjs`, both
`scripts/build-command-*.cjs --check` scripts, and `node tests/browser-e2e.cjs`
with Playwright Chromium installed. CI enforces these alongside existing Linux
and Windows native executable smoke tests.

**Release gate:** This phase is not published. The final interactive Windows
Edge/Chrome check still needs to verify keyboard shortcuts, full sync status
changes, failed Google refresh, modal focus return and small-screen behavior
against the intended app. Never silently update an installed EXE.

## Phase 4: Similarity Lab (included in v2.1.5)

The read-only **Similarity Lab** compares images in two deliberately different ways:

1. **Drive metadata leads:** compares up to 20,000 existing indexed image records by case-normalized exact filename and byte size; lists up to 120 candidate groups, with an option to show cross-folder matches. These are **possible duplicates only**, not proof of identical bytes or visual similarity. Files are linked to the normal Drive view. The scan does **not** download images or request extra permissions.
2. **Voluntary local comparison:** after you explicitly select JPEG, PNG or WebP files from the computer, the browser hashes their bytes with SHA-256 and, where the codec can be decoded safely, computes a 64-bit dHash from a 9×8 pixel comparison. Exact SHA-256 matches are labeled **identical local bytes**. dHash distance 0–5 denotes **similar-looking previews only**, not exact matches. This can have false positives for flat or low-detail images, and false negatives for cropped/rotated pictures.

Local comparison is capped at **24 files**, **15 MB per file**, **96 MB total** and **40 megapixels per decoded preview**. Processing is sequential, cancellable between operations and never reads original Drive files automatically. Hashes and temporary image previews remain only in the browser session and are cleared with **Clear / cancel** or on disconnect. No personal photos, filenames, hashes, tokens or Sheet content are uploaded to GitHub.

This phase adds unit tests for duplicate Drive IDs, cross-folder leads, false-positive prevention, SHA-256 evidence, dHash similarity, bounded input and the app view. The portable engines are `src/similarity-lab.js` and `src/similarity-controller.js`; regenerate their embedded modules in `web/app.js` using the matching `scripts/build-similarity-*.cjs` commands. The Windows patch ZIP allowlist remains unchanged.

**Release gate:** this feature is a proposed development PR until CI, the Windows build, and manual gallery/selection/cancel testing pass. It is not part of the published v2.1.1 installer.

## Phase 5: Video Library and storyboards (included in v2.1.5)

The **Video Library** adds an indexed, read-only video catalog, pagination, evidence filters,
links back to Drive, and opt-in three-frame storyboard previews. Videos are **never
downloaded just by opening the Video Library**.

- **Source evidence:** The Sheet's `Manifest` review status and analysis method are
  normalized by the existing media contract. Unverified, poster-only, sampled-frame,
  and documented full-video visual review remain different states. A generated poster
  or three-frame storyboard updates session-only evidence, **not the Sheet**.
  Playback reaching the end is shown separately and **does not prove full inspection**.
  A still, storyboard or playback event **never verifies audio**.
- **Video descriptions:** Catalog cards now show the already indexed visual
  description from the private Google Sheet, or a clearly labeled
  device-local review note if one exists. The cards show a three-line
  snippet and link to the complete detail view. A missing description
  is visibly labeled **Description missing**; filenames are not treated
  as visual evidence. Source descriptions based on sampled frames do
  not imply full-video review or audio verification.
- **Storyboards:** Select a video and press *Generate 3-frame storyboard*. The app
  checks browser codec support, downloads at most **12 MB** of the chosen clip
  using the existing authenticated, cancellable Google API reader, validates MP4
  (`ftyp`) or WebM (EBML) headers, decodes metadata, and seeks to 15%, 50% and 85%.
  Frames are scaled to at most 320×180, memory-only, and released on close,
  cancel, disconnect or media change. Durations, dimensions, decoder errors and
  8-second per-step timeouts are bounded. Sampling is **not** full video review.
- **Playback:** The existing player keeps its **32 MB** limit (20 MB for GIFs),
  rejects malformed MP4/WebM headers and unsupported browser codecs, and
  directs users to **Open in Drive** for oversized or unsupported clips.
  No remote transcoding, analysis, uploads, external image host or Drive edit occurs.

Pure logic and tests live in `src/video-library.js` and
`tests/video-library.test.cjs`. The browser controller lives in
`src/video-controller.js`. Run both `scripts/build-video-*.cjs` commands to
regenerate the embedded `web/app.js` content; CI checks `--check`. No new
runtime paths were added to the preexisting Windows patch ZIP allowlist.

**Release gate:** This work is on a feature PR branch, not in the published v2.1.2
release. Test against fabricated MP4/WebM fixtures and real Windows playback,
cancellation and rollback before merging and creating a future version.
Phase 4's PR #28 must also be reconciled before claiming the full roadmap shipped.

## v2.1.1 updater recovery

Some Windows network environments return **HTTP 403** when the built-in updater downloads GitHub release ZIP assets. v2.1.1 first tries the verified browser release URL, then GitHub's official public release-asset API. It still requires an approved update and verifies the ZIP format, the release tag, SHA-256 digest (when provided), allowlisted files and per-file checksums before installation. Both download paths stay on trusted GitHub hosts.

The Updates panel also shows a link to the latest matching **GitHub release**. If the automated download fails, open that release in the browser, save `jacks-image-vault-patch.zip`, and choose **Verify & install ZIP** in Updates. A local patch updates the interface, **not the Windows updater executable**. To receive the new native HTTP 403 fallback, download and launch the **v2.1.1 Windows EXE** after it is published. Neither route changes Drive photos, filenames or your source Sheet.

Release procedure: merge the reviewed PR, run the **Build and publish Image Vault update** GitHub Action with `version=2.1.1` (no leading `v`), verify the published EXE/ZIP/checksums, and test upgrade and rollback on Windows. Do not claim the release is shipped before those steps succeed.

## Memory Lane (v2.1.0)

**Memory Lane** adds a read-only chronological view of the existing gallery,
with year and date-source filters, month cards, an undated section and **On This
Day** for older media with verified capture or filename dates.

Date labels are deliberately conservative:
- **EXIF camera date:** a valid capture date from `Manifest!P` (via Search
  Index column H). Camera-local calendar dates are preserved, not shifted across
  timezones.
- **Filename-derived:** a complete valid date in `Manifest!J`, used only when
  no valid EXIF capture date exists. Year-only names such as `2026_48.jpg` do
  not establish a day.
- **Drive added (local date):** the ISO Drive-created timestamp from
  `Manifest!H`, converted to the viewing device's local calendar date.
  This indicates upload/Drive creation, **not when the photo was captured**.
- **Date unknown:** none of those sources provides a valid full date.

Every record is grouped once by stable Drive ID. On This Day includes only
**older** EXIF/filename-dated media matching today's month/day, never Drive
creation timestamps. February 29 only matches on another February 29.
Unknown dates are not invented and remain accessible in their own section.
The date-source label is also visible on each timeline result and in the
media detail modal.

The pure implementation is `src/memory-lane.js` and the UI controller is
`src/memory-controller.js`. Regenerate their matching embedded sections
using `node scripts/build-memory-lane.cjs` and
`node scripts/build-memory-controller.cjs`; both accept `--check`.
No extra files ship inside the installed Windows app, preserving the existing
ZIP updater allowlist. Memory Lane shipped in the published v2.1.0 release.

The live Sheet's **Photo Date Audit** already contains verified EXIF timestamps.
An audit during this phase identified 471 verified entries missing from the
Manifest EXIF column. Those blank `Manifest!P` cells were populated by
matching exact Drive IDs without changing any Drive originals, date-exception
decisions, or existing EXIF values. The app still treats upload timestamps
as a separate evidence class.

## Smart Collections (v2.1.0)

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
Smart Collections shipped in the published v2.1.0 release.

## Search 2.0 (v2.1.0)

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
Search 2.0 shipped in the published v2.1.0 release.

## v2.1 roadmap

The v2.1 roadmap is tracked in [GitHub issue #12](https://github.com/zackadoorie-cpu/jacks-image-vault/issues/12).
The first foundation PR introduces a portable, versioned media record contract
with separate visual-evidence and date-provenance states. It is compatible with
the existing **read-only** Google Drive and Google Sheets workflows. Search 2.0, Smart Collections and Memory Lane shipped in v2.1.0; Similarity Lab, Video Library and Command Center remain future phases.

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
2. Choose **Run workflow**, keep branch **main**, and enter a **new, unused version greater than the latest published release**, such as **2.1.1** after the published v2.1.0. Enter only three numbers and two dots: **no leading `v`, spaces, or trailing period**. Click **Run workflow**.
3. The workflow tests the app, builds a Windows EXE, produces a validated `jacks-image-vault-patch.zip`, and publishes a GitHub Release with checksums.
4. Wait for the workflow to show a green check, then inspect the download links under [Releases](https://github.com/zackadoorie-cpu/jacks-image-vault/releases). If the workflow fails, inspect its job logs; do not assume a release exists.
5. In the installed v2 app, open **Updates**, enter `zackadoorie-cpu/jacks-image-vault`, choose **Save repository**, and then **Check GitHub**. Select **Install update** and approve if a newer release is available.

**Versions are unique and cannot be reused.** Check the [published tags and releases](https://github.com/zackadoorie-cpu/jacks-image-vault/releases) first. In particular, **v2.0.2 already exists**, and entering `2.1.0.` with a trailing period is invalid. The workflow now checks version format, existing releases and tags, and monotonic version order **before building**, so a mistaken input fails quickly with a clear error. **v2.1.0 was published on November 14, 2026** with Search 2.0, Smart Collections, and Memory Lane. The remaining v2.1 roadmap features were not included. For a later release use a new version such as **2.1.1** and validate the install before updating your main Windows app.

The repository is **public**, but Drive images and inventory are not included. **Never upload private photo files, spreadsheet exports, OAuth access tokens, Google client secrets, or personal settings.**

The app accesses public GitHub releases over HTTPS; a GitHub access token is not required. SHA-256 checksums protect against accidental corruption but do not authenticate a malicious or compromised release publisher. Install updates only from a repository you control and trust.

### Future patches generated in ChatGPT

Keep the source ZIP. To make a new patch, update its `web/` files and use the bundled Python standard-library tool (Python is for creating patch ZIPs, **not** required on your Windows computer to run the app):

```bash
python3 make_patch.py --version 2.1.1 --web web --output jacks-image-vault-patch.zip --notes "Thumbnail fixes"
```

Use **Updates → Install a local patch** for the result, or attach it to a **new, matching** GitHub release with a unique tag such as `v2.0.12` and filename `jacks-image-vault-patch.zip`. Change the example version when publishing subsequent updates.

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

## Windows saved sign-in across UI patches

In the browser-based Windows launcher, a previously consented, encrypted
read-only Desktop OAuth grant is now retried on startup, just as in the
native WebView2 host. WebView2 can also recover the inventory Sheet ID
from a successfully refreshed DPAPI record when its private web profile
does not contain that ID. A separate manual **Reconnect using saved
Windows sign-in** control is shown when the backend reports a stored
grant. Only a Sheet identifier is restored to profile settings; refresh
tokens and Desktop client credentials remain protected by Windows DPAPI.
The browser-mode restore is restricted to the private loopback application
and a previously configured inventory. Sheet-edit OAuth is not saved.
Explicit Disconnect / Forget still removes the encrypted session.

An invalid or revoked grant requires new consent. In Google OAuth's external
Testing publishing status, refresh tokens for Drive/Sheets scopes typically
expire after seven days even without installing an update. See
`docs/windows-signin-patch-recovery.md` for troubleshooting.
