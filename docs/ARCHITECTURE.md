# Architecture

PromptShield is a static single-page application with a strict local-only data
flow. This document describes the component boundaries, the worker protocol, the
storage model, and the deployment layout.

## Stack

| Layer        | Choice                               | Why                                                                                     |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Build        | Vite 6                               | Fast builds, module-worker support, Pages-friendly base paths                           |
| UI           | React 18 + TypeScript (strict)       | Predictable component model, typed boundaries                                           |
| Styling      | Tailwind CSS 3 + CSS-variable tokens | Light/dark theming without runtime cost                                                 |
| Icons        | lucide-react                         | Local, tree-shaken, no runtime font/CDN                                                 |
| Routing      | Hash router (custom, ~60 lines)      | Works on GitHub Pages without SPA fallback; prompt text can never leak into route paths |
| Detection    | Web Worker (ES module)               | Keeps regex work off the main thread                                                    |
| Tests        | Vitest + Testing Library; Playwright | Unit/integration and real-browser E2E                                                   |
| Runtime deps | react, react-dom, lucide-react only  | Small, auditable dependency surface                                                     |

## Source layout

```text
src/
  app/            Shell, hash router, settings provider (non-sensitive prefs)
  components/     UI primitives (dialog, menu, toast, badges, buttons) — all
                  hand-rolled, ARIA-pattern based, no Radix
  features/
    sanitizer/    Session store, input panel, scan controls, findings panel,
                  output panel, diff view
    rules/        Rules provider, rules workspace
    settings/     Settings view
    privacy/      Privacy center
    guides/       Guides view
    about/        About/methodology view
  lib/
    detection/    Engine core: types, engine, registry, context, spans,
                  masking, normalizers, defaults
      detectors/  13 detector modules (one per family)
    redaction/    apply.ts (span pipeline), pseudonyms.ts (volatile store)
    workers/      protocol.ts (versioned messages), scan.worker.ts, client.ts
    rules/        schema (validation/storage/export), presets
    diff.ts       Bounded line/word diff
    files.ts      Local import/download helpers
    samples.ts    Synthetic sample prompts
    settings-io.ts Settings/rules export/import
  styles/         Design tokens (light/dark CSS variables)
```

## Data flow

```text
User pastes/types/imports text
            |
            v
   Input state (memory only, React context)
            |
            v
   ScanRequest -> Web Worker (scanId, text, ScanOptions)
            |
            v
   Normalization + detector registry (13 detectors, time-budgeted)
            |
            v
   Overlap resolution (deterministic) -> ScanResult (offsets + masked previews)
            |
            v
   UI review: severity/confidence badges, category filters, sub-details
            |
            v
   Redaction decisions (user-chosen, undoable)
            |
            v
   applyRedactions() -> Sanitized output + diff (memory only)
            |
            v
   Copy / download / clear (all local)
```

No edge of this graph connects prompt content to a server, an analytics SDK, an
external model, or any backend.

## Worker protocol

Versioned, typed messages (`src/lib/workers/protocol.ts`):

- `SCAN_REQUEST { scanId, text, options }` — one scan at a time; new requests
  supersede in-flight ones.
- `SCAN_PROGRESS { stage, completed, total }` — stage/count only; never values.
- `SCAN_RESULT { scanId, result }` — detections with offsets and masked previews.
- `SCAN_CANCELLED` / `SCAN_ERROR { code, message }` — sanitized codes only.
- `CANCEL_SCAN` — cooperative flag checked between detectors.
- `VALIDATE_RULE` / `VALIDATE_RULE_BATCH` — user-rule test cases run in the
  worker with synthetic text supplied by the caller.

**Cancellation & timeout.** Cancellation is cooperative (checked between
detectors). The main-thread client additionally enforces a hard timeout: if a
scan exceeds it, the worker is **terminated** and respawned on next use. Worker
termination is the reliable backstop against a pathological regex stuck in a
sync loop — a JavaScript regex cannot be interrupted cooperatively.

**Stale-result rejection.** Only the latest scan's promise resolves; superseded
scans reject and their results are dropped by the session store.

## Overlap resolution

Detectors run independently, so the same span can match twice (e.g. an env-var
assignment and the AWS key inside it). `resolveOverlaps` sorts candidates by
severity, then confidence, then span length, then position, and greedily selects
non-overlapping primaries. Every shadowed candidate becomes a sub-detail of the
first covering primary (up to four, summarized in the UI). The same candidate set
always resolves identically — covered by dedicated unit tests.

## Offset convention

All ranges are UTF-16 code-unit offsets into the **original** text, `end`
exclusive — consistent with JavaScript string indexing. Redaction applies edits
end-to-start against original offsets so earlier replacements never invalidate
later ranges.

## Storage model

| Key                        | Contents                                                                               | Sensitive?                              |
| -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| `promptshield.settings.v1` | theme, reduced-motion, input limit, region hint, preset, sensitivity, category toggles | No — validated defensively on load      |
| `promptshield.rules.v1`    | user rule definitions + synthetic tests                                                | User-authored config; never prompt data |

Everything else (text, findings, decisions, allowlist, pseudonym map) is React
state in memory only. `sessionStorage`, `IndexedDB`, cookies, and un-namespaced
`localStorage` writes are forbidden and audited (`pnpm audit:privacy`).

## Detection engine design

- **Registry**: ordered list of `Detector` objects with `id`, `version`,
  `category`, `label`, and a pure `run(ctx)` function. Disabled categories are
  never executed.
- **Context**: detectors receive text, options, sensitivity, locale hint, and a
  scan deadline. They may read matched values locally for validation (Luhn,
  mod-97, Verhoeff, IP parsing, entropy) but must emit only masked previews and
  structural evidence — a unit test asserts raw values never appear in any
  serialized finding.
- **Sensitivity gates**: low/medium/high control which confidence tiers run.
- **Allowlist**: exact-match exclusion at engine level (case-insensitive),
  session-scoped in memory.

## Redaction pipeline

`applyRedactions(text, detections, decisions, pseudonymStore)` resolves each
decision to a replacement string, sorts edits descending by start offset, and
splices them into a new string. Pseudonymization goes through the volatile
`PseudonymStore` (`${category}:${subtype}:${value}` → `[PREFIX_N]`), which keeps
a reverse map for warning-gated local re-identification and can be forgotten
irreversibly in one click.

## Diff

`diffLines` runs an LCS on lines (capped at 4000 lines), pairs adjacent
delete+insert rows, and refines them with word-level LCS (capped at 400
tokens/pair; whitespace-preserving tokenization). `inlineSegments` produces the
mobile variant. Pure functions, fully unit-tested.

## Build & deployment

- `pnpm build` → `dist/` with base path `/PromptShield/` (GitHub Pages project
  site).
- Production `index.html` gains the CSP meta tag (dev is exempt to allow HMR).
- Deployment: GitHub Actions uploads `dist/` and deploys via
  `actions/deploy-pages` (see `.github/workflows/deploy.yml`).
- No service worker is shipped. An offline-first PWA would require caching
  application assets only; it was deliberately omitted so that no cache layer can
  ever interact with user content (see [SECURITY.md](SECURITY.md)).
