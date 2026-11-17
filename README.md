# PromptShield — Private AI Prompt Sanitizer

> **Share the prompt. Not the sensitive bits.**

PromptShield helps you inspect AI prompts before you send them. It flags potential
personal data, financial identifiers, secrets, internal/confidential content, and
prompt-risk indicators — then lets you redact, pseudonymize, or replace exactly what you
choose, review a before/after diff, and copy or download a safer version.

**Everything runs in your browser.** There is no backend, no account system, no analytics,
and no AI service: prompt text is analyzed by a Web Worker on your device and is never
transmitted by the application. See [docs/PRIVACY.md](docs/PRIVACY.md) for the precise
data-flow contract and its limits.

> PromptShield scans text in your browser and suggests potential sensitive information and
> risk indicators. Detection is heuristic: it can miss sensitive content and flag harmless
> text. Review every change before sharing. PromptShield does not guarantee that a prompt
> is anonymous, secure, or resistant to prompt injection.

## Status

🚧 Under active development — the workspace, design system, and navigation are in place;
the detection engine, redaction pipeline, rules, and documentation land in the following
milestones. See [CHANGELOG.md](CHANGELOG.md) for progress.

## Tech stack

- Vite + React + TypeScript (strict)
- Tailwind CSS with a light/dark design-token system
- Web Workers for prompt analysis (bounded, cancellable)
- Vitest + Testing Library for unit/integration tests
- Playwright for E2E tests and screenshots
- GitHub Actions CI + GitHub Pages deployment

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # start the dev server
pnpm test           # unit & integration tests
pnpm lint           # eslint
pnpm typecheck      # tsc project build
pnpm build          # production build (dist/)
pnpm preview        # serve the production build locally
pnpm audit:privacy  # static privacy audit of source & build output
pnpm test:e2e       # Playwright E2E against the production build
```

## Documentation

- [Privacy](docs/PRIVACY.md) — what is processed, stored, and never transmitted
- [Architecture](docs/ARCHITECTURE.md) — components, worker protocol, storage boundaries
- [Detection catalog](docs/DETECTION-CATALOG.md) — detectors, confidence, limitations
- [Security](docs/SECURITY.md) — threat model, CSP, scope
- [Testing](docs/TESTING.md) — test matrix and privacy audit process
- [User guide](docs/USER-GUIDE.md) — walkthrough with screenshots

## License

[MIT](LICENSE)
