import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/* eslint-disable react-refresh/only-export-components -- context module exports provider + hook */
import type { ReactNode } from 'react';
import type { UserRule } from '../../lib/detection/types';
import {
  loadRules,
  saveRules,
  validateRule,
  parseRulesJson,
  buildExport,
  newRuleDraft,
} from '../../lib/rules/schema';

/**
 * Custom-rule state, persisted to localStorage under promptshield.rules.v1
 * (local-only, disclosed in the UI). Rule contents are user-authored pattern
 * definitions and synthetic test cases — never prompt data.
 */
interface RulesContextValue {
  rules: UserRule[];
  createRule: (rule: UserRule) => void;
  updateRule: (rule: UserRule) => void;
  deleteRule: (id: string) => void;
  duplicateRule: (id: string) => void;
  toggleRule: (id: string) => void;
  importPreview: (json: string) => { rules: UserRule[]; errors: string[] };
  applyImport: (rules: UserRule[]) => { added: number; skipped: number };
  exportJson: () => string;
  draft: () => UserRule;
}

const RulesContext = createContext<RulesContextValue | null>(null);

export function RulesProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<UserRule[]>(loadRules);

  const persist = useCallback((next: UserRule[]): void => {
    setRules(next);
    saveRules(next);
  }, []);

  const createRule = useCallback(
    (rule: UserRule): void => {
      persist([...rules.slice(0, 49), rule]);
    },
    [rules, persist],
  );

  const updateRule = useCallback(
    (rule: UserRule): void => {
      persist(rules.map((r) => (r.id === rule.id ? rule : r)));
    },
    [rules, persist],
  );

  const deleteRule = useCallback(
    (id: string): void => {
      persist(rules.filter((r) => r.id !== id));
    },
    [rules, persist],
  );

  const duplicateRule = useCallback(
    (id: string): void => {
      const source = rules.find((r) => r.id === id);
      if (source === undefined) return;
      const now = new Date().toISOString();
      const copy: UserRule = {
        ...source,
        id: `rule-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
        name: `${source.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      };
      persist([...rules.slice(0, 49), copy]);
    },
    [rules, persist],
  );

  const toggleRule = useCallback(
    (id: string): void => {
      persist(
        rules.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() } : r,
        ),
      );
    },
    [rules, persist],
  );

  const importPreview = useCallback((json: string) => parseRulesJson(json), []);

  const applyImport = useCallback(
    (imported: UserRule[]): { added: number; skipped: number } => {
      let added = 0;
      let skipped = 0;
      const existingIds = new Set(rules.map((r) => r.id));
      const next = [...rules];
      for (const rule of imported) {
        if (next.length >= 50) {
          skipped += 1;
          continue;
        }
        // Re-validate each imported rule defensively before applying.
        const check = validateRule(rule);
        if (check.rule === undefined) {
          skipped += 1;
          continue;
        }
        if (existingIds.has(check.rule.id)) {
          skipped += 1;
          continue;
        }
        existingIds.add(check.rule.id);
        next.push(check.rule);
        added += 1;
      }
      persist(next);
      return { added, skipped };
    },
    [rules, persist],
  );

  const exportJson = useCallback(() => buildExport(rules), [rules]);

  const draft = useCallback(() => newRuleDraft(), []);

  const value = useMemo<RulesContextValue>(
    () => ({
      rules,
      createRule,
      updateRule,
      deleteRule,
      duplicateRule,
      toggleRule,
      importPreview,
      applyImport,
      exportJson,
      draft,
    }),
    [
      rules,
      createRule,
      updateRule,
      deleteRule,
      duplicateRule,
      toggleRule,
      importPreview,
      applyImport,
      exportJson,
      draft,
    ],
  );

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function useRules(): RulesContextValue {
  const ctx = useContext(RulesContext);
  if (ctx === null) throw new Error('useRules must be used within RulesProvider');
  return ctx;
}
