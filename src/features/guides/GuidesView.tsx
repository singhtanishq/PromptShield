import { CircleHelp, ScanSearch } from 'lucide-react';
import { Panel } from '../../components/ui';

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: '1. Get text in',
    body: 'Paste or type a prompt, load a synthetic sample, or import a .txt/.md file. Files are read locally in your browser and never uploaded.',
  },
  {
    title: '2. Scan',
    body: 'Run a scan to detect potential personal data, financial identifiers, secrets, internal/confidential content, and prompt-risk indicators. Scanning never changes your text.',
  },
  {
    title: '3. Review findings',
    body: 'Each finding shows a masked preview, severity (how serious), confidence (how sure the detector is), and why it matched. Findings are suggestions, not verdicts.',
  },
  {
    title: '4. Choose redactions',
    body: 'Mask with a category placeholder, pseudonymize consistently (Jane → [PERSON_1]), enter a custom replacement, or remove a span entirely. Nothing is redacted until you act.',
  },
  {
    title: '5. Compare and export',
    body: 'Review the before/after diff, then copy or download the sanitized text. Export never includes the original unless you explicitly ask for an annotated copy.',
  },
];

const GLOSSARY: Array<[string, string]> = [
  [
    'Redaction',
    'Replacing a span of text with a placeholder such as [EMAIL_REDACTED] so the original value is no longer present in the output.',
  ],
  [
    'Pseudonymization',
    'Replacing a value with a consistent placeholder ([PERSON_1]) repeated for every occurrence of the same entity in the session. Contextual clues may still make re-identification possible — this reduces direct exposure, not full anonymity.',
  ],
  [
    'Severity',
    'How consequential a finding would be if real: critical, high, medium, low, or informational.',
  ],
  [
    'Confidence',
    'How certain the heuristic is that it matched the right thing: high, medium, or low. A possible private key can be high severity but medium confidence.',
  ],
  [
    'Allowlist',
    'A local, explicit list of exact values you marked “not sensitive”. Allowed items stay visible in findings counts until you remove them from the list.',
  ],
  [
    'Prompt injection',
    'An attempt to make an AI system ignore its instructions or leak hidden context. PromptShield flags indicators for human review; it cannot sanitize injection away, and no scanner can guarantee an LLM will obey instruction boundaries.',
  ],
];

export function GuidesView() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink">Guides</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Practical walkthroughs, a glossary, and an overview of what the detectors look for —
          including what they cannot do.
        </p>
      </div>

      <Panel title="Sanitizing a prompt, step by step" subtitle="The core workflow">
        <ol className="flex flex-col divide-y divide-line">
          {STEPS.map((step) => (
            <li key={step.title} className="px-4 py-3">
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title="Detection categories"
        subtitle="What the built-in detectors look for — and their honest limits"
      >
        <div className="overflow-x-auto px-4 py-1">
          <table className="w-full min-w-200 text-left text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Looks for
                </th>
                <th scope="col" className="py-2 font-medium">
                  Keep in mind
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">Contact &amp; PII</td>
                <td className="py-2.5 pr-4 align-top">
                  Email addresses, phone numbers with international formats and extensions, IP
                  addresses (validated), URLs with embedded credentials or tracking parameters.
                </td>
                <td className="py-2.5 align-top">
                  Conservative boundaries to avoid flagging ordinary punctuation or version numbers.
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">Personal data</td>
                <td className="py-2.5 pr-4 align-top">
                  Person names (heuristic, honorifics and labeled patterns), postal addresses via
                  context keywords, dates of birth and ages when clearly labeled.
                </td>
                <td className="py-2.5 align-top">
                  Name detection is deliberately limited without a bundled language model — use
                  custom rules for people you work with.
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">Financial</td>
                <td className="py-2.5 pr-4 align-top">
                  Payment card numbers with Luhn validation, IBANs with mod-97 checksums,
                  account/routing candidates with context.
                </td>
                <td className="py-2.5 align-top">
                  Format validity ≠ a real account. Test card numbers will match.
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">
                  Secrets &amp; credentials
                </td>
                <td className="py-2.5 pr-4 align-top">
                  API keys and high-entropy tokens with context, common provider token shapes (AWS,
                  GitHub, Slack, Stripe, Google, Azure, OpenAI-style), bearer/JWT patterns, labeled
                  passwords, private keys, database URLs with embedded credentials.
                </td>
                <td className="py-2.5 align-top">
                  Provider prefixes are recognized only where stable and documented; coverage is not
                  exhaustive. Nothing is validated against any service.
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">
                  Internal &amp; confidential
                </td>
                <td className="py-2.5 pr-4 align-top">
                  Internal hostnames and private IP ranges, local file paths, staging/dev endpoints,
                  confidential labels (“internal only”, “NDA”, “customer data”).
                </td>
                <td className="py-2.5 align-top">
                  A confidential label is an indicator, not proof of legal status.
                </td>
              </tr>
              <tr className="border-b border-line/60">
                <td className="py-2.5 pr-4 align-top font-medium text-ink">Prompt risk review</td>
                <td className="py-2.5 pr-4 align-top">
                  Instruction-override phrasing, requests to reveal hidden context or bypass
                  safeguards, exfiltration-style instructions, hidden Unicode (zero-width/bidi)
                  characters, suspicious encoded payloads.
                </td>
                <td className="py-2.5 align-top">
                  Keyword rules are evadable and false-positive prone. This is a review aid — never
                  treated as PII and never auto-redacted.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Glossary">
        <dl className="flex flex-col divide-y divide-line">
          {GLOSSARY.map(([term, definition]) => (
            <div key={term} className="px-4 py-3">
              <dt className="text-sm font-semibold text-ink">{term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{definition}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Safe-use tips">
        <div className="space-y-2.5 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <p className="flex items-start gap-2">
            <ScanSearch aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            Treat every redaction as an editorial decision. Automated masking can miss context that
            a human would consider sensitive.
          </p>
          <p className="flex items-start gap-2">
            <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            If a detector misses something specific to your work (codenames, customer names), add a
            custom rule instead of relying on generic heuristics.
          </p>
        </div>
      </Panel>
    </div>
  );
}
