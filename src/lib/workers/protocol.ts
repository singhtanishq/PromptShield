import type { ScanOptions, ScanResult, UserRule } from '../detection/types';

/**
 * Versioned, typed scan-worker protocol. Payloads never contain matched raw
 * values: detections carry masked previews and offsets only, and progress
 * messages carry counts/stage names only. Workers never log.
 */

export const WORKER_PROTOCOL_VERSION = 1 as const;

export interface ScanRequestMessage {
  type: 'SCAN_REQUEST';
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  scanId: string;
  text: string;
  options: ScanOptions;
}

export interface CancelScanMessage {
  type: 'CANCEL_SCAN';
  scanId: string;
}

export interface ValidateRuleMessage {
  type: 'VALIDATE_RULE';
  requestId: string;
  /** Synthetic test text only — never the user's current prompt. */
  testInput: string;
  rule: UserRule;
  shouldMatch: boolean;
}

export interface ValidateRuleBatchMessage {
  type: 'VALIDATE_RULE_BATCH';
  requestId: string;
  testInput: string;
  rules: UserRule[];
}

export interface ScanResultMessage {
  type: 'SCAN_RESULT';
  scanId: string;
  result: ScanResult;
}

export interface ScanErrorMessage {
  type: 'SCAN_ERROR';
  scanId: string;
  code: 'invalid-request' | 'too-large' | 'timeout' | 'worker-error';
  message: string;
}

export interface ScanCancelledMessage {
  type: 'SCAN_CANCELLED';
  scanId: string;
}

export interface RuleValidationResultMessage {
  type: 'RULE_VALIDATION_RESULT';
  requestId: string;
  results: Array<{
    ruleId: string;
    testIndex: number;
    expected: boolean;
    matched: boolean;
    error?: string;
  }>;
}

export interface ScanProgressMessage {
  type: 'SCAN_PROGRESS';
  scanId: string;
  stage: 'detect' | 'resolve';
  completed: number;
  total: number;
}

export type WorkerRequest =
  ScanRequestMessage | CancelScanMessage | ValidateRuleMessage | ValidateRuleBatchMessage;
export type WorkerResponse =
  | ScanResultMessage
  | ScanErrorMessage
  | ScanCancelledMessage
  | ScanProgressMessage
  | RuleValidationResultMessage;
