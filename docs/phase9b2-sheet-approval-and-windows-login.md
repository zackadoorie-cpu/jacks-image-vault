# Phase 9B-2 — Explicit Manifest write-back & Windows saved read-only sessions

## Purpose
The owner successfully connected the native Windows WebView2 app to an existing
Google Sheets inventory and requested two separate improvements: approved
Sheet review write-back and reliable native Windows auto-login.

## Windows auto-login
- New Desktop OAuth setup has a visible **Stay signed in** checkbox, checked
  by default but effective only when the user actively chooses **Connect via
  system browser** and completes Google's offline-access consent.
- A returned `refresh_token` and its matching Desktop OAuth client ID/secret
  are encrypted with the current Windows user's DPAPI and written to a bounded
  file in `%LOCALAPPDATA%/JacksImageVault`. They are never sent to web storage,
  the browser callback page, GitHub, or diagnostics.
- The encrypted record is bound to the configured Google inventory Sheet ID.
  Opening the native WebView2 app attempts one read-only refresh using this
  record, without requiring the system browser. Additional refreshes can occur
  before access-token expiration while the app is open.
- **Forget saved Windows sign-in** deletes the local encrypted record;
  **Disconnect** also clears it. OAuth revocation/expiration, lost Windows
  profile protection, or changed Sheet identity requires a fresh sign-in.
- Google must issue a refresh token for automatic sign-in to work. If it
  doesn't, the one-time sign-in still succeeds but the app shows a clear
  message that auto-login was not saved.
- On non-Windows builds, no session is stored. The Edge/Chrome GIS auto-reconnect
  flow remains unchanged.
- This does *not* store a Sheets-edit grant or request write permission when
  the app starts.

## Opt-in Sheet approval flow
- **Review & Health → Sheet Approvals** displays only the user's own locally
  reviewed items with an exact stable Drive ID and existing Manifest row.
- **Preview** fetches the current `Manifest!D`, `M`, `N`, and `T` cells
  directly from Google Sheets, checks the Drive ID, and shows the complete
  current and proposed review data. Original Sheet fields that contain formulas
  are blocked from overwrite.
- The user stages individual previews (up to 10) and separately confirms a
  batch. Staging is local only.
- Only at this point does the app request a **temporary OAuth token** with the
  `spreadsheets` edit and `drive.readonly` scopes. Google grants the full
  Sheets edit scope, which can cover other spreadsheets; Image Vault itself
  restricts writes to the exact configured Sheet and Manifest cells.
- The app calls Drive About with the temporary token to verify its
  `user.permissionId` matches the account used to load the library. It
  discovers the Manifest sheet's actual tab ID rather than hardcoding one.
- Immediately before applying, it re-reads every staged row to compare source
  Drive ID, old cell contents and the current local review timestamp/value.
  Any changed row or wrong identity aborts the entire batch before submission.
- A **second final confirmation** precedes one Sheets
  `spreadsheets.batchUpdate` request. The request has three `updateCells`
  operations per selected row, columns M (12), N (13) and T (19), with
  `userEnteredValue.stringValue` and no formulas or Drive changes.
- On success, the app checks Google's reply count, re-reads every modified row
  and records the outcome in the local Activity feed. A failed verification or
  uncertain network response is reported as **possibly applied** and is never
  retried automatically.
- Sheets API does not provide atomic compare-and-swap with another editor:
  the preflight can still race with an outside concurrent edit. The UI warns
  honestly and never claims to provide transaction-level conflict prevention.
- This stage does not rename/move/delete media, change the formula-driven
  `Search Index` directly, or modify the separate historic `Review Queue`
  and `Rename Log` tabs.
- App-version rollback remains under Updates → Recovery. Phase 9B-3
  introduces a distinct, independently authorized, conflict-checked
  row-level undo for **newly verified** Sheet approvals whose exact
  before-and-after values are retained. Older count-only events cannot
  be safely undone. The Sheets API does not provide atomic compare-and-swap.

## Verification
- Linux Go OAuth tests verify the saved grant is only read-only, that it is
  bound to the Sheet ID, and that temp editing tokens are never persisted.
- Windows DPAPI tests save/reload/clear one fixture session and verify that
  secrets are absent from file bytes.
- Node tests cover eligibility, original ID and exact content comparisons,
  formula-source refusal, duplicates, max 10, and exact M/N/T ranges.
- Chromium E2E verifies that preview and staging are read-only and that
  separate write consent and explicit confirmations are required.
- Existing updater ZIP, Windows native WebView2, 10k-file gallery and
  read-only browsing tests continue to gate release.

The first native Windows sign-in after upgrading must be repeated once with
Stay signed in enabled; the older v2.1.21 app never requested offline access.
