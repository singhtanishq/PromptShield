# Detection catalog

Every built-in detector, what it looks for, how confidence and severity are
assigned, and the caveats you should assume. All offsets are UTF-16 code units in
the original text (end-exclusive). Findings never contain the matched value —
only a masked preview and structural evidence.

**Global conventions**

- **Severity** is how consequential a finding would be _if real_. **Confidence**
  is how sure the heuristic is. They are independent: a possible private key can
  be critical severity at medium confidence.
- Format validation (checksums, parsing) improves confidence but never proves
  authenticity. A checksum-valid number is not necessarily a real account.
- Sensitivity setting gates tiers: `low` runs only high-confidence paths, `high`
  also runs low-confidence heuristics.
- Overlapping detections resolve deterministically (severity → confidence → span
  → position); shadowed findings appear as related sub-details.

## Contact & PII

### Email (`email` v1.1)

- **Looks for**: `local@domain.tld` shapes with conservative boundaries — no
  leading/trailing dots, no consecutive dots, ≤254 chars, sentence punctuation
  stays outside the match.
- **Severity/confidence**: medium / high.
- **Caveats**: deliberately conservative; exotic RFC-5322 forms (quoted local
  parts, IP-literal domains) are not matched. `example.com`-style addresses match
  — they are email-shaped even when fictional.

### Phone (`phone` v1.1)

- **Looks for**: NANP (`(415) 555-0132 ext. 88`), UK (`+44 20 7946 0958`), India
  (`98765 43210`), and generic international `+`-prefixed shapes; extensions
  included in the span. The region hint reorders patterns; all regions are always
  scanned.
- **Guards**: bare 10-digit runs require phone-context keywords nearby; matches
  inside digit runs longer than 15 digits (cards, order numbers) are rejected;
  leading-`+`/parenthesized/separated forms need no context.
- **Severity/confidence**: medium; high for region shapes, medium for generic intl.
- **Caveats**: heuristics only — international formats vary widely; short local
  formats are not matched.

### Network identifiers (`network` v1.0)

- **IPv4**: real octet parsing (rejects `999.1.2.3`, leading zeros). Public IPs →
  low severity; private/loopback/link-local → medium severity as
  infrastructure disclosure.
- **IPv6**: broad candidate filter validated with a real parser (compression
  rules). Low severity.
- **URLs with credentials** (`scheme://user:pass@host`): critical / high — the
  masked preview shows only scheme + masked user/pass + host head.
- **URLs with tracking parameters** (`utm_*`, `fbclid`, `gclid`, …):
  informational / high.
- **Internal/staging hosts** (keyword anywhere in the host):
  medium / medium-confidence.
- **Caveats**: plain public URLs are ignored; internal-host detection is
  keyword-based and can miss unusual naming.

## Personal data

### Person names (`personal-data` v1.0)

- **Looks for**: honorific patterns (`Ms/Mr/Dr/Prof/Sir/Rev…` + capitalized
  words) and explicit labels (`Customer:`, `Attendee:`, `From:`, `Signed:` …).
- **Severity/confidence**: medium / medium.
- **Caveats**: deliberately limited local heuristics — **not** a language model
  and not full NER. Names without honorifics or labels are not detected (avoiding
  noisy false positives on capitalized ordinary words was a design choice). Use
  custom rules for people you work with.

### Postal addresses (`personal-data` v1.0)

- **Looks for**: house number + street-name words + street-type suffix;
  city/state/ZIP only when an address keyword is nearby.
- **Severity/confidence**: medium (street) / low (city-state-zip), medium confidence.
- **Caveats**: US-style patterns; international formats are largely uncovered.

### DOB and age (`personal-data` v1.0)

- **DOB**: explicit labels (`DOB`, `date of birth`, `born on`, `birthday`) + date
  shape → high severity / high confidence.
- **Age**: `age: 42`-style labels with range sanity (1–129) → low / medium.

## Financial

### Payment cards (`payment-card` v1.0)

- **Looks for**: 13–19 digit numbers (grouped or continuous) with brand prefixes
  (Visa, Mastercard, Amex, Discover, JCB, Diners, UnionPay).
- **Severity/confidence**: **critical / high** when Luhn-valid with a plausible
  brand shape; **medium / low** for card-shaped numbers failing Luhn.
- **Caveats**: test card numbers (e.g. `4111 1111 1111 1111`) match — they are
  structurally valid. A Luhn pass does not prove the number belongs to a real
  account. Partial mask mode keeps the last four digits.

### IBAN (`iban` v1.0)

- **Looks for**: country code + 2 check digits + BBAN, validated with the ISO
  13616 mod-97 checksum.
- **Severity/confidence**: high; **high** confidence when the checksum passes,
  **low** when it fails.

### Bank-account candidates (`bank-account` v1.0)

- **Looks for**: 8–17 digit runs (and a few regional shapes) near banking
  keywords (account, IBAN, routing, sort code…).
- **Severity/confidence**: medium / medium. Jurisdiction shapes vary — this is a
  candidate, not a verified identifier.

## Government identifiers (`government-id` v1.0)

All findings are **heuristic format matches — never proof of authenticity**, and
every explanation says so.

- **US SSN** (`123-45-6789`): area/group/serial structural rules (rejects
  000/666/9xx areas, 00 groups, 0000 serials). Critical; high confidence with SSN
  context nearby, medium without. Bare 9-digit runs without context are ignored.
- **UK National Insurance** (`QQ 12 34 56 A` shape, restricted letter classes):
  critical; medium with NI context, low without.
