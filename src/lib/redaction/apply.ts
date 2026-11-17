import type {
  AppliedEdit,
  Detection,
  RedactionDecision,
  RedactionMode,
  SanitizeOutcome,
} from '../detection/types';
import type { PseudonymStore } from './pseudonyms';

/**
 * Span-based redaction. Edits are applied against ORIGINAL offsets from end to
 * start (never naive repeated String.replace), so offsets stay valid regardless
 * of replacement lengths. Primary detections are already non-overlapping, so
 * decided spans never conflict.
 */

/** Default mask placeholders per detection subtype family. */
const MASK_BY_SUBTYPE: Record<string, string> = {
  email: '[EMAIL_REDACTED]',
  'phone-nanp': '[PHONE_REDACTED]',
  'phone-uk': '[PHONE_REDACTED]',
  'phone-in': '[PHONE_REDACTED]',
  'phone-intl': '[PHONE_REDACTED]',
  'url-credentials': '[URL_WITH_CREDENTIALS_REDACTED]',
  'url-tracking-params': '[URL_REDACTED]',
  'url-internal-host': '[INTERNAL_URL_REDACTED]',
  'ip-public': '[IP_REDACTED]',
  'ip-private-private': '[INTERNAL_IP_REDACTED]',
  'ip-private-loopback': '[INTERNAL_IP_REDACTED]',
  'ip-private-link-local': '[INTERNAL_IP_REDACTED]',
  'ip-ipv6': '[IP_REDACTED]',
  'card-visa': '[CARD_REDACTED]',
  'card-mastercard': '[CARD_REDACTED]',
  'card-amex': '[CARD_REDACTED]',
  'card-discover': '[CARD_REDACTED]',
  'card-jcb': '[CARD_REDACTED]',
  'card-diners': '[CARD_REDACTED]',
  'card-unionpay': '[CARD_REDACTED]',
  'card-unknown': '[CARD_REDACTED]',
  'iban-valid': '[IBAN_REDACTED]',
  'iban-format': '[IBAN_REDACTED]',
  'bank-account-candidate': '[ACCOUNT_REDACTED]',
  'us-ssn': '[SSN_REDACTED]',
  'uk-nino': '[NATIONAL_ID_REDACTED]',
  'in-pan': '[TAX_ID_REDACTED]',
  'in-aadhaar': '[NATIONAL_ID_REDACTED]',
  'aws-access-key': '[API_KEY_REDACTED]',
  'github-token': '[TOKEN_REDACTED]',
  'github-fine-grained': '[TOKEN_REDACTED]',
  'gitlab-token': '[TOKEN_REDACTED]',
  'slack-token': '[TOKEN_REDACTED]',
  'stripe-secret': '[API_KEY_REDACTED]',
  'stripe-publishable': '[API_KEY_REDACTED]',
  'stripe-webhook': '[SIGNING_SECRET_REDACTED]',
  'google-api-key': '[API_KEY_REDACTED]',
  'openai-style-key': '[API_KEY_REDACTED]',
  jwt: '[TOKEN_REDACTED]',
  'bearer-token': '[TOKEN_REDACTED]',
  'basic-auth': '[CREDENTIALS_REDACTED]',
  'high-entropy-candidate': '[SECRET_REDACTED]',
  'labeled-password': '[PASSWORD_REDACTED]',
  'private-key-block': '[PRIVATE_KEY_REDACTED]',
  'private-key-header': '[PRIVATE_KEY_REDACTED]',
  'db-connection-string': '[DATABASE_URL_REDACTED]',
  'env-credential': '[ENV_SECRET_REDACTED]',
  'session-cookie': '[SESSION_COOKIE_REDACTED]',
  'recovery-code': '[RECOVERY_CODE_REDACTED]',
  'person-name-honorific': '[NAME_REDACTED]',
  'person-name-labeled': '[NAME_REDACTED]',
  'street-address': '[ADDRESS_REDACTED]',
  'city-state-zip': '[ADDRESS_REDACTED]',
  'date-of-birth': '[DOB_REDACTED]',
  age: '[AGE_REDACTED]',
  'label-confidential': '[CONFIDENTIAL_MARKER]',
  'label-internal-only': '[CONFIDENTIAL_MARKER]',
  'label-do-not-share': '[CONFIDENTIAL_MARKER]',
  'label-nda': '[CONFIDENTIAL_MARKER]',
  'label-customer-data': '[CONFIDENTIAL_MARKER]',
  'label-proprietary': '[CONFIDENTIAL_MARKER]',
  'label-trade-secret': '[CONFIDENTIAL_MARKER]',
  'internal-hostname': '[INTERNAL_HOST_REDACTED]',
  'local-file-path': '[FILE_PATH_REDACTED]',
  'cloud-resource-id': '[RESOURCE_ID_REDACTED]',
};

/** Context-preserving placeholders (mode 6): typed, human-readable aliases. */
const CONTEXT_BY_SUBTYPE: Record<string, string> = {
  email: '[SENDER_EMAIL]',
  'person-name-honorific': '[CUSTOMER_NAME]',
  'person-name-labeled': '[CUSTOMER_NAME]',
  'street-address': '[MAILING_ADDRESS]',
  'city-state-zip': '[MAILING_ADDRESS]',
  'date-of-birth': '[DATE_OF_BIRTH]',
  'db-connection-string': '[DATABASE_CONNECTION]',
  'labeled-password': '[REDACTED_PASSWORD]',
};

