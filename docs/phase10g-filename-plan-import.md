# Phase 10G — Filename Plan Import & Guided One-File Queue

## Why the error occurred

The user selected an exported filename plan in the **Import ChatGPT
review batch** control. That control exclusively parsed JSON with
`schema: image-vault-review-batch-v1`, an `items` array of 1–500
records containing inspected descriptions and tags. The Filename
Review export instead uses `schema: image-vault-filename-review-v1`,
`kind: review-only-filename-plan`, and an `entries` array (1–25).
The Video Rename Desk format is `image-vault-rename-plan-v1`,
`kind: approval-review-only`. These are not interchangeable
review records and are never Sheet write requests.

## New behavior

- **Filename Review → Import filename plan (JSON)** accepts either
  of the two filename-plan exports, after exact account/Sheet checks.
- The visual-review importer recognizes those plan formats and routes
  them to the correct queue with explicit consent, instead of raising
  an unrelated visual-review schema exception.
- All entry identities are revalidated against the loaded manifest:
  Drive ID, unchanged old name, Manifest row, parent folder, MIME,
  reviewed source, safe same extension, and case-insensitive
  duplicate-name collision protection. The import is all-or-nothing.
- At most 25 entries are loaded into a **private in-memory queue**,
  never a batch rename. Use **Prepare next imported filename** to
  stage one name. The next action is the existing live Drive
  verification, temporary edit permission, explicit confirmations,
  read-back and recorded undo. After a verified rename, the
  corresponding queue item is removed.
- Sheet Approvals then separately reconciles the verified real Drive
  name by updating only Manifest AD. The formula-driven Search Index
  is never directly edited.

## Limits

The 25-entry cap applies **only** to a local filename proposal
export/import. It does not authorize 25 Drive PATCH operations
or a 25-row Sheet batch. The 1–500 cap belongs to a wholly separate
visual-description review format.

The queue is not automatically saved to disk or Sheets. Clearing
staging, disconnecting or changing Google accounts drops the queue,
and importing an exported plan again revalidates all sources. A file
that was renamed outside the app or has stale review evidence will
block further action until a new proposal is generated.

## Tests

Unit tests cover 25 entries, wrong accounts, duplicate IDs, stale
names, mismatched Sheet and Drive identities, unsafe extensions,
unreviewed sources and Video Desk exported format. Synthetic browser
tests cover picking filename JSON in the old visual-review importer,
correct navigation, private one-file staging, declined or wrong-account
data and no remote writes. Existing Windows sign-in, updater,
Drive one-file rename/undo, Sheet formula-safe sync and browser suites
must pass before a release. CI uses only fabricated fixture content.
