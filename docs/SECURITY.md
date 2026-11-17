# Security

PromptShield's security model is unusual for a web app: there is no server-side
surface at all. This document describes the scope, assumptions, controls, and —
equally important — what PromptShield does **not** claim.

## Scope

PromptShield is a client-side text-review utility. It has no backend, no
database, no accounts, and no prompt-processing endpoint. The only server
involved is the static host serving the application files (GitHub Pages).

## Threat model and controls

| Threat                            | Control                                                                                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt text sent to a third party | No network APIs in application source (statically audited), CSP `connect-src 'self'`, canary E2E test asserting no request carries a synthetic marker prompt                                                                                                |
| Prompt text persisted             | Memory-only session state; no `localStorage`/`sessionStorage`/IndexedDB writes of prompt data (audited); no service worker exists                                                                                                                           |
| DOM XSS from prompt text          | Prompt text is rendered exclusively as text (React text nodes); no `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`/`new Function`, no dynamic script injection — enforced by lint + static audit; E2E test feeds script payloads and asserts inertness |
| ReDoS from user regex             | Pattern length cap (200 chars), flags subset, nested-quantifier pre-check at save time, worker-only execution, and a hard main-thread timeout that terminates and respawns the worker                                                                       |
| Oversized input / files           | Configurable character limit (default 50k) with visible boundary; scan disabled beyond the limit; imports restricted to `.txt`/`.md`, 25 MB cap                                                                                                             |
| Clickjacking / framing            | `frame-src 'none'`; GitHub Pages sets no frame-ancestors, so framing is not technically blocked — standard caveat for static hosting                                                                                                                        |
| Dependency compromise             | Minimal runtime dependencies (react, react-dom, lucide-react), lockfile-pinned, CI-installed with `--frozen-lockfile`                                                                                                                                       |
| Leaks via logs/URLs/errors        | `no-console` enforced in app source; prompt text never enters routes (hash router carries only view names); error toasts carry fixed strings, never values                                                                                                  |

## Content Security Policy

The production build injects (via meta tag, since GitHub Pages cannot set
headers):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self';
manifest-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-src 'none'
```

Notes: `style-src 'unsafe-inline'` is required for React inline style attributes
and carries no script risk here; `connect-src 'self'` blocks third-party network
calls even if a dependency turned hostile; `frame-ancestors` cannot be expressed
in a meta tag (hosting limitation, documented).

## What PromptShield does NOT claim

- **Not a guarantee of anonymity.** Redaction reduces direct exposure; context
  can still identify people.
- **Not prompt-injection protection.** The prompt-risk review flags indicators
  for human attention. Keyword rules are evadable, false-positive prone, and say
  nothing about how an LLM will behave. There is deliberately no "sanitize
  injection" button.
- **Not a DLP or compliance product.** Detection is heuristic with documented
  blind spots (see [DETECTION-CATALOG.md](DETECTION-CATALOG.md)).
- **Not verifiable end-to-end by the audit alone.** The static audit and canary
  test cover the shipped application; they cannot cover your browser,
  extensions, OS clipboard, or the host's logs. See
  [PRIVACY.md](PRIVACY.md) for the precise claims.

## Service worker / PWA

Deliberately omitted. A service worker could only cache application assets, but
any cache layer adjacent to user content is a recurring source of subtle leaks
(stale assets, mis-scoped caches). PromptShield ships no service worker, so
"nothing cached" is trivially true.

## Reporting

Please open a GitHub issue for security-relevant bugs in the application code.
For anything sensitive, use GitHub's private security advisory feature rather
than a public issue. There is no bug bounty and no SLA; fixes land as
maintainer time allows.
