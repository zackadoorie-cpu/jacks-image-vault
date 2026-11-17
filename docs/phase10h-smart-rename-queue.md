# Phase 10H — Smart Rename Queue

## Source and authorization boundary

Manifest column R supplies **proposals**, never actual Drive names. Only
reviewed, stable Manifest rows with Drive IDs, an indexed Search Index
row, supported same-extension Windows-safe names, and a verified parent
folder can enter a queue. No EXIF date is inferred from a filename.

Selecting up to **25** proposals and requesting a preview is read-only.
For every file the preview must confirm:

1. Current Drive ID, existing name, MIME type, one parent folder,
   untrashed state, `canRename`, version, and complete folder sibling
   listing without a proposed-name collision.
2. Manifest C/D/AD and Search Index C/K identities/names.
3. Search Index C2/K2 array formula anchors, including references to
   Manifest D, AD and C.
4. The formula-derived index and effective Manifest name match the
   recorded *previous* filename. No outside edits are overwritten.

Batch execution requires **two explicit confirmations** and separate
temporary broad Google `drive.metadata` plus Sheets edit grants. Both
tokens are checked against the same Drive permission ID. Neither grant,
OAuth secret nor photo bytes are stored in localStorage. Windows DPAPI
read-only sign-in is unchanged.

For **each** approved file, the app rereads its Drive and Sheet
metadata immediately before a write, records `drive-submitting` in
its private progress journal, sends exactly one name-only Drive PATCH,
then independently reads Drive and records `drive-verified`.
Next, it rechecks live Drive and formula-backed Sheet cells, records
`sheet-submitting`, sends exactly one `updateCells` to **Manifest
column AD** and reads back both Manifest AD and formula-derived Search
Index C. Only then is the entry marked `synced`.

The queue stops at the first conflict, lost session, uncertain response
or unverified read-back. It never blindly repeats a POST or PATCH.

## Progress and recovery

A bounded, account-bound local journal records per-file statuses and
filename/row/parent identity, but no credentials. `drive-submitting`,
`sheet-submitting`, or `*-uncertain` after a browser crash means
**manual inspection required**. Those states have no automatic retry.

`drive-verified` and `undo-drive-verified` indicate an independent
Drive read-back succeeded before a Sheet write. The corresponding
**Finish Sheet sync** button requests a new temporary Sheet grant,
rechecks real Drive/Manifest/index state, and confirms a single AD
update. If the external Sheet already matches exactly, the app
independently verifies it and sends no duplicate POST.

A synced item offers **Preview undo** if an unambiguous verified
Drive-rename activity record remains. Undo independently checks the
restored original name for collisions and both Sheet identities,
gets separate permissions and two confirmations, reverses exactly one
Drive filename, records Activity undo and automatically reconciles
Manifest AD. An interrupted undo uses the same fail-closed recovery.

The journal is device-local and bounded. Clearing browser storage can
remove recovery/undo context; the user should export private Activity
history separately for long-term backup. No UI silently discards the
journal when deselecting or changing screens.

## Important limitations

Google Drive + Sheets cannot be changed atomically. Another editor
could alter a file or cell between the final live check and submission.
Repeated live checks and independent readbacks narrow, but do not
eliminate, the race. Activity history is finite (120 events); older
renames may no longer support automatic undo. The app never performs
automatic bulk Drive changes merely because Manifest R contains a
proposal.

## Synthetic test gates

- Unit: 1–25 source-reviewed proposals, wrong account, stale Manifest
  row or index identity, folder mismatch, collision, draft extension,
  write-ahead transitions and uncertain-operation no-retry guards.
- Browser: read-only preflight, decline consent, wrong-account grant,
  exact name-only PATCH, one Manifest AD request and intact formula,
  persistent progress states, individual verified undo and second AD
  write, no token in localStorage.
- Native: existing Windows DPAPI auto-login, WebView2, updater
  rollback, security tests, and release artifact allowlist/hash gates.

No real Drive or Sheet writes take place in automated tests.
