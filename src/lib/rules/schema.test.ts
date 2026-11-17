import { describe, expect, it } from 'vitest';
import { parseRulesJson, buildExport, validateRule, newRuleDraft, MAX_RULES } from './schema';
import type { UserRule } from '../detection/types';

const validRule: UserRule = {
  id: 'r1',
  name: 'Project Saffron',
  description: 'Internal codename',
  enabled: true,
  category: 'custom',
  severity: 'high',
  confidence: 'high',
  matchType: 'literal',
  pattern: 'Project Saffron',
  flags: 'u',
  replacement: '[PROJECT_1]',
  contextKeywords: ['confidential'],
  tests: [{ text: 'Kickoff for Project Saffron Monday.', shouldMatch: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('validateRule', () => {
  it('accepts a valid rule and normalizes fields', () => {
    const { rule, error } = validateRule(validRule);
    expect(error).toBeUndefined();
    expect(rule?.name).toBe('Project Saffron');
    expect(rule?.severity).toBe('high');
  });

  it('rejects rules without a name or pattern', () => {
    expect(validateRule({ ...validRule, name: '' }).error).toBeDefined();
    expect(validateRule({ ...validRule, pattern: '' }).error).toBeDefined();
  });

  it('rejects invalid regex patterns (ReDoS guard)', () => {
    expect(
      validateRule({ ...validRule, matchType: 'regex', pattern: '(a+)+b' }).error,
    ).toBeDefined();
    expect(validateRule({ ...validRule, matchType: 'regex', pattern: 'a(' }).error).toBeDefined();
  });

  it('sanitizes unsupported flags and unknown categories', () => {
    const { rule } = validateRule({ ...validRule, flags: 'igXU9', category: 'bogus' });
    expect(rule?.flags).toBe('i');
    expect(rule?.category).toBe('custom');
  });

  it('caps tests and keyword lists', () => {
    const tests = Array.from({ length: 25 }, (_, i) => ({ text: `case ${i}`, shouldMatch: true }));
    const { rule } = validateRule({ ...validRule, tests, contextKeywords: Array(20).fill('x') });
    expect(rule?.tests.length).toBe(10);
    expect(rule?.contextKeywords.length).toBe(6);
  });
});

describe('parseRulesJson', () => {
  it('round-trips through buildExport', () => {
    const json = buildExport([validRule]);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.kind).toBe('promptshield-rules');
    expect(parsed.version).toBe(1);
    const { rules, errors } = parseRulesJson(json);
    expect(errors).toHaveLength(0);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe('Project Saffron');
    expect(rules[0]?.tests[0]?.text).toContain('Project Saffron');
  });

  it('rejects non-JSON and JSON without rules', () => {
    expect(parseRulesJson('not json').errors.length).toBeGreaterThan(0);
    expect(parseRulesJson('{"foo": 1}').errors.length).toBeGreaterThan(0);
    expect(parseRulesJson('[]').rules).toHaveLength(0); // bare array tolerated, zero rules
  });

  it('caps the number of imported rules and reports overflow', () => {
    const many = Array.from({ length: MAX_RULES + 5 }, (_, i) => ({
      ...validRule,
      id: `r${i}`,
      name: `Rule ${i}`,
    }));
    const { rules, errors } = parseRulesJson(buildExport(many));
    expect(rules).toHaveLength(MAX_RULES);
    expect(errors.some((e) => e.includes('only the first'))).toBe(true);
  });

  it('reports per-rule validation errors without aborting the rest', () => {
    const json = buildExport([validRule, { ...validRule, id: 'bad', name: '', pattern: '' }]);
    const { rules, errors } = parseRulesJson(json);
    expect(rules).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

describe('newRuleDraft', () => {
  it('creates a unique id and empty test scaffold', () => {
    const a = newRuleDraft();
    const b = newRuleDraft();
    expect(a.id).not.toBe(b.id);
    expect(a.tests).toHaveLength(1);
    expect(a.matchType).toBe('literal');
  });
});
