# Phase 10C — Safe Rename Undo

## What it does

When a real Phase 10B Drive rename has been verified, the private Activity
history on that device stores the exact Drive ID, parent folder ID, original
filename and newly applied filename. Phase 10C can reverse **one** such
verified rename at a time. It does not revert a GitHub release, undo a
Sheet approval, edit media content, move a file or change a folder.

Open **Activity & Undo**, find the verified rename, and choose **Preview
Drive rename undo**. The action is available only while its local record
is still present, complete and not already undone. Activity histories
are bound to a specific Google account and spreadsheet; they retain at
most 120 entries or 90 days of recently appended entries, whichever
limits are met first, on the current device. It is not a Drive-wide
revision history.

## Fail-closed preflight

1. Match the exact Google account and Sheet identity against the journal.
2. Reject older entries if there is a newer verified or uncertain rename
   or undo event for the same Drive ID in local history.
3. Check the indexed media's Drive ID, Manifest row, MIME and mapped folder
   against the history and the verified Drive folder ID. The indexed
   filename may be either the old or renamed value because Sheet
   indexing can lag behind a real rename; a third name is blocked.
4. Read the actual Drive file with the read-only token, requiring exact
   current renamed filename, ID, MIME, single parent, untrashed state,
   `canRename` and a valid version.
5. Completely list the parent folder (at most 10,000 names, with complete
   pagination) and block the original name if any other untrashed file
   already uses that name, comparing case-insensitively after NFKC.
6. Display the exact recorded current name and proposed original name
   before any Google write access is requested.

A failed or incomplete check does not submit an undo.

## Explicit Google write action

1. The user confirms the broader, restricted `drive.metadata` scope.
   This permission applies to Drive metadata across the account, not just
   the chosen file. The temporary token is held in memory only, separate
   from the Windows-encrypted **read-only** saved session.
2. The write token's Google permission ID must match the original account.
3. Re-check the history, loaded inventory and live file/folder state
   against the preview version.
4. The user confirms the exact file ID and before/after names a second time.
5. Re-read both the file and the complete sibling list after confirmation.
6. Send exactly one Drive `files.update` PATCH body:
   `{"name":"<recorded-original-name>"}`.
7. Independently read the Drive file to verify ID, filename, MIME and
   parent folder before marking the private history event undone.

The private journal records a `drive-undo` event on verified success.
A submitted but ambiguous response is **not retried automatically**:
show a warning, invalidate the preview, and record a
`drive-undo-unverified` event if local storage is available. The
user must inspect the actual Drive file before doing anything else.

## Limitations

Google Drive's metadata update does not provide atomic compare-and-swap
against another editor in this workflow. An outside rename can occur
between the final check and PATCH. The operation reduces the race
window, but cannot promise transactional isolation.

History may be erased by clearing the journal, browser storage cleanup,
the retention limit, or use of a different device. Without a complete
verified history entry, undo is not offered. Tampered, stale or
mismatched records fail closed. After a successful undo, the Google
Sheet Manifest filename can still be out of sync; separately reindex
when needed. **No automatic Sheet write occurs.**

The v2.1.29 native Windows desktop bundle remains the minimum native
host for this metadata authorization route. A newer UI patch alone
cannot add the host endpoint to older installs.

## Synthetic regression tests

- Node: exact inverse name-only payload, parent/MIME/version checks,
  case-insensitive original-name collision, wrong file/account,
  single-use and later uncertain history blocks.
- Chromium: read-only preview, external name change, collision, declined
  consent, wrong-account token, verified single PATCH and read-back,
  one-time undo activity record, no persistent access token.
- Existing CI: bundle parity, Desktop OAuth/DPAPI, Sheet approvals and
  their separate undo, gallery and release safety tests.

All automated Google calls are mocks. No user's live Drive or Sheet
records are modified during test execution.
