import { WORKER_PROTOCOL_VERSION } from './protocol';
import type {
  RuleValidationResultMessage,
  ScanProgressMessage,
  WorkerRequest,
  WorkerResponse,
} from './protocol';
import type { ScanOptions, ScanResult, UserRule } from '../detection/types';

/**
 * Main-thread client for the scan worker. Guarantees:
 * - stale scans are rejected (only the latest scan resolves);
 * - an in-flight scan can be cancelled (cooperative + stale rejection);
 * - a scan exceeding the hard timeout TERMINATES the worker (ReDoS backstop)
 *   and reports a safe error; a replacement worker is created on next use;
 * - nothing from the worker is logged.
 */

export const SCAN_HARD_TIMEOUT_MS = 10_000;

export type ScanClientState = 'idle' | 'scanning' | 'cancelled' | 'error';

export type ScanProgressHandler = (progress: Omit<ScanProgressMessage, 'type' | 'scanId'>) => void;

export interface ScanClient {
  scan: (
    text: string,
    options: ScanOptions,
    onProgress?: ScanProgressHandler,
  ) => Promise<ScanResult>;
  cancelActive: () => void;
  validateRule: (
    rule: UserRule,
    testInput: string,
  ) => Promise<RuleValidationResultMessage['results']>;
  terminate: () => void;
}

interface PendingScan {
  scanId: string;
  resolve: (result: ScanResult) => void;
  reject: (error: Error) => void;
  onProgress?: ScanProgressHandler;
  startedAt: number;
}

interface PendingValidation {
  requestId: string;
  resolve: (results: RuleValidationResultMessage['results']) => void;
}

let scanCounter = 0;

export function createScanClient(): ScanClient {
  let worker: Worker | null = null;
  let pendingScan: PendingScan | null = null;
  let pendingValidations = new Map<string, PendingValidation>();

  function spawn(): Worker {
    const next = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    next.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'SCAN_PROGRESS') {
        if (pendingScan !== null && pendingScan.scanId === message.scanId) {
          pendingScan.onProgress?.({
            stage: message.stage,
            completed: message.completed,
            total: message.total,
          });
        }
        return;
      }
      if (message.type === 'SCAN_RESULT') {
        if (pendingScan !== null && pendingScan.scanId === message.scanId) {
          const current = pendingScan;
          pendingScan = null;
          current.resolve(message.result);
        }
        return;
      }
      if (message.type === 'SCAN_CANCELLED') {
        if (pendingScan !== null && pendingScan.scanId === message.scanId) {
          const current = pendingScan;
          pendingScan = null;
          current.reject(new Error('cancelled'));
        }
        return;
      }
      if (message.type === 'SCAN_ERROR') {
        if (pendingScan !== null && pendingScan.scanId === message.scanId) {
          const current = pendingScan;
          pendingScan = null;
          current.reject(new Error(message.code === 'timeout' ? 'timeout' : message.message));
        }
        return;
      }
      if (message.type === 'RULE_VALIDATION_RESULT') {
        const pending = pendingValidations.get(message.requestId);
        if (pending !== undefined) {
          pendingValidations.delete(message.requestId);
          pending.resolve(message.results);
        }
        return;
      }
    };
    next.onerror = () => {
      // Worker crashed: fail the pending scan safely (never with content).
      if (pendingScan !== null) {
        const current = pendingScan;
        pendingScan = null;
        current.reject(new Error('worker-error'));
      }
      next.terminate();
      if (worker === next) worker = null;
    };
    return next;
  }

  function ensureWorker(): Worker {
    if (worker === null) worker = spawn();
    return worker;
  }

  function hardTimeoutGuard(pending: PendingScan): void {
    const elapsed = Date.now() - pending.startedAt;
    const remaining = SCAN_HARD_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      failWithTimeout(pending);
      return;
    }
    window.setTimeout(() => {
      if (pendingScan === pending && Date.now() - pending.startedAt >= SCAN_HARD_TIMEOUT_MS) {
        failWithTimeout(pending);
      }
    }, remaining + 10);
  }

  function failWithTimeout(pending: PendingScan): void {
    // Hard-terminate the worker: the only reliable backstop against a
    // pathological regex stuck in a sync loop. Content stays inside the
    // dying worker; nothing is logged.
    worker?.terminate();
    worker = null;
    pendingScan = null;
    pending.reject(new Error('timeout'));
  }

  return {
    scan(text, options, onProgress) {
      // A new scan supersedes any in-flight one; the old promise rejects so
      // its caller can drop the stale result.
      if (pendingScan !== null) {
        const stale = pendingScan;
        pendingScan = null;
        stale.reject(new Error('superseded'));
        worker?.postMessage({ type: 'CANCEL_SCAN', scanId: stale.scanId } satisfies WorkerRequest);
      }
      scanCounter += 1;
      const scanId = `scan-${scanCounter}-${Math.random().toString(36).slice(2, 8)}`;
      const current: PendingScan = {
        scanId,
        resolve: () => {},
        reject: () => {},
        onProgress,
        startedAt: Date.now(),
      };
      const promise = new Promise<ScanResult>((resolve, reject) => {
        current.resolve = resolve;
        current.reject = reject;
      });
      pendingScan = current;
      const activeWorker = ensureWorker();
      activeWorker.postMessage({
        type: 'SCAN_REQUEST',
        protocolVersion: WORKER_PROTOCOL_VERSION,
        scanId,
        text,
        options,
      } satisfies WorkerRequest);
      hardTimeoutGuard(current);
      return promise;
    },

    cancelActive() {
      if (pendingScan !== null) {
        const current = pendingScan;
        worker?.postMessage({
          type: 'CANCEL_SCAN',
          scanId: current.scanId,
        } satisfies WorkerRequest);
      }
    },

    validateRule(rule, testInput) {
      const requestId = `rule-val-${Math.random().toString(36).slice(2, 10)}`;
      const promise = new Promise<RuleValidationResultMessage['results']>((resolve) => {
        pendingValidations.set(requestId, { requestId, resolve });
      });
      ensureWorker().postMessage({
        type: 'VALIDATE_RULE',
        requestId,
        testInput,
        rule,
        shouldMatch: true,
      } satisfies WorkerRequest);
      return promise;
    },

    terminate() {
      worker?.terminate();
      worker = null;
      if (pendingScan !== null) {
        const current = pendingScan;
        pendingScan = null;
        current.reject(new Error('worker-terminated'));
      }
      for (const pending of pendingValidations.values()) {
        pending.resolve([]);
      }
      pendingValidations = new Map();
    },
  };
}
