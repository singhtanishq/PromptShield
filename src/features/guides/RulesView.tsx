import { Scale } from 'lucide-react';
import { EmptyState, Panel } from '../../components/ui';

/**
 * Custom rules workspace. Custom rule management is built in the Rules milestone;
 * this view always renders honest, real content — never placeholder controls.
 */
export function RulesView() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink">Custom rules</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Teach PromptShield about names, projects, and identifiers specific to your work. Rules run
          locally in the scan worker, are stored only in this browser, and can be exported or
          imported as JSON. Rule contents are treated like the rest of your data: never transmitted.
        </p>
      </div>

      <Panel title="Your rules" subtitle="Custom recognizers supplement the built-in detectors.">
        <EmptyState
          icon={<Scale aria-hidden="true" />}
          title="No custom rules yet"
          description="Built-in detectors already cover common PII, financial, secret, and internal-content patterns. Custom rules let you add organization-specific recognizers — for example matching your project codenames or customer identifiers with a regex, a severity, and a replacement placeholder."
        />
      </Panel>

      <Panel title="How custom rules work">
        <div className="space-y-3 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <p>
            Each rule defines a name, a regex or literal pattern, optional context keywords, a
            severity, a confidence label, and the placeholder used when a finding is redacted.
          </p>
          <p>
            Patterns execute inside the scan Web Worker with length caps and a time budget, so an
            accidentally catastrophic regex cannot freeze the page — it fails safely with an error
            instead.
          </p>
          <p className="text-ink-faint">
            Rules and their test cases are stored only in this browser’s local storage and never
            include prompt content. Use synthetic examples in rule tests.
          </p>
        </div>
      </Panel>
    </div>
  );
}
