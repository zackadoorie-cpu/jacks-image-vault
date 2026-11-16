# Phase 10A — Intelligent Filename Review

## Goal

Provide an evidence-grounded, read-only filename review queue across
**memes, photos, and videos**, replacing a fragmented proposal experience.
This phase deliberately does **not** authorize or execute Drive renames.

## Evidence sources

- **Memes:** existing reviewed tags and descriptions, using the original
  Review Inbox suggestion. No new media inspection or claim of AI vision.
- **Videos:** existing Rename Desk's reviewed video title/description
  proposal. Video preview frames or a poster are not evidence of a
  complete-video inspection.
- **Photos:** strict EXIF camera capture value from Manifest!P
  (Search Index!H, in-memory field captureDate). Supported timestamp forms
  include EXIF YYYY:MM:DD HH:mm:ss and ISO-like dates. The camera's
  recorded wall-clock date/time is not converted across timezones.
  When only a date is available, the plan uses YYYY-MM-DD and explicitly
  labels that it has no capture time.
- **Never** treat filename-derived dates (Manifest!J), Drive upload
  timestamps, or Drive modified timestamps as EXIF capture dates.
  Missing/invalid photo capture evidence blocks automatic proposals.

## What reviewers can do

1. Open **Review & Health → Filename Review**, the homepage shortcut, or
   Ctrl+K and search Filename Review.
2. Search by existing/proposed name, folder, exact Drive ID or Manifest
   row. Filter all/ready/conflict/blocked/staged or by media kind.
3. Inspect the original name, exact source and explanation, proposed name,
   row identity and any known same-folder conflicts.
4. Adjust a candidate individually. Every draft is checked for Windows
   filename validity, original extension and loaded-folder uniqueness.
5. Stage at most 25 individually reviewed items. Staging exists in memory
   only for the connected account. It clears on disconnection or a new
   account session.
6. Download a private JSON plan containing existing/proposed names,
   Drive IDs, Manifest row IDs, evidence provenance and explicit
   status=unapplied / requiresLiveDriveRecheck=true. The plan is not a
   Google write authorization and is never auto-applied.

## Safety boundaries

- Default Drive and Google Sheets scopes remain read-only.
- New staged plans never call PATCH, POST, PUT, DELETE or any other
  Google media mutation endpoint.
- No file deletion, move, rename, Sheet edit, background write or
  Google authorization change.
- No export of private user filenames, account IDs, photo bytes or
  review notes to the public GitHub repository or CI.
- Local conflict checking is **not** a live Google Drive transaction
  check. Before a future separately authorized rename, check live
  Drive identity, current filename, parents, permissions and collisions.
- No change to the user's working DPAPI protected Windows saved sign-in.
- The loaded gallery can be incomplete until full folder verification.
  Counts never claim to be exhaustive Drive inventory counts.

## Acceptance

- Node tests: strict EXIF parsing, date-only vs time-bearing evidence,
  invalid leap days, source differentiation, malformed names, same-folder
  case-insensitive collisions, competing proposals, account isolation,
  source drift, export limit, and 10,000 synthetic media rows.
- Chromium E2E: disconnected preview, connected navigation, search,
  filter, per-file staging, plan download and strict read-only Google
  request history.
- Existing 10k gallery, Windows WebView2/DPAPI, updater/rollback,
  media playback and release checksum suites remain mandatory.

Phase 10B, if approved separately, is the first stage where new Google
Drive write scope and explicit rename transactions would be designed.
