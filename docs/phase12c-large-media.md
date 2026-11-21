# Phase 12C — Native large-media streaming and original-image viewer (v2.1.45)

## Problem and scope

The previous video/GIF modal downloaded every byte through Google Drive's authenticated REST API into a browser Blob before playback, capped at 32 MiB for MP4/WebM, 20 MiB for GIF and 12 MiB for storyboards. This prevented longer clips from playing inside the app. Full-resolution image display depended on small thumbnails. Simply lifting these caps risks large memory spikes, long waits, token expiry and poor seeking.

This phase adds a **native Windows loopback server upgrade**, with UI fallback for legacy launchers. **Installing a UI-only ZIP over the v2.1.44 EXE does not install the new Go streaming route. Install the full v2.1.45 Windows executable or desktop bundle.**

## Features

- Video modal streams MP4/WebM over the local loopback connection when over 32 MiB, with HTML5 play, pause and seek. Up to **32 GiB** subject to browser codec, network, Drive quota and file-owner download permissions. Smaller videos keep the established 32 MiB Blob flow for compatibility.
- Large animated GIF playback streams on demand, capped at **256 MiB**.
- Still-image modal offers **Full resolution** for JPEG/PNG/WebP up to **256 MiB**. Uses on-demand native streaming, a bounded ≤64 MiB authenticated Blob fallback for older launchers, and a Fit/±Zoom viewport up to 4×. Native Google image metadata (if available) rejects more than 80 megapixels, or dimensions over 20,000 pixels, to reduce decode pressure.
- Thumbnail and three-frame storyboard generation retain their old caps. No audio or full-video review is inferred from playback.

## Security and privacy

- New local routes: GET /__vault_media/status, POST /__vault_media/start, POST /__vault_media/renew, POST /__vault_media/stop, GET/HEAD /__vault_media/stream/{48-character random ticket}. No CORS, cookie authentication or bearer tokens in media URLs.
- Every mutating route requires the original native anti-CSRF X-Vault-Nonce and the existing strict loopback Host/Origin guard.
- The app sends the ephemeral Google **read-only** access token via an authorized same-origin POST to the localhost server only after the user requests playback. Server validates the exact Google Drive ID, MIME, size, version, download privilege and trash state against live metadata before allocating a session.
- The native server keeps the OAuth bearer in memory only; never in browser URL, local storage, logs, local media cache or Sheet. One-use-per-viewer opaque capabilities cannot be guessed. Up to 8 sessions and 4 concurrent range requests are permitted. Stop/close revokes the ticket. Idle expiry is 25 minutes, maximum lifetime 6 hours; per-session OAuth bearer must be renewed at most 50 minutes after verification.
- GET Range requests clamp to **4 MiB** and reject multi-ranges, invalid offsets and upstream Google responses with mismatched status, Content-Range or byte count. Without Range, bytes stream sequentially with the verified full Content-Length. No full-file buffering in Go.
- Google upstream calls always use HTTPS on a fixed API host; redirects are restricted to approved Google media hosts and bearer authorization is stripped when leaving the API host.
- The modal renews native sessions while playing when the connected Google token remains valid, and can refresh the saved desktop read-only login as before. On codec, quota, sign-in, upstream Range or decoder failures the user can still open the media in Drive.
- No Drive rename, move, content modification, deletion, Sheet write, new OAuth scope or uploaded copy.

## Test and release gates

- Synthetic Go HTTP tests: nonce/cross-origin protection, opaque ticket issuance/revocation, exact byte Range/HEAD/full GET, malicious multi-range and overflow inputs, large-range chunk clamp, Google failing Range, metadata and permission drift, token renewal, idle expiry and session cap. Native broker uses a fabricated HTTP Transport; no real private media.
- Node tests: 500 MiB and 16 GiB video stream eligibility versus 12 MiB storyboard cap, unsupported MIME and codec limits.
- Real Chromium fixture: legacy launcher prompts an EXE update for oversized media; synthetic native ticket starts a 64 MiB video without a Blob and provides fit/zoom on an image; modal close requests revocation. No Google write method.
- Existing Go race/fuzz, Windows DPAPI/session/shortcut/updater/WebView2, Chromium and full release artifact/hash checks must remain green. Do not merge or publish on failure.
- Publish **full native EXE + optional desktop bundle**, update ZIP (UI only), and SHA256SUMS. Existing "Stay signed in" is preserved.

## Important limitation

Google Drive's native download APIs may deny Range requests, disallow downloads, return a changed version, impose quotas or deliver codecs the installed Edge/WebView2 cannot decode. This feature offers a secure in-app streaming attempt with actionable fallback, not universal transcoding or guaranteed playback for every file type. Movie metadata inside MP4 may affect seeking; no audio analysis or transcoding is performed.

## v2.1.46 regression correction

The v2.1.45 release passed an insufficient browser test: it only verified that an HTML `video` element existed, using intentionally undecodable bytes. This **did not prove playback**. The small-video path still used the old 32 MiB Blob downloader and a brittle `ftyp` header test. v2.1.46 now attempts native streaming for small files too and performs a single bounded legacy fallback for small clips if no native support is available or the stream errors. It relies on the actual browser decoder rather than `canPlayType` as a hard gate. Drive file sizes can drift from Sheet metadata; authenticated Blob fallback remains size-capped without rejecting benign metadata drift.

The previous desktop host explicitly required exactly one versioned Go EXE in its directory. This wrongly rejected an otherwise functional upgrade extracted over an earlier bundle. It now selects the highest semantic version, leaving older EXEs untouched. The Windows host stress script creates an older side-by-side EXE and verifies the desktop launcher still starts.

For Google Drive original media that ignores an HTTP byte-range request, the native host can recover by reading the entire response **only if the verified source file is ≤32 MiB**, checking the complete byte count before serving the requested partial range. Large files still fail closed if Range is not honored. Three-frame storyboard size/security limits remain unchanged.

The browser E2E fixture decodes a genuine 64×64, one-second, 590-byte VP8 WebM from an entirely fabricated source using both the native HTTP video element and legacy bounded Blob path. It verifies decoded dimensions/metadata, not just element creation. This is strong synthetic regression coverage but **not a live playback test against the user's private Google Drive account**. Actual codec and quota behavior still depends on the installed Windows WebView2 runtime and Drive permissions.
