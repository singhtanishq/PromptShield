import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/* eslint-disable react-refresh/only-export-components -- context module exports provider + hook */
import type { ReactNode } from 'react';
import type { RedactionDecision, ScanResult, ScanOptions } from '../../lib/detection/types';
import type { ScanClient } from '../../lib/workers/client';
import { createScanClient } from '../../lib/workers/client';
import { PseudonymStore } from '../../lib/redaction/pseudonyms';

/**
 * Sanitizer session state. PRIVACY: the prompt text, findings, decisions, the
 * pseudonymization map, and the allowlist live ONLY in this in-memory provider.
 * Nothing here touches localStorage, IndexedDB, sessionStorage, or the network.
 * The pseudonym store is volatile by design — "Forget mapping" and closing the
 * tab are the only ways it clears (see docs/PRIVACY.md).
 */
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error' | 'cancelled';

export interface ScanSessionState {
  status: ScanStatus;
  /** Sanitized error description — never includes prompt content. */
  error: string | null;
  progress: { completed: number; total: number } | null;
}

interface DecisionState {
  current: RedactionDecision[];
  past: RedactionDecision[][];
  future: RedactionDecision[][];
}

const EMPTY_DECISIONS: DecisionState = { current: [], past: [], future: [] };

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
  /** Ordered redaction decisions applied on top of the current scan. */
  decisions: RedactionDecision[];
  canUndo: boolean;
  canRedo: boolean;
  /** True when a reversible pseudonym mapping exists in memory. */
  hasPseudonymMap: boolean;
  pseudonymCount: number;
  startScan: (options: ScanOptions) => Promise<void>;
  cancelScan: () => void;
  clearScan: () => void;
  ignoreFinding: (findingId: string) => void;
  clearIgnored: () => void;
  allowlistValue: (value: string) => void;
  removeFromAllowlist: (value: string) => void;
  /** Record (or replace) the decision for one finding. */
  decide: (decision: RedactionDecision) => void;
  /** Remove the decision for one finding (per-finding undo). */
  undecide: (findingId: string) => void;
  /** Replace all decisions at once (bulk actions). */
  setDecisions: (next: RedactionDecision[]) => void;
  undo: () => void;
  redo: () => void;
  forgetPseudonyms: () => void;
  /** Local re-identification of the given text using the session map. */
  reidentify: (value: string) => { text: string; replaced: number };
  /** Access the volatile pseudonym store for redaction application. */
  getPseudonymStore: () => PseudonymStore;
  /** Clear everything in memory: text, scan, decisions, mapping, allowlist. */
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const IDLE_SCAN: ScanSessionState = { status: 'idle', error: null, progress: null };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [text, setTextState] = useState('');
  const [scan, setScan] = useState<ScanSessionState>(IDLE_SCAN);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [decisionState, setDecisionState] = useState<DecisionState>(EMPTY_DECISIONS);
  const [pseudonymVersion, setPseudonymVersion] = useState(0);
  const clientRef = useRef<ScanClient | null>(null);
  const pseudonymsRef = useRef<PseudonymStore>(new PseudonymStore());

  const getClient = useCallback((): ScanClient => {
    if (clientRef.current === null) clientRef.current = createScanClient();
    return clientRef.current;
  }, []);

  // Editing text invalidates the scan, decisions, and pseudonym mapping
  // (offsets no longer refer to the same document).
  const setText = useCallback((next: string): void => {
    setTextState(next);
    setResult(null);
    setScan(IDLE_SCAN);
    setIgnoredIds([]);
    setDecisionState(EMPTY_DECISIONS);
    pseudonymsRef.current.forgetAll();
    setPseudonymVersion((v) => v + 1);
  }, []);

  const startScan = useCallback(
    async (options: ScanOptions): Promise<void> => {
      const currentText = text;
      if (currentText.length === 0) return;
      const client = getClient();
      setIgnoredIds([]);
      setDecisionState(EMPTY_DECISIONS);
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
    setDecisionState(EMPTY_DECISIONS);
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

  const decide = useCallback((decision: RedactionDecision): void => {
    setDecisionState((prev) => ({
      current: [...prev.current.filter((d) => d.findingId !== decision.findingId), decision],
      past: [...prev.past.slice(-49), prev.current],
      future: [],
    }));
  }, []);

  const undecide = useCallback((findingId: string): void => {
    setDecisionState((prev) => ({
      current: prev.current.filter((d) => d.findingId !== findingId),
      past: [...prev.past.slice(-49), prev.current],
      future: [],
    }));
  }, []);

  const setDecisions = useCallback((next: RedactionDecision[]): void => {
    setDecisionState((prev) => ({
      current: next,
      past: [...prev.past.slice(-49), prev.current],
      future: [],
    }));
  }, []);

  const undo = useCallback((): void => {
    setDecisionState((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1]!;
      return {
        current: previous,
        past: prev.past.slice(0, -1),
        future: [prev.current, ...prev.future].slice(0, 50),
      };
    });
  }, []);

  const redo = useCallback((): void => {
    setDecisionState((prev) => {
      if (prev.future.length === 0) return prev;
      const [next, ...restFuture] = prev.future;
      return {
        current: next ?? [],
        past: [...prev.past, prev.current],
        future: restFuture,
      };
    });
  }, []);

  const forgetPseudonyms = useCallback((): void => {
    pseudonymsRef.current.forgetAll();
    setPseudonymVersion((v) => v + 1);
  }, []);

  const reidentify = useCallback((value: string): { text: string; replaced: number } => {
    return pseudonymsRef.current.reidentify(value);
  }, []);

  const clearSession = useCallback((): void => {
    setTextState('');
    setResult(null);
    setScan(IDLE_SCAN);
    setIgnoredIds([]);
    setAllowlist([]);
    setDecisionState(EMPTY_DECISIONS);
    pseudonymsRef.current.forgetAll();
    setPseudonymVersion((v) => v + 1);
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
      decisions: decisionState.current,
      canUndo: decisionState.past.length > 0,
      canRedo: decisionState.future.length > 0,
      hasPseudonymMap: !pseudonymsRef.current.isEmpty,
      pseudonymCount: pseudonymsRef.current.size,
      startScan,
      cancelScan,
      clearScan,
      ignoreFinding,
      clearIgnored,
      allowlistValue,
      removeFromAllowlist,
      decide,
      undecide,
      setDecisions,
      undo,
      redo,
      forgetPseudonyms,
      reidentify,
      getPseudonymStore: () => pseudonymsRef.current,
      clearSession,
    }),
    // pseudonymVersion is intentionally included: it forces the context value to
    // update when the mutable pseudonym store changes (the store itself is a ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      text,
      setText,
      scan,
      result,
      ignoredIds,
      allowlist,
      decisionState,
      pseudonymVersion,
      startScan,
      cancelScan,
      clearScan,
      ignoreFinding,
      clearIgnored,
      allowlistValue,
      removeFromAllowlist,
      decide,
      undecide,
      setDecisions,
      undo,
      redo,
      forgetPseudonyms,
      reidentify,
      clearSession,
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
