import type { Detection, ScanOptions, ScanResult, Severity, DetectorCategory } from './types';
import { DETECTOR_CATEGORIES } from './types';
import { resolveOverlaps } from './spans';
import type { ScanContext } from './context';
import { DEFAULT_TIME_BUDGET_MS } from './context';
import { getDetectors } from './registry';

export { DEFAULT_TIME_BUDGET_MS };

export type ScanStage = 'detect' | 'resolve' | 'done';

export interface EngineHooks {
  /** Called between detectors with the stage just reached. */
  onProgress?: (stage: ScanStage, completed: number, total: number) => void;
  /** Cooperative cancellation check, polled between detectors. */
  isCancelled?: () => boolean;
}

/**
 * Run the detection pipeline over the given text. This function is pure with
 * respect to the UI — it never reads state beyond its arguments and never
 * performs I/O or network access. The matched raw values exist only inside
 * detector closures; findings carry masked previews and offsets only.
 */
export function runScan(
  text: string,
  options: ScanOptions,
  hooks: EngineHooks = {},
  scanId: string,
): ScanResult {
  const startedAt = performance.now();
  const maxLen = options.maxInputLength;
  const truncated = text.length > maxLen;
  const scanText = truncated ? text.slice(0, maxLen) : text;

  // Empty allowlist lookups should be cheap; normalize once.
  const allowlist = options.allowlist.map((v) => v.toLowerCase());

  const detectors = getDetectors().filter((d) => options.categories[d.category]?.enabled === true);

  const candidates: Detection[] = [];
  let skippedDetectors: string[] = [];
  let completed = 0;
  const deadline = startedAt + DEFAULT_TIME_BUDGET_MS;

  for (const detector of detectors) {
    if (hooks.isCancelled?.() === true) {
      skippedDetectors = detectors.slice(completed).map((d) => d.id);
      break;
    }
    hooks.onProgress?.('detect', completed, detectors.length);
    const ctx: ScanContext = {
      text: scanText,
      options,
      sensitivity: options.sensitivity,
      localeHint: options.localeHint,
      deadline,
      cancelled: false,
    };
    try {
      const found = detector.run(ctx);
      for (const detection of found) {
        // Allowlisted exact values (case-insensitive) are excluded here — the
        // UI still reports how many allowlist entries matched via the caller.
        const value = scanText.slice(detection.range.start, detection.range.end);
        if (allowlist.includes(value.toLowerCase())) continue;
        candidates.push(detection);
      }
    } catch {
      // A detector failure never aborts the scan; other detectors still run.
      skippedDetectors.push(detector.id);
    }
    completed++;
    if (performance.now() > deadline) {
      skippedDetectors = skippedDetectors.concat(detectors.slice(completed).map((d) => d.id));
      break;
    }
  }

  hooks.onProgress?.('resolve', completed, detectors.length);
  const { primary, subFindings } = resolveOverlaps(candidates);

  // Stable scan-scoped IDs: derived from position, never from the value.
  // Assigned before building the sub-findings record so parents are keyed by
  // their final stable id.
  primary.forEach((detection, index) => {
    detection.id = `${scanId}-${index + 1}`;
  });

  const bySeverity = countBySeverity(primary);
  const byCategory = countByCategory(primary);

  const subFindingsRecord: Record<string, ScanResult['subFindings'][string]> = {};
  for (const [parent, subs] of subFindings) {
    subFindingsRecord[parent.id] = subs.map((sub) => ({
      detectorId: sub.detectorId,
      subtype: sub.subtype,
      preview: sub.preview,
      explanation: sub.explanation,
    }));
  }

  hooks.onProgress?.('done', detectors.length, detectors.length);

  return {
    scanId,
    detections: primary,
    subFindings: subFindingsRecord,
    stats: {
      total: primary.length,
      bySeverity,
      byCategory,
      durationMs: Math.round(performance.now() - startedAt),
      truncated,
      skippedDetectors,
    },
  };
}

const SEVERITY_KEYS: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];

function countBySeverity(items: Detection[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_KEYS.map((k) => [k, 0])) as Record<Severity, number>;
  for (const d of items) counts[d.severity] += 1;
  return counts;
}

function countByCategory(items: Detection[]): Record<DetectorCategory, number> {
  const counts = Object.fromEntries(DETECTOR_CATEGORIES.map((k) => [k, 0])) as Record<
    DetectorCategory,
    number
  >;
  for (const d of items) counts[d.category] += 1;
  return counts;
}
