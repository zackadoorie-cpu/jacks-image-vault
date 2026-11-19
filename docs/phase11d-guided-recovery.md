# Phase 11D — Guided Recovery Desk (v2.1.40 candidate)

Phase 11D builds directly on Phase 11C's **live filename integrity** audit. All new actions are **read-only**. It does not perform Drive renames, Sheet reconciliation, metadata edits, file moves or deletion.

## User workflow

1. Connect the correct Google account and private Sheet. In **Library Health → Filename Integrity**, start the account- and snapshot-scoped live Drive-ID audit.
2. Open **Recovery Desk** to view priority issues, search or filter by exact Drift, External Rename, Uncertain Journal, Inaccessible Metadata, Blocked Identity, Needs Visual Review, Poster-only Video, Sampled Video and No Verified Date Evidence.
3. For a recorded name mismatch, select **Fresh live recheck** to re-read exact Drive ID, name, MIME, parent, trash state and version, bound to the current in-memory account and Sheet snapshot. Any account/snapshot switch discards the result. No repair happens.
4. **Inspect guarded naming desk**, **Review original media**, or **Inspect Activity & Undo** opens an existing workflow. Nothing is staged, approved or changed. A separate live preflight and the existing authorizations are still necessary before a rename or Sheet write.
5. **Export audit CSV locally** remains the Phase 11C export. The report does not leave the device via this feature.

## Evidence distinctions

- Blank `Manifest!AD` can mean **original filename unchanged**, not a failed rename.
- No indexed camera capture date is a **date-evidence exception**, not proof that visual review failed and not a license to infer EXIF or upload time.
- Poster-only video review is not independent original-video inspection.
- Sampled video frames are not continuous full-video or audio playback. Only explicit, source-supported full playback evidence may be reported as such.
- The **Review Queue** decisions and private Manifest remain authoritative for prior user-reviewed items. This feature does not erase or overwrite them.

## What is and is not independently verified

The targeted live recheck checks Google Drive metadata as it exists at the moment of the read; the Sheet values come from the currently loaded private snapshot and are **not freshly re-read** here. Therefore the recheck can never by itself authorize or submit a Sheet repair. The existing safe, one-file reconciliation workflow performs its own required fresh Sheet, Drive, identity and version checks, with separate permissions and confirmations.

## Safeguards

- Pure code `src/recovery-desk.js`, embedded using `scripts/build-recovery-desk.cjs` with parity gates in Linux and release CI.
- No OAuth token, file contents, private Drive ID, filename or private Sheet URL in public repo files or test fixtures.
- No new Drive PATCH/POST/DELETE, no Sheet write endpoint, no automatic folder moves.
- No edits to Manifest C/D/R, current filename AD, or formula-backed Search Index C.
- Account changes, logout and inventory reload invalidate recovery previews.
- Missing/inaccessible Drive metadata is not treated as deletion.
- Safe HTML escaping and the preexisting formula-injection-resistant CSV export.

## Release acceptance

- Pass pure Recovery Desk tests including **25,000 synthetic records**, exact parent/MIME/version failures, wrong-account, missing date evidence, real video evidence distinctions and safe navigation semantics.
- Pass browser-source parity, JavaScript syntax, Go security, Windows DPAPI/WebView2/updater smoke, Chromium E2E and release asset verification.
- After green CI and explicit release approval, merge a focused PR then publish **v2.1.40** through existing release.yml, including checksum-verified update patch and Windows binaries.

This is a guided recovery and triage milestone, not an automatic repair or bulk Sheet reconciliation tool.