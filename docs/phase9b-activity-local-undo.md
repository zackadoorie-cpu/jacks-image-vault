# Phase 9B — Smart Library Manager 2.0: Activity & Local Undo

## Delivered in first PR

A single **Activity & Undo** view under **Review & Health** connects
existing local review notes, review backup/batch imports, Rename Desk export,
rename-plan staging clear, and read-only Sheet inventory loads. Related links
lead directly to Review Inbox, Rename Desk, and the original app **Updates**
recovery interface.

**What Undo means in this release**

- A single saved or reset LOCAL review note can be restored to its previous
  local contents, but only if the current note exactly matches the most recent
  value the activity entry recorded (description, tags, status and updatedAt).
- A newer local edit or import that changes the note blocks undo of the older
  entry. Users can undo several local review actions newest-first when each
  earlier expected value becomes current again.
- Confirmation identifies the affected local note, not a Google Sheet row.
  Existing Sheet descriptions and Google Drive originals are never written.
- Batch imports, exports, scans and draft rename plans are informational,
  **not** individually undoable in this release. Use the existing local review
  backup to recover a large import, and confirm its replacement explicitly.
- App version rollback is a separate, already shipped feature under
  **Updates → Recovery**. This PR does not change it.

## Private journal

- Saved in browser/WebView2 localStorage, scoped to the exact Drive account's
  permission ID and the configured Google Sheet ID.
- Schema 1, maximum 120 entries, 480 KiB serialized, up to 90 days of
  non-pruned older entries. New events cannot cause unbounded storage.
- Local review undo records necessarily include the previous and applied
  personal description, tags, status and timestamp. A journal export includes
  these private fields and Drive IDs. All exported data is entirely local and
  users are warned before downloading.
- The activity list **does not** serialize media names or thumbnails into its
  journal. Names are derived from the currently connected inventory.
- Disconnect clears active tokens, images, review edits and activity from
  memory. The user may explicitly clear their own current account's journal
  without deleting local reviews or any Google Drive/Sheet content.
- Damaged/cross-account journals are never overwritten silently; the UI
  reports the error. Browser storage limits may prevent history writes, in
  which case local review saving can still succeed and the app warns that no
  journalled undo is available. Because two browser localStorage keys cannot
  be changed atomically, the history is **not** a transactional database.
- No account IDs, spreadsheet IDs, review text or photos are committed to
  GitHub, sent to an external API, or included in CI fixtures.
- No new OAuth scopes or Google API mutations.

## Why no Sheet/Drive undo yet

The separate direct Sheet write-back and file rename work requires additional
consent, evidence validation, exact Drive-ID-to-Manifest-row checks, live
preflight comparisons, read-after-write verification and a guarded journal of
applied values. Standard Sheets writes are not an atomic compare-and-swap,
and cross-service rename + Sheet updates cannot be one transaction. Nothing
in this local review history is represented as a completed remote write.

The next focused PR (Phase 9B-2) should implement a **separately authorized,
opt-in, per-batch Sheet review proposal/approval** flow, beginning with a
read-only preview and synthetic permission-denied/changed-row test cases.
Do not automatically upgrade current read-only Drive scopes. Explicit undo
of approved remote changes comes only when conflict handling is testable.

## Tests

- Unit tests for account/Sheet isolation, schema and size limits, 120-entry
  retention, malformed fields, undo of saved/reset notes, conflict denial,
  marked-undone replay denial, and non-undoable imports or rename plans.
- Browser synthetic account flow: save two local notes, verify only the newest
  can be undone, undo twice sequentially, assert exact restoration, inspect
  the private journal, verify only GET requests to fake Google endpoints.
- Existing 10,000-file Turbo Gallery, Chromium, Linux, Windows EXE/WebView2,
  updater, and browser OAuth regressions remain required.

Actual Drive/Sheet contents are not modified by this feature.
