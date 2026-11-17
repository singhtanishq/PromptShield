# Testing

PromptShield's quality gates: unit/integration coverage for the engine and UI,
Playwright E2E for real user flows, an axe accessibility audit, and two layers of
privacy verification (static audit + canary E2E).

## Commands

```bash
pnpm test           # Vitest: unit & integration (153 tests)
pnpm test:e2e       # Playwright E2E against the production build (24 tests)
pnpm lint           # ESLint (incl. no-console in app code)
pnpm typecheck      # tsc project build (strict)
pnpm format:check   # Prettier
pnpm build          # production build (part of every gate run)
pnpm audit:privacy  # static privacy audit of source + dist
pnpm validate:readme# README screenshot-embed validation
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR; E2E runs
on a separate job against the production build with Playwright's Chromium.

## Unit & integration coverage (Vitest)

**Detectors** (`src/lib/detection/detectors/*.test.ts`) — for every detector:
positive, negative/benign, boundary, malformed, and Unicode cases, plus
high/medium/low-confidence paths and regional formats. Specific assertions
include:

- Luhn accepts valid synthetic cards and rejects bad check digits;
- IBAN mod-97 passes the canonical example and fails off-by-one;
- IPv4/IPv6 parsers reject malformed octets/compression;
- the email matcher keeps sentence punctuation outside the span and rejects
  mid-word matches;
- the phone detector does not classify card numbers, dates, or bare order
  numbers as phones;
- secret patterns require realistic shapes (partial prefixes don't fire);
- private-key matching handles multiline boundaries and truncated blocks;
- DB-URL credentials are identified without echoing values in any field;
- encoded-content review obeys size/depth limits and never executes content;
- hidden-Unicode detection identifies dangerous controls without normalizing or
  removing them;
- government-ID findings always say "heuristic format — not authenticity".

**Engine** (`engine.test.ts`): deterministic overlap resolution (including
sub-detail limits and order independence), category toggles, allowlist
exclusion, truncation reporting, scan-scoped IDs, and the invariant that no raw
matched value appears anywhere in serialized findings or sub-details.

**Redaction** (`redaction.test.ts`): span application end-to-start, mixed modes,
emoji/surrogate pairs, CRLF/tabs/code fences, adjacent spans, remove-mode
semantics, partial masks, repeated-entity pseudonymization consistency, the
pseudonym store lifecycle (forget = irreversible; session-bound), re-identification
with colon-containing values, and annotations that never contain raw values.

**Diff** (`diff.test.ts`): equal/insert/delete classification, CRLF/tab/emoji
safety, pure deletions, whitespace preservation, bounded token paths.

**Rules** (`schema.test.ts`): validation (ReDoS guards, flag sanitization, caps),
export/import round-trip, per-rule error isolation, and overflow caps.

## E2E coverage (Playwright, production build)

- **Core flow** (`e2e/sanitize-flow.spec.ts`): empty state, sample loading, scan,
  findings review, mask/pseudonymize/bulk-redaction actions, per-finding and
  global undo, diff assertions, download content verification (sanitized file
  contains no original secrets), oversized-input boundary, clear-with-confirm.
- **Privacy canary** (`e2e/privacy-canary.spec.ts`): a synthetic marker prompt is
  scanned, redacted, copied, downloaded, and navigated while every network
  request, console message, and storage record is instrumented; the test asserts
  the marker appears in none of them, and separately that allowlisted values
  never reach storage.
- **Hardening** (`e2e/hardening.spec.ts`): script-like prompts stay inert (no
  `window.__pwned`, no script elements created), prompt-risk findings are
  review-only with "quote as untrusted data", hidden Unicode gets codepoint
  evidence, custom-rule creation flows through to detection, pathological regex
  is rejected before saving, clear-data controls work.
- **Keyboard + a11y** (`e2e/keyboard-a11y.spec.ts`): keyboard-only scan and
  redaction, focus order (skip link), axe scans with WCAG 2.0/2.1 A+AA tags on
  every view — passing in both themes.
- **Responsive** (`e2e/responsive.spec.ts`): mobile viewport navigation and
  inline diff rendering.

## Privacy audit (static)

`scripts/privacy-audit.mjs` (runs in CI) checks:

1. **Source** — no `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/
   `sendBeacon`, no dynamic remote imports, no `dangerouslySetInnerHTML`,
   `eval`, `new Function`, `innerHTML`, `document.write`, dynamic script
   elements, un-namespaced `localStorage` writes, or IndexedDB/sessionStorage
   usage; no remote assets in `index.html`.
2. **Build output** — no executable network APIs in the bundle, CSP meta tag
   present with `connect-src 'self'`, no remote `<script>`/resource loads.
3. **Storage model** — the settings key namespace and the absence of
   prompt-persistence code paths.

Current result: **394+ checks, all passing**. The audit is a defense-in-depth
gate — it complements, and never replaces, the runtime canary test and manual
review.

## Canary claim

The honest wording (also used in [PRIVACY.md](PRIVACY.md)): **"no prompt-content
network transmission observed in tested workflows."** That is the result of the
instrumented canary run — not a mathematical guarantee about all possible
environments (browser extensions, compromised dependencies, host logs).

## Manual smoke test

Before each release: run the production build (`pnpm build && pnpm preview`),
then exercise load → scan → redact (each mode) → diff → copy → download → clear
in Chrome, plus a mobile-viewport pass and a dark-theme pass. The screenshot
script (`pnpm screenshots`) doubles as a scripted smoke pass.
