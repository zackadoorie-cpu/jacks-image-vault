# Windows app-window integration — OAuth-safe next phase

**Baseline:** v2.1.16. This phase deliberately keeps Edge/Chrome as the default
browser engine, rather than moving Google OAuth into an embedded WebView.

## Why the native WebView2 host is not yet the default

Google's OAuth security policy prohibits conducting Google OAuth authorization
requests inside developer-controlled embedded user-agents, including WebViews.
The current gallery uses browser-only Google Identity Services token flows.
Simply putting the existing web UI into WebView2 would risk
`403: disallowed_useragent`, isolate its browser profile, and invalidate the
existing convenient account-reconnect behavior.

Official guidance:
- Google OAuth secure browsers: https://developers.google.com/identity/protocols/oauth2/policies
- Microsoft Edge PWA installation: https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge
- Microsoft WebView2 runtime guidance: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version

## What this first phase implements

1. Native Go launcher supports `--serve-only`. It binds the same
   `127.0.0.1:8765` read-only gallery and authenticated update endpoints but
   never launches or claims a browser window. This is preparatory infrastructure
   for a later desktop shell and is not offered as a user-facing alternate
   launch method yet.
2. The existing launcher first looks for an installed **Edge app shortcut**
   named `Jack's Image Vault.lnk` in known current-user Edge-app Start Menu
   folders. It validates an official Edge executable path, a Web App ID,
   the exact Vault loopback origin and rejects dangerous Chromium arguments.
   **Only after all checks pass** does it open the installed Edge app.
3. If no validated installed app exists, it uses the existing Edge/Chrome
   `--app=http://localhost:8765/` launch. The app remains usable without
   any PWA installation and no Google session is moved to another browser.
4. Synthetic Windows CI tests exercise a trusted PWA shortcut and reject
   foreign domains, unrecognized executables and unsafe launch switches.
   A real native server-only process is tested against its loopback health
   and document-serving endpoints.

**Limitations:** Edge stores PWA shortcuts differently across versions and
profiles. This phase only recognizes the known Microsoft Edge Apps or Edge Apps
Start Menu folders and an optional `--app-url` argument pointing exactly at
the Vault localhost origin. If that evidence is absent, it **fails closed and
falls back**. It never searches unrelated shortcuts or opens an unverified
`.lnk` target. Reusing the same Edge profile should preserve the browser's
Google login, but Google may still request consent or sign-in.

## Later phases

- **Second phase: OAuth broker design.** If a native WebView2 shell is desired,
  design a Desktop OAuth (PKCE + loopback) flow in the *system browser*, not an
  embedded WebView, and a strictly origin-bound session bridge. Review scopes,
  token lifetime and revocation, browser isolation, and migration from the
  existing Web OAuth client. Never silently copy browser cookies or tokens.
- **Third phase: native window prototype.** Only after the OAuth broker passes
  Google login and reconnect tests, try a real WebView2 window with its own icon,
  shutdown behavior and Windows AppUserModelID. Keep the original Edge/Chrome
  launcher as a fallback.
- **Fourth phase: packaging.** Ship a new Windows EXE/installer after native
  integration tests, signature/release verification, and hands-on user testing.

## Test commands

```powershell
go test ./...
./scripts/windows-edge-pwa-smoke.ps1
./scripts/windows-server-only-smoke.ps1 -ExecutablePath .\Jacks_Image_Vault.exe
```

No actual Google Drive or Sheet write operations are required for these tests.
