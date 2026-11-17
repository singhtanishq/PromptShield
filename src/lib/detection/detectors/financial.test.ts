import { describe, expect, it } from 'vitest';
import { expectSingleDetection, runDetector, subtypesOf } from '../../../tests/detection-helpers';

describe('payment card detector', () => {
  it('accepts Luhn-valid synthetic cards at high confidence', () => {
    const d = expectSingleDetection('payment-card', 'card 4111 1111 1111 1111 charged twice');
    expect(d.subtype).toBe('card-visa');
    expect(d.severity).toBe('critical');
    expect(d.confidence).toBe('high');
    expect(d.evidence).toContain('Luhn');
    expect(d.preview).toMatch(/•••• •••• •••• 1111/);
  });

  it('accepts mastercard test number', () => {
    expect(subtypesOf('payment-card', '5555 5555 5555 4444')).toContain('card-mastercard');
    expect(subtypesOf('payment-card', '5555555555554444')).toContain('card-mastercard');
  });

  it('rejects invalid check digits to low-confidence card-shaped', () => {
    // 4111 1111 1111 1112 fails Luhn
    const d = expectSingleDetection('payment-card', '4111 1111 1111 1112');
    expect(d.confidence).toBe('low');
    expect(d.severity).toBe('medium');
    expect(d.evidence).toContain('fails Luhn');
  });

  it('rejects ordinary digit runs', () => {
    expect(runDetector('payment-card', 'order 1004239112')).toHaveLength(0);
    expect(runDetector('payment-card', 'call 415 555 0132')).toHaveLength(0);
    expect(runDetector('payment-card', 'phone +1 (415) 555-0132 ext. 88')).toHaveLength(0);
  });

  it('handles dashes and continuous digits', () => {
    expect(subtypesOf('payment-card', '4111-1111-1111-1111')).toContain('card-visa');
  });

  it('flags 16 identical digits (Luhn-valid) but not placeholder zeros', () => {
    // 16 zeros: prefix 0000 is not a plausible brand shape.
    expect(runDetector('payment-card', '0000 0000 0000 0000')).toHaveLength(0);
  });

  it('preview never contains the full number', () => {
    const text = '4111 1111 1111 1111';
    const d = expectSingleDetection('payment-card', text);
    expect(d.preview).not.toBe(text);
    expect(d.preview.replace(/[^0-9]/g, '').length).toBeLessThanOrEqual(4);
  });
});

describe('IBAN detector', () => {
  it('accepts the standard IBAN example via mod-97', () => {
    const d = expectSingleDetection('iban', 'account GB82 WEST 1234 5698 7654 32');
    expect(d.subtype).toBe('iban-valid');
    expect(d.confidence).toBe('high');
    expect(d.severity).toBe('high');
  });

  it('marks checksum failures as low confidence', () => {
    const d = expectSingleDetection('iban', 'GB82 WEST 1234 5698 7654 33');
    expect(d.subtype).toBe('iban-format');
    expect(d.confidence).toBe('low');
  });

  it('rejects too-short or non-IBAN shapes', () => {
    expect(runDetector('iban', 'US 12345')).toHaveLength(0);
    expect(runDetector('iban', 'GB82')).toHaveLength(0);
  });
});

describe('bank account detector', () => {
  it('requires banking context nearby', () => {
    expect(runDetector('bank-account', 'random 1234567890123 here')).toHaveLength(0);
    const found = runDetector('bank-account', 'wire to checking account 123456789 tomorrow');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.subtype).toBe('bank-account-candidate');
    expect(found[0]?.confidence).toBe('medium');
  });

  it('flags sort-code shape near context', () => {
    const found = runDetector('bank-account', 'sort code 20-382-4411 unknown');
    expect(found.length).toBeGreaterThan(0);
  });
});
