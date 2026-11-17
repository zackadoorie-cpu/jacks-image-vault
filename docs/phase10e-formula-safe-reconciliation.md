# Phase 10E — Formula-safe filename reconciliation

## Confirmed real Sheet structure

The live **Manifest** contains: C = original filename, D = Drive file
ID, M = reviewed visual description, R = proposed filename, and
AD = current filename (empty until indexed or renamed). The
**Search Index** is formula-driven: C2 contains an ARRAYFORMULA selecting
Manifest AD when nonblank and otherwise Manifest C; K2 is an ARRAYFORMULA
of Manifest D. Its C and K values are computed, **not writable source
cells**. Phase 10D's two-cell write model was incorrect for this inventory.

## Corrected source-only write

A one-file reconciliation from a verified local Drive rename/undo history
entry first checks the live Drive ID, name, MIME, one parent, untrashed
state and version. It reads Manifest C/D/AD and effective Search Index C/K
as displayed values, plus the original Search Index C2/K2 formulas
and the Manifest AD entered value with FORMULA rendering.

Both Drive IDs must match; the effective source and index name must
match the recorded previous filename; Manifest AD must be free of
formulas; and the two formula anchors must be present and point to
the expected Manifest source columns. Any drift blocks the action.

Temporary Sheets edit consent, wrong-account protection and two explicit
confirmations are retained. After a final read and version check, the
app submits a single Sheets updateCells request for precisely one
userEnteredValue at **Manifest AD (zero-based column 29)**. It must send
**no updateCells to Search Index** and must not touch Manifest C, D,
M, N, R or T. An independent read-back confirms Manifest AD, both
unchanged Drive IDs, both formula anchors, the resulting computed
Search Index C name, and the actual Drive name and version.

An uncertain result never retries automatically. Google Sheets updateCells
does not have atomic compare-and-swap across editors; this workflow
reduces but does not eliminate a concurrent-edit race.

## Reviewed filename proposals

The app additionally reads Manifest R and AD during its normal
read-only Sheet snapshot. It uses a reviewed R value as a **draft
filename** if the video is source-reviewed, indexed by exact Drive ID,
and the proposal passes existing Windows-safety and extension checks.
Locally edited drafts have higher priority. The Video Library may show
a proposed title with a clear **Drive unchanged** label. Live Drive
rename still requires its separate Phase 10B write permission, conflict
checking, confirmations and independent read-back.

The spreadsheet source itself now contains 25 descriptive proposals
for timestamp/WhatsApp-named videos, and 10 evidence-preserving
description improvements. No Drive media files were renamed by those
Sheet edits. A separate prospective rename action remains required.

## Regression gates

- Node: one `Manifest!AD` update only; zero Search Index writes;
  unchanged formula requirement; both Drive IDs, old-name comparison,
  formula/value collisions; account/version/parent protections.
- Browser: emulate the formula-driven Search Index; verify the computed
  C value after exactly one Manifest AD write; refuse altered formula,
  wrong Drive ID, outside edit, declined consent and wrong-account grant.
- Existing: review Sheet M/N/T workflow, Drive rename/undo, updater,
  browser, Windows DPAPI and WebView2 smoke tests.

No live Sheets or Drive writes occur in automated tests.
