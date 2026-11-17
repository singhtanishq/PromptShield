import { makeDetection, sensitivityAllows } from '../context';
import type { Detector, ScanContext } from '../context';
import type { Detection } from '../types';

/**
 * Personal data beyond contact info: person names (deliberately conservative
 * local heuristics — honorifics and explicit labels, never full NER claims),
 * postal addresses via context keywords, and labeled dates of birth / ages.
 */

// Honorific + 1-3 capitalized words.
const HONORIFIC_NAME_RE =
  /(?<![\w])(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Prof\.|Sir|Madam|Rev)\.?\s+([A-Z][a-z''-]+(?:\s+[A-Z][a-z''-]+){0,2})(?![\w])/g;

// Explicit labels: "Customer: Sofia Reyes", "name: …", "attendee Jordan Ellis", "signed, …"
const LABELED_NAME_RE =
  /(?<=^|\n)(?:[Cc]ustomer|[Cc]lient|[Aa]ttendee|[Cc]ontact|[Ff]rom|[Tt]o|[Aa]ttn|[Ss]igned|[Ee]mployee|[Mm]anager|[Ll]ead|[Nn]ame)\s*[:-]\s*([A-Z][a-z''-]+(?:\s+[A-Z][a-z''-]+){1,2})(?![\w])/g;

// Street-address shape: number + street-name words + street-type suffix.
const STREET_ADDRESS_RE =
  /(?<![\w])(\d{1,6}\s+(?:[A-Z][a-z]+\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Terrace|Place|Pl|Square|Sq|Alley|Parkway)\b\.?)/g;

// City, ST 12345 (US-style) — only flagged near address context.
const CITY_STATE_ZIP_RE = /(?<![\w])([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}\s+\d{5})(?![\w])/g;

const ADDRESS_CONTEXT =
  /\b(address|street|apt|apartment|suite|zip|postal|live[sd]? at|located at|address:)\b/i;

// DOB labeled forms.
const DOB_RE =
  /(?<=^|\n|\b)(?:dob|date of birth|birthday|born(?: on|:)?|birth date)\s*[:-]?\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}))(?![\w])/gi;

// Age explicitly labeled with an out-of-range guard.
const AGE_RE = /(?<=^|\n|\b)(?:age|aged)\s*[:-]?\s*(\d{1,3})(?![\w])/gi;

function capitalizedWordsOnly(value: string): boolean {
  const words = value.split(/\s+/);
  return words.length >= 2 && words.every((w) => /^[A-Z][a-z''-]+$/.test(w));
}

export const personalDataDetector: Detector = {
  id: 'personal-data',
  version: '1.0.0',
  category: 'personal',
  label: 'Personal data',
  run(ctx: ScanContext): Detection[] {
    const detections: Detection[] = [];

    // Names via honorifics.
    if (sensitivityAllows(ctx.sensitivity, 'medium')) {
      for (const match of ctx.text.matchAll(HONORIFIC_NAME_RE)) {
        const name = match[1];
        if (name === undefined || !capitalizedWordsOnly(name)) continue;
        const start = (match.index ?? 0) + match[0].indexOf(name);
        detections.push(
          makeDetection({
            detector: personalDataDetector,
            subtype: 'person-name-honorific',
            range: { start, end: start + name.length },
            text: ctx.text,
            severity: 'medium',
            confidence: 'medium',
            maskKind: 'name',
            explanation:
              'Name following an honorific (Mr/Ms/Dr/…). Heuristic local pattern — not a language model; it can miss names without honorifics and rarely misfires on capitalized titles.',
            remediation:
              'Replace with a pseudonym placeholder ([PERSON_1]) to keep context while removing the real name.',
            evidence: `${name.split(/\s+/).length} capitalized words after honorific`,
          }),
        );
      }

      // Names via explicit labels.
      for (const match of ctx.text.matchAll(LABELED_NAME_RE)) {
        const name = match[1];
        if (name === undefined || !capitalizedWordsOnly(name)) continue;
        const start = (match.index ?? 0) + match[0].lastIndexOf(name);
        detections.push(
          makeDetection({
            detector: personalDataDetector,
            subtype: 'person-name-labeled',
            range: { start, end: start + name.length },
            text: ctx.text,
            severity: 'medium',
            confidence: 'medium',
            maskKind: 'name',
            explanation:
              'Name following an explicit label (customer/attendee/from/…). Heuristic — verify it is actually a person before redacting.',
            remediation: 'Replace with [PERSON_1] if it is a person.',
            evidence: 'capitalized words after a person label',
          }),
        );
      }
    }

    // Street addresses.
    for (const match of ctx.text.matchAll(STREET_ADDRESS_RE)) {
      const value = match[1];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: personalDataDetector,
          subtype: 'street-address',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'medium',
          confidence: 'medium',
          maskKind: 'address',
          explanation:
            'Street-address shape (house number + street-name words + street-type suffix).',
          remediation:
            'Replace with [ADDRESS_1] or reduce to city-level detail if location matters.',
          evidence: 'street-suffix pattern',
        }),
      );
    }

    // City/state/zip only when address context is nearby.
    for (const match of ctx.text.matchAll(CITY_STATE_ZIP_RE)) {
      const value = match[1];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      const surrounding = ctx.text.slice(Math.max(0, start - 200), start + value.length + 200);
      if (!ADDRESS_CONTEXT.test(surrounding)) continue;
      detections.push(
        makeDetection({
          detector: personalDataDetector,
          subtype: 'city-state-zip',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'low',
          confidence: 'medium',
          maskKind: 'address',
          explanation:
            'City, two-letter state and ZIP near an address keyword — part of a postal address.',
          remediation: 'Replace with [ADDRESS_1] if full precision is unnecessary.',
        }),
      );
    }

    // DOB.
    for (const match of ctx.text.matchAll(DOB_RE)) {
      const value = match[0];
      if (value === undefined) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: personalDataDetector,
          subtype: 'date-of-birth',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'high',
          confidence: 'high',
          maskKind: 'labeled-value',
          explanation: 'A date explicitly labeled as a date of birth (DOB/birthday/born on).',
          remediation:
            'Replace with [DOB_1] or an age range if the assistant needs it for eligibility logic.',
          evidence: 'DOB label + date',
        }),
      );
    }

    // Age.
    for (const match of ctx.text.matchAll(AGE_RE)) {
      const value = match[0];
      const age = match[1];
      if (value === undefined || age === undefined) continue;
      const n = Number(age);
      if (n === 0 || n > 129) continue;
      const start = match.index ?? 0;
      detections.push(
        makeDetection({
          detector: personalDataDetector,
          subtype: 'age',
          range: { start, end: start + value.length },
          text: ctx.text,
          severity: 'low',
          confidence: 'medium',
          maskKind: 'labeled-value',
          explanation:
            'An explicitly labeled age — quasi-identifier when combined with other details.',
          remediation: 'Consider an age range like "30s" if exact age is unnecessary.',
        }),
      );
    }

    return detections;
  },
};
