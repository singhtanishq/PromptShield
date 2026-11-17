import type { Detector } from './context';
import { emailDetector } from './detectors/email';
import { phoneDetector } from './detectors/phone';
import { networkDetector } from './detectors/network';
import { paymentCardDetector } from './detectors/payment-card';
import { ibanDetector, bankAccountDetector } from './detectors/financial-account';
import { governmentIdDetector } from './detectors/government-id';
import { secretsDetector } from './detectors/secrets';
import { credentialsDetector } from './detectors/credentials';
import { personalDataDetector } from './detectors/personal-data';
import { sensitiveContextDetector } from './detectors/sensitive-context';
import { promptRiskDetector } from './detectors/prompt-risk';
import { customRulesDetector } from './detectors/custom-rules';

/**
 * Ordered detector registry. Order affects time budgeting only — overlap
 * resolution is deterministic regardless of order. Built-in detectors are
 * read-only; the custom-rules entry executes user rules from local storage.
 */
const DETECTORS: readonly Detector[] = [
  emailDetector,
  phoneDetector,
  networkDetector,
  paymentCardDetector,
  ibanDetector,
  bankAccountDetector,
  governmentIdDetector,
  secretsDetector,
  credentialsDetector,
  personalDataDetector,
  sensitiveContextDetector,
  promptRiskDetector,
  customRulesDetector,
];

export function getDetectors(): readonly Detector[] {
  return DETECTORS;
}

export function getDetectorById(id: string): Detector | undefined {
  return DETECTORS.find((d) => d.id === id);
}
