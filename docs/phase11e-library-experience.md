# Phase 11E — Library Experience Overhaul (v2.1.41)

This release changes **navigation and presentation only**. It retains all previously connected Google Drive and Sheets workflows, original file safeguards, OAuth handling, desktop auto sign-in, updater behavior and local review metadata.

## Navigation

Five top-level destinations: Home, Library, Review Center, Library Health, Tools. Each existing `data-view` is preserved once in its appropriate group. Review and filename completion are grouped behind Review Center, and exploratory tools behind Tools.

Desktop users can toggle an **icon-only sidebar** with the visible Collapse sidebar button, expanding the media canvas from 244 pixels of navigation to 78 pixels. Group headings open contextual flyout menus. The choice persists locally as `jack-vault-sidebar-icon-mode-v1`, containing only `compact` or `expanded`; no credentials or media metadata. The existing resizable sidebar remains available when expanded. At tablet/mobile widths, the familiar horizontal navigation remains, with the compact toggle hidden.

## Unified Library Health

Library Health contains Overview, Filename Integrity, Recovery Desk and Catalog & Sync as explicit tabs with ARIA tab/tabpanel relationships. Left/Right, Home and End change tabs. The existing Drive scan, GET-only integrity audit, Recovery Desk rechecks, and the explicit, separately authorized catalog import remain the same functions. Switching tabs never triggers a network write. The existing content is not destroyed or duplicated: it is displayed only under one active pane.

## Home & gallery

- Softer palette-aware hero and calmer typography
- Four large, wired entry points: Search, Review Center, Library Health and Explore Tools
- More generous gallery width, refined toolbar, and less noisy status/action cards
- Every numeric library summary continues to come from the live account-bound inventory. **The UI does not claim that a full audit succeeded without verification.**
- Existing home shortcuts, video library, activity, undo, review, favorites, collections and advanced tools are retained, including their element IDs.

## Tests and release rules

1. Preserve every previous Drive/Sheet/OAuth/updater safety test and existing first-party theme.
2. New fabricated Chromium checks: five primary destinations, all 17 old routes, icon mode persist/expand, tools flyout, keyboard and ARIA Health tabs, four functional home actions, and no-data preview.
3. Cross-platform Linux, Windows DPAPI/WebView2/updater and Chromium CI must pass. Native browser and Windows connectivity must continue working without credential-copy workflows.
4. No original Drive file renamed, moved or deleted by this release. No Sheet formula or review-row rewrite. No direct Google API call was added to the presentation code.
5. Ship only after independent full `release.yml` build, synthetic validation, Windows EXE, update ZIP, desktop bundle and SHA-256 assets are verified.

### Design note

Previous UI mockups were **visual concepts**, not accurate statements about live user counts. This implementation keeps real accounting, existing app icons and the five theme palettes, without adding stock personal images or guessed album data.

Related to Issue #88.
