import type { PersistedSettings } from '../app/settings';
import { DEFAULT_SETTINGS, MAX_INPUT_LENGTH_CHOICES, LOCALE_HINTS } from '../app/settings';
import type { UserRule, DetectorCategory } from './detection/types';
import type { PresetId } from './rules/presets';
import { PRESETS } from './rules/presets';
import { DETECTOR_CATEGORIES } from './detection/types';
import type { RulesFile } from './rules/schema';

/**
 * Settings export/import. Exports contain ONLY user preferences and rule
 * definitions — never prompt text, findings, allowlist entries, or the
 * pseudonymization map (those live in memory and are never exported).
 */
export interface SettingsFile {
  kind: 'promptshield-settings';
  version: 1;
  exportedAt: string;
  settings: {
    theme: PersistedSettings['theme'];
    reducedMotion: boolean;
    maxInputLength: number;
    localeHint: string;
    presetId: PresetId;
    sensitivity: PersistedSettings['sensitivity'];
    categories: Record<string, boolean>;
  };
  rules: UserRule[];
}

export type ImportResult =
  | {
      ok: true;
      settings: Omit<PersistedSettings, 'version'>;
      rules: UserRule[];
      warnings: string[];
    }
  | { ok: false; error: string };

export function buildSettingsExport(settings: PersistedSettings, rules: UserRule[]): string {
  const file: SettingsFile = {
    kind: 'promptshield-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      theme: settings.theme,
      reducedMotion: settings.reducedMotion,
      maxInputLength: settings.maxInputLength,
      localeHint: settings.localeHint,
      presetId: settings.presetId,
      sensitivity: settings.sensitivity,
      categories: settings.categories,
    },
    rules,
  };
  return JSON.stringify(file, null, 2);
}

/** Validate an imported settings file defensively; return the patch to apply. */
export function parseSettingsImport(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Unexpected file structure.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.kind !== 'promptshield-settings' || obj.version !== 1) {
    return {
      ok: false,
      error: 'This is not a PromptShield settings export (missing kind/version).',
    };
  }
  const warnings: string[] = [];
  const rawSettings = (
    typeof obj.settings === 'object' && obj.settings !== null ? obj.settings : {}
  ) as Record<string, unknown>;

  // Settings
  const theme =
    rawSettings.theme === 'light' || rawSettings.theme === 'dark' || rawSettings.theme === 'system'
      ? rawSettings.theme
      : DEFAULT_SETTINGS.theme;
  const reducedMotion =
    typeof rawSettings.reducedMotion === 'boolean' ? rawSettings.reducedMotion : false;
  const maxInputLength =
    typeof rawSettings.maxInputLength === 'number' &&
    (MAX_INPUT_LENGTH_CHOICES as readonly number[]).includes(rawSettings.maxInputLength)
      ? rawSettings.maxInputLength
      : DEFAULT_SETTINGS.maxInputLength;
  const localeHint = LOCALE_HINTS.some((l) => l.value === rawSettings.localeHint)
    ? (rawSettings.localeHint as string)
    : DEFAULT_SETTINGS.localeHint;
  const presetId =
    PRESETS.some((p) => p.id === rawSettings.presetId) || rawSettings.presetId === 'custom'
      ? (rawSettings.presetId as PresetId)
      : DEFAULT_SETTINGS.presetId;
  const sensitivity =
    rawSettings.sensitivity === 'low' ||
    rawSettings.sensitivity === 'medium' ||
    rawSettings.sensitivity === 'high'
      ? rawSettings.sensitivity
      : DEFAULT_SETTINGS.sensitivity;
  const categories = { ...DEFAULT_SETTINGS.categories };
  if (typeof rawSettings.categories === 'object' && rawSettings.categories !== null) {
    const rawCategories = rawSettings.categories as Record<string, unknown>;
    for (const key of DETECTOR_CATEGORIES as readonly DetectorCategory[]) {
      if (typeof rawCategories[key] === 'boolean') categories[key] = rawCategories[key] as boolean;
    }
  }

  // Rules (reuse the rules validator through structural check only; caller applies)
  const rulesRaw = Array.isArray(obj.rules) ? obj.rules : [];
  const rulesValid = rulesRaw.every((r) => typeof r === 'object' && r !== null);
  if (!rulesValid) warnings.push('Some rule entries were malformed and will be skipped.');
  const rules = rulesValid ? (rulesRaw as UserRule[]) : [];

  return {
    ok: true,
    settings: {
      theme,
      reducedMotion,
      maxInputLength,
      localeHint,
      presetId,
      sensitivity,
      categories,
    },
    rules,
    warnings,
  };
}

/** Internal helper re-export for tests. */
export type { RulesFile };
