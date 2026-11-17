import { makeDetection } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Prompt Risk Review — independent from PII detection and never auto-redacted.
 * Rule-based indicators only: they are evadable and false-positive prone, and
 * a browser-side scanner cannot guarantee anything about how an AI system will
 * behave. This detector flags for human review; it does not "sanitize".
 */

const RISK_PATTERNS: Array<{
  re: RegExp;
  subtype: string;
  description: string;
  severity: 'high' | 'medium';
  confidence: 'high' | 'medium' | 'low';
  remediation: string;
}> = [
  {
    re: /\b(?:ignore|disregard|forget|override|discard)\b[^.\n]{0,40}\b(?:all\s+)?(?:previous|prior|above|earlier|preceding|system|developer|initial|external)\b[^.\n]{0,20}\b(?:instructions?|prompts?|rules?|directions?|messages?|guidance)\b/gi,
    subtype: 'instruction-override',
    description:
      'Instruction-override phrasing: asks to discard previous/system/developer instructions. Common in prompt-injection attempts, also in ordinary writing — review the intent.',
    severity: 'high',
    confidence: 'medium',
    remediation:
      'If this text came from an untrusted source, consider quoting it as data (e.g. in a fenced block) and telling the model to treat it as untrusted content rather than instructions.',
  },
  {
    re: /\b(?:reveal|show|print|output|display|repeat|leak|expose)\b[^.\n]{0,40}\b(?:system\s+prompt|hidden\s+prompt|initial\s+instructions?|developer\s+message|internal\s+instructions?|secret[s]?\b|credentials?\b|api\s+keys?\b|private\s+keys?\b)/gi,
    subtype: 'reveal-hidden-context',
    description:
      'Requests to reveal hidden prompts, credentials, or confidential context — a classic goal of prompt injection.',
    severity: 'high',
    confidence: 'medium',
    remediation: 'Review manually. Consider removing or quoting the sentence as untrusted data.',
  },
  {
    re: /\b(?:bypass|circumvent|jailbreak|disable|turn\s+off|drop)\b[^.\n]{0,30}\b(?:safety|guardrails?|filters?|restrictions?|content\s+(?:policy|filter)|safeguards?|moderation)\b/gi,
    subtype: 'safeguard-bypass',
    description: 'Requests to bypass safeguards or policy controls.',
    severity: 'high',
    confidence: 'medium',
    remediation: 'Review manually and decide whether the phrasing belongs in your prompt at all.',
  },
  {
    re: /\b(?:send|post|upload|submit|exfiltrate|transmit|forward|email|fetch)\b[^.\n]{0,80}\b(?:to|via|through)\b[^.\n]{0,40}\b(?:https?:\/\/|webhook|pastebin|attacker|external\s+server|remote\s+host|my\s+server)\b/gi,
    subtype: 'data-exfiltration',
    description:
      'Instruction-like phrasing about sending/transmitting content to an external endpoint — possible data-exfiltration setup.',
    severity: 'high',
    confidence: 'medium',
    remediation:
      'Verify manually. If the text instructs tools or agents to contact external endpoints, treat it as hostile unless you wrote it yourself.',
  },
  {
    re: /\b(?:pretend|act|you\s+are\s+now|from\s+now\s+on)\b[^.\n]{0,50}\b(?:no\s+rules|unrestricted|without\s+restrictions|dan\s+mode|unfiltered)\b/gi,
    subtype: 'persona-jailbreak',
    description:
      'Persona/jailbreak-style phrasing ("you are now unrestricted" patterns). Evadable and false-positive prone — an indicator only.',
    severity: 'medium',
    confidence: 'low',
    remediation: 'Review manually.',
  },
];

/**
 * Zero-width and bidi control characters that can smuggle instructions.
 * These character classes are the detection target itself, so the
 * no-misleading-character-class / no-control-regex rules are intentionally
 * disabled for the exact patterns below.
 */
const HIDDEN_CHARS: Array<[RegExp, string]> = [
  // eslint-disable-next-line no-misleading-character-class -- detection target
  [/[\u200B\u200C\u200D\u2060\uFEFF]/g, 'zero-width (U+200B/C/D, U+2060, U+FEFF)'],
  [/[\u202A-\u202E\u2066-\u2069]/g, 'bidi control (U+202A-202E, U+2066-2069)'],
  // eslint-disable-next-line no-control-regex -- detection target
  [/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, 'control character (C0/C1)'],
];

const BASE64_RUN_RE = /(?<![\w/=+])[A-Za-z0-9+/]{32,}={0,2}(?![\w/=+])/g;
const HEX_RUN_RE = /(?<![\wA-Fa-f])(?:[0-9A-Fa-f]{2}){24,}(?![\wA-Fa-f])/g;
const PERCENT_ENCODED_RE = /(?:%[0-9A-Fa-f]{2}){8,}/g;

