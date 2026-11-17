import { makeDetection, sensitivityAllows } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';
import { ssnStructurallyValid, verhoeffValid } from '../normalizers';

/**
 * Government identifiers as regional rule packs: US SSN, UK National
 * Insurance, India PAN and Aadhaar. Format match is NEVER treated as
 * validation or proof of authenticity — findings say so explicitly.
 * Raw IDs never appear in findings UI; previews are masked.
 */

// 123-45-6789 / 123 45 6789 / 123456789 (with context keywords for bare form)
const SSN_RE = /(?<!\d)(\d{3}[- ]\d{2}[- ]\d{4}|\d{9})(?!\d)/g;
const SSN_KEYWORDS = /\b(ssn|social security|tax|identity)\b/i;

// QQ 12 34 56 C — leading letters exclude certain confusing letters
const UK_NI_RE =
  /(?<![\w])([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])(?![\w])/g;

// ABCDE1234F (5th char = holder-type letter)
const IN_PAN_RE = /(?<![\w])([A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z])(?![\w])/g;

// 4-4-4 digits (spaces or continuous); validated with Verhoeff
const AADHAAR_RE = /(?<!\d)(\d{4}[ ]?\d{4}[ ]?\d{4})(?!\d)/g;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

export const governmentIdDetector: Detector = {
  id: 'government-id',
  version: '1.0.0',
  category: 'personal',
  label: 'Government identifier',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    // US SSN
    for (const match of ctx.text.matchAll(SSN_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const digits = digitsOf(raw);
      const bare = !raw.includes('-') && !raw.includes(' ');
      const start = match.index ?? 0;
      const range = { start, end: start + raw.length };
      const windowStart = Math.max(0, start - 160);
      const surrounding = ctx.text.slice(windowStart, range.end + 160);
      const hasContext = SSN_KEYWORDS.test(surrounding);
      if (bare && !hasContext) continue; // bare 9-digit runs need context
      if (!ssnStructurallyValid(digits)) continue;
      detections.push(
        makeDetection({
          detector: governmentIdDetector,
          subtype: 'us-ssn',
          range,
          text: ctx.text,
          severity: 'critical',
          confidence: hasContext ? 'high' : 'medium',
          maskKind: 'government-id',
          explanation:
            'Matches US Social Security number format with valid area/group/serial structure. Format validity is not authenticity — treat as heuristic.',
          remediation:
            'Remove entirely or replace with [SSN_1]. Full SSNs should not enter AI tools.',
          evidence: 'valid SSN structure (area/group/serial rules)',
        }),
      );
    }

    // UK National Insurance
    for (const match of ctx.text.matchAll(UK_NI_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const start = match.index ?? 0;
      const surrounding = ctx.text.slice(Math.max(0, start - 160), start + raw.length + 160);
      const hasContext = /\b(ni|national insurance|nino|tax)\b/i.test(surrounding);
      if (!hasContext && !sensitivityAllows(ctx.sensitivity, 'low')) continue;
      detections.push(
        makeDetection({
          detector: governmentIdDetector,
          subtype: 'uk-nino',
          range: { start, end: start + raw.length },
          text: ctx.text,
          severity: 'critical',
          confidence: hasContext ? 'medium' : 'low',
          maskKind: 'government-id',
          explanation:
            'Matches UK National Insurance number format (two prefix letters, six digits, one suffix letter). Heuristic format match only.',
          remediation: 'Remove or replace with [NATIONAL_ID_1].',
          evidence: `${raw.replace(/\s/g, '').length} chars, NI format`,
        }),
      );
    }

    // India PAN
    for (const match of ctx.text.matchAll(IN_PAN_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const start = match.index ?? 0;
      const surrounding = ctx.text.slice(Math.max(0, start - 160), start + raw.length + 160);
      const hasContext = /\b(pan|income tax|tax|gstin|identity)\b/i.test(surrounding);
      detections.push(
        makeDetection({
          detector: governmentIdDetector,
          subtype: 'in-pan',
          range: { start, end: start + raw.length },
          text: ctx.text,
          severity: 'critical',
          confidence: hasContext ? 'medium' : 'low',
          maskKind: 'government-id',
          explanation:
            'Matches Indian PAN format (five letters, four digits, one letter; holder-type letter in position 5). Heuristic format match only.',
          remediation: 'Remove or replace with [TAX_ID_1].',
          evidence: '10 chars, PAN format',
        }),
      );
    }

    // India Aadhaar (Verhoeff-validated when possible)
    for (const match of ctx.text.matchAll(AADHAAR_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const digits = digitsOf(raw);
      if (digits.length !== 12) continue;
      if (/^0+$|^1+$/.test(digits)) continue;
      const verhoeff = verhoeffValid(digits);
      const start = match.index ?? 0;
      const surrounding = ctx.text.slice(Math.max(0, start - 160), start + raw.length + 160);
      const hasContext = /\b(aadhaar|aadhar|uidai|uid|identity)\b/i.test(surrounding);
      if (!verhoeff && !hasContext) continue;
      detections.push(
        makeDetection({
          detector: governmentIdDetector,
          subtype: 'in-aadhaar',
          range: { start, end: start + raw.length },
          text: ctx.text,
          severity: 'critical',
          confidence: verhoeff ? (hasContext ? 'high' : 'medium') : 'low',
          maskKind: 'government-id',
          explanation:
            'Matches Aadhaar-like 12-digit format' +
            (verhoeff ? ' and passes the Verhoeff checksum used by Aadhaar numbers. ' : '. ') +
            'Heuristic format match — never proof of authenticity.',
          remediation: 'Remove or replace with [NATIONAL_ID_1].',
          evidence: verhoeff ? 'passes Verhoeff checksum' : 'fails Verhoeff checksum',
        }),
      );
    }

    return detections;
  },
};
