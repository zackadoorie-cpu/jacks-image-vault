# Windows saved sign-in recovery after UI patch updates

## Symptoms and root causes
- The Google Desktop OAuth broker saves a read-only refresh token with
  Windows DPAPI under the current Windows user profile, **outside** UI
  patch ZIPs. Patches cannot and should not copy or replace this file.
- Previously, native WebView2 auto-restoration stopped immediately if its
  private localStorage Sheet ID was missing, despite a valid encrypted grant.
- The standard Edge/Chrome Windows launcher showed the Desktop OAuth form,
  but never attempted that same saved session on subsequent startup.
- If Google expires or revokes a refresh token, even a perfect local save
  cannot bypass a new Google authorization. External OAuth consent projects
  still in Testing status commonly have seven-day refresh token lifetimes.

## Fix (read-only)
- Successful broker resume, with a missing caller Sheet ID, returns only its
  saved Sheet binding alongside the short-lived read-only access token.
  An explicitly provided nonmatching Sheet ID still fails closed.
- Native WebView2 can recover the missing Sheet ID, preserving profile settings
  across changing launchers and UI-only patch installations.
- The browser-mode Windows launcher checks its private loopback backend for a
  previously saved encrypted grant only when its own localStorage already has
  an inventory Sheet ID, then resumes that grant before falling back to its
  existing browser Google reconnect flow.
- A manual resume button appears when the local broker reports a saved grant.
- An invalid Google grant produces clear credential-free guidance, including
  the seven-day Testing-mode possibility. It still removes an invalid grant.
- Saved refresh grants, Desktop secrets, and tokens never enter localStorage
  or release artifacts; temporary Sheet editing tokens are never persisted.
- Explicit Disconnect and Forget saved Windows sign-in still clear the record.

## Regression coverage
- Go: missing Sheet ID can be recovered by a valid encrypted read-only grant;
  mismatched IDs and invalid IDs remain rejected; returned response never
  exposes a refresh token or client secret.
- Chromium: fabricated Google APIs verify that browser launcher startup and
  a subsequent UI-patch-style reload both restore the saved Windows session
  without persisting OAuth credentials in browser storage.
- Existing Windows DPAPI round-trip, cross-platform browser, media stress,
  updater rollback and native-host tests remain release gates.

## On-device verification
1. Install a full Desktop bundle version at least v2.1.22 if using an older
   native EXE. A UI ZIP cannot retrofit backend OAuth support.
2. Save the inventory Sheet ID and sign in via system browser with
   Stay signed in enabled. Confirm encrypted saved-session status.
3. Close and reopen the native app; then install a UI-only patch and reload.
4. Also test launching the same native backend in a standard browser window.
   The previously saved session should restore without Google consent.
5. If the grant is invalid, inspect Google Cloud OAuth consent publishing
   status; for an external app in Testing, consider publishing it appropriately
   and reauthorize. Never paste a client secret into support screenshots.

Google reference: https://developers.google.com/identity/protocols/oauth2
