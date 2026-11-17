import { useState } from 'react';
import { AlertTriangle, Check, Copy, Info } from 'lucide-react';
import { Panel } from '../../components/ui';
import { useToast } from '../../components/toast';

declare const __APP_VERSION__: string;

const PRODUCT_URL = 'https://singhtanishq.github.io/PromptShield/';

export function AboutView() {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink">
          About PromptShield <span className="font-normal text-ink-faint">v{__APP_VERSION__}</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          A local-first utility for inspecting prompts before sharing them with AI tools. Built as a
          static web application with no backend by design.
        </p>
      </div>

      <Panel title="Methodology">
        <div className="space-y-3 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <p>
            Detection runs through a registry of deterministic, rule-based recognizers executed
            inside a Web Worker. Each detector reports findings with UTF-16 text offsets, severity
            (how consequential), and confidence (how certain) — deliberately separated concepts,
            because a possible private key can be high severity at medium confidence.
          </p>
          <p>
            Findings never store or display the full matched value — only masked previews. Where
            formats define validation (Luhn for cards, mod-97 for IBANs, structural parsing for IPs
            and JWTs), validation improves confidence but never proves authenticity: a
            checksum-valid number is not a real account.
          </p>
          <p>
            Overlapping detections resolve deterministically (severity, then confidence, then span
            length, then position) so the same text always produces the same result. Every detector
            is unit-tested with positive, negative, boundary, and Unicode cases; a benign corpus
            keeps ordinary phrases like “system requirements” from being flagged.
          </p>
        </div>
      </Panel>

      <Panel title="Known limitations">
        <ul className="space-y-2.5 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <li className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Detection is heuristic. It misses things (false negatives) and flags harmless things
            (false positives). It is not a DLP product or a compliance tool.
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Person-name detection uses conservative local heuristics, not a language model —
            coverage is deliberately limited to avoid noisy false positives.
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Prompt-risk indicators are keyword/phrase rules. They are evadable, can misfire on
            ordinary text, and cannot guarantee anything about how an AI system will behave.
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            PromptShield does not guarantee that a prompt is anonymous, secure, or resistant to
            prompt injection. Pseudonymization reduces direct exposure but may not fully anonymize
            context.
          </li>
        </ul>
      </Panel>

      <Panel title="Testing approach">
        <div className="space-y-3 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <p>
            The engine is independent of the UI and tested with Vitest: per-detector positive,
            negative, boundary, and Unicode cases; span-transformation tests covering overlaps,
            emoji, CRLF, and code fences; and privacy tests asserting that a canary prompt never
            reaches storage, URLs, console output, or the network.
          </p>
          <p>
            Playwright drives the real application end-to-end — scanning, redacting, copying,
            exporting, clearing — in desktop and mobile viewports, against the production build.
          </p>
        </div>
      </Panel>

      <Panel title="Project">
        <div className="flex flex-col gap-3 px-4 py-3 text-sm text-ink-muted">
          <p>
            PromptShield is open source under the MIT license. The code, documentation, and issue
            tracker live on GitHub.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://github.com/singhtanishq/PromptShield"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
            >
              GitHub repository
            </a>
            <button
              type="button"
              onClick={() => {
                window.navigator.clipboard
                  .writeText(PRODUCT_URL)
                  .then(() => {
                    setCopied(true);
                    showToast('success', 'Product link copied — no prompt data included.');
                    window.setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() =>
                    showToast('error', 'Could not access the clipboard. Copy the URL manually.'),
                  );
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4 text-success" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              Copy product link
            </button>
          </div>
          <p className="flex items-start gap-2 text-2xs leading-snug text-ink-faint">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            PromptShield is an independent project and is not affiliated with, endorsed by, or
            connected to any AI provider. Provider names appear only to describe recognizable token
            formats.
          </p>
        </div>
      </Panel>
    </div>
  );
}
