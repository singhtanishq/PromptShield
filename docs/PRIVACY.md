# Privacy

This page documents the exact data-flow contract between you and PromptShield —
what is processed, what is stored, what is never transmitted by the application,
and the honest limits of those claims. The wording here is reviewed against the
actual implementation (see [TESTING.md](TESTING.md) for the verification methods).

## The short version

- **Processing is local.** Prompt text is analyzed in your browser tab by
  JavaScript and a Web Worker on your device. There is no backend, no scanning
  API, no account system, no analytics, and no AI service involved.
- **No prompt-content transmission.** Application code performs no network
  requests at all once loaded: no `fetch`, `XMLHttpRequest`, WebSocket,
  `sendBeacon`, or dynamic script imports exist anywhere in the source, and the
  production build's Content Security Policy restricts `connect-src` to `'self'`.
- **Nothing about your prompt is persisted.** Prompt text, findings, redaction
  decisions, allowlist entries, and the pseudonymization map live in memory only
  and are discarded when the tab closes or you clear the session.
- **Saved preferences contain no prompt data.** Theme, input limits, region hint,
  preset/category choices, and custom rule definitions are stored in this
  browser's local storage under the `promptshield.settings.v1` and
  `promptshield.rules.v1` keys. Custom rules are your own pattern definitions and
  synthetic test cases — the app never writes prompt content into them.
- **Exports are sanitized by default.** Copy and download always contain the
  sanitized text; the optional "copy with annotations" adds category counts, never
  values. Settings/rules exports contain preferences and rule definitions only.
  The pseudonymization map is never included in any export.

## What is stored where

| Data                          | Where it lives              | Cleared by                                             |
| ----------------------------- | --------------------------- | ------------------------------------------------------ |
| Prompt text                   | Memory (this tab)           | Closing/reloading the tab, Clear session, Clear prompt |
| Scan findings & decisions     | Memory (this tab)           | New scan, text edit, Clear session                     |
| Allowlisted exact values      | Memory (this tab)           | Per-item remove, Clear session                         |
| Pseudonymization map          | Memory (this tab)           | Forget mapping, text edit, Clear session               |
| Appearance & scan preferences | localStorage (this browser) | Clear local settings                                   |
| Custom rule definitions       | localStorage (this browser) | Rule editor, Clear local settings                      |

## Verification (and its limits)

The local-only contract is enforced in layers:

1. **Static audit** (`pnpm audit:privacy`, runs in CI): scans application source
   and the production build for network APIs (`fetch`, `XMLHttpRequest`,
   `WebSocket`, `EventSource`, `sendBeacon`), unsafe HTML sinks
   (`dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`), dynamic
   script loading, un-namespaced storage writes, and remote runtime assets.
2. **Canary E2E test** (`e2e/privacy-canary.spec.ts`): enters a synthetic marker
   prompt, then scans, redacts, copies, downloads, changes settings, and
   navigates while instrumenting every network request, console message, and
   storage record. The test asserts the marker appears in none of them.
3. **CSP**: the production build ships a `Content-Security-Policy` meta tag with
   `connect-src 'self'`, `script-src 'self'`, `object-src 'none'`,
   `base-uri 'none'`, and `form-action 'none'`, so even an injected dependency
   could not silently exfiltrate to a third party without also breaking the page.

The honest claim is: **"no prompt-content network transmission observed in the
tested workflows."** That is evidence from testing, not mathematical proof. The
audit and canary cover the application code that ships; they cannot prove
anything about your browser, your extensions, or the host.

## Caveats that matter

- **Hosting/CDN logs.** The static site is served from GitHub Pages. Like any
  web host, it may keep access logs for page and asset requests. Those requests
  cannot contain prompt text (the app never sends any), but the fact that you
  visited the page is visible to the host and your network operator.
- **Browser extensions.** Extensions with page access can read anything on the
  page, including your prompt text, regardless of this application's behavior.
  If your prompts are highly sensitive, consider using a clean browser profile.
- **Clipboards.** Copy actions use your browser's clipboard API. Some platforms
  keep clipboard history; paste-sensitive-content-into-clipboard at your own
  discretion. Copy actions only run after an explicit user gesture.
- **Clipboard permissions.** PromptShield never requests clipboard _read_
  permission; paste via your browser's normal paste behavior stays local.
- **Downloads.** Exported files land wherever your browser saves downloads.
- **No anonymization guarantee.** Redacting identifiers reduces direct exposure;
  it does not make a prompt anonymous. Contextual details (project names, writing
  style, timelines) can still identify people or employers.
- **Heuristic detection.** Misses and false positives are expected. See
  [DETECTION-CATALOG.md](DETECTION-CATALOG.md) per detector.

## Required disclaimer

> PromptShield scans text in your browser and suggests potential sensitive
> information and risk indicators. Detection is heuristic: it can miss sensitive
> content and flag harmless text. Review every change before sharing.
> PromptShield does not guarantee that a prompt is anonymous, secure, or
> resistant to prompt injection.

## Clearing data

Two controls, matching what they actually remove:

- **Clear current prompt & session** — drops in-memory text, findings, decisions,
  allowlist, and the pseudonymization map. Nothing was ever stored or sent.
- **Clear local settings** — removes saved preferences (and you can delete rule
  definitions from the Rules workspace). Both actions run entirely on your device.
