import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';
import { luhnValid } from '../normalizers';

/**
 * Payment card numbers: 13-19 digits in groups or continuous, brand-prefix
 * aware, Luhn-validated. A Luhn pass raises confidence but never proves the
 * number belongs to a real account; a pattern-only match keeps low confidence.
 */
const CARD_RE =
  /(?<![\w-])(\d{4}[\s-]?\d{6}[\s-]?\d{3,10}|\d{4}(?:[\s-]?\d{4}){2,4}|\d{13,19})(?![\d])/g;

/** Brand prefixes (structural facts only, no affiliation claimed). */
const BRAND_PREFIXES: Array<[string, RegExp]> = [
  ['visa', /^4/],
  ['mastercard', /^(5[1-5]|2[2-7])/],
  ['amex', /^3[47]/],
  ['discover', /^(6011|65|64[4-9])/],
  ['jcb', /^35(2[89]|[3-8])/],
  ['diners', /^3(?:0[0-5]|[68])/],
  ['unionpay', /^62/],
];

function brandFor(digits: string): string | null {
  for (const [brand, re] of BRAND_PREFIXES) {
    if (re.test(digits)) return brand;
  }
  return null;
}

function plausibleCardLength(digits: string): boolean {
  // Common network lengths; non-listed lengths stay eligible with low confidence.
  return (
    [13, 14, 15, 16, 17, 18, 19].includes(digits.length) &&
    /^(4|5|6|3[47]|35|3[0689]|2[2-7]|6011|64[4-9]|65)/.test(digits)
  );
}

export const paymentCardDetector: Detector = {
  id: 'payment-card',
  version: '1.0.0',
  category: 'financial',
  label: 'Payment card number',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];
    for (const match of ctx.text.matchAll(CARD_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const digits = raw.replace(/[\s-]/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      if (/^0+$|^1+$|^1234567890123456$/.test(digits)) continue; // trivial placeholders
      const brand = brandFor(digits);
      const luhn = luhnValid(digits);
      const start = match.index ?? 0;
      const range = { start, end: start + raw.length };

      if (luhn && (brand !== null || plausibleCardLength(digits))) {
        detections.push(
          makeDetection({
            detector: paymentCardDetector,
            subtype: `card-${brand ?? 'unknown'}`,
            range,
            text: ctx.text,
            severity: 'critical',
            confidence: 'high',
            maskKind: 'card',
            explanation: `A ${digits.length}-digit number matching ${brand ?? 'a known'} card format that passes the Luhn checksum.`,
            remediation:
              'Never include full card numbers in prompts. Replace with [CARD_REDACTED] or keep only the last 4 digits.',
            evidence: `passes Luhn checksum, ${digits.length} digits`,
          }),
        );
      } else {
        // Card-shaped but failing checksum — still worth surfacing at low confidence.
        if (!plausibleCardLength(digits)) continue;
        detections.push(
          makeDetection({
            detector: paymentCardDetector,
            subtype: `card-shaped-${brand ?? 'unknown'}`,
            range,
            text: ctx.text,
            severity: 'medium',
            confidence: 'low',
            maskKind: 'card',
            explanation: `A ${digits.length}-digit number looks like a card number but does not pass the Luhn checksum. Could be an account or reference number.`,
            remediation:
              'Review manually: if it is an account identifier rather than a card, decide whether it is still sensitive.',
            evidence: 'fails Luhn checksum',
          }),
        );
      }
    }
    return detections;
  },
};
