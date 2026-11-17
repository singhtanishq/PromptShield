import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';
import { isIPv4, isIPv6, ipv4Scope } from '../normalizers';

/**
 * Network identifiers: structurally validated IPv4/IPv6 addresses and URLs
 * (embedded credentials, tracking parameters, internal/staging hosts). IP
 * validation uses real octet parsing, not a loose regex.
 */

const IPV4_RE = /(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w.])/g;
// Broad candidate filter, validated with real parsing (isIPv6) afterwards.
const IPV6_CANDIDATE_RE = /(?<![\w:.])[0-9A-Fa-f:.]{2,45}(?![\w:.])/g;

const URL_WITH_CREDS_RE =
  /(?<![\w.-])([a-z][a-z0-9+.-]{1,15}):\/\/([^\s:@/"'<>]{1,64}):([^\s:@/"'<>]{1,128})@([^\s"'<>]{1,200})/g;

const URL_RE = /(?<![\w.-])(https?:\/\/[^\s"'<>]{3,300})(?=[\s)\]},;]|$)/gi;

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
];

const INTERNAL_HOST_RE = /(?:staging|stage|internal|intranet|dev|test|qa|uat|corp|local)\b/i;

export const networkDetector: Detector = {
  id: 'network',
  version: '1.0.0',
  category: 'contact',
  label: 'Network identifiers',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    // IPv4 — structurally validated, scope-aware.
    for (const match of ctx.text.matchAll(IPV4_RE)) {
      const value = match[1];
      if (value === undefined) continue;
      if (!isIPv4(value)) continue;
      const scope = ipv4Scope(value);
      const start = (match.index ?? 0) + 0;
      if (scope === 'private' || scope === 'loopback' || scope === 'link-local') {
        // Internal-range IPs are handled here with the internal category via
        // overlap resolution: emit as contact (public) or internal (private).
        detections.push(
          makeDetection({
            detector: networkDetector,
            subtype: `ip-private-${scope}`,
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'medium',
            confidence: 'high',
            maskKind: 'ip',
            explanation: `Valid IPv4 address in a non-public range (${scope}). Internal addressing can reveal network topology.`,
            remediation: 'Replace with [INTERNAL_IP_1] or remove unless the assistant needs it.',
            evidence: 'parsed as IPv4, non-public scope',
          }),
        );
      } else {
        detections.push(
          makeDetection({
            detector: networkDetector,
            subtype: 'ip-public',
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'low',
            confidence: 'high',
            maskKind: 'ip',
            explanation: 'Valid public IPv4 address (structurally parsed, all octets in range).',
            remediation: 'Replace with [IP_1] if the assistant does not need the exact address.',
            evidence: 'parsed as IPv4, public scope',
          }),
        );
      }
    }

    // IPv6 — broad candidates validated by real parsing.
    for (const match of ctx.text.matchAll(IPV6_CANDIDATE_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      if (!value.includes(':')) continue;
      if (!isIPv6(value)) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: networkDetector,
          subtype: 'ip-ipv6',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'low',
          confidence: 'high',
          maskKind: 'ip',
          explanation: 'Valid IPv6 address (parsed with compression rules).',
          remediation: 'Replace with [IP_1] if the assistant does not need the exact address.',
          evidence: 'parsed as IPv6',
        }),
      );
    }

    // URLs with embedded credentials — high severity, secrets-style masking.
    for (const match of ctx.text.matchAll(URL_WITH_CREDS_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: networkDetector,
          subtype: 'url-credentials',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'critical',
          confidence: 'high',
          maskKind: 'url-with-credentials',
          explanation:
            'URL containing embedded username and password (user:pass@host form). Anyone with the text can read the credentials.',
          remediation:
            'Remove the credentials or replace the whole URL with [URL_WITH_CREDENTIALS]. Move secrets to a credential manager, never into prompts.',
          evidence: `${match[3]?.length ?? 0}-char password component`,
          groupId: `url-creds-${start}`,
        }),
      );
    }

    // Plain URLs: flag tracking parameters and internal/staging hosts.
    for (const match of ctx.text.matchAll(URL_RE)) {
      const value = match[1];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      const lower = value.toLowerCase();
      const hasTracking = TRACKING_PARAMS.some((p) => lower.includes(`${p}=`));
      const isInternal = INTERNAL_HOST_RE.test(value);
      if (!hasTracking && !isInternal) continue;
      detections.push(
        makeDetection({
          detector: networkDetector,
          subtype: hasTracking ? 'url-tracking-params' : 'url-internal-host',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: hasTracking ? 'informational' : 'medium',
          confidence: 'high',
          maskKind: 'url',
          explanation: hasTracking
            ? 'URL contains tracking parameters (utm_*/click identifiers) that can link the text back to you or a campaign.'
            : 'URL points at an internal/staging/test host, which can reveal infrastructure details.',
          remediation: hasTracking
            ? 'Strip tracking parameters before sharing, or replace with [URL_1].'
            : 'Replace the host with a placeholder unless the assistant genuinely needs it.',
          evidence: hasTracking
            ? 'contains tracking parameter(s)'
            : 'host matches internal patterns',
        }),
      );
    }

    return detections;
  },
};
