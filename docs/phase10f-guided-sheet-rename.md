# Phase 10F — Guided reviewed Sheet filename rollout

## Sources and provenance

`Manifest!R` is a **proposed filename**, not the actual Drive name.
`Manifest!C` is the original filename, `Manifest!D` the Drive file
ID, `Manifest!AD` the current verified name when reconciled, and
`Search Index!C2` an ARRAYFORMULA choosing Manifest AD or C.

Phase 10F reads the same workbook snapshot as v2.1.32. It accepts a
Manifest R proposal for a photo, meme, or video only when that media
has an independently source-reviewed or owner-reviewed visual record,
an indexed Manifest row, unchanged supported extension and a valid
Windows-safe name. A Sheet proposal does not establish EXIF capture
time. The existing EXIF-only photo name fallback remains when R is
blank. Unreviewed or malformed Sheet proposals remain blocked.

The live Sheet gained five descriptive **photo proposals** alongside
the 25 previously indexed videos. The photo source names are opaque
WhatsApp names with no verified original camera time; their proposed
names intentionally contain no dates. Every proposal was written to
exactly one Manifest R cell and read back. All Drive files are unchanged.

## Guided one-file workflow

1. Open **Filename Review → Proposals from Manifest R**, or open
   **Video Rename Desk → Review Sheet proposal**.
2. Click **Prepare next Sheet proposal** to stage exactly one eligible
   name *locally*, without network writes. The action refuses to
   replace a different already staged selection.
3. Inspect the original media and its review evidence. You can edit
   your local draft and stage it again.
4. Click **Verify one staged Drive rename** to fetch real Drive name,
   MIME, ID, parent, version, edit permissions and folder-wide
   conflicts.
5. Only after separate temporary OAuth permission and two explicit
   confirmations will an exact one-file metadata-only PATCH occur.
   Its response and independent read-back are verified. Activity
   history retains an undo record.
6. Open **Sheet Approvals** to separately reconcile that verified
   name into **Manifest AD**. Search Index C recalculates using its
   original formula. No automatic Google Sheet changes occur when
   renaming Drive.

Local export can include at most 25 individually staged proposals, but
**export is not approval to execute a batch rename**. No one-click
bulk Drive rename or batch Sheet mutation is introduced.

## Expected test coverage

- Source engine: reviewed R precedence for photos and videos,
  no inferred EXIF, malformed/unreviewed proposals blocked, collision
  detection and Sheet-filter pagination.
- Browser fixture: current read-only Session remains usable, next
  proposal locally stages a single row, never replaces an existing
  stage, Video Desk handoff opens the correct file, no GET-only
  baseline turns into an unintended POST/PATCH.
- Existing independent Drive rename, one-file undo, formula-safe
  Manifest AD reconciliation, temporary OAuth account checks,
  Windows sign-in, WebView2, and updater safeguards.

Tests use fabricated Google API responses only, never user files.
