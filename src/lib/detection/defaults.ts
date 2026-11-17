import type { ScanOptions } from './types';
import { DEFAULT_CATEGORY_CONFIG } from './types';

/** Baseline scan options — used by the app on first run and by tests. */
export function defaultScanOptions(): ScanOptions {
  return {
    categories: structuredClone(DEFAULT_CATEGORY_CONFIG),
    sensitivity: 'medium',
    localeHint: 'US',
    customRules: [],
    maxInputLength: 50_000,
    decodeEncodedContent: false,
    allowlist: [],
  };
}
