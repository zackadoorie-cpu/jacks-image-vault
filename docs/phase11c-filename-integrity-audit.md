# Phase 11C — Filename Integrity & Drift Audit

Tracking: [Issue #82](https://github.com/zackadoorie-cpu/jacks-image-vault/issues/82)

## Source and verified baseline (2026-11-19)

- Release v2.1.38 exists, tagged at main commit `b6842857d413cda3bc360d5e365f6842c61926ec`.
- Active Manifest contains 1,817 indexed files. 229 proposed names in R exactly match 229 nonblank recorded names in AD.
- Five representative IDs were read from live Drive metadata and matched their AD names. The other 224 require independent verification before any claim of complete live synchronization.
- 839 other Manifest rows have blank AD. This can be correct: AD records a changed/current name when applicable, while meaningful original filenames remain in C. Blank AD **must not** be called a failed rename.
- Prior dashboard snapshot counted 1,758 image records with visual descriptions. Poster-only video review, full animation review and EXIF verification are separate evidence types.

**Privacy:** Do not put the private Sheet ID, Drive file IDs, filenames, folder contents, tokens, or personal metadata in this public repository or its test fixtures.

## 11C1: Read-only audit engine

Use existing authenticated read-only session and authoritative Manifest Drive ID mapping. At audit time compare immutable Drive ID, MIME, live name, parent folder and trash/access state against source Manifest C/D/R/AD, Search Index C/K and activity journal state. Avoid overwriting unsynced journals or silently treating a Sheet-recorded name as a live rename.

State machine:

| State | Condition |
|---|---|
| Live verified | Live Drive file ID and name match expected effective name; display scan timestamp |
| Sheet recorded, not checked | AD claims a name but live Drive metadata has not been fetched or freshness has expired |
| Name drift | Source expected name differs from fetched live name; show both with file ID and evidence, do not fix automatically |
| Missing or inaccessible | Drive lookup explicitly fails; preserve distinction where API cannot tell missing from permission denial |
| Original unchanged | AD blank; live Drive name matches original C; normal, not a failure |
| External rename | AD blank; live Drive name differs from original C; review separately, not automatically a rename proposal |
| Uncertain/pending | Existing private write-ahead journal indicates pending, partial or ambiguous state; do not mask by fresh scan |

Treat malformed source data, duplicates, wrong account, mismatched sheet or incomplete discovery as blockers. Use bounded concurrent reads and backoff for throttling, an abortable progress UI, explicit per-file errors, and resume only with a matching identity-bound snapshot. No network writes during audit or export.

## 11C2: UI and workflow

Add Filename Integrity under Library Health or Naming Completion with current progress, verified/unverified/drift/error counts, last scan time, filter by collection and status, and row details. An audit report should be exportable locally without uploading its contents to GitHub or telemetry. Exact live evidence and the confidence of each comparison must be visible.

For repair, link to existing 10H/11B preflight and individual approval-only rename/Sheet reconciliation. No new write endpoint. Before a write, reuse real-time account, Drive identity, parent, version, name-collision, formula and Sheet preflight checks, two confirmations and temporary permissions.

## Test and release gates

1. Pure tests: 25k synthetic records, 229 recorded/partially verified cases, meaningful originals with blank AD, ID collisions, missing/inaccessible files, stale Search Index arrays, changed parent/MIME/version, source drift and journal uncertainty.
2. Browser tests: paged progress, cancellation/resume, XSS escaping in hostile fake filenames, no requests with PATCH/POST/DELETE during a read-only audit, and account switch isolation.
3. Windows WebView2, saved-login, updater and Linux/Chromium CI regressions. No customer file content in CI.
4. Implement in small reviewable commits, verify green CI, then merge. Tag next release only after CI and packaged artifact checks. Never auto-merge uncertain results.

## Out of scope

New folder intake, invented visual descriptions, fabricated capture times, automatic bulk Drive renames, writing original Manifest C, altering formula-driven Search Index C, moving or deleting originals.
