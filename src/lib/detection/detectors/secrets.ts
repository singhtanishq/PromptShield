import { makeDetection, sensitivityAllows } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';
import { shannonEntropy } from '../masking';

/**
 * Secret/token recognizers: documented provider prefixes (recognition only —
 * no provider affiliation implied, nothing validated against any service),
 * bearer/JWT/basic patterns, and high-entropy candidates with context.
 */

interface TokenShape {
  subtype: string;
  re: RegExp;
  severity: 'critical' | 'high' | 'low';
  confidence: 'high' | 'medium';
  note: string;
}

const TOKEN_SHAPES: TokenShape[] = [
  {
    subtype: 'aws-access-key',
    re: /(?<![\w])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented AWS access key id format (20 chars, AKIA/ASIA… prefix).',
  },
  {
    subtype: 'github-token',
    re: /(?<![\w])gh[pousr]_[A-Za-z0-9]{36,255}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented GitHub token format (ghp_/gho_/ghs_/ghu_/ghr_ + 36+ chars).',
  },
  {
    subtype: 'github-fine-grained',
    re: /(?<![\w])github_pat_[A-Za-z0-9_]{22,255}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented GitHub fine-grained personal access token format.',
  },
  {
    subtype: 'gitlab-token',
    re: /(?<![\w])glpat-[A-Za-z0-9_-]{20,64}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented GitLab personal access token format (glpat-).',
  },
  {
    subtype: 'slack-token',
    re: /(?<![\w])xox[abprs]-[A-Za-z0-9-]{10,128}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented Slack token format (xoxb-/xoxa-/xoxp-/xoxs-/xoxr-).',
  },
  {
    subtype: 'stripe-secret',
    re: /(?<![\w])(?:sk|rk)_live_[A-Za-z0-9]{16,247}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented Stripe live secret/restricted key format (sk_live_/rk_live_).',
  },
  {
    subtype: 'stripe-publishable',
    re: /(?<![\w])pk_live_[A-Za-z0-9]{16,247}(?![\w])/g,
    severity: 'low',
    confidence: 'high',
    note: 'Matches the documented Stripe live publishable key format (pk_live_) — public by design, flagged for awareness.',
  },
  {
    subtype: 'stripe-webhook',
    re: /(?<![\w])whsec_[A-Za-z0-9]{24,128}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented Stripe webhook signing secret format (whsec_).',
  },
  {
    subtype: 'google-api-key',
    re: /(?<![\w])AIza[0-9A-Za-z_-]{35}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches the documented Google API key format (AIza…, 39 chars).',
  },
  {
    subtype: 'openai-style-key',
    re: /(?<![\w])sk-[A-Za-z0-9_-]{20,255}(?![\w])/g,
    severity: 'critical',
    confidence: 'medium',
    note: 'Matches an sk- prefixed key shape used by several AI providers (format recognition only; not attributed to any provider).',
  },
  {
    subtype: 'jwt',
    re: /(?<![\w.-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![\w])/g,
    severity: 'critical',
    confidence: 'high',
    note: 'Matches JWT structure (three base64url segments; header starts with the standard eyJ encoding of {"alg":…).',
  },
  {
    subtype: 'bearer-token',
    re: /(?<![\w])Bearer\s+[A-Za-z0-9._~+/=-]{16,512}(?![\w.,])/g,
    severity: 'high',
    confidence: 'high',
    note: 'Authorization header Bearer scheme followed by a token.',
  },
  {
    subtype: 'basic-auth',
    re: /(?<![\w])Basic\s+[A-Za-z0-9+/]{16,512}={0,2}(?![\w])/g,
    severity: 'high',
    confidence: 'high',
    note: 'Authorization header Basic scheme followed by base64 credentials.',
  },
];

// Standalone high-entropy run near secret-ish context.
const ENTROPY_RUN_RE = /(?<![\w/])[A-Za-z0-9+/=_-]{32,128}(?![\w/=@])/g;
const SECRET_CONTEXT =
  /\b(api[_-]?key|apikey|token|secret|passwd|password|credential|auth|private[_-]?key|client[_-]?secret|access[_-]?key|session)\b/i;

export const secretsDetector: Detector = {
  id: 'secrets',
  version: '1.0.0',
  category: 'secrets',
  label: 'Secrets & tokens',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    for (const shape of TOKEN_SHAPES) {
      if (!sensitivityAllows(ctx.sensitivity, shape.confidence)) continue;
      for (const match of ctx.text.matchAll(shape.re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        detections.push(
          makeDetection({
            detector: secretsDetector,
            subtype: shape.subtype,
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: shape.severity,
            confidence: shape.confidence,
            maskKind: 'secret',
            explanation: `${shape.note} Nothing is validated against any provider — recognition is format-only.`,
            remediation:
              'Revoke and rotate this credential if it is real, then replace the text with [SECRET_REDACTED] or a reference placeholder.',
            evidence: `${value.length} chars`,
          }),
        );
      }
    }

    // High-entropy standalone runs with secret context nearby.
    if (ctx.sensitivity !== 'low') {
      for (const match of ctx.text.matchAll(ENTROPY_RUN_RE)) {
        const value = match[0];
        if (value === undefined) continue;
        // Provider shapes above already claimed their ranges; skip those overlaps cheaply.
        if (/(?:gh[pousr]_|glpat-|xox[abprs]-|sk_live_|whsec_|AKIA|AIza)/.test(value)) continue;
        const entropy = shannonEntropy(value);
        if (entropy < 3.2) continue;
        const start = match.index ?? 0;
        const surrounding = ctx.text.slice(Math.max(0, start - 120), start + value.length + 120);
        if (!SECRET_CONTEXT.test(surrounding)) continue;
        detections.push(
          makeDetection({
            detector: secretsDetector,
            subtype: 'high-entropy-candidate',
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'high',
            confidence: 'medium',
            maskKind: 'secret',
            explanation:
              'Long high-entropy string near a secret-related keyword — could be a token, a hash, or an encoded value. Entropy is a hint, not proof.',
            remediation:
              'Inspect manually. If it is a credential, rotate it; otherwise ignore this finding.',
            evidence: `${value.length} chars, ${entropy.toFixed(1)} bits/char entropy`,
          }),
        );
      }
    }

    return detections;
  },
};
