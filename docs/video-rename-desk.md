# Video Rename Desk — proposal and approval safety

Phase 8D preview foundation, developed after the shipped v2.1.9 sidebar update.

The private application uses Google Sheets and Drive **read-only** scopes. The
Rename Desk does not mutate files or request write authorization. It makes a
concrete exportable plan for the separate final apply/undo operation.

## Current implementation

- Search Video Library titles, tags, existing visual descriptions, folder
  names and original filenames locally without video downloads.
- Open **Review & Health → Rename Desk** (or `Alt+5`). There are three
  filters: suggested names, locally staged changes, and blocked records,
  alongside all videos. Edit filenames individually and stage each proposed
  change before export. Staging is deliberately **off by default**.
- Proposals are based on previously indexed visual-review tags/descriptions,
  not an unviewed video. Existing human-readable filenames remain unchanged
  unless a person writes a new proposed name. Stage up to 25 at once.
- Preflight checks reject unsafe Windows paths/device names, extension changes,
  no-op names, existing same-folder filenames, and duplicate staged targets.
  Review evidence and the unaltered original name remain visible.
- The private JSON export is an **unapplied approval request**, containing
  the source account/Sheet, Drive ID, exact Manifest row, current/proposed
  filename, folder, MIME type, review evidence, and an undo precondition.
  Export does not upload to GitHub or write any Google Drive/Sheet API.
- The draft map and staged selection are kept in memory and cleared on
  disconnect; no persistent token or folder metadata is added to storage.
- Source engines and browser bundle have deterministic `--check` gates.
  Regression and synthetic browser tests cover export, collisions, keyboard,
  video search, lack of API writes and responsive layout.

## Before implementing actual renames

A future implementation must request separately authorized, least-privilege
write access and demonstrate that the granted scope covers **the exact
existing Drive files**. Do not assume `drive.file` grants all pre-existing
files. Never rename anything from a draft merely because it was exported.

For each explicitly approved record:

1. Fetch the live Drive file by exact ID and compare current name, MIME
   type, parent ID(s), modtime/version context and verified owner/account.
   Verify there is no conflicting sibling filename in the same parent.
2. Verify `Manifest!D{row}` is still the exact file ID and re-read
   `C`, `R`, `AD`, `AE`, `AF` without overwriting historical column
   C (the original name). The old Sheet has some C/AD inconsistencies;
   those must be resolved explicitly, not silently.
3. Present a final, per-file before/after confirmation with exact Drive IDs
   and the intended destination. Permission or API failure must stop that
   file rather than claim success.
4. Record a pending journal entry locally before the mutation, then call
   Drive metadata rename and verify the returned name by ID. Only after
   verification, update the Sheet's approved current-name/rename-log fields
   and verify readback, keeping partial failures visible and retriable.
5. Undo is a new **confirmed write**, guarded by current ID, name and folder
   matching the recorded applied result. Abort if someone else changed it.
   Sheets API preflight is not atomic CAS, and the rename/Sheet update pair
   is not a cross-service transaction. Do not claim otherwise.

For now, the user can review and export proposals and bring the exact plan
back for approval. **No Drive names have been changed by this PR.**
