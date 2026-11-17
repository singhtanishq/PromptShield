import type { DetectorCategory } from '../detection/types';
import type { ScanOptions } from '../detection/types';

/**
 * Scan presets. Presets toggle categories and sensitivity only — they never
 * modify the prompt or apply redactions. "Custom" is the state after manual
 * category/sensitivity tweaks.
 */
export type PresetId = 'general' | 'developer' | 'work' | 'financial' | 'minimal' | 'custom';

export interface PresetDefinition {
  id: PresetId;
  label: string;
  description: string;
  sensitivity: ScanOptions['sensitivity'];
  categories: Record<DetectorCategory, boolean>;
}

const ALL: DetectorCategory[] = [
  'contact',
  'personal',
  'financial',
  'secrets',
  'internal',
  'prompt-risk',
  'custom',
];

function categories(enabled: DetectorCategory[]): Record<DetectorCategory, boolean> {
  return Object.fromEntries(ALL.map((c) => [c, enabled.includes(c)])) as Record<
    DetectorCategory,
    boolean
  >;
}

export const PRESETS: PresetDefinition[] = [
  {
    id: 'general',
    label: 'General Personal Privacy',
    description:
      'Balanced scan for everyday prompts: contact details, personal data, common secrets.',
    sensitivity: 'medium',
    categories: categories([
      'contact',
      'personal',
      'financial',
      'secrets',
      'internal',
      'prompt-risk',
      'custom',
    ]),
  },
  {
    id: 'developer',
    label: 'Developer / API Secrets',
    description: 'Focus on tokens, keys, connection strings, and internal endpoints.',
    sensitivity: 'high',
    categories: categories(['contact', 'secrets', 'internal', 'prompt-risk', 'custom']),
  },
  {
    id: 'work',
    label: 'Work / Confidential Context',
    description: 'Internal hosts, confidential labels, customer references, plus core PII.',
    sensitivity: 'medium',
    categories: categories(['contact', 'personal', 'secrets', 'internal', 'prompt-risk', 'custom']),
  },
  {
    id: 'financial',
    label: 'Financial Details',
    description: 'Cards, IBANs, account references, plus identity documents.',
    sensitivity: 'high',
    categories: categories([
      'contact',
      'personal',
      'financial',
      'secrets',
      'prompt-risk',
      'custom',
    ]),
  },
  {
    id: 'minimal',
    label: 'Minimal Scan',
    description: 'Only high-confidence contact and secret detection. Fewest flags.',
    sensitivity: 'low',
    categories: categories(['contact', 'secrets', 'custom']),
  },
];

export function presetById(id: PresetId): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === id);
}
