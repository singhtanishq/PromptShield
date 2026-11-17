import { useState } from 'react';
import { Contrast, Gauge, RotateCcw, Trash2, Zap } from 'lucide-react';
import { LOCALE_HINTS, MAX_INPUT_LENGTH_CHOICES, useSettings } from '../../app/settings';
import { Button, Panel, RadioCards, SelectInput, Switch } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import { useSession } from '../sanitizer/session';

/**
 * Detection & appearance settings. Only non-sensitive preferences are persisted
 * (theme, motion, input limit, region hint). Prompt content never reaches storage.
 */
export function SettingsView() {
  const { settings, update, resetAll } = useSettings();
  const { showToast } = useToast();
  const { setText } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearSession, setConfirmClearSession] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Preferences are stored only in this browser and contain no prompt content. Clearing them
          is always one click away.
        </p>
      </div>

      <Panel title="Appearance & motion">
        <div className="px-4 py-2">
          <RadioCards
            legend="Theme"
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System', description: 'Follow your OS setting' },
            ]}
          />
          <Switch
            label="Reduced motion"
            description="Minimize animations and transitions regardless of your OS setting."
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => update({ reducedMotion })}
          />
        </div>
      </Panel>

      <Panel title="Scanning">
        <div className="px-4 py-2">
          <SelectInput
            label="Maximum prompt length"
            value={String(settings.maxInputLength)}
            onChange={(v) => update({ maxInputLength: Number(v) })}
            options={MAX_INPUT_LENGTH_CHOICES.map((n) => ({
              value: String(n),
              label: `${n.toLocaleString()} characters`,
            }))}
            hint="Text beyond this limit is not scanned. Larger limits use more memory and take longer; the boundary is always shown in the editor."
          />
          <SelectInput
            label="Region hint for phone & ID formats"
            value={settings.localeHint}
            onChange={(localeHint) => update({ localeHint })}
            options={LOCALE_HINTS.map((l) => ({ value: l.value, label: l.label }))}
            hint="Biases phone-number and government-ID heuristics toward formats common in your region. Detection still considers international formats."
          />
        </div>
      </Panel>

      <Panel title="Data controls">
        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-muted">
            Two separate controls, matching what they actually remove:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setConfirmClearSession(true)}
            >
              Clear current prompt & session
            </Button>
            <Button
              variant="secondary"
              icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
              onClick={() => setConfirmReset(true)}
            >
              Clear local settings
            </Button>
          </div>
          <p className="text-2xs leading-snug text-ink-faint">
            “Clear current prompt & session” removes in-memory text and scan results from this tab.
            “Clear local settings” removes saved preferences (theme, limits, region hint) from this
            browser’s local storage. Neither step ever involves a server.
          </p>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmClearSession}
        title="Clear the current prompt and session?"
        body="In-memory prompt text and any scan state will be dropped from this tab. This cannot be undone, but nothing was ever stored or transmitted."
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
        body="Saved preferences (theme, reduced motion, prompt-length limit, region hint) will be reset to defaults. No prompt content is stored, so there is nothing else to remove."
        confirmLabel="Reset settings"
        danger
        onConfirm={() => {
          resetAll();
          setConfirmReset(false);
          showToast('info', 'Local settings cleared. Defaults restored.');
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <p className="flex items-start gap-2 text-2xs leading-snug text-ink-faint">
        <Gauge aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Detection categories and sensitivity tuning are managed on the Sanitizer workspace and in
        the Rules section once configured.
      </p>
      <p className="flex items-start gap-2 text-2xs leading-snug text-ink-faint">
        <Contrast aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Both themes are designed to meet WCAG 2.2 AA contrast targets.
      </p>
      <p className="flex items-start gap-2 text-2xs leading-snug text-ink-faint">
        <Zap aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        PromptShield performs no network requests for prompt processing — see the Privacy page for
        the precise data-flow contract.
      </p>
    </div>
  );
}
