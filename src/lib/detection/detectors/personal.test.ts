import { describe, expect, it } from 'vitest';
import { expectSingleDetection, runDetector, subtypesOf } from '../../../tests/detection-helpers';

describe('government id detector', () => {
  it('detects structurally valid SSN with dashes', () => {
    const d = expectSingleDetection('government-id', 'SSN 123-45-6789 on file');
    expect(d.subtype).toBe('us-ssn');
    expect(d.severity).toBe('critical');
    expect(d.preview).not.toContain('123-45-6789');
    expect(d.explanation).toContain('not authenticity');
  });

  it('requires context for bare 9-digit runs', () => {
    expect(runDetector('government-id', 'ticket 123456789')).toHaveLength(0);
  });

  it('rejects structurally invalid SSN areas', () => {
    expect(runDetector('government-id', 'SSN 000-45-6789')).toHaveLength(0);
    expect(runDetector('government-id', 'SSN 900-45-6789')).toHaveLength(0);
    expect(runDetector('government-id', 'SSN 666-45-6789')).toHaveLength(0);
  });

  it('detects UK National Insurance near context', () => {
    const found = runDetector('government-id', 'NI number JL 12 34 56 A');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.subtype).toBe('uk-nino');
    expect(found[0]?.confidence).toBe('medium');
  });

  it('detects India PAN format', () => {
    // Holder-type letter must be a valid class (P/C/H/F/A/T/B/L/J/G). The widely
    // cited ABCDE1234F is deliberately invalid (D is not a holder type), so a
    // structurally valid synthetic PAN is used here.
    const d = expectSingleDetection('government-id', 'PAN ABCPA1234E');
    expect(d.subtype).toBe('in-pan');
    expect(d.severity).toBe('critical');
  });

  it('detects Verhoeff-valid Aadhaar-like numbers', () => {
    // 234567890124 — 12 digits passing the Verhoeff checksum (synthetic).
    const found = runDetector('government-id', 'aadhaar 234567890124');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.subtype).toBe('in-aadhaar');
    expect(found[0]?.evidence).toContain('Verhoeff');
  });

  it('rejects Aadhaar-shaped numbers failing checksum without context', () => {
    expect(runDetector('government-id', 'number 123456789012')).toHaveLength(0);
    // With explicit context, a checksum failure stays visible at low confidence.
    const found = runDetector('government-id', 'aadhaar 234567890125');
    expect(found[0]?.confidence).toBe('low');
  });

  it('never claims authenticity in explanations', () => {
    for (const text of ['SSN 123-45-6789', 'PAN ABCPA1234E']) {
      const found = runDetector('government-id', text);
      for (const d of found) {
        expect(d.explanation.toLowerCase()).toMatch(/heuristic|format|not proof|not authenticity/);
      }
    }
  });
});

describe('personal data detector', () => {
  it('detects honorific names at medium confidence', () => {
    const d = expectSingleDetection('personal-data', 'spoken to Ms Sofia Reyes today');
    expect(d.subtype).toBe('person-name-honorific');
    expect(d.confidence).toBe('medium');
    expect(d.preview).not.toContain('Reyes');
    expect(d.explanation).toContain('Heuristic');
  });

  it('detects labeled names', () => {
    const found = runDetector('personal-data', 'Customer: Sofia Reyes says charged twice');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.subtype).toBe('person-name-labeled');
  });

  it('does not flag capitalized ordinary words', () => {
    expect(runDetector('personal-data', 'The System Requirements Are Clear')).toHaveLength(0);
    expect(runDetector('personal-data', 'Customer Is Always Right')).toHaveLength(0);
  });

  it('detects street addresses', () => {
    const d = expectSingleDetection('personal-data', 'lives at 77 Baker Street, Apt 4C');
    expect(d.subtype).toBe('street-address');
    expect(d.confidence).toBe('medium');
  });

  it('detects labeled DOB', () => {
    const d = expectSingleDetection('personal-data', 'DOB: 1988-04-17');
    expect(d.subtype).toBe('date-of-birth');
    expect(d.severity).toBe('high');
    expect(d.confidence).toBe('high');
  });

  it('detects labeled DOB with born on', () => {
    expect(subtypesOf('personal-data', 'born on 2001-07-09 in Ohio')).toContain('date-of-birth');
  });

  it('detects labeled age in range', () => {
    expect(subtypesOf('personal-data', 'age: 42')).toContain('age');
    expect(runDetector('personal-data', 'age: 999')).toHaveLength(0);
  });

  it('city/state/zip requires address context', () => {
    expect(runDetector('personal-data', 'visit Springfield, IL 62704 for the fair')).toHaveLength(
      0,
    );
    const found = runDetector(
      'personal-data',
      'mailing address: 77 Baker Street, Springfield, IL 62704',
    );
    expect(found.length).toBeGreaterThan(0);
  });
});
