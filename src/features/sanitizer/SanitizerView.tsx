import { FlaskConical, ScanSearch, ShieldCheck } from 'lucide-react';
import { InputPanel } from './InputPanel';
import { EmptyState } from '../../components/ui';

/**
 * Primary workspace. Wide screens: input + findings left, output right.
 * Narrow screens: stacked with the editor first.
 */
export function SanitizerView() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Sanitize a prompt</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Paste the prompt you plan to send to an AI tool. Inspect what looks sensitive, choose
            redactions yourself, and copy the safer version out. Nothing is redacted until you
            choose it.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-2xs font-medium text-ink-muted"
          title="PromptShield has no backend: analysis runs in this browser tab and prompt text is never transmitted by the application."
        >
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
          Processed locally in your browser
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <InputPanel />
          <section
            aria-labelledby="findings-heading"
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
          >
            <div className="border-b border-line bg-surface-2 px-4 py-2.5">
              <h2 id="findings-heading" className="text-sm font-semibold text-ink">
                Findings
              </h2>
              <p className="mt-0.5 text-2xs text-ink-faint">
                Suggestions only — you choose what to redact.
              </p>
            </div>
            <EmptyState
              icon={<ScanSearch aria-hidden="true" />}
              title="No findings to review"
              description="Load text above, then run a scan to see detected sensitive information and risk indicators grouped by type, severity, and confidence."
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby="output-heading"
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
          >
            <div className="border-b border-line bg-surface-2 px-4 py-2.5">
              <h2 id="output-heading" className="text-sm font-semibold text-ink">
                Sanitized output
              </h2>
              <p className="mt-0.5 text-2xs text-ink-faint">
                Appears after you review findings and apply redactions.
              </p>
            </div>
            <EmptyState
              icon={<FlaskConical aria-hidden="true" />}
              title="No sanitized output yet"
              description="Redactions are never applied automatically. After you review findings and choose actions, the sanitized prompt appears here for copying or download."
            />
          </section>

          <section
            aria-labelledby="diff-heading"
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
          >
            <div className="border-b border-line bg-surface-2 px-4 py-2.5">
              <h2 id="diff-heading" className="text-sm font-semibold text-ink">
                Before / after
              </h2>
              <p className="mt-0.5 text-2xs text-ink-faint">
                Compare the original with the sanitized version.
              </p>
            </div>
            <EmptyState
              icon={<ScanSearch aria-hidden="true" />}
              title="No diff yet"
              description="The comparison view highlights exactly what was removed or replaced once redactions are applied."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
