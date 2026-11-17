import { Database, Globe2, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useSession } from '../sanitizer/session';
import { useSettings } from '../../app/settings';
import { useToast } from '../../components/toast';
import { Button, Panel } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { useState } from 'react';

/**
 * Privacy center: the precise, honest data-flow contract. This copy must match
 * actual implementation behavior — see docs/PRIVACY.md for the full version.
 */
export function PrivacyView() {
  const { setText } = useSession();
  const { resetAll } = useSettings();
  const { showToast } = useToast();
  const [confirmClearSession, setConfirmClearSession] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink">Privacy center</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          The exact contract between you and this application — what is processed, what is stored,
          and what is never transmitted. No marketing adjectives, just behavior.
        </p>
      </div>

      <Panel title="Data flow" subtitle="How prompt content moves through PromptShield">
        <div className="space-y-3 px-4 py-3 text-sm leading-relaxed text-ink-muted">
          <p className="flex items-start gap-2">
            <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">Processing is local.</strong> Your text is analyzed in
              this browser tab, by JavaScript and a Web Worker running on your device. There is no
              backend, no scanning API, no account system, and no AI service involved.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">Nothing about your prompt is stored.</strong> Prompt
              text, findings, and pseudonymization maps live in memory only. Closing or reloading
              the tab discards them. Saved preferences (theme, input limit, region hint, custom
              rules) stay in this browser’s local storage and contain no prompt content.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="text-ink">No prompt-content transmission.</strong> Application code
              performs no network requests with your text, findings, or mappings. There are no
              analytics scripts, remote fonts, or third-party runtime assets. A Content Security
              Policy restricts the page to same-origin resources.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              <strong className="text-ink">Honest caveats.</strong> Static hosting providers may
              keep access logs for page requests (which cannot contain prompt text, since the app
              never sends it). Browser extensions can read any page you visit. Pasting text uses
              your browser’s clipboard, which may keep history on some platforms. A browser-side
              scanner cannot guarantee that a prompt is anonymous, complete in its detection, or
              safe from prompt injection.
            </span>
          </p>
        </div>
      </Panel>

      <Panel title="What is stored where">
        <div className="overflow-x-auto px-4 py-1">
          <table className="w-full min-w-160 text-left text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Data
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Where it lives
                </th>
                <th scope="col" className="py-2 font-medium">
                  Cleared by
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              {[
                ['Prompt text', 'Memory (this tab)', 'Closing tab, reload, or Clear session'],
                ['Scan findings', 'Memory (this tab)', 'Editing text, new scan, or Clear session'],
                [
                  'Pseudonymization map',
                  'Memory (this tab)',
                  'Forget mapping action or Clear session',
                ],
                [
                  'Appearance & scan preferences',
                  'localStorage (this browser)',
                  'Clear local settings',
                ],
                [
                  'Custom rules & presets',
                  'localStorage (this browser)',
                  'Clear local settings, or rule editor',
                ],
              ].map(([data, where, clear]) => (
                <tr key={data} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-ink">{data}</td>
                  <td className="py-2.5 pr-4">{where}</td>
                  <td className="py-2.5">{clear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Clear data controls">
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirmClearSession(true)}>
              Clear current prompt & session
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(true)}>
              Clear local settings
            </Button>
          </div>
          <p className="text-2xs leading-snug text-ink-faint">
            Both actions run entirely on your device. “Clear session” drops in-memory state; “Clear
            local settings” removes the preferences entry from local storage.
          </p>
        </div>
      </Panel>

      <Panel title="Required disclaimer">
        <blockquote className="mx-4 my-3 border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-ink-muted">
          PromptShield scans text in your browser and suggests potential sensitive information and
          risk indicators. Detection is heuristic: it can miss sensitive content and flag harmless
          text. Review every change before sharing. PromptShield does not guarantee that a prompt is
          anonymous, secure, or resistant to prompt injection.
        </blockquote>
      </Panel>

      <ConfirmDialog
        open={confirmClearSession}
        title="Clear the current prompt and session?"
        body="In-memory prompt text and scan state will be dropped from this tab. This cannot be undone."
        confirmLabel="Clear session"
        danger
        onConfirm={() => {
          setText('');
          setConfirmClearSession(false);
          showToast('info', 'Current prompt and session cleared.');
        }}
        onCancel={() => setConfirmClearSession(false)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Clear local settings?"
        body="Saved preferences will be reset to defaults. No prompt content is stored, so there is nothing else to remove."
        confirmLabel="Reset settings"
        danger
        onConfirm={() => {
          resetAll();
          setConfirmReset(false);
          showToast('info', 'Local settings cleared. Defaults restored.');
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <p className="flex items-center gap-2 text-2xs text-ink-faint">
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
        Privacy wording on this page is reviewed against the actual implementation in the project’s
        privacy audit. See docs/PRIVACY.md for the full contract and its verification method.
      </p>
    </div>
  );
}
