# Phase 9B-4: Unified Library Desk

## Why it exists

Review Inbox, Rename Desk, Sheet Approvals and Activity & Undo were
separate workspaces. This new **Library Desk** coordinates existing
evidence and work queues without granting any new write permission.

## What the desk displays

- Original name, folder and exact Drive ID.
- Manifest row number, when the file has an indexed Sheet row.
- Current indexed Sheet description, tags and review status alongside
  any saved personal review note.
- Previously suggested, **unapplied** filename from reviewed tags or
  video title evidence. Suggestions never imply the file was renamed.
- Separate flags for newly discovered Drive items, visual review needed,
  local notes eligible for Sheet write preview, previously recorded
  Sheet undo *previews*, and filename suggestions.
- Counts over at most 20,000 loaded items, plus 12-item pages and
  keyboard-accessible name/folder/ID/row search. No additional Drive scan.

The page does not claim that a recorded undo is already safe.
A fresh live comparison is always required in the existing Activity
workflow. A local approval also requires a fresh Manifest source
read to determine whether it remains eligible to write.

## Actions and trust boundaries

**Open media** invokes the existing viewer. **Review filename** opens
Review Inbox for images or Rename Desk for videos without mutating
Drive content. **Preview Sheet change** and **Preview Sheet undo**
delegate to the exact previously validated live-read workflows.
No additional Google API endpoint or editing scope is introduced.

The Sheet approval and undo flows continue to require a temporary,
separately authorized Sheets-edit grant, identity/row comparisons,
explicit confirmation, a final re-read and read-back verification.
Outside collaborators can still race with a final Sheet write because
Google Sheets does not expose an atomic compare-and-swap.

The manager never saves search text, duplicates sensitive local
records in a new persistent store, copies OAuth credentials, or
modifies the Windows DPAPI sign-in implementation. Existing Drive
files, filenames and Sheets records are untouched until the user
explicitly initiates an existing approval.

## Verification

- Node tests cover source parity, 10,000 synthetic records, deduplication,
  pagination, malformed note handling, already applied notes, wrong
  account/Sheet undo isolation, and no editing of Drive-new files.
- Browser tests exercise disconnected mode, home navigation, private
  search and filtering, Sheet preflight with no POST, and live undo
  preview with no new POST.
- Linux Go/Node, Windows DPAPI/WebView2, media decoding, gallery
  virtualization, and updater rollback remain mandatory CI gates.

All development tests use fabricated credentials and media metadata.
No real Drive or Sheet records are changed during CI.
