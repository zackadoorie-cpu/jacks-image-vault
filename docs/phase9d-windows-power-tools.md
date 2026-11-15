# Phase 9D — Windows Power Tools

The first Phase 9D release adds Ctrl+K commands, contextual file actions, a resizable sidebar, and remembered native window geometry. It does not change Google authorization, video playback, or Drive/Sheet permissions.

## Searchable command palette
Ctrl+K or the topbar Commands button opens a modal palette. Search app views, settings, updates, and explicit read-only Drive verification. Connected-session filename matches require at least two characters and are bounded to five results. Typing issues no extra Google requests. Text uses textContent, never untrusted HTML. Arrow keys choose, Enter opens, Esc closes. Search history is not persisted.

## File context actions
Right-click a gallery tile, use Shift+F10 or its More actions button. Open details, favorite locally, copy filename if clipboard permission allows, or open the original on the official Google Drive site. IDs are rechecked against the connected private gallery before each action. No delete, move, rename, upload, or Sheet write actions exist here. Menus close on navigation, disconnect, click outside and Escape.

## Personal layout
The sidebar width can be dragged or changed with arrow/home/end keys on desktop. Only a number between 200 and 360px is stored in the local browser profile. The native WebView2 window stores width, height and maximized state in %LOCALAPPDATA%/JacksImageVault/window-layout-v1.json, with bounded dimensions and atomic overwrites. DPAPI sign-in data and the WebView2 profile path remain unchanged.

## Verification
Source parity is checked with node scripts/build-power-tools.cjs --check. Synthetic Chromium browser tests cover Ctrl+K, accessibility, right-click actions, bounded filename matches and layout persistence. Native Windows tests cover window-size bounds and read-only data storage. Existing 10k-item gallery, GIF/MP4/WebM, Go security, DPAPI, WebView2 and updater rollback tests remain release gates.

For a real login-persistence test install the full v2.1.25 Desktop Bundle under the same Windows account and check whether the v2.1.24 encrypted Google session resumes without reauthorization. A Google-revoked or expired grant still requires user consent.
