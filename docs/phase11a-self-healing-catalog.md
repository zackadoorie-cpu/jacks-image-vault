# Phase 11A — Self-Healing Catalog Reconciliation

## What changed

This phase closes the read-only Drive-to-Manifest gap. The current full Drive folder
discovery already compares immutable file IDs but used to leave new files as
`newInDrive` gallery-only records with no Manifest row or visual review evidence.
Library Health now exposes a separate **Self-Healing Catalog** section.

The default path is **read-only**. Only a complete, error-free full Drive scan can
produce import candidates. Discovery uses the existing verified watched roots, and
checks the same Drive file ID across all scanned folders. Unsupported media, wrong
parents and files in newly discovered/unindexed folders are blocked with an
explanation; those folders need their own authorized Folders-row intake in a
future milestone.

## Approval and identity

1. Owner chooses 1–10 items and requests a read-only preview.
2. Preview checks exact Drive ID/name/MIME/one parent/not-trashed/version/size,
   existing Manifest Drive IDs, all 32 columns in destination rows, native
   tab identities and the 13 Search Index array-formula anchors.
3. The app compares the live Folders path with its existing ID mapping,
   verifies the Overview metric labels and Library Dashboard formulas, and
   computes the next free contiguous Manifest row. Gaps, duplicates, unexpected
   source changes or occupied destination cells block the import.
4. User explicitly confirms a temporary Google Sheets edit grant; the grant
   is checked against the read-only session's Drive permission ID.
5. The app re-reads all live metadata. A *second final approval* names exact
   Manifest rows and dashboard/formula changes. A final read immediately
   before posting checks for outside changes.
6. A bounded, account-bound write-ahead journal is stored before exactly
   one Google Sheets batchUpdate. A single approval writes A:AF only for
   the new rows, extends Search Index formulas and sheet capacity only if
   necessary, reconciles Library Dashboard formula coverage, converts
   Overview's seven index counts into lasting formulas, and refreshes
   exact affected Folders counters.
7. Each imported file has M/N/O blank and T = Needs review. No generated
   description, visual verification, EXIF, OCR, rename, deletion or move
   is implied. After submitting, a separate Sheets readback verifies both
   Manifest C/D/F and derived Search Index C/K.
8. A lost/ambiguous response halts and leaves an **uncertain** journal.
   Recovery uses read-only GETs to compare exact recorded rows. An
   uncertain batch is **never replayed automatically**.

## Trust boundaries

- Original media remain unchanged; temporary consent is scoped by the
  client to the configured Sheet, but Google's Sheets OAuth permission is
  broader, so a separate grant and confirmations remain mandatory.
- Local storage contains only bounded file IDs, names, row indices,
  account/Sheet identity and status. No OAuth tokens, source media bytes,
  original thumbnails, or saved write grants are stored there.
- A named filename is not pixel evidence. All imports remain pending visual
  review; unrelated approvals, filename proposals, renames and undo
  journals remain untouched.
- The Sheets API has no compare-and-swap over collaborators. Repeated
  read-before-write reduces concurrency risk but cannot guarantee isolation.
- New/unindexed folders, broken array formulas, stale or duplicate Drive
  IDs, incomplete discovery, and uncertain writes fail closed.
- The app does not create a new row solely due to Sync. Both the gallery
  and Sheet remain read-only until an explicit Phase 11A approval.

## Verification

- Pure engine unit tests: formula span growth, column scopes,
  reserved/hostile names, duplicate Drive IDs, stale source row identity,
  changed MIME/parent/version, partial metadata, occupied rows, 1–10
  limits, and **25,000 synthetic files**.
- Browser integration tests simulate Google Drive and Sheets responses,
  approved edits, declined consent, a mismatched Google account,
  API failures, recovery readbacks and no media PATCH/DELETE.
- Existing Linux Go security/fuzz/race tests, Chromium E2E,
  Windows WebView2/DPAPI/updater rollback and full JavaScript suite
  must remain green before merge.

No real Drive or Sheet files are modified in CI or by this PR.
