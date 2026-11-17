import { makeDetection, hasContextKeywords } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection, UserRule } from '../types';

/**
 * User-defined rule execution. Runs ONLY inside the scan worker with:
 * - pattern length cap (200 chars) and flags subset (i, m, s, u);
 * - catastrophic-backtracking pre-check (nested quantifier heuristics);
 * - a per-rule execution time guard enforced by the worker loop;
 * - context keyword requirement checked against the surrounding window.
 * Built-in detectors are read-only; custom rules come from local storage.
 */

export const MAX_RULE_PATTERN_LENGTH = 200;
export const ALLOWED_RULE_FLAGS = 'imsu';

export interface RuleValidationResult {
  ok: boolean;
  error?: string;
}

/** Conservative static validation before a regex is ever executed. */
export function validateRulePattern(
  rule: Pick<UserRule, 'matchType' | 'pattern' | 'flags'>,
): RuleValidationResult {
  if (rule.matchType === 'literal') {
    if (rule.pattern.length === 0)
      return { ok: false, error: 'Literal pattern must not be empty.' };
    if (rule.pattern.length > MAX_RULE_PATTERN_LENGTH)
      return { ok: false, error: `Literal pattern exceeds ${MAX_RULE_PATTERN_LENGTH} characters.` };
    return { ok: true };
  }
  if (rule.pattern.length === 0) return { ok: false, error: 'Regex pattern must not be empty.' };
  if (rule.pattern.length > MAX_RULE_PATTERN_LENGTH) {
    return {
      ok: false,
      error: `Regex exceeds ${MAX_RULE_PATTERN_LENGTH} characters — keep rules focused.`,
    };
  }
  const disallowed = [...rule.flags].filter((f) => !ALLOWED_RULE_FLAGS.includes(f));
  if (disallowed.length > 0) {
    return {
      ok: false,
      error: `Unsupported regex flags: ${disallowed.join(', ')}. Allowed: ${ALLOWED_RULE_FLAGS.split('').join(', ')}.`,
    };
  }
  // Nested-quantifier ReDoS heuristics: (a+)+, (a*)*, (a+)*, (.+)+ etc.
  const nested = /\((?:[^()\\]|\\.)*[+*]\)[+*{]/.test(rule.pattern);
  if (nested) {
    return {
      ok: false,
      error:
        'Pattern contains a nested quantifier like (a+)+ which can hang the scanner. Restructure it (e.g. (?:a+)*) or use a literal match.',
    };
  }
  try {
    new RegExp(rule.pattern, rule.flags);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid regex: ${error instanceof Error ? error.message : 'parse error'}`,
    };
  }
  return { ok: true };
}

/** Compile a user rule to a RegExp, or null when validation fails. */
function compileRule(rule: UserRule): RegExp | null {
  const validation = validateRulePattern(rule);
  if (!validation.ok) return null;
  const flags = rule.matchType === 'literal' ? rule.flags.replace('g', '') : rule.flags;
  const pattern =
    rule.matchType === 'literal'
      ? rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : rule.pattern;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function runUserRule(rule: UserRule, ctx: ScanContext): Detection[] {
  const detections: Detection[] = [];
  const re = compileRule(rule);
  if (re === null) return detections;
  const globalRe = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g');
  for (const match of ctx.text.matchAll(globalRe)) {
    const value = match[0];
    if (value === undefined || value.length === 0) continue;
    const start = match.index ?? 0;
    const range = { start, end: start + value.length };
    if (!hasContextKeywords(ctx, range, rule.contextKeywords)) continue;
    detections.push(
      makeDetection({
        detector: customRulesDetector,
        subtype: `rule:${rule.name}`,
        range,
        text: ctx.text,
        severity: rule.severity,
        confidence: rule.confidence,
        maskKind: 'generic',
        explanation: `Custom rule “${rule.name}”${rule.description ? ` — ${rule.description}` : ''}. Custom rules match your own patterns; review every hit.`,
        remediation: `Apply your preferred redaction; the rule's placeholder is “${rule.replacement}”.`,
        evidence: `user rule`,
      }),
    );
  }
  return detections;
}

export const customRulesDetector: Detector = {
  id: 'custom-rules',
  version: '1.0.0',
  category: 'custom',
  label: 'Custom rules',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];
    for (const rule of ctx.options.customRules) {
      if (!rule.enabled) continue;
      detections.push(...runUserRule(rule, ctx));
    }
    return detections;
  },
};

/** Validate a rule's test cases using synthetic text supplied by the caller. */
export function testUserRule(
  rule: UserRule,
  testInput: string,
): { matched: boolean; error?: string } {
  const validation = validateRulePattern(rule);
  if (!validation.ok) return { matched: false, error: validation.error };
  const re = compileRule(rule);
  if (re === null) return { matched: false, error: 'Rule could not be compiled.' };
  try {
    return { matched: re.test(testInput) };
  } catch (error) {
    return {
      matched: false,
      error: error instanceof Error ? error.message : 'regex execution failed',
    };
  }
}
