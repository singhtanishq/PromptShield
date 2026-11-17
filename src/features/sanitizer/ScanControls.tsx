import { ScanSearch, ShieldQuestion, XCircle } from 'lucide-react';
import { Button, SelectInput, Switch } from '../../components/ui';
import { useSession } from './session';
import { useSettings } from '../../app/settings';
import type { ScanOptions } from '../../lib/detection/types';

export type Sensitivity = ScanOptions['sensitivity'];

const SENSITIVITY_HELP: Record<Sensitivity, string> = {
  low: 'Only high-confidence detections. Fewer false positives, more misses.',
  medium: 'Balanced: high and medium-confidence detections. Recommended.',
  high: 'Include low-confidence heuristics. More coverage, more false positives.',
};

/**
 * Scan toolbar: explicit scan action with loading/cancel/error states plus the
 * two scan-time toggles (sensitivity, encoded-payload inspection opt-in).
 */
export function ScanControls({
  sensitivity,
  onSensitivityChange,
  decodeEncoded,
  onDecodeEncodedChange,
}: {
  sensitivity: Sensitivity;
  onSensitivityChange: (next: Sensitivity) => void;
  decodeEncoded: boolean;
  onDecodeEncodedChange: (next: boolean) => void;
}) {
  const { text, scan, startScan, cancelScan } = useSession();
  const { settings } = useSettings();

  const overLimit = text.length > settings.maxInputLength;
  const empty = text.length === 0;
  const disabled = empty || overLimit;
  const scanning = scan.status === 'scanning';
  const progressPercent =
    scan.progress !== null && scan.progress.total > 0
      ? Math.round((scan.progress.completed / scan.progress.total) * 100)
      : null;

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
            onClick={() =>
              void startScan({
                sensitivity,
                decodeEncodedContent: decodeEncoded,
                localeHint: settings.localeHint,
                maxInputLength: settings.maxInputLength,
                categories: {
                  contact: { enabled: true },
                  personal: { enabled: true },
                  financial: { enabled: true },
                  secrets: { enabled: true },
                  internal: { enabled: true },
                  'prompt-risk': { enabled: true },
                  custom: { enabled: true },
                },
                customRules: [],
                allowlist: [],
              })
            }
            disabled={disabled}
            icon={<ScanSearch aria-hidden="true" className="h-4 w-4" />}
          >
            Scan prompt
          </Button>
        )}

        <div className="w-44">
          <SelectInput
            label="Sensitivity"
            value={sensitivity}
            onChange={(v) => onSensitivityChange(v as Sensitivity)}
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
        <p className="text-2xs text-ink-faint">{SENSITIVITY_HELP[sensitivity]}</p>
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
