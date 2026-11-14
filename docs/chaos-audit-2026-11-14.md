# Jack's Image Vault — adversarial stress audit

**Date:** 2026-11-14  
**Baseline:** native Windows release v2.1.14, GitHub `main` as audited on this date  
**Change set:** PR #53, synthetic-data hardening tests and fixes  
**Scope:** no connected Google account, real images, spreadsheet records, credentials, or existing Windows shortcuts were modified during this audit.

## Summary

This pass deliberately attempts invalid/hostile input and overlapping work, not only normal feature smoke tests.

### Reproducible defects in baseline source and changes

| Priority | Condition | Baseline risk | Remediation |
|---|---|---|---|
| High | Start a newer EXE while an older EXE already owns localhost:8765 | The constant health marker made a newer launcher reopen an older one with no warning; the new feature appears not to install | Include separate native/UI version headers. A newer EXE detects and refuses older native servers (including legacy responses lacking the header), with clear instructions to close the old process |
| Medium | Existing Desktop/Start Menu shortcut targets an unrelated binary named like `Jacks_Image_Vault.exe` | Basename matching alone let setup claim a shortcut it may not own | Require a strictly versioned EXE path inside the specific per-user Vault installation directory. Leave other shortcuts untouched |
| Medium | Version component exceeds machine integer range | `strconv.Atoi` overflow was ignored and the component silently compared as zero, potentially misordering patches | Decimal-string numeric comparator handles arbitrarily long values and leading zeroes |

### New tests added

- **Windows EXE identity:** old/new/legacy/unrelated local server classification, including a test with UI version newer than the underlying native launcher.
- **ZIP chaos:** corrupted archive, truncated ZIP, absent/bad manifest, extra/traversal entries, oversized expanded assets and **400 deterministic random bit flips** of a valid ZIP. An unexpectedly accepted mutation must still yield identical verified payloads.
- **Go fuzzing:** malformed seed and fully valid, verified update ZIP seed; GitHub CI runs a short bounded fuzz session. *This is a short smoke-fuzz, not exhaustive formal proof.*
- **Race/concurrency:** race detector runs concurrent synthetic patch installations and version/status reads; the highest version must win with a checksum-valid active release.
- **Browser injection:** HTML-like text submitted in both the search field and saved-search name must be escaped and never executed.
- **Narrow screens:** check 320px viewport width while opening Home, gallery, Video Library, Review Inbox and Install App. Existing 375px mobile test remains in place.
- **Windows safety:** Windows CI compiles and tests versioned-copy behavior, shortcut destination ownership and native installer nonce/Origin validation; existing Windows EXE, restart and rollback smoke tests also run.

### Already-present tests retained

- Scan datasets of 3,000, 5,000 and 8,250 synthetic Drive files.
- Repeated page tokens, pagination failure, 403/429 quota situations, stalled and cancelled operations, deleted or moved files, wrong-account reconnect and privacy.
- Reviews, filename suggestions, video descriptions, video codecs, media cancellation, temporary poster object URLs and JSON backups.
- Verified release ZIPs, checksums, native rollback and same-origin security guards.

### Deliberate boundaries and remaining risks

1. **Real Windows user experience:** CI cannot prove taskbar grouping, browser process shutdown, Start Menu cache refresh, redirected desktop policy, or behavior with security products on the user's specific PC. Manual Windows exploratory testing is still required.
2. **Browser-hosted window:** Edge/Chrome still owns the actual app-mode window. This PR prevents confusing old-server reuse but does not turn it into a true native WebView2 process or automatically quit its server when the browser closes.
3. **Live Drive/Sheets:** tests use mock accounts, IDs, network responses and read-only operations, so real quota limits, latency and Google OAuth cookie-policy changes are not reproducible in this pass.
4. **Partial shortcut setup:** installing a versioned EXE copy and creating two shortcuts is not yet one transactional operation. A blocked Start Menu/Desktop write can leave a harmless extra local copy. A follow-up could add a per-user transaction log and recovery wizard.
5. **Fuzzing coverage:** the bounded CI run should continue periodically with longer duration and an expanded corpus. Passing it does not imply memory or parser safety for every possible ZIP.

### Repeatable validation

```bash
go test ./...
go test -race -run TestChaos -count=2 ./...
go test -run '^$' -fuzz '^FuzzParseZip$' -fuzztime=3s -parallel=2 .
node --test tests/*.test.cjs
```

GitHub Actions also runs `node tests/browser-e2e.cjs`, the Windows-specific Go tests, and real Windows EXE smoke/rollback checks.

**Release policy:** CI must be green before merging. A newer native EXE, not a UI-only ZIP, is required for the launcher identity and Windows shortcut security fixes.
