import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Labeled credentials and key material: explicit password labels, private key
 * blocks, database connection strings, environment-variable assignments with
 * credential-indicating names, session cookies, and recovery codes.
 */

// Explicit password labels: password=, passwd:, passphrase = "…"
const LABELED_PASSWORD_RE =
  /(?<![\w-])(?:password|passwd|pwd|passphrase|pass)\s*(?:is\s+|[:=])\s*["']?(\S{4,128})["']?/gi;

// PEM/OpenSSH/PGP private key blocks — bounded multiline match.
const PRIVATE_KEY_RE =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----(?:.|\n){10,8000}-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g;

// OpenSSH one-line public keys are NOT secret; but a bare "PRIVATE KEY" header line
// without the END marker still deserves a warning (truncated paste).
const PRIVATE_KEY_HEADER_RE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g;

// Database connection strings with embedded credentials.
const DB_URL_RE =
  /(?<![\w.-])(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver|jdbc:[a-z0-9:]+):\/\/([^\s:@/"'<>]{1,64}):([^\s:@/"'<>]{1,128})@([^\s"'<>]{1,200})/g;

// Environment-variable assignments whose names indicate credentials.
const ENV_ASSIGN_RE = /(?<=^|\n)([A-Za-z_][A-Za-z0-9_.]{2,63})\s*=\s*["']?([^\s"']{8,512})["']?/g;
const ENV_SECRET_NAME =
  /(?:SECRET|TOKEN|PASSWORD|PASSWD|PASS|API[_]?KEY|ACCESS[_]?KEY|CREDENTIAL|AUTH|PRIVATE[_]?KEY|SIGNING|COOKIE|SESSION)/i;

// Session/auth cookies
const COOKIE_RE =
  /(?<![\w-])(?:set-cookie:\s*)?((?:session|auth|jwt|sid|remember)[-_.a-z0-9]*\s*[=:]\s*)["']?([A-Za-z0-9._+/=-]{12,512})["']?/gi;

// Recovery / one-time codes with strong context.
const RECOVERY_CODE_RE =
  /(?<![\w-])(?:recovery|backup|one[- ]time|otp|verification)\s*(?:code|codes|key)\s*(?:is|[:=])?\s*["']?([A-Z0-9]{4}(?:[- ][A-Z0-9]{4}){1,4})["']?/gi;

export const credentialsDetector: Detector = {
  id: 'credentials',
  version: '1.0.0',
  category: 'secrets',
  label: 'Credentials & keys',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    // Explicitly labeled passwords.
    for (const match of ctx.text.matchAll(LABELED_PASSWORD_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'labeled-password',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'critical',
          confidence: 'high',
          maskKind: 'labeled-value',
          explanation:
            'A value explicitly labeled as a password/passphrase. Avoids guessing over ordinary text — it matched only because of an explicit label.',
          remediation:
            'Remove the password entirely; if the assistant needs auth context, use a placeholder like [PASSWORD_REDACTED] and share the secret through a credential manager.',
          evidence: `${match[1]?.length ?? 0}-char value after label`,
        }),
      );
    }

    // Private key blocks (complete).
    for (const match of ctx.text.matchAll(PRIVATE_KEY_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'private-key-block',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'critical',
          confidence: 'high',
          maskKind: 'key-block',
          explanation:
            'A complete private key block (PEM/OpenSSH/PGP marker to END marker). The full key material is in the text.',
          remediation:
            'Remove the block immediately. If this key was ever shared anywhere, treat it as compromised and rotate it.',
          evidence: `${value.split('\n').length} lines`,
        }),
      );
    }

    // Truncated private key headers (warn even without the END marker).
    if (!ctx.text.includes('-----END') && PRIVATE_KEY_HEADER_RE.test(ctx.text)) {
      PRIVATE_KEY_HEADER_RE.lastIndex = 0;
      for (const match of ctx.text.matchAll(PRIVATE_KEY_HEADER_RE)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        detections.push(
          makeDetection({
            detector: credentialsDetector,
            subtype: 'private-key-header',
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'high',
            confidence: 'high',
            maskKind: 'key-block',
            explanation:
              'A private key BEGIN header without a matching END marker — the block may be truncated, but any accompanying material is still key data.',
            remediation: 'Inspect and remove the surrounding key material manually.',
          }),
        );
      }
    }

    // Database connection strings.
    for (const match of ctx.text.matchAll(DB_URL_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'db-connection-string',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'critical',
          confidence: 'high',
          maskKind: 'url-with-credentials',
          explanation:
            'Database connection string with embedded username and password (scheme://user:pass@host). The password is readable by anyone who sees this text.',
          remediation:
            'Replace with [DATABASE_URL_REDACTED] or an environment-variable reference. Rotate the password if it is real.',
          evidence: `${match[1] ?? 'database'} URL, ${match[3]?.length ?? 0}-char password`,
          groupId: `db-url-${start}`,
        }),
      );
    }

    // Environment-variable assignments with credential-indicating names.
    for (const match of ctx.text.matchAll(ENV_ASSIGN_RE)) {
      const name = match[1];
      const value = match[0];
      if (name === undefined || value === undefined) continue;
      if (!ENV_SECRET_NAME.test(name)) continue;
      // Skip values that are just references rather than literals.
      if (/^\$\{?\w+\}?$/.test(match[2] ?? '')) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'env-credential',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'high',
          confidence: 'medium',
          maskKind: 'labeled-value',
          explanation:
            'Environment-variable assignment whose name suggests a credential (SECRET/TOKEN/KEY/PASSWORD…). The value looks like a literal, not a reference.',
          remediation:
            'Replace the literal with a reference placeholder such as [ENV_SECRET] and keep the real value outside the prompt.',
          evidence: `${name.length}-char variable name`,
        }),
      );
    }

    // Session/auth cookies.
    for (const match of ctx.text.matchAll(COOKIE_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'session-cookie',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'high',
          confidence: 'medium',
          maskKind: 'labeled-value',
          explanation:
            'Text matching a session/auth cookie assignment. Replaying a session cookie can grant account access.',
          remediation: 'Remove the cookie value or replace with [SESSION_COOKIE].',
          evidence: `${match[2]?.length ?? 0}-char value`,
        }),
      );
    }

    // Recovery / one-time codes.
    for (const match of ctx.text.matchAll(RECOVERY_CODE_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: credentialsDetector,
          subtype: 'recovery-code',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'high',
          confidence: 'high',
          maskKind: 'labeled-value',
          explanation:
            'A recovery/one-time code explicitly labeled as such. Codes grant access without a password.',
          remediation: 'Remove the code, or replace with [RECOVERY_CODE].',
          evidence: `${match[1]?.length ?? 0}-char code`,
        }),
      );
    }

    return detections;
  },
};
