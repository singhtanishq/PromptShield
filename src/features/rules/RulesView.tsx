import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Copy, Download, FileUp, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import type { UserRule, DetectorCategory, Severity, Confidence } from '../../lib/detection/types';
import { CATEGORY_LABELS, DETECTOR_CATEGORIES } from '../../lib/detection/types';
import {
  validateRulePattern,
  ALLOWED_RULE_FLAGS,
} from '../../lib/detection/detectors/custom-rules';
import { SeverityBadge } from '../../components/badges';
import { Button, EmptyState, IconButton, Panel, SelectInput, Switch } from '../../components/ui';
import { ConfirmDialog, Dialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import { useRules } from './RulesProvider';
import { useSession } from '../sanitizer/session';
import { ACCEPTED_IMPORT_TYPES } from '../../lib/files';

/**
 * Custom rules workspace: create, edit, test, duplicate, enable/disable,
 * delete, export, and import user-defined recognizers. Regex execution for
 * test cases happens in the scan worker; the main thread only runs the static
 * pattern validator. Built-in detectors are read-only and listed separately.
 */
export function RulesView() {
  const {
    rules,
    createRule,
    updateRule,
    deleteRule,
    duplicateRule,
    toggleRule,
    importPreview,
    applyImport,
    exportJson,
    draft,
  } = useRules();
  const { validateRules } = useSession();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<UserRule | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<UserRule | null>(null);
  const [importState, setImportState] = useState<{
    open: boolean;
    json: string;
    rules: UserRule[];
    errors: string[];
  }>({ open: false, json: '', rules: [], errors: [] });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openEditor = (rule: UserRule): void => {
    setEditing(structuredClone(rule));
    setValidationError(null);
  };

  const onRuleFieldChange = (patch: Partial<UserRule>): void => {
    setEditing((prev) =>
      prev === null ? prev : { ...prev, ...patch, updatedAt: new Date().toISOString() },
    );
  };

  const saveRule = async (): Promise<void> => {
    if (editing === null) return;
    if (editing.name.trim().length === 0) {
      setValidationError('Give the rule a name.');
      return;
    }
    const patternCheck = validateRulePattern(editing);
    if (!patternCheck.ok) {
      setValidationError(patternCheck.error ?? 'Invalid pattern.');
      return;
    }
    const meaningfulTests = editing.tests.filter((t) => t.text.trim().length > 0);
    if (meaningfulTests.length > 0) {
      setValidating(true);
      try {
        const results = await validateRules([{ ...editing, tests: meaningfulTests }]);
        const failures = meaningfulTests.filter((test, i) => {
          const outcome = results.find((r) => r.ruleId === editing.id && r.testIndex === i);
          return outcome === undefined || outcome.matched !== test.shouldMatch;
        });
        if (failures.length > 0) {
          setValidationError(
            `${failures.length} test case${failures.length === 1 ? '' : 's'} did not behave as expected. Fix the pattern or the test expectations before saving.`,
          );
          return;
        }
      } finally {
        setValidating(false);
      }
    }
    if (rules.some((r) => r.id === editing.id)) updateRule(editing);
    else createRule(editing);
    setEditing(null);
    showToast('success', `Rule “${editing.name}” saved locally.`);
  };

  const onImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    void file.text().then((text) => {
      const { rules: imported, errors } = importPreview(text);
      if (imported.length === 0 && errors.length > 0) {
        showToast('error', `Import failed: ${errors[0]}`);
        return;
      }
      setImportState({ open: true, json: text, rules: imported, errors });
    });
  };

  const confirmImport = (): void => {
    const { added, skipped } = applyImport(importState.rules);
    setImportState({ open: false, json: '', rules: [], errors: [] });
    showToast(
      'info',
      `Imported ${added} rule${added === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} (duplicates or invalid)` : ''}. Nothing but rule definitions was read.`,
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Custom rules</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Teach PromptShield about names, projects, and identifiers specific to your work. Rules
            run locally in the scan worker, are stored only in this browser, and export/import as
            JSON rule definitions — never prompt content.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            icon={<FileUp aria-hidden="true" className="h-4 w-4" />}
          >
            Import
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const json = exportJson();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'promptshield-rules.json';
              anchor.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              showToast('success', 'Rules exported as JSON definitions (no prompt data).');
            }}
            icon={<Download aria-hidden="true" className="h-4 w-4" />}
          >
            Export
          </Button>
          <Button
            variant="primary"
            onClick={() => openEditor(draft())}
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          >
            New rule
          </Button>
        </div>
      </div>

      <Panel title="Your rules" subtitle="Custom recognizers supplement the built-in detectors.">
        {rules.length === 0 ? (
          <EmptyState
            icon={<Scale aria-hidden="true" />}
            title="No custom rules yet"
            description="Create a rule to match organization-specific patterns — for example project codenames or customer identifiers — with your own severity and replacement placeholder."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-ink">{rule.name}</span>
                    <SeverityBadge severity={rule.severity} />
                    <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs text-ink-muted">
                      {CATEGORY_LABELS[rule.category]}
                    </span>
                    <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-2xs text-ink-faint">
                      {rule.matchType === 'regex'
                        ? `/${rule.pattern.slice(0, 24)}${rule.pattern.length > 24 ? '…' : ''}/${rule.flags}`
                        : `“${rule.pattern.slice(0, 24)}${rule.pattern.length > 24 ? '…' : ''}”`}
                    </span>
                  </div>
                  {rule.description.length > 0 && (
                    <p className="mt-0.5 text-2xs text-ink-faint">{rule.description}</p>
                  )}
                </div>
                <Switch
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                  label={`Enable ${rule.name}`}
                />
                <div className="flex items-center gap-1">
                  <IconButton label={`Edit ${rule.name}`} onClick={() => openEditor(rule)}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Duplicate ${rule.name}`}
                    onClick={() => duplicateRule(rule.id)}
                  >
                    <Copy aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${rule.name}`}
                    onClick={() => setDeleteCandidate(rule)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Built-in detectors"
        subtitle="Read-only, maintained with the app. Disable whole categories in Settings."
      >
        <p className="px-4 py-3 text-sm leading-relaxed text-ink-muted">
          The built-in registry covers emails, phones, IPs and URLs, payment cards, IBANs, bank
          accounts, government-ID formats, provider token shapes, labeled credentials, private keys,
          database URLs, personal-data heuristics, internal/confidential content, and the
          prompt-risk review indicators. See the detection catalog in the About page for each
          detector's confidence model and caveats.
        </p>
      </Panel>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_TYPES + ',application/json,.json'}
        onChange={onImportFile}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <ConfirmDialog
        open={deleteCandidate !== null}
        title={`Delete rule “${deleteCandidate?.name ?? ''}”?`}
        body="The rule is removed from this browser's local storage. Existing scan results are not affected."
        confirmLabel="Delete rule"
        danger
        onConfirm={() => {
          if (deleteCandidate !== null) deleteRule(deleteCandidate.id);
          setDeleteCandidate(null);
          showToast('info', 'Rule deleted.');
        }}
        onCancel={() => setDeleteCandidate(null)}
      />

      <Dialog
        open={importState.open}
        title="Import rules?"
        description="Preview before applying — only rule definitions are read from the file."
        onClose={() => setImportState({ open: false, json: '', rules: [], errors: [] })}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setImportState({ open: false, json: '', rules: [], errors: [] })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={confirmImport}
              disabled={importState.rules.length === 0}
            >
              Import {importState.rules.length} rule{importState.rules.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-sm">
          {importState.errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-2xs text-warning">
              {importState.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <p className="text-ink-muted">
            The following rules will be added (existing rules with the same id are skipped):
          </p>
          <ul className="flex flex-col gap-1">
            {importState.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-2xs">
                <span className="font-medium text-ink">{r.name}</span>
                <span className="text-ink-faint">{CATEGORY_LABELS[r.category]}</span>
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-ink-faint">
                  {r.matchType === 'regex'
                    ? `/${r.pattern.slice(0, 30)}`
                    : `“${r.pattern.slice(0, 30)}”`}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>

      {editing !== null && (
        <RuleEditorDialog
          rule={editing}
          isNew={!rules.some((r) => r.id === editing.id)}
          onChange={onRuleFieldChange}
          onClose={() => setEditing(null)}
          onSave={() => void saveRule()}
          error={validationError}
          validating={validating}
        />
      )}
    </div>
  );
}

function RuleEditorDialog({
  rule,
  isNew,
  onChange,
  onClose,
  onSave,
  error,
  validating,
}: {
  rule: UserRule;
  isNew: boolean;
  onChange: (patch: Partial<UserRule>) => void;
  onClose: () => void;
  onSave: () => void;
  error: string | null;
  validating: boolean;
}) {
  const inputClass =
    'h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-accent';
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'New custom rule' : `Edit rule: ${rule.name}`}
      description="Patterns run in the scan worker with length caps and a time budget. Test cases must pass before saving."
      size="lg"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={validating}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error !== null && (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-2xs text-danger"
          >
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-name" className="mb-1 block text-2xs font-medium text-ink-faint">
              Name
            </label>
            <input
              id="rule-name"
              value={rule.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className={inputClass}
              placeholder="Project codename"
            />
          </div>
          <div>
            <label
              htmlFor="rule-replacement"
              className="mb-1 block text-2xs font-medium text-ink-faint"
            >
              Replacement placeholder
            </label>
            <input
              id="rule-replacement"
              value={rule.replacement}
              onChange={(e) => onChange({ replacement: e.target.value })}
              className={`${inputClass} font-mono`}
              placeholder="[PROJECT_1]"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="rule-description"
            className="mb-1 block text-2xs font-medium text-ink-faint"
          >
            Description (optional)
          </label>
          <input
            id="rule-description"
            value={rule.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className={inputClass}
            placeholder="What this pattern matches and why it is sensitive"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Category"
            value={rule.category}
            onChange={(v) => onChange({ category: v as DetectorCategory })}
            options={DETECTOR_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          />
          <SelectInput
            label="Severity"
            value={rule.severity}
            onChange={(v) => onChange({ severity: v as Severity })}
            options={['critical', 'high', 'medium', 'low', 'informational'].map((s) => ({
              value: s,
              label: s,
            }))}
          />
          <SelectInput
            label="Confidence"
            value={rule.confidence}
            onChange={(v) => onChange({ confidence: v as Confidence })}
            options={['high', 'medium', 'low'].map((c) => ({ value: c, label: c }))}
          />
          <SelectInput
            label="Match type"
            value={rule.matchType}
            onChange={(v) => onChange({ matchType: v as UserRule['matchType'] })}
            options={[
              { value: 'literal', label: 'Literal text' },
              { value: 'regex', label: 'Regular expression' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="rule-pattern" className="mb-1 block text-2xs font-medium text-ink-faint">
            {rule.matchType === 'regex'
              ? 'Pattern (regex, max 200 chars)'
              : 'Literal text to match'}
          </label>
          <input
            id="rule-pattern"
            value={rule.pattern}
            onChange={(e) => onChange({ pattern: e.target.value })}
            className={`${inputClass} font-mono`}
            placeholder={rule.matchType === 'regex' ? 'PROJ-[0-9]{3,6}' : 'Project Saffron'}
          />
          {rule.matchType === 'regex' && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-2xs font-medium text-ink-faint">Flags:</span>
              {ALLOWED_RULE_FLAGS.split('').map((flag) => (
                <label
                  key={flag}
                  className="inline-flex items-center gap-1 text-2xs text-ink-muted"
                >
                  <input
                    type="checkbox"
                    checked={rule.flags.includes(flag)}
                    onChange={(e) => {
                      const flags = e.target.checked
                        ? rule.flags + flag
                        : rule.flags.replace(flag, '');
                      onChange({ flags });
                    }}
                    className="h-3.5 w-3.5 rounded border-line-strong"
                  />
                  <code>{flag}</code>
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="rule-keywords" className="mb-1 block text-2xs font-medium text-ink-faint">
            Context keywords (comma-separated, all must appear nearby)
          </label>
          <input
            id="rule-keywords"
            value={rule.contextKeywords.join(', ')}
            onChange={(e) =>
              onChange({
                contextKeywords: e.target.value
                  .split(',')
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0),
              })
            }
            className={inputClass}
            placeholder="confidential, project"
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-2xs font-medium text-ink-faint">
            Test cases (synthetic examples — must behave as expected to save)
          </legend>
          <div className="flex flex-col gap-2">
            {rule.tests.map((test, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={test.text}
                  onChange={(e) => {
                    const tests = [...rule.tests];
                    tests[i] = { ...test, text: e.target.value };
                    onChange({ tests });
                  }}
                  className={`${inputClass} font-mono text-2xs`}
                  placeholder="Example text containing Project Saffron"
                  aria-label={`Test case ${i + 1} text`}
                />
                <label className="inline-flex shrink-0 items-center gap-1.5 text-2xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={test.shouldMatch}
                    onChange={(e) => {
                      const tests = [...rule.tests];
                      tests[i] = { ...test, shouldMatch: e.target.checked };
                      onChange({ tests });
                    }}
                    className="h-3.5 w-3.5 rounded border-line-strong"
                  />
                  should match
                </label>
                <IconButton
                  label={`Remove test case ${i + 1}`}
                  size="sm"
                  onClick={() => onChange({ tests: rule.tests.filter((_, j) => j !== i) })}
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() =>
              onChange({ tests: [...rule.tests, { text: '', shouldMatch: true }].slice(0, 10) })
            }
            icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />}
            disabled={rule.tests.length >= 10}
          >
            Add test case
          </Button>
        </fieldset>
      </div>
    </Dialog>
  );
}
