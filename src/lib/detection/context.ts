import type { ScanOptions, Severity, Confidence, Detection, DetectorCategory } from './types';
import { buildPreview } from './masking';
import type { MaskKind } from './masking';
import { valueAt } from './spans';
import type { TextRange } from './types';

/** Total engine time budget per scan (milliseconds). */
export const DEFAULT_TIME_BUDGET_MS = 6000;

/**
 * Execution context handed to detectors. Raw matched values may be read from
 * `text` inside the detector for validation, but must never leave the engine
 * except as validated structural facts (checksums, lengths, entropy).
 */
export interface ScanContext {
  text: string;
  options: ScanOptions;
  sensitivity: ScanOptions['sensitivity'];
  localeHint: string;
  /** performance.now() deadline for the whole scan. */
  deadline: number;
  cancelled: boolean;
}

export interface Detector {
  id: string;
  version: string;
  category: DetectorCategory;
  /** UI-facing name. */
  label: string;
  run: (ctx: ScanContext) => Detection[];
}

/** Sensitivity gate: at 'low', medium/low-confidence heuristics stay quiet. */
export function sensitivityAllows(
  sensitivity: ScanContext['sensitivity'],
  minConfidence: Confidence,
): boolean {
  if (sensitivity === 'high') return true;
  if (sensitivity === 'medium') return minConfidence !== 'low';
  return minConfidence === 'high';
}

/** Helper for detectors to emit a fully-formed detection with a safe preview. */
export function makeDetection(params: {
  detector: Detector;
  subtype: string;
  range: TextRange;
  text: string;
  severity: Severity;
  confidence: Confidence;
  maskKind: MaskKind;
  explanation: string;
  remediation: string;
  evidence?: string;
  groupId?: string;
}): Detection {
  const value = valueAt(params.text, params.range);
  return {
    id: '', // assigned by the engine after overlap resolution
    detectorId: params.detector.id,
    detectorVersion: params.detector.version,
    category: params.detector.category,
    subtype: params.subtype,
    range: params.range,
    severity: params.severity,
    confidence: params.confidence,
    preview: buildPreview(params.maskKind, value),
    explanation: params.explanation,
    remediation: params.remediation,
    evidence: params.evidence,
    groupId: params.groupId,
  };
}

/**
 * Context keyword check: every keyword must appear in the surrounding window
 * (whole paragraph or ±300 chars). Keywords are matched case-insensitively.
 */
export function hasContextKeywords(
  ctx: ScanContext,
  range: TextRange,
  keywords: string[],
  window = 300,
): boolean {
  if (keywords.length === 0) return true;
  const start = Math.max(0, range.start - window);
  const end = Math.min(ctx.text.length, range.end + window);
  const surrounding = ctx.text.slice(start, end).toLowerCase();
  return keywords.every((keyword) => surrounding.includes(keyword.toLowerCase()));
}
