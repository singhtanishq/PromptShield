import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { DETECTOR_CATEGORIES } from '../lib/detection/types';
import type { DetectorCategory, ScanOptions } from '../lib/detection/types';
import type { PresetId } from '../lib/rules/presets';
import { PRESETS } from '../lib/rules/presets';

/* eslint-disable react-refresh/only-export-components -- context modules export the provider together with its hook */

/**
 * Persisted user preferences. ONLY non-sensitive preferences live here —
 * never prompt text, findings, or pseudonymization maps (see docs/PRIVACY.md).
 * The schema is versioned and defensively validated on load.
 */
export interface PersistedSettings {
  version: 1;
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  maxInputLength: number;
  localeHint: string;
  /** Active scan preset; 'custom' after manual category/sensitivity tweaks. */
  presetId: PresetId;
  sensitivity: ScanOptions['sensitivity'];
  categories: Record<DetectorCategory, boolean>;
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  theme: 'system',
  reducedMotion: false,
  maxInputLength: 50_000,
  localeHint: 'US',
  presetId: 'general',
  sensitivity: 'medium',
  categories: Object.fromEntries(DETECTOR_CATEGORIES.map((c) => [c, true])) as Record<
    DetectorCategory,
    boolean
  >,
};

export const MAX_INPUT_LENGTH_CHOICES = [10_000, 25_000, 50_000, 100_000, 200_000] as const;

export const LOCALE_HINTS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'EU', label: 'Europe (general)' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
] as const;

const STORAGE_KEY = 'promptshield.settings.v1';

function clampMaxLength(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const allowed: readonly number[] = MAX_INPUT_LENGTH_CHOICES;
  return allowed.includes(value) ? value : fallback;
}

function validateCategories(
  value: unknown,
  fallback: Record<DetectorCategory, boolean>,
): Record<DetectorCategory, boolean> {
  if (typeof value !== 'object' || value === null) return fallback;
  const obj = value as Record<string, unknown>;
  const merged = { ...fallback };
  for (const key of Object.keys(fallback) as DetectorCategory[]) {
    if (typeof obj[key] === 'boolean') merged[key] = obj[key] as boolean;
  }
  return merged;
}

function validatePresetId(value: unknown, fallback: PresetId): PresetId {
  if (typeof value === 'string' && (PRESETS.some((p) => p.id === value) || value === 'custom')) {
    return value as PresetId;
  }
  return fallback;
}

function validateSensitivity(
  value: unknown,
  fallback: ScanOptions['sensitivity'],
): ScanOptions['sensitivity'] {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function validate(raw: unknown): PersistedSettings {
  const fallback = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;
  return {
    version: 1,
    theme:
      obj.theme === 'light' || obj.theme === 'dark' || obj.theme === 'system'
        ? obj.theme
        : fallback.theme,
    reducedMotion: typeof obj.reducedMotion === 'boolean' ? obj.reducedMotion : false,
    maxInputLength: clampMaxLength(obj.maxInputLength, fallback.maxInputLength),
    localeHint: typeof obj.localeHint === 'string' ? obj.localeHint.slice(0, 8) : 'US',
    presetId: validatePresetId(obj.presetId, fallback.presetId),
    sensitivity: validateSensitivity(obj.sensitivity, fallback.sensitivity),
    categories: validateCategories(obj.categories, fallback.categories),
  };
}

function load(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    return validate(JSON.parse(raw));
  } catch {
    // Corrupt or unavailable storage: fall back to defaults silently.
    return { ...DEFAULT_SETTINGS };
  }
}

function save(settings: PersistedSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, quota) — preferences simply stay in memory.
  }
}

interface SettingsContextValue {
  settings: PersistedSettings;
  update: (patch: Partial<Omit<PersistedSettings, 'version'>>) => void;
  resetAll: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PersistedSettings>(load);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Apply theme + reduced-motion to <html>.
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (): void => {
      const prefersDark =
        settingsRef.current.theme === 'dark' ||
        (settingsRef.current.theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', prefersDark);
    };
    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('user-motion-reduce', settings.reducedMotion);
  }, [settings.reducedMotion]);

  const update = useCallback((patch: Partial<Omit<PersistedSettings, 'version'>>): void => {
    setSettings((prev) => {
      const next: PersistedSettings = { ...prev, ...patch, version: 1 };
      save(next);
      return next;
    });
  }, []);

  const resetAll = useCallback((): void => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, resetAll }),
    [settings, update, resetAll],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx === null) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
