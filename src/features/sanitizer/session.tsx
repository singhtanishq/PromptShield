import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/* eslint-disable react-refresh/only-export-components -- context module exports provider + hook */
import type { ReactNode } from 'react';
import type { ScanResult } from '../../lib/detection/types';
import type { ScanClient } from '../../lib/workers/client';
import { createScanClient } from '../../lib/workers/client';
import type { ScanOptions } from '../../lib/detection/types';

/**
 * Sanitizer session state. PRIVACY: the prompt text, findings, allowlist, and
 * any redaction state live ONLY in this in-memory provider. Nothing here
 * touches localStorage, IndexedDB, sessionStorage, or the network.
 */
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error' | 'cancelled';

export interface ScanSessionState {
  status: ScanStatus;
  /** Sanitized error description — never includes prompt content. */
  error: string | null;
  progress: { completed: number; total: number } | null;
}

interface SessionContextValue {
  /** The prompt text, held in memory only for this browser tab session. */
  text: string;
  setText: (text: string) => void;
  hasText: boolean;
  scan: ScanSessionState;
  result: ScanResult | null;
  /** Finding ids marked "not sensitive" for this session. */
  ignoredIds: string[];
  /** Session-scoped allowlist of exact values (never persisted, never exported). */
  allowlist: string[];
  startScan: (options: ScanOptions) => Promise<void>;
  cancelScan: () => void;
  clearScan: () => void;
  ignoreFinding: (findingId: string) => void;
  clearIgnored: () => void;
  allowlistValue: (value: string) => void;
  removeFromAllowlist: (value: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const IDLE_SCAN: ScanSessionState = { status: 'idle', error: null, progress: null };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [text, setTextState] = useState('');
  const [scan, setScan] = useState<ScanSessionState>(IDLE_SCAN);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const clientRef = useRef<ScanClient | null>(null);

  const getClient = useCallback((): ScanClient => {
    if (clientRef.current === null) clientRef.current = createScanClient();
    return clientRef.current;
  }, []);

  // Editing text invalidates the current scan.
  const setText = useCallback((next: string): void => {
    setTextState(next);
    setResult(null);
    setScan(IDLE_SCAN);
    setIgnoredIds([]);
  }, []);

  const startScan = useCallback(
    async (options: ScanOptions): Promise<void> => {
      const currentText = text;
      if (currentText.length === 0) return;
      const client = getClient();
      setIgnoredIds([]);
      setScan({ status: 'scanning', error: null, progress: null });
      try {
        const scanResult = await client.scan(currentText, options, (progress) => {
          setScan((prev) =>
            prev.status === 'scanning'
              ? { ...prev, progress: { completed: progress.completed, total: progress.total } }
              : prev,
          );
        });
        setResult(scanResult);
        setScan({ status: 'done', error: null, progress: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        if (message === 'cancelled' || message === 'superseded') {
          setScan({ status: 'cancelled', error: null, progress: null });
        } else if (message === 'timeout') {
          setScan({
            status: 'error',
            error:
              'The scan took too long and was stopped safely. Try a shorter prompt, or check custom rules for expensive patterns.',
            progress: null,
          });
        } else {
          setScan({
            status: 'error',
            error:
              'The scan could not complete. Your text was not sent anywhere — try scanning again.',
            progress: null,
          });
        }
      }
    },
    [text, getClient],
  );

  const cancelScan = useCallback((): void => {
    clientRef.current?.cancelActive();
    setScan((prev) =>
      prev.status === 'scanning' ? { status: 'cancelled', error: null, progress: null } : prev,
    );
  }, []);

  const clearScan = useCallback((): void => {
    setResult(null);
    setScan(IDLE_SCAN);
    setIgnoredIds([]);
  }, []);

  const ignoreFinding = useCallback((findingId: string): void => {
    setIgnoredIds((prev) => (prev.includes(findingId) ? prev : [...prev, findingId]));
  }, []);

  const clearIgnored = useCallback((): void => {
    setIgnoredIds([]);
  }, []);

  const allowlistValue = useCallback((value: string): void => {
    setAllowlist((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }, []);

  const removeFromAllowlist = useCallback((value: string): void => {
    setAllowlist((prev) => prev.filter((v) => v !== value));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      text,
      setText,
      hasText: text.length > 0,
      scan,
      result,
      ignoredIds,
      allowlist,
      startScan,
      cancelScan,
      clearScan,
      ignoreFinding,
      clearIgnored,
      allowlistValue,
      removeFromAllowlist,
    }),
    [
      text,
      setText,
      scan,
      result,
      ignoredIds,
      allowlist,
      startScan,
      cancelScan,
      clearScan,
      ignoreFinding,
      clearIgnored,
      allowlistValue,
      removeFromAllowlist,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
