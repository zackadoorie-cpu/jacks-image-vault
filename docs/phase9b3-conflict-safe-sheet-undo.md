# Phase 9B-3: Smart Library Manager — verified remote undo

## Why this phase exists

Phase 9B-2 recorded only the number of approved Sheet reviews per batch.
That is insufficient for safe reversal. This stage records each newly
verified Manifest row separately with its original and applied M/N/T values,
alongside the stable Drive ID and row number.

## Protected scope

- Only the configured inventory Sheet's Manifest tab is eligible.
- Each undo writes only M (description), N (tags) and T (review status)
  for one exact row with three text-only updateCells requests.
- Drive originals, filenames, folders and other Sheet tabs are untouched.
- Local activity history remains account-and-Sheet-scoped, capped at
  120 entries / 480 KiB with 90-day retention.
- No new OAuth scope, browser-stored secrets, permanent edit grant,
  background mutation or changes to Windows DPAPI sign-in.
- Historical count-only approvals remain non-undoable.

## User-approved restoration

1. Select Activity & Undo, filter Approved Sheet changes, and click
   Preview Sheet undo for one verified record.
2. Read-only live comparison checks exact Manifest D/M/N/T values against
   the recorded last-applied values. Wrong ID, changed cells or formulas
   block the operation.
3. Examine the exact original and applied values side by side.
4. Confirm an explicit request for temporary Sheets edit permission.
5. The app checks that the new write token belongs to the current Drive
   account, resolves the live Manifest tab, checks row mapping and live cells.
6. Confirm the final row-specific change. The app re-reads the row again
   immediately before sending the write.
7. One spreadsheets.batchUpdate restores only the original M/N/T literal
   strings. A second live read verifies that restoration.
8. The app marks this individual event undone and records a new Sheet-undo
   activity entry. Other rows from the approval batch stay independent.
9. If a write response is uncertain or verification fails, the result is
   explicitly MAY HAVE OCCURRED. The app never retries it automatically.

## Safety limitations

Google Sheets does not support true atomic compare-and-swap through this
updateCells API. Another collaborator could edit in the narrow gap between
the last read and write. The app reduces this race with final preflight
and complete read-back but cannot promise transaction isolation.

Older approvals, mismatched accounts, expired activity logs, changed row
identifiers or formula-like values have no safe automatic reversal. Local
review-note undo and app-version rollback are separate functions and never
silently change Google Sheets.

## Tests

- Node tests: exact M/N/T requests, invalid row, wrong Drive ID,
  independently changed cells, formula-like values, account isolation,
  bounded snapshot and duplicate-undo refusal.
- Synthetic Chromium tests: an explicitly approved fabricated Sheet
  update, no remote undo POST on conflict, no POST when the user declines,
  correct one-row restoration after two confirms and read-back.
- Existing Linux/Windows DPAPI, WebView2, browser, updater, 10,000-item
  virtualization, GIF and video regressions remain required.

No user-owned Google Sheet or Drive file is read or modified by CI.
