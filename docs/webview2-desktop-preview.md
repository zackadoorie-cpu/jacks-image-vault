# Jack's Image Vault — native WebView2 Windows preview

This is a **real WinForms window** using the Microsoft Edge WebView2 Runtime, not
an Edge or Chrome browser window. It is opt-in and packaged separately from
the unchanged, established Windows launcher.

## Install

1. From the GitHub release Assets, download
   `Jacks_Image_Vault_Desktop_Bundle_vVERSION.zip`.
2. Extract the **entire ZIP** into a fresh Windows folder. It contains two
   EXEs and `START_HERE.txt`.
3. Launch `Jacks_Image_Vault_Desktop.exe`. It starts the matching
   `Jacks_Image_Vault_VERSION.exe --serve-only` Go backend, verifies the
   app marker and native version and opens Image Vault in its own window.
4. Under **Google Drive setup**, save your existing inventory Sheet ID. Enter
   a separate Google OAuth **Desktop application** client ID (and optional
   Desktop client secret if your downloaded credentials include one). Choose
   **Connect via system browser**, authorize at Google's actual domain and
   return to the native window.
5. If WebView2 is unavailable or the new window isn't appropriate, launch
   `Jacks_Image_Vault_VERSION.exe` directly from the same folder to use the
   existing Edge/Chrome window.

**Do not upload the Desktop Bundle ZIP** under **Install local patch**. The
`jacks-image-vault-patch.zip` asset is the separate, small updater payload.
The native host and server must be extracted and installed together.

### Requirements

- Windows 10/11 x64.
- [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
  installed. The .NET 8 WinForms desktop host is **self-contained** and
  does not require a separate .NET runtime install.
- A Google Cloud project with Drive and Sheets APIs enabled and consent-screen
  approval for `drive.readonly` and `spreadsheets.readonly`. Create a
  separate OAuth client of type **Desktop app**. The pre-existing Web client
  ID is still used only by the regular browser launcher.

## Boundaries and ownership

The host window uses a stable Windows AppUserModelID and the approved Vault
folder icon. The embedded browser is restricted to the exact
`http://127.0.0.1:8765/` app document. It **does not** display Google
authorization, Drive pages, arbitrary sites or Google OAuth popups inside
WebView2. Allowed external Drive/GitHub links open in the system browser.
JavaScript host objects and WebView messages are disabled. There is no
custom privileged JS-to-Windows API bridge.

An injected, non-secret flag tells the web UI to show **Desktop OAuth only**,
bypassing the browser GIS OAuth flow and silent Web client reconnect. Google
PKCE authorization remains in the external system browser. The native broker
delivers a short-lived read-only access token only once to the same-origin
gallery. No Google account password, refresh token or authorization code is
stored in the WebView2 profile.

The embedded profile lives under
`%LOCALAPPDATA%\JacksImageVault\WebView2Profile`.
It is **separate** from Chrome/Edge profiles. It may remember your Sheet ID,
layout and browsing preferences, but it cannot inherit a browser OAuth session.
Re-authentication may be required when the access token expires because the
beta intentionally does not persist refresh tokens.

The host refuses to reuse any other process on port 8765 unless it reports
the correct Vault marker and the **same native version**. When launched from
the Desktop ZIP, the host starts only the matching server executable beside it.
Closing the final app document normally triggers the existing heartbeat-based
shutdown. A crashed host or missed close event may leave the server until the
heartbeat expiry; no unrelated browser process is force-terminated.

## Validation

The Windows CI:
- publishes an x64, self-contained, single-file .NET 8 WinForms WebView2 host;
- compiles the matching Go server using a test version;
- runs both the native navigation-policy self-test and the real Go
  `--serve-only` HTTP handshake self-test without signing in to Google;
- preserves the existing Windows native updater/rollback and shortcut tests.

Chromium CI tests the desktop-mode JavaScript path with fabricated Sheet data,
including saving a Sheet ID without a Web application client and refusing to
invoke the browser GIS token popup. The release verifier checks exact ZIP
members, both Windows executable signatures, the packaged server's equality
to the standalone EXE and SHA-256 sums.

**Not yet live-tested:** WebView2 rendering on your actual Windows machine,
the runtime installation state, system-browser OAuth approval with your Google
Cloud client and any graphics-driver-specific behaviour. Synthetic CI is
not a substitute for this final user-machine smoke test.

This preview is deliberately separate from a future one-click installer,
code-signing or background-token-refresh project.
