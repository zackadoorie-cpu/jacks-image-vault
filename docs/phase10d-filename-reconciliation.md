# Phase 10D — Verified filename index reconciliation

> **Superseded safety notice (v2.1.32):** This document describes the
> original Phase 10D design. The actual Search Index column C is backed by
> an ARRAYFORMULA and must never be directly updated. Phase 10E instead
> writes only Manifest column AD and verifies the formula-derived result.
> See [Phase 10E](phase10e-formula-safe-reconciliation.md).

## Purpose and strict boundaries

The Image Vault inventory has two independent filename cells:
**Manifest column C** and **Search Index column C**. The gallery reads
the latter. A Phase 10B Drive rename or Phase 10C Drive undo changes
only the real Drive filename; updating just Manifest C would leave the
gallery displaying a stale filename.

Phase 10D adds a separate **Reconcile renamed Drive files** panel inside
**Sheet Review Approvals**. It never runs on staged suggestions or
unknown Drive files. Candidates require a recent **verified** rename
or undo in local account-and-Sheet-bound private history. Older or
ambiguous activity, uncertain Drive operations, and uncertain/previous
Sheet reconciliations refuse a new automatic attempt.

## Read-only preview (no Sheet edits)

1. Resolve a source file from the connected Google account and exact
   inventory Sheet. Require a stable Drive ID, verified folder ID,
   Manifest row, Search Index row and MIME.
2. Derive the expected live and previous filenames from the most
   recent verified rename or undo activity. A recorded undo can
   reverse an already-synced filename.
3. Fetch the real Drive file and require exact name, ID, MIME,
   nontrashed state, exactly one expected parent and a version.
4. Fetch live Manifest C/D and Search Index C/K using FORMULA render.
   Require exact matching Drive IDs and the same recorded previous
   name in both filename cells. Formula-like values, third-party edits,
   partial updates, missing cells and already-synced rows are blocked.
5. Display both current names, exact row numbers and the proposed
   Drive name. No modification is made merely by previewing.

The UI does not bulk apply plans. It shows only the first 120 eligible
locally recorded operations, and allows one at a time.

## Explicit two-cell update

1. User confirms broader temporary Google Sheets editing permission.
   The same existing Windows/browsers grant flow is used, and no new
   token is stored.
2. A new temporary token must match the same Google permission ID.
3. The app verifies the **Manifest** and **Search Index** tab IDs are
   distinct and belong to the exact selected spreadsheet.
4. Re-read the two filename cells, two identity cells and Drive
   metadata with the original file version. The preview must still
   be current.
5. User explicitly confirms the exact one-file, two-cell write.
6. Repeat all comparisons after the final confirmation.
7. Use one Sheets `spreadsheets.batchUpdate` with exactly two
   literal `updateCells` requests: column C of the verified
   Manifest row and column C of the verified Search Index row.
8. Read both Sheet cells and Drive again, verifying exact names
   and identities. Update in-memory gallery metadata and write a
   bounded local activity entry only after verified success.

No Google Drive PATCH, file contents, folder, media metadata, other
Sheet fields, or existing local review note is changed.

## Important limitations

Sheets `updateCells` is not an atomic compare-and-swap against a
concurrent editor or a simultaneous Drive rename. The repeated checks
reduce, but do not eliminate, the race window. If a request might
have reached Google but post-write verification fails, the app warns
that the Sheet update **may have happened**, invalidates the preview
and records an uncertain activity event. **Never retry blindly**;
inspect both Sheet tabs and Drive. The journal is device-local,
bounded and may expire, so it is not a full change audit.

## Test gates

- Pure Node contract: historical single-file source; recent undo
  resolution; account, parent and identity mismatch; stale/partial/
  formula-cell refusal; Drive version conflicts; exactly two
  column-C updates; source/embed parity.
- Synthetic Chromium: perform fabricated Drive rename; block
  mismatched Search Index ID and third-party name changes; refuse
  user-declined and wrong-account consent; two-cell verified write;
  refuse repeated sync.
- Existing browser, sheet-review approval/undo, Drive rename/undo,
  Windows DPAPI session, WebView2, updater/rollback, and release
  packaging regression suites.

CI never modifies a real user's Google Drive or Sheet.
