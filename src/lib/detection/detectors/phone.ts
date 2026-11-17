import { makeDetection, sensitivityAllows } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Phone numbers: international + prefixed forms, common separators, and
 * extensions. The locale hint biases which regional shapes are considered but
 * international formats are always scanned. Bare continuous digit runs (order
 * numbers, ids) are rejected by shape checks and a context requirement, and
 * matches inside longer digit runs are ignored.
 */

interface PhonePattern {
  re: RegExp;
  /** Minimum digit count required. */
  minDigits: number;
  confidence: 'high' | 'medium' | 'low';
  region: string;
}

const EXT_SUFFIX = String.raw`(?:\s*(?:x|ext\.?|extension|phone)\s*[#:.]?\s*\d{1,6})?`;

// North American: +1 optional, (area) 555-0132 etc.
const NANP_RE = new RegExp(
  String.raw`(?<![\w.+-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}${EXT_SUFFIX}(?!\d)`,
  'g',
);

// UK: +44 / 0 trunk-prefixed (area 2-5 digits, then subscriber number)
const UK_RE = new RegExp(
  String.raw`(?<![\w.+-])(?:\+44[\s.-]?|0)(?:\d{2,5}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\d{4}[\s.-]?\d{6})${EXT_SUFFIX}(?!\d)`,
  'g',
);

// India: +91 / 0 + 10 digits
const IN_RE = new RegExp(
  String.raw`(?<![\w.+-])(?:\+91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}${EXT_SUFFIX}(?!\d)`,
  'g',
);

// Generic international: +prefix with grouped digits (3-15 digit total)
const INTL_RE = new RegExp(
  String.raw`(?<![\w.+-])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){1,5}\d{2,9}${EXT_SUFFIX}(?!\d)`,
  'g',
);

const PATTERNS: PhonePattern[] = [
  { re: NANP_RE, minDigits: 10, confidence: 'high', region: 'NANP' },
  { re: UK_RE, minDigits: 10, confidence: 'high', region: 'UK' },
  { re: IN_RE, minDigits: 10, confidence: 'high', region: 'IN' },
  { re: INTL_RE, minDigits: 8, confidence: 'medium', region: 'intl' },
];

/** Locale hint -> pattern priority. Region-specific shapes run before generic intl. */
const LOCALE_PRIORITY: Record<string, string[]> = {
  US: ['NANP', 'UK', 'IN', 'intl'],
  CA: ['NANP', 'UK', 'IN', 'intl'],
  GB: ['UK', 'IN', 'NANP', 'intl'],
  IN: ['IN', 'UK', 'NANP', 'intl'],
};

/** Bare (no separators/prefix) matches require explicit phone context nearby. */
const PHONE_CONTEXT =
  /\b(phone|call|tel|telephone|mobile|cell|contact|reach|fax|ext|phone number)\b/i;

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/** Digit total of the maximal digit/separator run containing [start, end). */
function surroundingDigitRun(text: string, start: number, end: number): number {
  const isDigitOrSep = (ch: string | undefined): boolean =>
    ch !== undefined && (/\d/.test(ch) || /[\s.()-]/.test(ch));
  let from = start;
  let to = end;
  while (from > 0 && isDigitOrSep(text[from - 1])) from--;
  while (to < text.length && isDigitOrSep(text[to])) to++;
  return digitCount(text.slice(from, to));
}

function looksLikeOtherNumber(text: string, start: number, end: number): boolean {
  // Reject when glued to digits (part of a longer run) or immediately
  // preceded by a digit+dash context that looks like an ID range.
  const before = text.slice(Math.max(0, start - 2), start + 1);
  const after = text.slice(end, end + 2);
  if (/\d[\s./]?$/.test(before) && /[\s./]?\d/.test(after)) return true;
  return false;
}

export const phoneDetector: Detector = {
  id: 'phone',
  version: '1.1.0',
  category: 'contact',
  label: 'Phone number',
  run(ctx: ScanContext): Detection[] {
    const priority = LOCALE_PRIORITY[ctx.localeHint] ?? ['NANP', 'UK', 'IN', 'intl'];
    const ordered = [...PATTERNS].sort(
      (a, b) => (priority.indexOf(a.region) + 1 || 99) - (priority.indexOf(b.region) + 1 || 99),
    );

    const detections: Detection[] = [];
    const claimed: Array<{ start: number; end: number }> = [];

    const isClaimed = (start: number, end: number): boolean =>
      claimed.some((c) => start < c.end && end > c.start);

    for (const pattern of ordered) {
      if (!sensitivityAllows(ctx.sensitivity, pattern.confidence)) continue;
      for (const match of ctx.text.matchAll(pattern.re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        const end = start + value.length;
        if (isClaimed(start, end)) continue;
        if (looksLikeOtherNumber(ctx.text, start, end)) continue;
        const digits = digitCount(value);
        if (digits < pattern.minDigits || digits > 15) continue;
        // All-zero or trivially sequential runs are placeholders, not phones.
        if (/^0+$/.test(digits.toString())) continue;
        // Inside a longer digit run (cards, order numbers) — not a phone.
        if (surroundingDigitRun(ctx.text, start, end) > 15) continue;
        // Bare continuous digit runs are ambiguous: require phone context.
        const hasSeparators = /[+\-()\s]/.test(value);
        if (
          !hasSeparators &&
          !PHONE_CONTEXT.test(ctx.text.slice(Math.max(0, start - 160), end + 160))
        ) {
          continue;
        }
        claimed.push({ start, end });
        detections.push(
          makeDetection({
            detector: phoneDetector,
            subtype: `phone-${pattern.region.toLowerCase()}`,
            range: { start, end },
            text: ctx.text,
            severity: 'medium',
            confidence: pattern.confidence,
            maskKind: 'phone',
            explanation: `Text matching a ${pattern.region === 'intl' ? 'international' : pattern.region} phone-number shape${pattern.region !== 'intl' ? ` (region hint: ${ctx.localeHint})` : ''}.`,
            remediation:
              'Replace with [PHONE_1] or remove. Keep a last-2-digit suffix only if you need to refer to it later.',
            evidence: `${digits} digits`,
          }),
        );
      }
    }
    return detections;
  },
};
