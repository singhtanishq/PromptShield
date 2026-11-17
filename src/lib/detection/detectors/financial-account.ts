import { makeDetection, sensitivityAllows } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';
import { ibanValid } from '../normalizers';

/**
 * IBAN and bank-account-like identifiers. IBAN uses the ISO 13616 mod-97
 * checksum; generic account/routing candidates require contextual keywords.
 */
const IBAN_RE =
  /(?<![\w])([A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]{4}){3,7}[ ]?[A-Za-z0-9]{1,3})(?![\w])/g;

const ACCOUNT_CONTEXT =
  /\b(account|acct|checking|savings|iban|swift|sort code|routing|routing number|bank)\b/i;

const ACCOUNT_VALUE_RE =
  /(?<![\w/])(?:\d{8,17}|[A-Z]{2}\d{6,8}|(?:\d{2}-\d{3}-\d{4}|\d{6}-\d{4}))(?![\w/])/g;

export const ibanDetector: Detector = {
  id: 'iban',
  version: '1.0.0',
  category: 'financial',
  label: 'IBAN',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];
    for (const match of ctx.text.matchAll(IBAN_RE)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const cleaned = raw.replace(/\s+/g, '').toUpperCase();
      if (cleaned.length < 15 || cleaned.length > 34) continue;
      const valid = ibanValid(cleaned);
      if (!valid && !sensitivityAllows(ctx.sensitivity, 'low')) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: ibanDetector,
          subtype: valid ? 'iban-valid' : 'iban-format',
          range: { start, end: start + raw.length },
          text: ctx.text,
          severity: 'high',
          confidence: valid ? 'high' : 'low',
          maskKind: 'iban',
          explanation: valid
            ? 'Matches IBAN structure and passes the mod-97 checksum. Format validity does not prove the account exists or is yours to share.'
            : 'Matches the IBAN shape but fails the mod-97 checksum — possibly a mistyped or fictional IBAN.',
          remediation:
            'Replace with [IBAN_1] or remove. Bank details rarely belong in an AI prompt.',
          evidence: valid ? 'passes mod-97 checksum' : 'fails mod-97 checksum',
        }),
      );
    }
    return detections;
  },
};

export const bankAccountDetector: Detector = {
  id: 'bank-account',
  version: '1.0.0',
  category: 'financial',
  label: 'Bank account reference',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];
    for (const match of ctx.text.matchAll(ACCOUNT_VALUE_RE)) {
      const raw = match[0];
      if (raw === undefined) continue;
      const start = match.index ?? 0;
      const range = { start, end: start + raw.length };
      // Require financial context nearby; bare digit runs are too noisy.
      const windowStart = Math.max(0, start - 160);
      const windowEnd = Math.min(ctx.text.length, range.end + 160);
      const surrounding = ctx.text.slice(windowStart, windowEnd);
      if (!ACCOUNT_CONTEXT.test(surrounding)) continue;
      detections.push(
        makeDetection({
          detector: bankAccountDetector,
          subtype: 'bank-account-candidate',
          range,
          text: ctx.text,
          severity: 'medium',
          confidence: 'medium',
          maskKind: 'generic',
          explanation:
            'Digit run in a banking context (account/routing/sort-code shapes vary by jurisdiction — this is a candidate, not a verified identifier).',
          remediation: 'Review manually and replace with [ACCOUNT_1] if it is a real reference.',
          evidence: `${raw.length} chars near banking keyword`,
        }),
      );
    }
    return detections;
  },
};
