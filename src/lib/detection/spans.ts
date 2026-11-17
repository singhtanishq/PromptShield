import type { Detection, TextRange } from './types';
import { CONFIDENCE_ORDER, SEVERITY_ORDER } from './types';

/**
 * Span utilities. All offsets are UTF-16 code units; `end` is exclusive.
 * Overlap policy is fully deterministic: the same candidate set always
 * resolves to the same primary set and the same sub-findings.
 */

export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function rangeContains(outer: TextRange, inner: TextRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function rangeLength(range: TextRange): number {
  return range.end - range.start;
}

/**
 * Deterministic candidate ordering: highest severity first, then highest
 * confidence, then longer spans, then earlier position.
 */
export function compareDetections(a: Detection, b: Detection): number {
  const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (sev !== 0) return sev;
  const conf = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
  if (conf !== 0) return conf;
  const len = rangeLength(b.range) - rangeLength(a.range);
  if (len !== 0) return len;
  return a.range.start - b.range.start;
}

export interface OverlapResolution {
  /** Non-overlapping primaries, sorted per compareDetections then position. */
  primary: Detection[];
  /** parent detection (object identity) -> sub-findings shadowed by that parent. */
  subFindings: Map<Detection, Detection[]>;
}

/**
 * Resolve overlapping detections: greedily select primaries in deterministic
 * priority order; every candidate overlapping an already-selected primary is
 * attached to the FIRST covering primary as a sub-detail (max 4 kept, the rest
 * are summarized in the UI count). Identical detector+subtype+range duplicates
 * are dropped first.
 */
export function resolveOverlaps(detections: Detection[]): OverlapResolution {
  // Deduplicate exact duplicates (same detector, subtype, and range).
  const seen = new Set<string>();
  const unique: Detection[] = [];
  for (const d of detections) {
    const key = `${d.detectorId}::${d.subtype}::${d.range.start}::${d.range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

  const sorted = [...unique].sort(compareDetections);
  const primary: Detection[] = [];
  const subFindings = new Map<Detection, Detection[]>();

  for (const candidate of sorted) {
    const covering = primary.find((p) => rangesOverlap(p.range, candidate.range));
    if (covering === undefined) {
      primary.push(candidate);
    } else {
      const subs = subFindings.get(covering) ?? [];
      if (subs.length < 4) {
        subs.push(candidate);
        subFindings.set(covering, subs);
      }
    }
  }

  // Final order: severity first, then source position.
  primary.sort((a, b) => compareDetections(a, b) || a.range.start - b.range.start);
  return { primary, subFindings };
}

/** 1-based line/column for a UTF-16 offset (columns count code units). */
export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/** Extract the value at a range (used only inside the engine/worker, never logged). */
export function valueAt(text: string, range: TextRange): string {
  return text.slice(range.start, range.end);
}
