import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/* eslint-disable react-refresh/only-export-components -- context modules export the provider together with its hook */

/**
 * Sanitizer session state. PRIVACY: the prompt text, future findings, and any
 * redaction state live ONLY in this in-memory provider. Nothing here touches
 * localStorage, IndexedDB, sessionStorage, or the network.
 */
interface SessionContextValue {
  /** The prompt text, held in memory only for this browser tab session. */
  text: string;
  setText: (text: string) => void;
  hasText: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState('');

  const value = useMemo<SessionContextValue>(
    () => ({
      text,
      setText,
      hasText: text.length > 0,
    }),
    [text],
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
