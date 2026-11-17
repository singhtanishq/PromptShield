import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Email addresses with conservative boundary checks: no leading/trailing local
 * dots, no consecutive dots, sane length caps, and no matches embedded inside
 * longer word runs. A sentence-final period stays outside the match.
 * Deliberately conservative — exotic RFC-5322 forms are out of scope for
 * heuristics (see docs/DETECTION-CATALOG.md).
 */
const EMAIL_RE =
  /(?<![\w.+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}(?![A-Za-z0-9])/g;

export const emailDetector: Detector = {
  id: 'email',
  version: '1.1.0',
  category: 'contact',
  label: 'Email address',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];
    for (const match of ctx.text.matchAll(EMAIL_RE)) {
      const value = match[0];
      if (value === undefined || value.length > 254 || value.length < 6) continue;
      if (value.includes('..')) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: emailDetector,
          subtype: 'email',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'medium',
          confidence: 'high',
          maskKind: 'email',
          explanation:
            'Text matching an email address format (local part @ domain with a dot-separated suffix).',
          remediation:
            'Replace with a placeholder such as [EMAIL_1], or remove it if the assistant does not need the address.',
          evidence: `${value.length} chars`,
        }),
      );
    }
    return detections;
  },
};
