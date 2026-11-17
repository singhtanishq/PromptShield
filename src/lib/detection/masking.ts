/**
 * Masked preview builders. A preview may reveal enough structure to identify a
 * finding's type and let users distinguish two findings of the same type — never
 * enough to reconstruct the value. These strings are safe for UI, aria-labels,
 * and titles; raw matched values never reach any of them.
 */

const DOT = '•';

function lead(value: string, n: number): string {
  return value.slice(0, n);
}

function tail(value: string, n: number): string {
  return value.slice(-n);
}

function genericPreview(value: string): string {
  if (value.length <= 6) return `${DOT.repeat(Math.max(value.length, 3))}`;
  return `${lead(value, 2)}${DOT.repeat(6)}${tail(value, 2)} (${value.length} chars)`;
}

export type MaskKind =
  | 'email'
  | 'phone'
  | 'card'
  | 'iban'
  | 'government-id'
  | 'secret'
  | 'key-block'
  | 'name'
  | 'address'
  | 'url-with-credentials'
  | 'url'
  | 'ip'
  | 'date'
  | 'labeled-value'
  | 'generic';

/**
 * Build the safe preview for a matched value. Callers must pass only the
 * already-matched substring (not surrounding text) so nothing extra leaks.
 */
export function buildPreview(kind: MaskKind, value: string): string {
  switch (kind) {
    case 'email': {
      const at = value.indexOf('@');
      if (at <= 0) return genericPreview(value);
      const local = value.slice(0, at);
      const domain = value.slice(at + 1);
      const dot = domain.lastIndexOf('.');
      const tld = dot >= 0 ? domain.slice(dot) : '';
      const domainHead = dot >= 0 ? domain.slice(0, dot) : domain;
      return `${lead(local, 2)}${DOT.repeat(3)}@${lead(domainHead, 2)}${DOT.repeat(3)}${tld}`;
    }
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      return `+${DOT.repeat(3)} ${DOT.repeat(4)} ${tail(digits, 2)}`;
    }
    case 'card': {
      const digits = value.replace(/\D/g, '');
      return `${DOT.repeat(4)} ${DOT.repeat(4)} ${DOT.repeat(4)} ${tail(digits, 4)}`;
    }
    case 'iban': {
      const country = lead(value.replace(/\s/g, ''), 2);
      return `${country}${DOT.repeat(6)}${tail(value.replace(/\s/g, ''), 3)}`;
    }
    case 'government-id': {
      return `${lead(value, 2)}${DOT.repeat(5)}${tail(value, 2)}`;
    }
    case 'secret': {
      // Reveal only the structural prefix (e.g. "ghp_", "AKIA", "sk-") if present.
      const prefixMatch =
        /^(ghp_|gho_|ghs_|ghu_|github_pat_|glpat_|sk-|sk_live_|rk_live_|pk_live_|whsec_|AIza|AKIA|ASIA|xox[baprs]-|Bearer\s)/.exec(
          value,
        );
      const prefix = prefixMatch?.[0] ?? '';
      return `${prefix}${DOT.repeat(8)} (${value.length} chars)`;
    }
    case 'key-block': {
      const lines = value.split('\n').length;
      return `[${lead(value.replace(/-/g, ' ').trim(), 24)} — ${lines} lines]`;
    }
    case 'name': {
      const words = value.split(/\s+/);
      const first = words[0] ?? '';
      return `${lead(first, 12)}${first.length > 12 ? '…' : ''} ${DOT.repeat(3)}`;
    }
    case 'address':
      return `${lead(value, 8)}${DOT.repeat(4)}…`;
    case 'url-with-credentials': {
      const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//.exec(value);
      const scheme = schemeMatch?.[0] ?? '';
      const at = value.lastIndexOf('@');
      const hostPart = at >= 0 ? value.slice(at + 1) : value;
      return `${scheme}${DOT.repeat(2)}:${DOT.repeat(2)}@${lead(hostPart, 24)}`;
    }
    case 'url': {
      return `${lead(value, 32)}${value.length > 32 ? '…' : ''}`;
    }
    case 'ip': {
      return `${lead(value, 6)}${DOT.repeat(3)}`;
    }
    case 'date':
      return genericPreview(value);
    case 'labeled-value': {
      // Keep the label (e.g. "password="), mask the value.
      const eq = value.search(/[:=]/);
      if (eq < 0) return genericPreview(value);
      const label = value.slice(0, eq + 1).trimEnd();
      const rest = value.slice(eq + 1).replace(/^\s+/, '');
      const spaces = value.slice(eq + 1).length - rest.length;
      return `${label}${' '.repeat(spaces)}${DOT.repeat(4)}${tail(rest, 2)}`;
    }
    case 'generic':
    default:
      return genericPreview(value);
  }
}

/** Shannon entropy in bits per character — used as heuristic evidence, never as truth. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
