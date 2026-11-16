# Phase 10B — Guarded, separately authorized Google Drive renaming

## Permissions

One real rename is permitted only after an explicit, user-driven
approval. Google's narrow drive.file scope does not work for arbitrary
existing Drive files unless the user specifically shares them via
Google Picker or creates/opens them with the app. Phase 10B therefore
uses the restricted, Drive-wide metadata permission drive.metadata
plus drive.readonly for verification. This is broader than one file.
The interface discloses that fact *before* requesting Google consent.
The app is deliberately limited to one exact metadata-only file update
with the name field. It never sends parent, trash, move, deletion,
content or folder-creation requests.

The extra edit token is temporary, in memory only, and never persisted
with the separate Windows DPAPI-protected read-only refresh token.
A one-time Windows localhost endpoint, /__vault_desktop_auth/rename-start,
uses the external system browser and PKCE. It is only present in the
new v2.1.29 native executable. UI-only patching an older native
executable cannot enable it. Install the full Windows Desktop Bundle
for this particular version.

## One-file rename procedure

1. Select exactly one eligible reviewed filename proposal in Filename
   Review and click Verify one staged Drive rename.
2. Verify the exact current Drive ID, name, MIME, trashed=false, one
   parent folder, canRename capability, and version with a read-only
   GET. Reject missing or changed values.
3. Enumerate the actual parent folder with complete pagination (up to
   10,000 files). Block collisions ignoring case and Unicode NFKC.
   If pagination fails or is incomplete, do not offer an update.
4. Display exactly the live old name, proposed name, folder and version.
5. Obtain explicit user consent to the broader account-wide metadata
   permission. Confirm Google permissionId matches the existing
   read-only account. Recheck file and folder contents with this token.
6. Ask for a second file-specific confirmation. Recheck everything
   *again* immediately afterward to reduce possible races.
7. PATCH only the name field on that one Drive file. Read it back
   independently and verify the exact ID, name, MIME and parent.
8. If verified, update the in-memory gallery and record old/new
   names in the bounded, account-scoped private Activity journal.
   If submission is uncertain, warn the user that the rename MAY
   HAVE HAPPENED, do not retry automatically, and require manual
   inspection of the real Drive file.

## Limitations

Google Drive's metadata API does not provide atomic compare-and-swap
in this workflow, so an external editor may still race the final
read and PATCH. This stage cannot promise transaction isolation.

The Google Sheets Manifest names are not modified by the Drive rename
and can remain stale until the user's separate reindex. The preview
does not automatically process a multi-file JSON plan, and it has
no automatic undo yet. A later Phase 10C can add explicit conflict
checks and one-row-at-a-time undo.

The Google OAuth project may require restricted-scope configuration
and verification. Authorization failures are safe and never cause
a Drive mutation.

## Regression gates

- Pure Node checks: same ID/name/parent/MIME, canRename, version,
  complete sibling list, Windows-safe filename and name-only payload.
- Native OAuth Go tests: explicit temporary metadata grant, no
  refresh token persistence, rejection of insufficient permissions.
- Chromium synthetic Drive tests: changed source, real name collision,
  declined permission, wrong account, exact one-name PATCH, and
  read-back verification.
- Existing 10k gallery, Sheet approval and undo, WebView2/DPAPI,
  video playback, updater rollback, and release checksum tests.

No real user's Google Drive or Sheet files are modified by CI.
