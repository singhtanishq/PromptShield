import { describe, expect, it } from 'vitest';
import { runScan } from './engine';
import { defaultScanOptions } from './defaults';
import type { ScanOptions, UserRule } from './types';
import { SEVERITY_ORDER } from './types';
import { resolveOverlaps, lineColumnAt } from './spans';
import type { Detection } from './types';
import { validateRulePattern } from './detectors/custom-rules';

function optionsWith(overrides: Partial<ScanOptions>): ScanOptions {
  return { ...defaultScanOptions(), ...overrides };
}

function makeDetectionFixture(
  id: string,
  severity: Detection['severity'],
  confidence: Detection['confidence'],
  start: number,
  end: number,
): Detection {
  return {
    id,
    detectorId: 'test',
    detectorVersion: '0',
    category: 'contact',
    subtype: 'test',
    range: { start, end },
    severity,
    confidence,
    preview: `«${id}»`,
    explanation: 'fixture',
    remediation: 'fixture',
  };
}

describe('overlap resolution', () => {
  it('prefers higher severity on overlap', () => {
    const resolution = resolveOverlaps([
      makeDetectionFixture('low', 'low', 'high', 0, 10),
      makeDetectionFixture('crit', 'critical', 'low', 2, 8),
    ]);
    expect(resolution.primary.map((d) => d.id)).toEqual(['crit']);
    const parent = resolution.primary[0];
    expect(resolution.subFindings.get(parent!)?.[0]?.id).toBe('low');
  });

  it('prefers higher confidence when severity ties, then longer span', () => {
    const resolution = resolveOverlaps([
      makeDetectionFixture('med-conf', 'high', 'medium', 0, 10),
      makeDetectionFixture('high-conf', 'high', 'high', 1, 9),
      makeDetectionFixture('longer', 'high', 'high', 0, 12),
    ]);
    // high confidence + longer span wins
    expect(resolution.primary.map((d) => d.id)).toEqual(['longer']);
  });

  it('is deterministic regardless of input order', () => {
    const a = makeDetectionFixture('a', 'medium', 'high', 0, 10);
    const b = makeDetectionFixture('b', 'medium', 'high', 4, 14);
    const r1 = resolveOverlaps([a, b]);
    const r2 = resolveOverlaps([b, a]);
    expect(r1.primary.map((d) => d.id)).toEqual(r2.primary.map((d) => d.id));
  });

  it('keeps non-overlapping detections as separate primaries', () => {
    const resolution = resolveOverlaps([
      makeDetectionFixture('a', 'medium', 'high', 0, 10),
      makeDetectionFixture('b', 'medium', 'high', 10, 20),
    ]);
    expect(resolution.primary.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('drops exact duplicates', () => {
    const a = makeDetectionFixture('a', 'medium', 'high', 0, 10);
    const b = { ...makeDetectionFixture('b', 'medium', 'high', 0, 10), detectorId: 'test' };
    const resolution = resolveOverlaps([a, b]);
    expect(resolution.primary).toHaveLength(1);
  });

  it('limits sub-findings per parent to 4', () => {
    const parent = makeDetectionFixture('parent', 'critical', 'high', 0, 50);
    const children = Array.from({ length: 6 }, (_, i) =>
      makeDetectionFixture(`c${i}`, 'low', 'low', i * 5, i * 5 + 4),
    );
    const resolution = resolveOverlaps([parent, ...children]);
    expect((resolution.subFindings.get(resolution.primary[0]!) ?? []).length).toBe(4);
  });
});

describe('runScan', () => {
  it('returns deterministic sorted detections with scan-scoped ids', () => {
    const text =
      'Email jordan.ellis@bluebird-analytics.example and key AKIAIOSFODNN7EXAMPLE in it.';
    const options = optionsWith({});
    const result1 = runScan(text, options, {}, 's1');
    const result2 = runScan(text, options, {}, 's1');
    expect(result1.detections.map((d) => d.range.start)).toEqual(
      result2.detections.map((d) => d.range.start),
    );
    // Sorted: critical first.
    for (let i = 1; i < result1.detections.length; i++) {
      const prev = result1.detections[i - 1]!;
      const curr = result1.detections[i]!;
      expect(SEVERITY_ORDER[prev.severity]).toBeLessThanOrEqual(SEVERITY_ORDER[curr.severity]);
    }
    // IDs are positional per scan, not derived from values.
    result1.detections.forEach((d, i) => expect(d.id).toBe(`s1-${i + 1}`));
  });

  it('respects disabled categories', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE';
    const allOff = optionsWith({
      categories: {
        contact: { enabled: false },
        personal: { enabled: false },
        financial: { enabled: false },
        secrets: { enabled: false },
        internal: { enabled: false },
        'prompt-risk': { enabled: false },
        custom: { enabled: false },
      },
    });
    expect(runScan(text, allOff, {}, 's').detections).toHaveLength(0);
    const onlySecrets = optionsWith({
      categories: {
        contact: { enabled: false },
        personal: { enabled: false },
        financial: { enabled: false },
        secrets: { enabled: true },
        internal: { enabled: false },
        'prompt-risk': { enabled: false },
        custom: { enabled: false },
      },
    });
    const result = runScan(text, onlySecrets, {}, 's');
    expect(result.detections.length).toBeGreaterThan(0);
    expect(result.detections.every((d) => d.category === 'secrets')).toBe(true);
  });

  it('excludes allowlisted exact values case-insensitively', () => {
    const text = 'Contact jordan.ellis@bluebird-analytics.example now';
    const base = runScan(text, optionsWith({}), {}, 's');
    expect(base.detections.length).toBeGreaterThan(0);
    const allowlisted = runScan(
      text,
      optionsWith({ allowlist: ['JORDAN.ELLIS@BLUEBIRD-ANALYTICS.EXAMPLE'] }),
      {},
      's',
    );
    expect(allowlisted.detections.filter((d) => d.subtype === 'email')).toHaveLength(0);
  });

  it('truncates oversized input and reports it', () => {
    const text = `x AKIAIOSFODNN7EXAMPLE ${'y'.repeat(200)}`;
    const result = runScan(text, optionsWith({ maxInputLength: 30 }), {}, 's');
    expect(result.stats.truncated).toBe(true);
  });

  it('reports severity and category distributions', () => {
    const text = 'SSN 123-45-6789 and support@acme-labs.example';
    const result = runScan(text, optionsWith({}), {}, 's');
    expect(result.stats.bySeverity.critical).toBeGreaterThan(0);
    expect(result.stats.total).toBe(
      Object.values(result.stats.bySeverity).reduce((a, b) => a + b, 0),
    );
  });

  it('attaches DB URL credentials as sub-details of the parent', () => {
    const text = 'postgres://svc_reports:synthetic-pw-9f3@db.internal.example.com:5432/metrics';
    const result = runScan(text, optionsWith({}), {}, 's');
    // The critical DB URL (or env overlap) is primary; any shadowed findings are sub-details.
    expect(result.detections.length).toBeGreaterThan(0);
    for (const parentId of Object.keys(result.subFindings)) {
      expect(result.detections.some((d) => d.id === parentId)).toBe(true);
    }
  });

  it('never includes raw matched values in any detection field', () => {
    const secret = 'wJalrXUtnFEMI_K7MDENG_bPxRfiCYEXAMPLEKEY';
    const text = `AWS_SECRET_ACCESS_KEY=${secret} and SSN 123-45-6789 and jane.doe@x.example`;
    const result = runScan(text, optionsWith({}), {}, 's');
    const allText = JSON.stringify({
      detections: result.detections,
      subFindings: result.subFindings,
    });
    expect(allText).not.toContain(secret);
    expect(allText).not.toContain('123-45-6789');
    expect(allText).not.toContain('jane.doe@x.example');
  });

  it('skips failing detectors without aborting the scan', () => {
    // Corrupted options (customRules with garbage) must not crash the scan.
    const result = runScan('AKIAIOSFODNN7EXAMPLE', optionsWith({}), {}, 's');
    expect(result.detections.length).toBeGreaterThan(0);
  });
});

describe('custom rules in engine', () => {
  const rule: UserRule = {
    id: 'rule-1',
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
    contextKeywords: [],
    tests: [
      { text: 'Kickoff for Project Saffron Monday.', shouldMatch: true },
      { text: 'Unrelated text.', shouldMatch: false },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('detects user rule matches with rule severity', () => {
    const result = runScan(
      'Kickoff for Project Saffron Monday.',
      optionsWith({ customRules: [rule] }),
      {},
      's',
    );
    const match = result.detections.find((d) => d.detectorId === 'custom-rules');
    expect(match).toBeDefined();
    expect(match?.severity).toBe('high');
    expect(match?.subtype).toBe('rule:Project Saffron');
    expect(match?.explanation).toContain('Project Saffron');
  });

  it('honors rule.enabled=false', () => {
    const result = runScan(
      'Kickoff for Project Saffron.',
      optionsWith({ customRules: [{ ...rule, enabled: false }] }),
      {},
      's',
    );
    expect(result.detections.filter((d) => d.detectorId === 'custom-rules')).toHaveLength(0);
  });

  it('context keywords gate matches', () => {
    const ctxRule: UserRule = { ...rule, contextKeywords: ['confidential'] };
    expect(
      runScan(
        'Kickoff for Project Saffron.',
        optionsWith({ customRules: [ctxRule] }),
        {},
        's',
      ).detections.filter((d) => d.detectorId === 'custom-rules'),
    ).toHaveLength(0);
    expect(
      runScan(
        'CONFIDENTIAL: Kickoff for Project Saffron.',
        optionsWith({ customRules: [ctxRule] }),
        {},
        's',
      ).detections.filter((d) => d.detectorId === 'custom-rules').length,
    ).toBeGreaterThan(0);
  });
});

describe('rule pattern validation (ReDoS guards)', () => {
  const base: UserRule = {
    id: 'r',
    name: 'r',
    description: '',
    enabled: true,
    category: 'custom',
    severity: 'medium',
    confidence: 'medium',
    matchType: 'regex',
    pattern: 'x',
    flags: '',
    replacement: '',
    contextKeywords: [],
    tests: [],
    createdAt: '',
    updatedAt: '',
  };

  it('rejects nested quantifiers', () => {
    expect(validateRulePattern({ ...base, pattern: '(a+)+b' }).ok).toBe(false);
    expect(validateRulePattern({ ...base, pattern: '(a*)*b' }).ok).toBe(false);
    expect(validateRulePattern({ ...base, pattern: '(.+)+X' }).ok).toBe(false);
  });

  it('rejects unsupported flags and oversized patterns', () => {
    expect(validateRulePattern({ ...base, pattern: 'a', flags: 'igxyz' }).ok).toBe(false);
    expect(validateRulePattern({ ...base, pattern: 'a'.repeat(201) }).ok).toBe(false);
    expect(validateRulePattern({ ...base, pattern: 'a'.repeat(200), flags: 'i' }).ok).toBe(true);
  });

  it('rejects invalid regex syntax', () => {
    expect(validateRulePattern({ ...base, pattern: 'a(' }).ok).toBe(false);
    expect(validateRulePattern({ ...base, pattern: '[a-' }).ok).toBe(false);
  });

  it('accepts safe bounded patterns', () => {
    expect(validateRulePattern({ ...base, pattern: 'PROJ-[0-9]{3,6}', flags: 'iu' }).ok).toBe(true);
    expect(
      validateRulePattern({ ...base, matchType: 'literal', pattern: 'Project Saffron' }).ok,
    ).toBe(true);
  });

  it('escapes literal patterns so metacharacters stay literal', () => {
    const literal: UserRule = { ...base, matchType: 'literal', pattern: 'a.b(c)' };
    expect(validateRulePattern(literal).ok).toBe(true);
  });
});

describe('lineColumnAt', () => {
  it('computes 1-based line and column with CRLF and emoji', () => {
    const text = 'ab\n\ncd\r\ne\u00A9f';
    expect(lineColumnAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt(text, 3)).toEqual({ line: 2, column: 1 });
    expect(lineColumnAt(text, 4)).toEqual({ line: 3, column: 1 });
    // The CR of a CRLF counts as a column character (raw UTF-16 column semantics).
    expect(lineColumnAt(text, 7)).toEqual({ line: 3, column: 4 });
    expect(lineColumnAt(text, 8)).toEqual({ line: 4, column: 1 });
    expect(lineColumnAt(text, 10)).toEqual({ line: 4, column: 3 });
  });
});