export function maskPlaceholderFor(detection: Detection): string {
  return MASK_BY_SUBTYPE[detection.subtype] ?? `[${detection.subtype.toUpperCase()}_REDACTED]`;
}

export function contextPlaceholderFor(detection: Detection): string {
  return CONTEXT_BY_SUBTYPE[detection.subtype] ?? `[${detection.subtype.toUpperCase()}]`;
}

export function defaultReplacementFor(detection: Detection, mode: RedactionMode): string {
  switch (mode) {
    case 'mask':
      return maskPlaceholderFor(detection);
    case 'pseudonymize':
      // Actual placeholder comes from the session store; this is a UI fallback.
      return '[PSEUDONYM]';
    case 'context-placeholder':
      return contextPlaceholderFor(detection);
    case 'partial':
      return partialMaskFor(detection, '');
    case 'remove':
      return '';
    case 'custom':
      return '';
  }
}

/** True when the last-4 partial mask is appropriate for this finding. */
export function supportsPartialMask(detection: Detection): boolean {
  return [
    'card-visa',
    'card-mastercard',
    'card-amex',
    'card-discover',
    'card-jcb',
    'card-diners',
    'card-unionpay',
    'card-unknown',
    'iban-valid',
    'iban-format',
    'us-ssn',
    'phone-nanp',
    'phone-uk',
    'phone-in',
    'phone-intl',
  ].includes(detection.subtype);
}

/** Partial mask keeps a bounded suffix (typically the last four digits). */
export function partialMaskFor(detection: Detection, value: string): string {
  const digits = value.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  if (detection.subtype.startsWith('card-')) {
    return `•••• •••• •••• ${last4}`;
  }
  if (detection.subtype.startsWith('iban')) {
    return `••••${last4.length > 0 ? ' ' + last4 : ''}`;
  }
  if (detection.subtype.startsWith('phone')) {
    return `••••••${last4}`;
  }
  return `••••${last4}`;
}

/** Quote-as-untrusted-data formatting assistance for prompt-risk findings. */
export function untrustedQuoteFor(value: string): string {
  const inner = value.includes('\n')
    ? `<untrusted_content>\n${value}\n</untrusted_content>`
    : `<untrusted_content>${value}</untrusted_content>`;
  return inner;
}

export interface ApplyOptions {
  /** When true (re-identify flow), pseudonymize decisions map back instead. */
  reidentify?: boolean;
}

/**
 * Apply the user's redaction decisions to the original text.
 * Pure function: returns a new string plus the applied-edit bookkeeping.
 */
export function applyRedactions(
  text: string,
  detections: Detection[],
  decisions: RedactionDecision[],
  pseudonyms: PseudonymStore,
  _options: ApplyOptions = {},
): SanitizeOutcome {
  const detectionById = new Map(detections.map((d) => [d.id, d]));
  const edits: Array<{ decision: RedactionDecision; detection: Detection; replacement: string }> =
    [];

  for (const decision of decisions) {
    const detection = detectionById.get(decision.findingId);
    if (detection === undefined) continue;
    let replacement: string;
    switch (decision.mode) {
      case 'mask':
        replacement = maskPlaceholderFor(detection);
        break;
      case 'pseudonymize': {
        const value = text.slice(detection.range.start, detection.range.end);
        replacement = pseudonyms.pseudonymize(
          detection.category,
          detection.subtype,
          value,
          detection.preview,
        );
        break;
      }
      case 'custom':
      case 'context-placeholder':
        replacement = decision.replacement ?? defaultReplacementFor(detection, decision.mode);
        if (replacement.length === 0) replacement = defaultReplacementFor(detection, 'mask');
        break;
      case 'partial': {
        const value = text.slice(detection.range.start, detection.range.end);
        replacement = partialMaskFor(detection, value);
        break;
      }
      case 'remove':
        replacement = '';
        break;
      default:
        replacement = maskPlaceholderFor(detection);
    }
    edits.push({ decision, detection, replacement });
  }

  // Apply end-to-start against original offsets.
  const ordered = [...edits].sort((a, b) => b.detection.range.start - a.detection.range.start);
  let output = text;
  const applied: AppliedEdit[] = [];
  for (const { decision, detection, replacement } of ordered) {
    const { start, end } = detection.range;
    output = output.slice(0, start) + replacement + output.slice(end);
    applied.push({
      findingId: decision.findingId,
      originalRange: { start, end },
      outputRange: { start, end: start + replacement.length },
      replacement,
      mode: decision.mode,
    });
  }
  applied.reverse(); // restore original (top-to-bottom) order

  return { text: output, edits: applied };
}

/** Annotation block for the "copy with annotations" action (no raw values). */
export function annotationsFor(edits: AppliedEdit[], detections: Detection[]): string {
  if (edits.length === 0) return '';
  const detectionById = new Map(detections.map((d) => [d.id, d]));
  const counts = new Map<string, { label: string; count: number; placeholder: string }>();
  for (const edit of edits) {
    const detection = detectionById.get(edit.findingId);
    const label = detection?.subtype ?? 'finding';
    const entry = counts.get(label) ?? { label, count: 0, placeholder: edit.replacement };
    entry.count += 1;
    counts.set(label, entry);
  }
  const lines = [...counts.values()].map((e) => `- ${e.count}× ${e.label} → ${e.placeholder}`);
  return [
    '--- Sanitized with PromptShield ---',
    'Replacements applied (values removed, categories only):',
    ...lines,
    '---',
  ].join('\n');
}
