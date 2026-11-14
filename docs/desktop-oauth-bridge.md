# Windows desktop OAuth bridge — opt-in beta

This implementation complements the existing Google Identity Services browser
connection. It does **not** replace it or switch the app to WebView2.

## What the new bridge does

- Uses Google's **Desktop application** OAuth client type, not the previously
  configured **Web application** client ID.
- Opens the Google authorization endpoint in the **system browser**, which is
  required by Google's restriction on embedded user-agents.
- Registers a random-port, loopback-only `127.0.0.1` callback, validates a
  unique one-use `state`, and exchanges the authorization code with S256 PKCE.
- Requests exactly `drive.readonly` and `spreadsheets.readonly`. A token
  response missing either grant is rejected.
- Keeps the authorization code, PKCE verifier and optional Desktop client
  secret only in memory. The callback browser page receives **no access token**.
- Delivers a **short-lived, one-time access token** to the app document over
  its existing same-origin, nonce-protected local API. Google Drive/Sheets
  requests continue directly from the browser in the existing verified client.
- Does not request `offline` access and **does not save refresh tokens**.
  Approved-but-unclaimed access tokens expire after five minutes; pending
  authorization times out after three minutes.
- Rejects foreign origins, missing per-app session nonce, wrong callback state,
  malformed client ID, repeated claims and insufficient scopes. A new flow
  cannot silently replace one currently awaiting user approval.
- Does not alter your stored Web OAuth Client ID, browser account binding,
  Google Sheet ID, Drive files, spreadsheet or existing manual connection.

## Enable the beta on a Windows EXE built with this feature

1. In Google Cloud Console, enable **Google Drive API** and **Google Sheets API**
   for the project already used by your Image Vault.
2. Under **Google Auth Platform → Clients**, create a new OAuth 2.0 client of
   type **Desktop app**. This is distinct from your existing **Web application**
   client. Ensure the consent screen lists the requested read-only scopes and
   that your Google account is an allowed test user if still in Testing.
3. Download the Desktop client credentials from Google Cloud. Open the current
   native Image Vault EXE, visit **Google Drive setup** and save the Sheet ID
   through the existing connection settings if it is not already present.
4. In the optional **Windows desktop sign-in** section, paste the Desktop
   client ID. Paste the Desktop client secret only if the downloaded credentials
   include one. Select **Connect via system browser**.
5. Confirm Google's actual `accounts.google.com` domain, choose the desired
   account, and approve the requested read-only scopes. Return to Image Vault
   to load your inventory. No access token or client secret is stored in the
   browser's localStorage.

This feature does not use a Google account password, service account or OAuth
refresh token. It may need a new manual authorization whenever the short-lived
access token expires. Existing browser Google sign-in remains the primary
recommended option for normal use.

## Security limitations

- This beta is currently hosted by the existing localhost gallery, **not** a
  native WebView2 window. A full WebView2 host still requires a separate
  compatibility and security review before any default migration.
- The approved short-lived access token is handed into the current gallery's
  JavaScript memory, as with its existing browser OAuth flow. Local malware,
  browser extensions or compromised trusted gallery scripts remain in scope
  for a later hardening phase; localhost is not an absolute security boundary.
- A Desktop OAuth client is considered a public client. Its optional client
  secret is not a secure replacement for PKCE or state validation.
- The bridge does **not** promise silent reconnect. Refresh tokens are
  deliberately discarded. Automatic reconnect remains on the prior
  browser-client flow only.
- The native EXE's existing custom localhost nonce and host/origin guard are
  reused. The per-flow callback is on a different randomized port and validates
  exact Host and state; it never accepts a bearer token in its URL.
- User login, verification requirements and allowed scope grants remain
  controlled by Google.

## Test coverage

`desktop_auth_test.go` uses a synthetic local OAuth provider to verify:
PKCE S256, exact localhost callback, wrong-state refusal, one-time code
exchange, one-time token claim, cancelled and overlapping flows, missing scopes,
no refresh-token delivery, and local endpoint CSRF/Origin protection.

Chromium E2E uses fabricated Sheets/Drive responses to confirm that Desktop
sign-in is hidden outside native Windows, that the user must explicitly opt in,
and that a claimed token can load the existing gallery without persisting the
Desktop secret or bearer token.

Sources:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/identity/protocols/oauth2/policies
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices

**Release requirement:** Use the new Windows EXE. A browser UI ZIP cannot add
the native broker by itself.
