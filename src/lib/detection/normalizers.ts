/**
 * Format validation helpers. These improve confidence heuristics — a checksum
 * pass never proves a value is real, current, or belongs to anyone. Detectors
 * label this honestly: "passes Luhn checksum" is structural evidence only.
 */

/** Luhn checksum for payment-card-like numbers. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** IBAN mod-97 checksum (ISO 13616). Input should already be whitespace-free. */
export function ibanValid(value: string): boolean {
  const cleaned = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) return false;
  const reordered = cleaned.slice(4) + cleaned.slice(0, 4);
  let remainder = 0;
  for (const ch of reordered) {
    if (ch >= 'A' && ch <= 'Z') {
      const code = ch.charCodeAt(0) - 55; // two-digit value, e.g. W = 32
      remainder = (remainder * 100 + code) % 97;
    } else if (ch >= '0' && ch <= '9') {
      remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
    } else {
      return false;
    }
  }
  return remainder === 1;
}

export function isIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false; // no leading zeros
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/** Conservative IPv6 validator: handles ::-compressed and full forms. */
export function isIPv6(value: string): boolean {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  if (!value.includes(':')) return false;
  const doubleColonCount = (value.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return false;
  const parts = value.split('::');
  if (parts.length > 2) return false;
  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups = segment.split(':');
    const nums: number[] = [];
    for (const g of groups) {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
      nums.push(parseInt(g, 16));
    }
    return nums;
  };
  const head = parseGroups(parts[0] ?? '');
  if (head === null) return false;
  const tail = parts.length === 2 ? parseGroups(parts[1] ?? '') : [];
  if (tail === null) return false;
  const total = head.length + tail.length;
  if (parts.length === 2) {
    if (total > 7) return false;
    return true;
  }
  return total === 8;
}

export type IPv4Scope = 'public' | 'private' | 'loopback' | 'link-local' | 'reserved';

export function ipv4Scope(value: string): IPv4Scope {
  const parts = value.split('.').map(Number);
  const [a, b] = [parts[0] ?? -1, parts[1] ?? -1];
  if (a === 127) return 'loopback';
  if (a === 10) return 'private';
  if (a === 192 && b === 168) return 'private';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 0 || a === 100 || a === 198 || a === 203 || a >= 224) return 'reserved';
  return 'public';
}

/** Verhoeff checksum used by Aadhaar-format numbers. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    const d = Number(reversed[i]);
    const pRow = VERHOEFF_P[i % 8]!;
    const pValue = pRow[d]!;
    const dRow = VERHOEFF_D[c]!;
    c = dRow[pValue]!;
  }
  return c === 0;
}

/** US SSN area/group/serial validity heuristics (format rules, not authenticity). */
export function ssnStructurallyValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  const area = Number(digits.slice(0, 3));
  const group = Number(digits.slice(3, 5));
  const serial = Number(digits.slice(5));
  if (area === 0 || area === 666 || area >= 900) return false;
  if (group === 0 || serial === 0) return false;
  return true;
}
