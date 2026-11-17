/// <reference lib="webworker" />
import { runScan } from '../detection/engine';
import { testUserRule } from '../detection/detectors/custom-rules';
import { WORKER_PROTOCOL_VERSION } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Scan worker: all regex execution over prompt text happens here, off the main
 * thread. Cancellation is cooperative (checked between detectors); the main
 * thread additionally hard-terminates this worker if a scan exceeds its time
 * budget, which is the ReDoS backstop for pathological user regexes.
 * This worker never logs message contents.
 */

const cancelledScanIds = new Set<string>();

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'CANCEL_SCAN') {
    cancelledScanIds.add(message.scanId);
    return;
  }

  if (message.type === 'VALIDATE_RULE') {
    const matched = testUserRule(message.rule, message.testInput);
    post({
      type: 'RULE_VALIDATION_RESULT',
      requestId: message.requestId,
      results: [
        {
          ruleId: message.rule.id,
          testIndex: 0,
          expected: message.shouldMatch,
          matched: matched.matched,
          error: matched.error,
        },
      ],
    });
    return;
  }

  if (message.type === 'VALIDATE_RULE_BATCH') {
    const results = message.rules.flatMap((rule) =>
      rule.tests.map((test, testIndex) => {
        const outcome = testUserRule(rule, test.text);
        return {
          ruleId: rule.id,
          testIndex,
          expected: test.shouldMatch,
          matched: outcome.matched,
          error: outcome.error,
        };
      }),
    );
    post({ type: 'RULE_VALIDATION_RESULT', requestId: message.requestId, results });
    return;
  }

  if (message.type === 'SCAN_REQUEST') {
    if (message.protocolVersion !== WORKER_PROTOCOL_VERSION) {
      post({
        type: 'SCAN_ERROR',
        scanId: message.scanId,
        code: 'invalid-request',
        message: 'Protocol version mismatch. Reload the page to update the worker.',
      });
      return;
    }
    if (cancelledScanIds.has(message.scanId)) {
      cancelledScanIds.delete(message.scanId);
      post({ type: 'SCAN_CANCELLED', scanId: message.scanId });
      return;
    }
    try {
      const result = runScan(
        message.text,
        message.options,
        {
          onProgress: (stage, completed, total) => {
            post({
              type: 'SCAN_PROGRESS',
              scanId: message.scanId,
              stage: stage === 'resolve' ? 'resolve' : 'detect',
              completed,
              total,
            });
          },
          isCancelled: () => cancelledScanIds.has(message.scanId),
        },
        message.scanId,
      );
      if (cancelledScanIds.has(message.scanId)) {
        cancelledScanIds.delete(message.scanId);
        post({ type: 'SCAN_CANCELLED', scanId: message.scanId });
        return;
      }
      post({ type: 'SCAN_RESULT', scanId: message.scanId, result });
    } catch (error) {
      post({
        type: 'SCAN_ERROR',
        scanId: message.scanId,
        code: 'worker-error',
        message: error instanceof Error ? 'Scan failed inside the worker.' : 'Scan failed.',
      });
    }
    return;
  }
};
