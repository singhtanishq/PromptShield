import type { UserRule, DetectorCategory, Severity, Confidence } from '../detection/types';
import { DETECTOR_CATEGORIES } from '../detection/types';
import { validateRulePattern, MAX_RULE_PATTERN_LENGTH } from '../detection/detectors/custom-rules';

/**
 * User-rule storage schema and import/export validation. Rules live in
 * localStorage under `promptshield.rules.v1` (local-only preference, disclosed
 * in the UI). Exports contain rule definitions and synthetic test cases only —
 * never prompt content, findings, or pseudonymization state.
 */

export const RULES_STORAGE_KEY = 'promptshield.rules.v1';
export const MAX_RULES = 50;
export const MAX_TESTS_PER_RULE = 10;

export interface RulesFile {
  kind: 'promptshield-rules';
  version: 1;
  exportedAt: string;
  rules: UserRule[];
}

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

function asString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Defensively validate one rule object from untrusted JSON. */
export function validateRule(raw: unknown): { rule?: UserRule; error?: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'not an object' };
  const obj = raw as Record<string, unknown>;
  const name = asString(obj.name, '', 80).trim();
  if (name.length === 0) return { error: 'missing name' };
  const matchType =
    obj.matchType === 'literal' ? 'literal' : obj.matchType === 'regex' ? 'regex' : null;
  if (matchType === null) return { error: 'invalid matchType' };
  const pattern = asString(obj.pattern, '', MAX_RULE_PATTERN_LENGTH);
  if (pattern.length === 0) return { error: 'missing pattern' };
  const category = DETECTOR_CATEGORIES.includes(obj.category as DetectorCategory)
    ? (obj.category as DetectorCategory)
    : 'custom';
  const severity = SEVERITIES.includes(obj.severity as Severity)
    ? (obj.severity as Severity)
    : 'medium';
  const confidence = CONFIDENCES.includes(obj.confidence as Confidence)
    ? (obj.confidence as Confidence)
    : 'medium';
  const flags = asString(obj.flags, '', 4)
    .split('')
    .filter((f) => 'imsu'.includes(f))
    .join('');
  const testsRaw = Array.isArray(obj.tests) ? obj.tests.slice(0, MAX_TESTS_PER_RULE) : [];
  const tests = testsRaw
    .map((t) => {
      if (typeof t !== 'object' || t === null) return null;
      const testObj = t as Record<string, unknown>;
      const text = asString(testObj.text, '', 400);
      if (text.length === 0) return null;
      return { text, shouldMatch: asBool(testObj.shouldMatch, true) };
    })
    .filter((t): t is { text: string; shouldMatch: boolean } => t !== null);

  const rule: UserRule = {
    id: asString(obj.id, `rule-${Math.random().toString(36).slice(2, 10)}`, 40),
    name,
    description: asString(obj.description, '', 300),
    enabled: asBool(obj.enabled, true),
    category,
    severity,
    confidence,
    matchType,
    pattern,
    flags,
    replacement: asString(obj.replacement, '', 100),
    contextKeywords: Array.isArray(obj.contextKeywords)
      ? obj.contextKeywords
          .slice(0, 6)
          .map((k) => asString(k, '', 40))
          .filter((k) => k.length > 0)
      : [],
    tests,
    createdAt: asString(obj.createdAt, new Date().toISOString(), 40),
    updatedAt: asString(obj.updatedAt, new Date().toISOString(), 40),
  };

  const patternCheck = validateRulePattern(rule);
  if (!patternCheck.ok) return { error: patternCheck.error };
  return { rule };
}

export function loadRules(): UserRule[] {
  try {
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (raw === null) return [];
    return parseRulesJson(raw).rules;
  } catch {
    return [];
  }
}

export function saveRules(rules: UserRule[]): void {
  try {
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ version: 1, rules }));
  } catch {
    // Storage unavailable — rules stay in memory for this session only.
  }
}

/** Parse and validate a rules JSON payload (storage or imported file). */
export function parseRulesJson(raw: string): { rules: UserRule[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rules: [], errors: ['Not valid JSON.'] };
  }
  const container = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const candidate: unknown = Array.isArray(container.rules)
    ? container.rules
    : Array.isArray(parsed)
      ? parsed
      : null;
  if (!Array.isArray(candidate))
    return { rules: [], errors: ['No rules array found in the file.'] };
  const listRaw: unknown[] = candidate;
  const capped = listRaw.slice(0, MAX_RULES);
  if (listRaw.length > MAX_RULES) {
    errors.push(`File contains ${listRaw.length} rules; only the first ${MAX_RULES} were read.`);
  }
  const rules: UserRule[] = [];
  capped.forEach((entry: unknown, index: number) => {
    const { rule, error } = validateRule(entry);
    if (rule !== undefined) rules.push(rule);
    else errors.push(`Rule ${index + 1}: ${error ?? 'invalid'}`);
  });
  return { rules, errors };
}

export function buildExport(rules: UserRule[]): string {
  const file: RulesFile = {
    kind: 'promptshield-rules',
    version: 1,
    exportedAt: new Date().toISOString(),
    rules,
  };
  return JSON.stringify(file, null, 2);
}

export function newRuleDraft(): UserRule {
  const now = new Date().toISOString();
  return {
    id: `rule-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    name: '',
    description: '',
    enabled: true,
    category: 'custom',
    severity: 'medium',
    confidence: 'medium',
    matchType: 'literal',
    pattern: '',
    flags: 'u',
    replacement: '[REDACTED]',
    contextKeywords: [],
    tests: [{ text: '', shouldMatch: true }],
    createdAt: now,
    updatedAt: now,
  };
}
