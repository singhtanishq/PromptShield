# Changelog

All notable changes to PromptShield are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning.

## [0.1.0] — 2026-11-18

Initial public release.

### Added

- **Local detection engine** (Web Worker): email, phone (region-hinted, NANP/UK/IN
  plus international shapes with extensions), structurally validated IPv4/IPv6 with
  scope awareness, URLs with embedded credentials / tracking parameters /
  internal hosts, Luhn-validated payment cards, mod-97 IBANs, contextual bank-account
  candidates, government-ID format packs (US SSN, UK NI, India PAN, Aadhaar with
  Verhoeff checksum — all labeled heuristic), documented provider token shapes
  (AWS, GitHub, GitLab, Slack, Stripe, Google, OpenAI-style), JWT, Bearer/Basic
  auth, entropy-based candidates with context, labeled passwords, private key
  blocks, database connection strings, credential env-vars, session cookies,
  recovery codes, conservative name/address/DOB/age heuristics, internal hostnames
  and file paths, ARN-style resource IDs, confidential labels, and a separate
  prompt-risk review (instruction-override phrasing, reveal/bypass/exfiltration
  indicators, hidden Unicode including zero-width and bidi controls, opt-in bounded
  encoded-payload inspection that never executes decoded content).
- Deterministic overlap resolution (severity → confidence → span → position) with
  shadowed findings as sub-details; stable scan-scoped IDs never derived from values.
- Redaction pipeline: mask (subtype-aware placeholders), pseudonymization with a
  volatile session map, custom replacements with preview, partial last-4 masks,
  removal, and typed context placeholders. End-to-start span application, 50-step
  undo/redo, per-finding undo, bulk high-confidence redaction that never touches
  prompt-risk findings, and quote-as-untrusted-data formatting.
- Before/after diff: bounded line LCS with word-level segments, side-by-side on
  desktop and inline on mobile; CRLF, tab, emoji, and code-fence safe.
- Custom rules: literal or regex patterns with flags subset, context keywords,
  test cases that must pass before saving, worker-only execution, ReDoS guards,
  localStorage persistence, versioned JSON export/import with preview.
- Scan presets (General Privacy, Developer/Secrets, Work/Confidential, Financial,
  Minimal) plus per-category toggles and sensitivity control.
- Session allowlist with masked previews and one-click re-enable (memory only).
- File import (.txt/.md, size-limited, never uploaded), sanitized .txt/.md export,
  clipboard copy with manual-selection fallback, copy-with-annotations.
- Privacy center with the exact data-flow contract, storage table, honest caveats,
  and separate clear-session / clear-settings controls.
- Privacy verification: static audit script (394+ checks over source and build
  output) and Playwright canary E2E asserting a marker prompt never reaches
  network traffic, console, storage, or URLs in tested flows.
- Accessibility: skip link, keyboard-only operation, focus-trapped dialogs, ARIA
  menu pattern, live-region announcements, reduced-motion support, axe scans
  (WCAG 2.0/2.1 A+AA) passing in light and dark themes.
- Content Security Policy applied to the production build (connect-src 'self').
- GitHub Actions CI (format, lint, typecheck, tests, build, privacy audit, E2E)
  and GitHub Pages deployment.
- Documentation set: PRIVACY, ARCHITECTURE, DETECTION-CATALOG, SECURITY, TESTING,
  USER-GUIDE, plus this changelog; README embeds 12 genuine screenshots.
