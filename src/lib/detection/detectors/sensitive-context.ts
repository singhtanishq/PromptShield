import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Internal / confidential content: confidential labels, internal hostnames,
 * local file paths, cloud resource identifiers, and private-range references.
 * A confidential label is a contextual indicator — not proof of legal status.
 */

const CONFIDENTIAL_LABELS: Array<{ re: RegExp; subtype: string; label: string }> = [
  { re: /\bconfidential\b/gi, subtype: 'label-confidential', label: '“confidential”' },
  {
    re: /\binternal\s+(?:only|use)\b/gi,
    subtype: 'label-internal-only',
    label: '“internal only/internal use”',
  },
  {
    re: /\bdo\s+not\s+(?:share|distribute|disclose)\b/gi,
    subtype: 'label-do-not-share',
    label: '“do not share/distribute”',
  },
  { re: /\bNDA\b/g, subtype: 'label-nda', label: '“NDA”' },
  { re: /\bcustomer\s+data\b/gi, subtype: 'label-customer-data', label: '“customer data”' },
  { re: /\bproprietary\b/gi, subtype: 'label-proprietary', label: '“proprietary”' },
  { re: /\btrade\s+secret\b/gi, subtype: 'label-trade-secret', label: '“trade secret”' },
];

// Host-shaped runs; internal/staging keyword may appear anywhere in the host.
const HOSTNAME_RE = /(?<![\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?![\w.-])/gi;
const INTERNAL_KEYWORD_RE =
  /(?:^|\.)(?:[^.]*-)?(?:internal|intranet|corp|local|lan|staging|stage|dev|test|qa|uat)(?:-[^.]*)?\./i;

// User-home file paths and unix-style system paths — may reveal usernames and structure.
const FILE_PATH_RE =
  /(?<![\w~])(?:~\/|[A-Za-z]:\\(?:Users|Documents|Desktop|Projects|repos|src)\\|\/(?:Users|home|var\/www|srv|opt|root)\/)[^\s"'<>|;*]{1,120}/g;

// AWS ARN-style resource identifiers.
const ARN_RE = /(?<![\w])arn:aws[a-z0-9-]*:[a-z0-9-]{1,40}:[a-z0-9-]{0,40}:\d{12}:[^\s"']{1,120}/g;

export const sensitiveContextDetector: Detector = {
  id: 'sensitive-context',
  version: '1.0.0',
  category: 'internal',
  label: 'Internal & confidential',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    for (const { re, subtype, label } of CONFIDENTIAL_LABELS) {
      re.lastIndex = 0;
      for (const match of ctx.text.matchAll(re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        detections.push(
          makeDetection({
            detector: sensitiveContextDetector,
            subtype,
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'informational',
            confidence: 'high',
            maskKind: 'url',
            explanation: `Confidentiality label ${label} found. This is a contextual indicator that surrounding content may be sensitive — not proof of legal status.`,
            remediation:
              'If the surrounding content is confidential, consider summarizing rather than pasting it, or redact identifiers individually.',
            evidence: 'exact phrase match',
          }),
        );
      }
    }

    for (const match of ctx.text.matchAll(HOSTNAME_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      if (!INTERNAL_KEYWORD_RE.test(value)) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: sensitiveContextDetector,
          subtype: 'internal-hostname',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'medium',
          confidence: 'medium',
          maskKind: 'url',
          explanation:
            'Hostname using internal TLD conventions (internal/intranet/corp/local/staging/dev). Revealing internal hostnames can map your infrastructure.',
          remediation: 'Replace with [INTERNAL_HOST_1] unless the assistant needs the real host.',
          evidence: 'internal TLD pattern',
        }),
      );
    }

    for (const match of ctx.text.matchAll(FILE_PATH_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: sensitiveContextDetector,
          subtype: 'local-file-path',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'medium',
          confidence: 'medium',
          maskKind: 'address',
          explanation:
            'Local filesystem path. Home-directory paths can include your username; project paths can reveal client or codebase names.',
          remediation: 'Shorten to a placeholder like [PROJECT_PATH] or use a generic filename.',
          evidence: 'path-prefix pattern',
        }),
      );
    }

    for (const match of ctx.text.matchAll(ARN_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: sensitiveContextDetector,
          subtype: 'cloud-resource-id',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'medium',
          confidence: 'high',
          maskKind: 'url',
          explanation:
            'Cloud resource identifier (ARN format) including account id — reveals your cloud account and resource names.',
          remediation: 'Replace with [RESOURCE_ID] or remove the account segment.',
          evidence: 'ARN format with 12-digit account id',
        }),
      );
    }

    return detections;
  },
};
