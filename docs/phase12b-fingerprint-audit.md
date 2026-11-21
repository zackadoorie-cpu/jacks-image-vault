# Phase 12B — Read-only fingerprint evidence audit (v2.1.44)

## What was wrong
Similarity Lab previously showed only filename-plus-size metadata leads even when the source Manifest already contained SHA-256 (V) and first-frame perceptual hash (W) values. Missing fingerprints were indistinguishable from unique images. Historic recorded hashes were not visibly distinguished from fresh live verification. 

## Fix
- The ordinary read-only Sheet snapshot now loads `Manifest!V:W` by the verified Manifest Drive file ID. No source Sheet or Search Index formulas are written.
- Similarity Lab shows full indexed-image fingerprint coverage, malformed values and missing SHA-256 counts, and separate groups of matching SHA-256 and matching first-frame perceptual hashes.
- SHA-256 groups are evidence of matching **recorded** digests. Manifest-only values are historic and not proof of the current bytes. Perceptual pHash equality is *not* exact-byte proof. Session-computed dHash is kept separate from legacy pHash because algorithm identity is not guaranteed.
- The user may opt into an explicit, read-only **next 25 eligible images** download-and-hash batch. Each file is at most 8 MiB and each batch at most 48 MiB; JPEG/PNG/WebP only. GIF, AVIF, oversized, inaccessible or uncertain files remain gaps and are identified as such. No automatic full-library download.
- For each file, the app GETs exact live Drive ID, name, MIME, bytes, trash state and version; downloads original bytes with a hard response-body size limit; computes SHA-256 in the browser; optionally computes a dHash from the decoded first frame; GETs metadata again; and discards the result if any source identity/version changed.
- Downloads and digests are restricted to the already-authorized, verified account and spreadsheet session. Cancel is immediate via AbortController and epoch invalidation. Verified hashes remain only in JavaScript memory for that session, with explicit clear; disconnect, reconnect and Sheet refresh clear them. Failures stop automatic retry for the same item within the session. No OAuth refresh grant, file contents, or fingerprints are persisted to disk, Sheet or Drive.
- The separate local-image comparison remains unchanged, with its existing 24-file/96-MiB safety cap.

## Verification
- Pure test fixtures for 1,758 images with 104 recorded SHA-256 and 95 pHash entries, cross-folder exact leads, malformed values, duplicate IDs, unsupported formats, and 20,000-record stress limits.
- Browser E2E confirms scan buttons are disabled while disconnected.
- Existing CI requires Go security/race tests, all Node tests, Linux Chromium browser tests, Windows DPAPI/WebView2/installer/updater smoke, and independent release asset/checksum verification.

## Remaining limits
This release does **not** claim all 1,758 images have been hashed, does not insert hashes into Manifest V/W, and does not identify JPEG/PNG/WebP re-encodes as exact duplicates. Batches are individually consented and may encounter quota/network errors. A later, separately authorized reconciliation could optionally save verified hashes to a suitable Sheet column only with a strict, individually approved conflict check. No automatic deletion, move, rename, or content change is permitted.
