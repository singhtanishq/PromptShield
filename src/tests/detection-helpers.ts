import { getDetectors } from '../lib/detection/registry';
import type { Detection, ScanOptions } from '../lib/detection/types';
import type { ScanContext } from '../lib/detection/context';
import { DEFAULT_TIME_BUDGET_MS } from '../lib/detection/context';
import { defaultScanOptions } from '../lib/detection/defaults';

/** Run one detector directly against text (unit-level, engine not involved). */
export function runDetector(
  detectorId: string,
  text: string,
  overrides: Partial<ScanContext> = {},
): Detection[] {
  const detector = getDetectors().find((d) => d.id === detectorId);
  if (detector === undefined) throw new Error(`Unknown detector: ${detectorId}`);
  return detector.run({
    text,
    options: defaultScanOptions(),
    sensitivity: 'high',
    localeHint: 'US',
    deadline: performance.now() + DEFAULT_TIME_BUDGET_MS,
    cancelled: false,
    ...overrides,
  });
}

/** Run one detector and assert exactly one finding, returning it. */
export function expectSingleDetection(detectorId: string, text: string): Detection {
  const found = runDetector(detectorId, text);
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly 1 finding from ${detectorId}, got ${found.length}: ${JSON.stringify(found.map((d) => d.subtype))}`,
    );
  }
  return found[0] as Detection;
}

export function subtypesOf(detectorId: string, text: string): string[] {
  return runDetector(detectorId, text).map((d) => d.subtype);
}

export function spansOf(detectorId: string, text: string): Array<[number, number]> {
  return runDetector(detectorId, text).map((d) => [d.range.start, d.range.end]);
}

export function withOptions(options: Partial<ScanOptions>): Partial<ScanContext> {
  return { options: { ...defaultScanOptions(), ...options } };
}
