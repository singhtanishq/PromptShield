/**
 * Session-scoped pseudonymization map. The reverse map (placeholder → value)
 * is extremely sensitive: it lives in volatile memory only, is never persisted
 * to any storage, never included in exports, and can be forgotten explicitly.
 * See docs/PRIVACY.md for the lifecycle contract.
 */
export interface PseudonymEntry {
  placeholder: string;
  /** Masked hint for UI display — never the raw value. */
  preview: string;
  category: string;
  createdAt: number;
}

const CATEGORY_PREFIX: Record<string, string> = {
  personal: 'PERSON',
  contact: 'CONTACT',
  financial: 'ACCOUNT',
  secrets: 'SECRET',
  internal: 'INTERNAL',
  custom: 'ENTITY',
  'prompt-risk': 'FLAGGED',
};

export class PseudonymStore {
  /** key: `${category}:${subtype}:${value}` — values never leave this map except via re-identify. */
  private forward: Map<string, PseudonymEntry> = new Map();
  private reverse: Map<string, string> = new Map(); // placeholder -> key
  private counters: Map<string, number> = new Map();

  /** Deterministic within one session: repeated values reuse the same placeholder. */
  pseudonymize(category: string, subtype: string, value: string, preview: string): string {
    const key = `${category}:${subtype}:${value}`;
    const existing = this.forward.get(key);
    if (existing !== undefined) return existing.placeholder;
    const prefix = CATEGORY_PREFIX[category] ?? 'ENTITY';
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    const placeholder = `[${prefix}_${next}]`;
    this.forward.set(key, { placeholder, preview, category, createdAt: Date.now() });
    this.reverse.set(placeholder, key);
    return placeholder;
  }

  get size(): number {
    return this.forward.size;
  }

  get isEmpty(): boolean {
    return this.forward.size === 0;
  }

  /** All entries with masked previews only (for the session indicator UI). */
  entries(): PseudonymEntry[] {
    return [...this.forward.values()];
  }

  /** Forget the entire mapping — irreversible by design. */
  forgetAll(): void {
    this.forward.clear();
    this.reverse.clear();
    this.counters.clear();
  }

  /**
   * Local re-identification: replaces placeholders back with their original
   * values in the given text. Operates only on the caller-provided string,
   * in memory, and requires the mapping to still exist (session-scoped).
   */
  reidentify(text: string): { text: string; replaced: number } {
    let output = text;
    let count = 0;
    // Sort placeholders by length descending so PERSON_10 replaces before PERSON_1.
    const placeholders = [...this.reverse.keys()].sort((a, b) => b.length - a.length);
    for (const placeholder of placeholders) {
      if (!output.includes(placeholder)) continue;
      const key = this.reverse.get(placeholder);
      if (key === undefined) continue;
      // Key format: `${category}:${subtype}:${value}` — the value is everything
      // after the second colon (values themselves may contain colons).
      const first = key.indexOf(':');
      const second = key.indexOf(':', first + 1);
      if (first < 0 || second < 0) continue;
      const original = key.slice(second + 1);
      output = output.split(placeholder).join(original);
      count += 1;
    }
    return { text: output, replaced: count };
  }
}

export function newPseudonymStore(): PseudonymStore {
  return new PseudonymStore();
}