const MAX_DECODE_BYTES = 4096;

function decodePreview(encoded: string): string | null {
  // Only called when the user opted in. Bounded: input capped, output truncated,
  // never executed, depth limited to one pass.
  try {
    let decoded: string | null = null;
    if (/%[0-9A-Fa-f]{2}/.test(encoded)) {
      decoded = decodeURIComponent(encoded.slice(0, MAX_DECODE_BYTES * 2));
    } else if (/^[0-9A-Fa-f]+$/.test(encoded)) {
      const bytes: number[] = [];
      for (let i = 0; i + 1 < encoded.length && bytes.length < MAX_DECODE_BYTES; i += 2) {
        bytes.push(parseInt(encoded.slice(i, i + 2), 16));
      }
      decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    } else {
      const bytes = atob(encoded.slice(0, MAX_DECODE_BYTES + 4));
      decoded = new TextDecoder('utf-8', { fatal: false }).decode(
        Uint8Array.from(bytes, (c) => c.charCodeAt(0) & 0xff),
      );
    }
    if (decoded === null) return null;
    const printable = decoded.replace(/[^\x20-\x7E\n\t]/g, '�');
    return printable.slice(0, 400) + (printable.length > 400 ? '…' : '');
  } catch {
    return null;
  }
}

export const promptRiskDetector: Detector = {
  id: 'prompt-risk',
  version: '1.0.0',
  category: 'prompt-risk',
  label: 'Prompt risk review',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    for (const pattern of RISK_PATTERNS) {
      for (const match of ctx.text.matchAll(pattern.re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        detections.push(
          makeDetection({
            detector: promptRiskDetector,
            subtype: pattern.subtype,
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: pattern.severity,
            confidence: pattern.confidence,
            maskKind: 'url',
            explanation: `${pattern.description} This is a keyword/phrase indicator — evadable and false-positive prone; it is not a security verdict.`,
            remediation: pattern.remediation,
            evidence: `${value.length}-char phrase`,
          }),
        );
      }
    }

    // Hidden Unicode characters.
    for (const [re, label] of HIDDEN_CHARS) {
      for (const match of ctx.text.matchAll(re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        const codepoint = value.codePointAt(0) ?? 0;
        detections.push(
          makeDetection({
            detector: promptRiskDetector,
            subtype: 'hidden-unicode',
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: 'high',
            confidence: 'high',
            maskKind: 'generic',
            explanation: `${label} character detected. Invisible characters can smuggle instructions, corrupt token boundaries, or exploit text rendering. PromptShield never silently removes them — removal is your decision.`,
            remediation:
              'Remove the character manually, or retype the surrounding text. (Charcode: U+' +
              codepoint.toString(16).toUpperCase().padStart(4, '0') +
              ')',
            evidence: `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`,
          }),
        );
      }
    }

    // Encoded payloads — surfaced as review candidates; decoding is opt-in.
    const encodedMatchers: Array<[RegExp, string]> = [
      [PERCENT_ENCODED_RE, 'percent-encoded'],
      [HEX_RUN_RE, 'hex-encoded'],
      [BASE64_RUN_RE, 'base64-encoded'],
    ];
    for (const [re, label] of encodedMatchers) {
      for (const match of ctx.text.matchAll(re)) {
        const value = match[0];
        if (value === undefined) continue;
        const start = match.index ?? 0;
        const decoded = ctx.options.decodeEncodedContent ? decodePreview(value) : null;
        const decodedLooksLikeInstruction =
          decoded !== null &&
          /(?:ignore|system prompt|instructions?|password|token|secret|curl|fetch|http)/i.test(
            decoded,
          );
        detections.push(
          makeDetection({
            detector: promptRiskDetector,
            subtype: `encoded-payload-${label}`,
            range: { start, end: start + value.length },
            text: ctx.text,
            severity: decodedLooksLikeInstruction ? 'high' : 'low',
            confidence: decodedLooksLikeInstruction ? 'medium' : 'low',
            maskKind: 'generic',
            explanation: decodedLooksLikeInstruction
              ? `${label} payload whose decoded preview contains instruction-like keywords. Decoded text is shown for review only and was never executed.`
              : `${label} run detected${decoded !== null ? ' — decoded preview available' : ' (decoding is off; enable it in scan options to inspect)'}. Encoded blobs sometimes hide instructions or secrets.`,
            remediation:
              'Inspect the decoded preview and remove the payload if you did not intend it.',
            evidence: `${value.length} chars${decoded !== null ? `, decoded: ${decoded.slice(0, 60)}` : ''}`,
          }),
        );
      }
    }

    return detections;
  },
};
