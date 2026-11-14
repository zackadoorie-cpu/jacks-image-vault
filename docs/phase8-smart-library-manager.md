# Phase 8 — Smart Library Manager
## Read-only audit and delivery plan (2026-11-14)

Status: implementation PR 8A in review. This is NOT a published feature and
does not grant additional OAuth scopes or change user data. No private Drive
identifiers, Google account information, personal photos or Sheet IDs are
committed here. The audit refers to the current configured Sheet at runtime.

### What already exists in main

- Google Drive and Sheets authentication is deliberately read-only:
  \`spreadsheets.readonly\` and \`drive.readonly\`. No in-app write endpoint exists.
- \`readSpreadsheetSnapshot()\` reads \`Search Index!A:M\`, \`Manifest!A:L\`,
  \`Folders!A:G\`, \`Manifest!T:T\` and \`Manifest!AC:AC\`. The inventory
  is built by exact Drive file ID and merged against live Drive folder scans.
- Browser-local reviews contain a text description, tags and one of
  \`draft\`, \`deferred\`, \`reviewed\`, isolated by Google Drive account identity
  and the configured spreadsheet ID. They are NOT Sheet approvals.
- The existing \`Review Queue\` Sheet tab is for EXIF/date/duplicate exceptions,
  not a new-upload approval queue. It must not be overwritten or repurposed.
- \`Manifest\` is the authoritative source: D=Drive ID, M=Visual analysis,
  N=Tags, R=Proposed filename, T=Review status, AC=Analysis method,
  AD=Current filename, AE=Verified rename date, AF=Drive rename result.
  \`Search Index\` is a derived ARRAYFORMULA view, not a write destination.
- \`Rename Log\` records prior renames. During audit the original-filename
  column C of some recently renamed Manifest records contained their new
  names while the intended current-filename column AD was blank. This is
  an **audit/integrity discrepancy**, not permission for an automatic repair.
- \`Search Index\` formulas currently have a fixed terminal Manifest row.
  Appending Manifest records without extending formulas can hide images
  from search. Never append and report a success without verifying index
  visibility and formula coverage.

### Risks and boundaries

1. **Identity and location.** Drive file ID is the immutable join key,
   not the filename, folder path, spreadsheet row or image hash. An unindexed
   new Drive image has no Manifest row and is not eligible for a direct
   update to an invented row. Re-read the ID at the expected row.
2. **Evidence honesty.** Description or tags alone do not prove visual
   inspection. Preserve sampled GIF/frame status, EXIF/date provenance,
   and unreviewed/deferred state; never elevate them automatically.
3. **Scope isolation.** Use current read-only scopes for discovery/preview.
   Direct Sheet writes, if enabled later, require separate opt-in OAuth
   authorization for a narrowly selected Sheet. Do NOT silently upgrade
   Drive read-only to full-drive write permissions.
4. **Concurrency.** Google Sheets standard values writes do not provide
   a safe multi-cell compare-and-swap transaction. Re-read immediately
   before a write; reject changed ID/status/description/tags/row and
   resolve the remaining TOCTOU risk before claiming collision-free or
   atomic updates. Do not promise atomicity from client preflight alone.
5. **Consent and audit.** No automatic batch renames, mass write-back or
   silent changes. Preview exact before/after, source confidence, counts,
   account/Sheet target and duplicate-name conflicts. Require a separate
   positive approval for each commit/batch; isolate any write scopes
   from read-only browsing.
6. **Reversal.** Journal previous and applied exact field values, Drive ID,
   verified version identity, and outcome for each approved operation.
   Undo is an explicit *new guarded operation* that refuses when current
   values no longer match the applied ones. No blind rollback.
7. **Personal photos.** Do not infer date-of-capture from Drive upload times
   or filename numerals. Auto-generated names from reviewed tags apply
   only to meme images in Phase 8A; other files need verified metadata
   or a user-written title.

### Milestones

**8A — read-only inbox and proposal foundation (this PR).**
Pure inbox engine, new/pending/deferred/filename-candidate filters,
paginated UI, source-evidence labels and safe tag-based filename drafts.
Get exact Manifest row identity for indexed media, without writing.
Provide dry-run filename validation with same-folder duplicate checks,
pure identity/conflict comparator, unit, bundle and browser tests.
No new OAuth scopes, no app/Sheet/Drive writes. No automatic image analysis.

**8B — separate opt-in Sheet write-back (future PR).**
Add a deliberately separate, temporary Google authorization flow and
a per-file preview for \`Manifest!M\`, \`N\`, \`T\` only. Check configured
Sheet ID/account, exact row D, expected source fields, version context,
lengths and evidence. Never write formulas in \`Search Index\`; it should
recalculate. Test grants, denial/revocation, stale rows, quota/network
failures, invalid data, wrong accounts and tab protections. Investigate
a genuinely serialized/transactional path before claiming atomic edits.

**8C — approvals, history and undo (future PR).**
Review several staged changes with per-file acknowledgments, a bounded
batch size, opt-in confirmation, and an on-device redacted audit log.
Implement conflict-safe retries *only* for still-matching fields and
explicit undo previews. Keep pending local notes on partial failures.
Test interleaved editors, partial updates and idempotency. Do not use
\`Rename Log\` as an automatic compensation mechanism.

**8D — filename / indexing integration (future PR).**
Explicit rename permissions separate from Sheet authorization, subject to
Drive file access actually granted. Do not assume \`drive.file\` includes
all previously uploaded user files. Offer manual/export fallback if
available scopes cannot rename a specific file. Validate current Drive
filename, MIME extension, folder siblings and change time immediately
before attempting a rename, verify by exact ID afterward, then update
the Sheet's *current* filename fields with provenance. Handle partial
failure with a visible recovery state. Separately review historical
column C/AD inconsistencies and bounded formula expansion; never
rewrite history without explicit permission.

**8E — hardening and release (future PR).**
Synthetic Google API E2E (success/conflict/403/429/5xx/revoke),
Windows EXE clean and upgraded install, keyboard/mobile tests, approval
and undo traceability, no private data in public artifacts, ZIP
allowlist/hash/version validation, rollback checks, human Windows QA,
and only then a new unused GitHub release tag.

### Acceptance tests for 8A

- A new Drive ID appears once in the inbox and is never assigned a
  nonexistent Manifest row.
- Historical EXIF-only exceptions do not show up as new visual reviews.
- A source-reviewed, opaque meme filename can receive a **preview** based
  on reviewed tags, without implying that the bytes were newly inspected.
- Personal photos, videos and unreviewed images cannot receive automatic
  filenames from unsourced information.
- Unsafe paths, device names, extension changes and same-folder duplicate
  names cannot pass validation.
- Account/Sheet/Drive ID, Manifest row and expected content conflicts
  are detected by the pure preflight comparator; no claim of atomic CAS.
- Disconnection clears private in-memory selections; no network writes
  or new OAuth scopes; browser mocks contain only fabricated records.
- Existing Search 2.0, review, Drive-sync, Windows-updater and browser
  tests continue passing.

### Operator note

This PR is deliberately useful before Sheet write-back exists: it makes
new discoveries and source-reviewed filename candidates visible to the
user, and allows safe dry-run validation. It does **not** deliver direct
Sheet updates, automatic intelligent vision, actual Drive renames or
real undo transactions yet. Those require later explicitly approved PRs.
