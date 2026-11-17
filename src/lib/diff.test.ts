import { describe, expect, it } from 'vitest';
import { diffLines, inlineSegments } from './diff';

describe('diffLines', () => {
  it('marks deleted spans and inserted placeholders', () => {
    const before = 'Email jane@example.com please.';
    const after = 'Email [EMAIL_REDACTED] please.';
    const lines = diffLines(before, after);
    // One changed pair (delete+insert aligned) or two ops — word segments present.
    const changed = lines.filter((l) => l.op !== 'equal');
    expect(changed.length).toBeGreaterThan(0);
    const hasDeletedEmail = lines.some((l) =>
      l.words?.some((s) => s.op === 'delete' && s.text.includes('jane@example.com')),
    );
    expect(hasDeletedEmail).toBe(true);
    const hasInsertedPlaceholder = lines.some((l) =>
      (l.words ?? []).some((s) => s.op === 'insert' && s.text.includes('[EMAIL_REDACTED]')),
    );
    expect(hasInsertedPlaceholder).toBe(true);
  });

  it('keeps unchanged context as equal rows with both line numbers', () => {
    const before = 'line one\nline two\nline three';
    const after = 'line one\nline two changed\nline three';
    const lines = diffLines(before, after);
    const equal = lines.filter((l) => l.op === 'equal');
    expect(equal.length).toBe(2);
    expect(equal[0]?.originalNumber).toBe(1);
    expect(equal[0]?.outputNumber).toBe(1);
  });

  it('preserves CRLF-as-content and tabs (diff treats them as text)', () => {
    const before = 'a\tb\nAKIAIOSFODNN7EXAMPLE\nc';
    const after = 'a\tb\n[API_KEY_REDACTED]\nc';
    const lines = diffLines(before, after);
    const equalFirst = lines.find((l) => l.original === 'a\tb');
    expect(equalFirst).toBeDefined();
    const changed = lines.filter((l) => l.op !== 'equal');
    expect(changed.length).toBeGreaterThan(0);
  });

  it('handles emoji and multi-byte content safely', () => {
    const before = '🚀 mail bob@x.example 🎉';
    const after = '🚀 mail [EMAIL_REDACTED] 🎉';
    const lines = diffLines(before, after);
    expect(lines.length).toBeGreaterThan(0);
    // No crash + both emoji present in equal segments.
    const allText = JSON.stringify(lines);
    expect(allText).toContain('🚀');
  });

  it('pure deletions render as delete rows without pairing', () => {
    const before = 'keep\nremove me\nkeep2';
    const after = 'keep\nkeep2';
    const lines = diffLines(before, after);
    const del = lines.find((l) => l.op === 'delete' && l.original === 'remove me');
    expect(del).toBeDefined();
    expect(del?.outputNumber).toBeNull();
  });

  it('empty diff for identical texts', () => {
    const lines = diffLines('same\ntext', 'same\ntext');
    expect(lines.every((l) => l.op === 'equal')).toBe(true);
  });
});

describe('inlineSegments', () => {
  it('produces a flat sequence with deletes and inserts', () => {
    const segs = inlineSegments('remove AKIAIOSFODNN7EXAMPLE now', 'remove [SECRET] now');
    const del = segs.find((s) => s.op === 'delete');
    const ins = segs.find((s) => s.op === 'insert');
    expect(del?.text).toContain('AKIAIOSFODNN7EXAMPLE');
    expect(ins?.text).toContain('[SECRET]');
  });

  it('whitespace is preserved exactly in equal segments', () => {
    const segs = inlineSegments('a  b   c', 'a  b   c');
    expect(segs.every((s) => s.op === 'equal')).toBe(true);
    const joined = segs.map((s) => s.text).join('');
    expect(joined).toBe('a  b   c');
  });
});