- **India PAN** (`ABCDE1234F` shape with valid holder-type letter): critical;
  medium with tax context, low without.
- **India Aadhaar** (12 digits): Verhoeff checksum when possible; critical;
  high/medium with checksum+context, low when only context.
- **Caveats**: regional coverage is deliberately narrow (SSN/NI/PAN/Aadhaar).
  Passport and driver-license formats vary too much for deterministic rules — use
  custom rules instead.

## Secrets & credentials

### Secrets (`secrets` v1.0)

- **Documented provider shapes** (recognition only — no provider affiliation, and
  nothing is validated against any service):
  AWS access keys (`AKIA…` 20 chars, critical/high), GitHub tokens
  (`ghp_/gho_/ghs_/ghu_/ghr_` + 36+, `github_pat_`), GitLab (`glpat-`), Slack
  (`xox[abprs]-`), Stripe live secret/restricted (`sk_live_`, `rk_live_`),
  publishable (`pk_live_` — low severity, public by design), webhook secrets
  (`whsec_`), Google API keys (`AIza…` 39 chars).
- **OpenAI-style keys** (`sk-` + 20+): critical / **medium** confidence — the
  prefix is shared by several providers.
- **JWT**: three base64url segments with the standard `eyJ…` header — critical /
  high.
- **Bearer / Basic** authorization values: high / high.
- **High-entropy candidates**: 32–128 char runs with ≥3.2 bits/char entropy near
  a secret keyword — high / **medium**. Entropy is a hint, not proof; hashes will
  match.

### Credentials (`credentials` v1.0)

- **Labeled passwords** (`password=`, `passwd:`, `passphrase is …`): critical /
  high — matched only because of the explicit label, including the label in the
  masked span.
- **Private key blocks** (BEGIN→END, PEM/OpenSSH/PGP): critical / high, multiline
  safe. Truncated BEGIN headers without END still warn (high).
- **Database connection strings** (`postgres://user:pass@host`, mysql, mongodb,
  redis, amqp, mssql…): critical / high; the password is a related sub-detail of
  the parent finding.
- **Credential env-vars** (`*_SECRET`, `*_TOKEN`, `*_KEY`, `PASSWORD`… with
  literal values): high / medium. Reference values (`${VAULT_KEY}`) are skipped.
- **Session/auth cookies**: high / medium.
- **Recovery/one-time codes** with explicit labels: high / high.

## Internal & confidential (`sensitive-context` v1.0)

- **Confidential labels** (`confidential`, `internal only`, `do not share`,
  `NDA`, `customer data`, `proprietary`, `trade secret`): **informational** /
  high. An indicator, not proof of legal status.
- **Internal hostnames** (internal/intranet/corp/local/staging/dev/test/qa/uat
  keywords in a host): medium / medium.
- **Local file paths** (`/Users/…`, `~/…`, `C:\Users\…`): medium / medium — home
  paths can expose usernames.
- **Cloud resource IDs** (ARN format with account id): medium / high.

## Prompt risk review (`prompt-risk` v1.0) — independent of PII

This section is a **review aid**, never auto-redacted, and never conflated with
PII redaction. Phrase rules are evadable and false-positive prone; a browser-side
scanner cannot guarantee anything about how an AI system will behave.

- **Instruction-override phrasing** (`ignore/disregard/override …
previous/system/developer instructions`): high / medium.
- **Reveal-hidden-context phrasing** (reveal/show the system prompt, secrets,
  credentials): high / medium.
- **Safeguard-bypass phrasing** (bypass/circumvent safety, filters,
  guardrails): high / medium.
- **Data-exfiltration phrasing** (send/post/upload … to a webhook/URL/external
  server): high / medium.
- **Persona/jailbreak phrasing** ("you are now unrestricted" patterns):
  medium / **low**.
- **Hidden Unicode**: zero-width (U+200B/C/D, U+2060, U+FEFF), bidi controls
  (U+202A–E, U+2066–9), C0/C1 control characters — high / **high** (structural).
  Evidence includes the codepoint. PromptShield never silently removes them.
- **Encoded payloads**: base64 (32+ chars), hex (48+ digits), percent-encoded
  runs — low / low by default. Decoding is **opt-in** (`Inspect encoded
payloads`), bounded (≤4KB input, ≤400-char preview), one level deep, displayed
  as inert text, and never executed. If the decoded preview contains
  instruction-like keywords the finding escalates to high / medium.
- **Limitations**: no homoglyph detection beyond a warning scope, no semantic
  analysis, and no guarantee that flagged text is malicious (quotes and training
  examples trigger these rules too).

## Custom rules (`custom-rules` v1.0)

User-defined recognizers: literal or regex patterns with `i`/`m`/`s`/`u` flags,
optional context keywords, user-chosen severity/confidence/replacement, and test
cases that must pass before saving. Guardrails: pattern length cap (200), flag
subset, nested-quantifier ReDoS pre-check, worker-only execution, and the scan
hard-timeout backstop.

## Known blind spots (summary)

- No language-model NER: unmarked names, honorific-free references, and
  non-US/UK/IN address formats are largely undetected.
- Provider token shapes are recognized only where prefixes are stable and
  documented; rotation schemes and new providers are not covered.
- Obfuscated secrets (split across lines, Caesar-shifted, templates) are not
  reconstructed.
- Encoded-payload analysis is one level deep and bounded by design.
- Prompt-injection indicators are keyword rules — trivially evadable — and never
  a security verdict.
