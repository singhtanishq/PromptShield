import { useEffect, useRef } from 'react';
import { ScanSearch, ShieldQuestion, XCircle } from 'lucide-react';
import { Button, SelectInput, Switch } from '../../components/ui';
import { useSession } from './session';
import { useSettings } from '../../app/settings';
import { useRules } from '../rules/RulesProvider';
import { PRESETS } from '../../lib/rules/presets';
import type { ScanOptions } from '../../lib/detection/types';

export type Sensitivity = ScanOptions['sensitivity'];

const SENSITIVITY_HELP: Record<Sensitivity, string> = {
  low: 'Only high-confidence detections. Fewer false positives, more misses.',
  medium: 'Balanced: high and medium-confidence detections. Recommended.',
  high: 'Include low-confidence heuristics. More coverage, more false positives.',
};

/**
 * Scan toolbar: explicit scan action with loading/cancel/error states, preset
 * selection (categories + sensitivity), and the encoded-payload opt-in.
 */
export function ScanControls({
  decodeEncoded,
  onDecodeEncodedChange,
}: {
  decodeEncoded: boolean;
  onDecodeEncodedChange: (next: boolean) => void;
}) {
  const { text, scan, startScan, cancelScan, allowlist } = useSession();
  const { settings, update } = useSettings();
  const { rules } = useRules();

  const overLimit = text.length > settings.maxInputLength;
  const empty = text.length === 0;
  const disabled = empty || overLimit;
  const scanning = scan.status === 'scanning';
  const progressPercent =
    scan.progress !== null && scan.progress.total > 0
      ? Math.round((scan.progress.completed / scan.progress.total) * 100)
      : null;

  // Keyboard: Ctrl/Cmd+Enter runs a scan from anywhere in the workspace.
  const scanNowRef = useRef<() => void>(() => {});
  scanNowRef.current = () => {
    if (disabled || scanning) return;
    void startScan({
      sensitivity: settings.sensitivity,
      decodeEncodedContent: decodeEncoded,
      localeHint: settings.localeHint,
      maxInputLength: settings.maxInputLength,
      categories: Object.fromEntries(
        Object.entries(settings.categories).map(([k, enabled]) => [k, { enabled }]),
      ) as ScanOptions['categories'],
      customRules: rules.filter((r) => r.enabled),
      allowlist: allowlist.map((a) => a.value),
    });
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        scanNowRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-panel">
      <div className="flex flex-wrap items-center gap-3">
        {scanning ? (
          <Button
            variant="secondary"
            onClick={cancelScan}
            icon={<XCircle aria-hidden="true" className="h-4 w-4" />}
          >
            Cancel scan
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => scanNowRef.current()}
            disabled={disabled}
            title="Scan the prompt (Ctrl/Cmd+Enter)"
            icon={<ScanSearch aria-hidden="true" className="h-4 w-4" />}
          >
            Scan prompt
          </Button>
        )}

        <div className="w-56">
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
          />
        </div>

        <div className="w-44">
          <SelectInput
            label="Sensitivity"
            value={settings.sensitivity}
            onChange={(v) => update({ sensitivity: v as Sensitivity, presetId: 'custom' })}
            options={[
              { value: 'low', label: 'Low — fewer flags' },
              { value: 'medium', label: 'Medium — balanced' },
              { value: 'high', label: 'High — most coverage' },
            ]}
          />
        </div>

        <div className="min-w-56 flex-1">
          <Switch
            label="Inspect encoded payloads"
            description="Decode Base64/hex/URL-encoded runs for review (opt-in, bounded, never executed)."
            checked={decodeEncoded}
            onChange={onDecodeEncodedChange}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs text-ink-faint">{SENSITIVITY_HELP[settings.sensitivity]}</p>
        {scanning && progressPercent !== null && (
          <p className="text-2xs text-ink-muted" role="status">
            Scanning… {progressPercent}% (stage {scan.progress?.completed}/{scan.progress?.total})
          </p>
        )}
        {scan.status === 'error' && scan.error !== null && (
          <p role="alert" className="flex items-center gap-1.5 text-2xs text-danger">
            <ShieldQuestion aria-hidden="true" className="h-3.5 w-3.5" />
            {scan.error}
          </p>
        )}
        {scan.status === 'cancelled' && (
          <p className="text-2xs text-ink-faint" role="status">
            Scan cancelled. Nothing was changed or sent.
          </p>
        )}
        {scan.status === 'done' && (
          <p className="text-2xs text-ink-faint" role="status">
            Scan complete — results below are suggestions only.
          </p>
        )}
      </div>
    </div>
  );
}
