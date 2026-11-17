import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Contrast, Download, FileUp, Gauge, RotateCcw, Trash2, Zap } from 'lucide-react';
import { LOCALE_HINTS, MAX_INPUT_LENGTH_CHOICES, useSettings } from '../../app/settings';
import { Button, Panel, RadioCards, SelectInput, Switch } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import { useSession } from '../sanitizer/session';
import { PRESETS } from '../../lib/rules/presets';
import { CATEGORY_LABELS, DETECTOR_CATEGORIES } from '../../lib/detection/types';
import type { DetectorCategory } from '../../lib/detection/types';
import { useRules } from '../rules/RulesProvider';
import { buildSettingsExport, parseSettingsImport } from '../../lib/settings-io';
import { downloadTextFile, ACCEPTED_IMPORT_TYPES } from '../../lib/files';

/**
 * Detection & appearance settings. Only non-sensitive preferences are persisted
 * (theme, motion, input limit, region hint). Prompt content never reaches storage.
 */
export function SettingsView() {
  const { settings, update, resetAll } = useSettings();
  const { showToast } = useToast();
  const { setText } = useSession();
  const { rules, applyImport } = useRules();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearSession, setConfirmClearSession] = useState(false);
  const [importPreview, setImportPreview] = useState<ReturnType<typeof parseSettingsImport> | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      <Panel
        title="Scanning presets & categories"
        subtitle="Presets set categories and sensitivity together; toggles below mark the setup as Custom."
      >
        <div className="px-4 py-2">
          <SelectInput
            label="Preset"
            value={settings.presetId}
            onChange={(v) => {
              const preset = PRESETS.find((p) => p.id === v);
              if (preset !== undefined) {
                update({
                  presetId: preset.id,
                  sensitivity: preset.sensitivity,
                  categories: preset.categories,
                });
              }
            }}
            options={[
              ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
              { value: 'custom', label: 'Custom' },
            ]}
            hint="Presets never modify your text — they only choose which detectors run and how sensitive they are."
          />
          <div className="py-2">
            <p className="mb-1.5 text-sm font-medium text-ink">Detection categories</p>
            <div className="divide-y divide-line rounded-lg border border-line bg-surface-2 px-4">
              {DETECTOR_CATEGORIES.map((category: DetectorCategory) => (
                <Switch
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  description={
                    category === 'prompt-risk'
                      ? 'Injection indicators and hidden characters — a review aid, never auto-redacted.'
                      : undefined
                  }
                  checked={settings.categories[category]}
                  onChange={(enabled) => {
                    update({
                      categories: { ...settings.categories, [category]: enabled },
                      presetId: 'custom',
                    });
                  }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-ink-faint">
              Disabled categories are not scanned at all. Your choices are saved locally and marked
              as the Custom preset.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Scanning limits">
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

      <Panel
        title="Export & import settings"
        subtitle="Preferences and rule definitions only — never prompt content, findings, allowlists, or mappings."
      >
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Download aria-hidden="true" className="h-4 w-4" />}
              onClick={() => {
                const json = buildSettingsExport(settings, rules);
                downloadTextFile('promptshield-settings.json', json, 'application/json');
                showToast('success', 'Settings and rule definitions exported (no prompt data).');
              }}
            >
              Export settings & rules
            </Button>
            <Button
              variant="secondary"
              icon={<FileUp aria-hidden="true" className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Import settings & rules
            </Button>
          </div>
          <p className="text-2xs leading-snug text-ink-faint">
            The export contains your saved preferences and custom rule definitions as versioned
            JSON. Import validates the file first and previews exactly what will change before
            anything is applied.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMPORT_TYPES + ',application/json,.json'}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file === undefined) return;
              void file.text().then((text) => {
                const result = parseSettingsImport(text);
                if (!result.ok) {
                  showToast('error', `Import failed: ${result.error}`);
                  return;
                }
                setImportPreview(result);
              });
            }}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
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
        open={importPreview !== null && importPreview.ok}
        title="Apply imported settings?"
        body={
          importPreview !== null && importPreview.ok ? (
            <>
              <p>
                The file contains valid preferences (theme:{' '}
                <strong>{importPreview.settings.theme}</strong>, max prompt length:{' '}
                <strong>{importPreview.settings.maxInputLength.toLocaleString()}</strong>, region:{' '}
                <strong>{importPreview.settings.localeHint}</strong>, sensitivity:{' '}
                <strong>{importPreview.settings.sensitivity}</strong>) and{' '}
                <strong>{importPreview.rules.length} rule definition(s)</strong>.
              </p>
              {importPreview.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-4">
                  {importPreview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                Current settings with the same names will be overwritten. Rules are merged by id
                (duplicates skipped). No prompt data is included in the file or applied here.
              </p>
            </>
          ) : null
        }
        confirmLabel="Apply import"
        onConfirm={() => {
          if (importPreview !== null && importPreview.ok) {
            update(importPreview.settings);
            const { added, skipped } = applyImport(importPreview.rules);
            showToast(
              'info',
              `Settings applied; ${added} rule(s) imported${skipped > 0 ? `, ${skipped} skipped (duplicates/invalid)` : ''}.`,
            );
          }
          setImportPreview(null);
        }}
        onCancel={() => setImportPreview(null)}
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
