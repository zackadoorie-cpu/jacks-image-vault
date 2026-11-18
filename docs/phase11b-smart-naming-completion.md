# Phase 11B — Smart Naming Completion

## Goal and live inventory baseline

The active Image Library Intelligence Manifest was checked before work. At audit time it had **229 nonblank Manifest!R proposals**, **63 matching Manifest!AD confirmed names**, and **166 outstanding** proposals, including 136 from a recent naming pass. These counts are intentionally **not hardcoded** in the app. They are recomputed on Sync from the connected Sheet and reviewed Drive-index data.

## Changes

The existing Filename Review workspace becomes **Naming Completion** and incorporates an improved Phase 10H queue:

- **Whole-library view, not first-80 only:** source-backed Manifest R entries are classified by immutable Drive ID, current Search Index filename, Manifest C original, Manifest AD recorded name, source review evidence and local progress journal.
- **Statuses** distinguish Ready, Needs visual review, Conflict, Blocked/stale, Drive verified but Sheet pending, Uncertain operation, Sheet-recorded, and prior verified rename/undo history. A value in AD does not independently prove the present live Drive filename.
- **Search, filter and paginate** all proposals, including deep rows and video entries. Select up to 25 ready proposals from the filtered results. This is local staging, not a Google write.
- **Provenance-first previews:** display indexed and original names separately from proposed names, source reason, parent folder, file ID, Manifest row and safely escaped text. Offer authenticated, bounded media thumbnails through the existing app thumbnail pipeline. Previews never send credentials in image URLs.
- **Fewer redundant calls:** the read-only batch preflight scans any given real Drive parent folder once per preview batch. The execution step still re-lists the real parent folder and rereads exact Drive/Sheet identity before **each individual write**.

## Existing source-of-truth and safety rail preserved

Phase 10H remains the **only writer** for actual rename and undo operations. It requires two user confirmations and separate temporary Drive metadata and Sheets grants, checks both account identities, exact file name/ID/parent/version/canRename/trashed state, complete sibling collision listings, Manifest C/D/AD, Search Index C/K and formula anchors, and writes **only** a Drive filename PATCH followed by Manifest AD via one Sheets request.

The account-scoped private journal is written ahead of each PATCH or Sheet POST. Partial or ambiguous results halt the batch. A Drive-verified-but-unsynced change can be finished with a new explicit Sheet authorization and independent read-back. Conflict-checked individual undo remains available when verified Activity history supports it. No blind retries; no edits to Search Index formula cells, Manifest C/D/R, original image contents, parents, or trash state.

## Test coverage

- Pure engine regression for 229 total / 63 already Sheet-recorded / 166 outstanding, current 136-item baseline, 25k synthetic records, deep search and pagination, mixed statuses and journal uncertainty.
- Browser markup checks for escaped source filenames, status/count display, paginated candidate cards and no network writes during browsing.
- Existing Phase 10H unit/browser safety, Windows DPAPI/WebView2/updater, Linux race/fuzz and Chromium E2E remain CI gates.
- New portable-source parity check included in standard CI and release workflow.

No live Drive file is renamed, moved or deleted by implementing Phase 11B.
