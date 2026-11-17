/**
 * Core detection engine types. UTF-16 code-unit offsets are used throughout,
 * consistently with JavaScript string indexing (`end` is exclusive).
 * See docs/DETECTION-CATALOG.md for the offset convention and detector semantics.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type Confidence = 'high' | 'medium' | 'low';

/** Severity ordering for deterministic sorting (highest first). */
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

/** Confidence ordering for deterministic sorting (highest first). */
export const CONFIDENCE_ORDER: Readonly<Record<Confidence, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

export interface TextRange {
  /** Inclusive start offset in UTF-16 code units. */
  start: number;
  /** Exclusive end offset in UTF-16 code units. */
  end: number;
}

/** Top-level detector categories (map to UI sections and toggles). */
export type DetectorCategory =
  'contact' | 'personal' | 'financial' | 'secrets' | 'internal' | 'prompt-risk' | 'custom';

export const DETECTOR_CATEGORIES: readonly DetectorCategory[] = [
  'contact',
  'personal',
  'financial',
  'secrets',
  'internal',
  'prompt-risk',
  'custom',
];

export const CATEGORY_LABELS: Readonly<Record<DetectorCategory, string>> = {
  contact: 'Contact & PII',
  personal: 'Personal data',
  financial: 'Financial',
  secrets: 'Secrets & credentials',
  internal: 'Internal & confidential',
  'prompt-risk': 'Prompt risk review',
  custom: 'Custom rules',
};

/** A single finding produced by a detector. */
export interface Detection {
  /** Stable within a single scan; never derived from the sensitive value itself. */
  id: string;
  detectorId: string;
  detectorVersion: string;
  category: DetectorCategory;
  /** Detector-specific subtype, e.g. "email", "api-key-aws", "jwt". */
  subtype: string;
  range: TextRange;
  severity: Severity;
  confidence: Confidence;
  /** Safe masked preview — never the full matched value. */
  preview: string;
  /** Human-readable explanation of why this was detected. */
  explanation: string;
  /** Suggested next step for the user. */
  remediation: string;
  /**
   * Optional structural evidence hint (e.g. "passes Luhn checksum", "48 chars, high entropy").
   * Must never repeat the full secret.
   */
  evidence?: string;
  /** Group id when multiple detections are related (e.g. credential pairs). */
  groupId?: string;
}

/**
 * A finding that overlapped a stronger primary finding. Kept as sub-detail so
 * e.g. a database URL's embedded username/password remain visible contextually
 * without producing overlapping edit conflicts. Sub-findings are never applied
 * as separate redactions: their primary covers them.
 */
export interface SubFinding {
  detectorId: string;
  subtype: string;
  preview: string;
  explanation: string;
}

/** Full result of one scan. Detections are sorted deterministically. */
export interface ScanResult {
  scanId: string;
  /** Primary, non-overlapping findings in deterministic order. */
  detections: Detection[];
  /** parentId -> sub-details shadowed by that parent. */
  subFindings: Record<string, SubFinding[]>;
  stats: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<DetectorCategory, number>;
    durationMs: number;
    /** True if input hit the configured size limit and was only partially scanned. */
    truncated: boolean;
    /** Detector ids skipped because the time budget was exhausted. */
    skippedDetectors: string[];
  };
}

/** User-tunable per-category configuration. */
export interface CategoryConfig {
  enabled: boolean;
}

export interface ScanOptions {
  categories: Record<DetectorCategory, CategoryConfig>;
  /** Global sensitivity: low favors fewer false positives, high favors recall. */
  sensitivity: 'low' | 'medium' | 'high';
  /** Regional hint for phone / government-id formats. */
  localeHint: string;
  /** User-defined rules executed only inside the scan worker. */
  customRules: UserRule[];
  /** Hard character limit; input beyond it is not scanned. */
  maxInputLength: number;
  /**
   * Opt-in inspection of encoded payloads (Base64/hex/URL) in prompt-risk review.
   * Decoding only ever produces a bounded preview for human review — never executed.
   */
  decodeEncodedContent: boolean;
  /** Allowlisted literal values (exact match), set explicitly by the user. */
  allowlist: string[];
}

/** A user-created custom rule (built-in detectors are read-only). */
export interface UserRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: DetectorCategory;
  severity: Severity;
  confidence: Confidence;
  matchType: 'regex' | 'literal';
  pattern: string;
  /** Regex flags subset: 'i' | 'm' | 's' | 'u'. */
  flags: string;
  /** Placeholder used when this finding is redacted. */
  replacement: string;
  /** All keywords must appear nearby (same paragraph) for a match to count. */
  contextKeywords: string[];
  /** Author-provided test cases validated when saving the rule. */
  tests: Array<{ text: string; shouldMatch: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CATEGORY_CONFIG: Record<DetectorCategory, CategoryConfig> = {
  contact: { enabled: true },
  personal: { enabled: true },
  financial: { enabled: true },
  secrets: { enabled: true },
  internal: { enabled: true },
  'prompt-risk': { enabled: true },
  custom: { enabled: true },
};

/** Redaction actions the user can choose per finding. */
export type RedactionMode =
  'mask' | 'pseudonymize' | 'custom' | 'remove' | 'partial' | 'context-placeholder';

export interface RedactionDecision {
  findingId: string;
  mode: RedactionMode;
  /** Required for 'custom' and 'context-placeholder'; the user's replacement text. */
  replacement?: string;
}

export interface AppliedEdit {
  findingId: string;
  /** Range in the original text that was replaced. */
  originalRange: TextRange;
  /** Range of the replacement in the sanitized output. */
  outputRange: TextRange;
  replacement: string;
  mode: RedactionMode;
}

export interface SanitizeOutcome {
  text: string;
  edits: AppliedEdit[];
}
