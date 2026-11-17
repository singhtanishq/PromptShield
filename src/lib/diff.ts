/**
 * Bounded before/after diff. Line-level LCS for alignment, word-level
 * refinement within changed line pairs. Very large inputs fall back to a
 * coarse line diff. Pure functions; prompt content never leaves the caller.
 */

export type DiffOp = 'equal' | 'delete' | 'insert';

export interface WordSegment {
  op: DiffOp;
  text: string;
}

export interface DiffLine {
  /** 1-based line number in the original (delete/equal rows). */
  originalNumber: number | null;
  /** 1-based line number in the sanitized output (insert/equal rows). */
  outputNumber: number | null;
  op: DiffOp;
  /** Original line content (delete/equal). */
  original: string | null;
  /** Sanitized line content (insert/equal). */
  output: string | null;
  /** Word-level segments for changed pairs (equal rows have none). */
  words?: WordSegment[];
}

const MAX_LINES = 4000;
const MAX_TOKENS_PER_PAIR = 400;

/** Classic LCS table — safe because callers cap the input size. */
function lcsOps<T>(
  a: T[],
  b: T[],
  eq: (x: T, y: T) => boolean,
): Array<{ op: DiffOp; a?: T; b?: T; ai?: number; bi?: number }> {
  const n = a.length;
  const m = b.length;
  // Guard: bounded allocation (lines are pre-capped by the caller).
  const table: Uint32Array = new Uint32Array((n + 1) * (m + 1));
  const width = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = eq(a[i] as T, b[j] as T)
        ? (table[(i + 1) * width + j + 1] as number) + 1
        : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  const ops: Array<{ op: DiffOp; a?: T; b?: T; ai?: number; bi?: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i] as T, b[j] as T)) {
      ops.push({ op: 'equal', a: a[i], b: b[j], ai: i, bi: j });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ op: 'delete', a: a[i], ai: i });
      i++;
    } else {
      ops.push({ op: 'insert', b: b[j], bi: j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ op: 'delete', a: a[i], ai: i });
    i++;
  }
  while (j < m) {
    ops.push({ op: 'insert', b: b[j], bi: j });
    j++;
  }
  return ops;
}

function tokenizeWords(line: string): string[] {
  // Keep whitespace attached so the diff preserves spacing exactly.
  return line.split(/(\s+)/).filter((t) => t.length > 0);
}

function wordSegments(before: string, after: string): WordSegment[] {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  if (a.length > MAX_TOKENS_PER_PAIR || b.length > MAX_TOKENS_PER_PAIR) {
    return [
      { op: 'delete', text: before },
      { op: 'insert', text: after },
    ];
  }
  const ops = lcsOps(a, b, (x, y) => x === y);
  const segments: WordSegment[] = [];
  let pendingDelete = '';
  let pendingInsert = '';
  const flush = (): void => {
    if (pendingDelete.length > 0) {
      segments.push({ op: 'delete', text: pendingDelete });
      pendingDelete = '';
    }
    if (pendingInsert.length > 0) {
      segments.push({ op: 'insert', text: pendingInsert });
      pendingInsert = '';
    }
  };
  for (const op of ops) {
    if (op.op === 'equal') {
      flush();
      segments.push({ op: 'equal', text: op.a as string });
    } else if (op.op === 'delete') {
      pendingDelete += op.a as string;
    } else {
      pendingInsert += op.b as string;
    }
  }
  flush();
  return segments;
}

/** Compute the aligned line diff between original and sanitized text. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const truncatedA = a.length > MAX_LINES ? a.slice(0, MAX_LINES) : a;
  const truncatedB = b.length > MAX_LINES ? b.slice(0, MAX_LINES) : b;
  const ops = lcsOps(truncatedA, truncatedB, (x, y) => x === y);

  const lines: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]!;
    if (op.op === 'equal') {
      ai += 1;
      bi += 1;
      lines.push({
        originalNumber: ai,
        outputNumber: bi,
        op: 'equal',
        original: op.a as string,
        output: op.b as string,
      });
    } else if (op.op === 'delete') {
      ai += 1;
      // Pair a delete with the following insert(s) for word-level refinement.
      const insertIdxs: number[] = [];
      for (let k2 = k + 1; k2 < ops.length && ops[k2]!.op === 'insert'; k2++) {
        insertIdxs.push(k2);
      }
      if (insertIdxs.length === 1) {
        const ins = ops[insertIdxs[0]!]!;
        bi += 1;
        lines.push({
          originalNumber: ai,
          outputNumber: bi,
          op: 'delete',
          original: op.a as string,
          output: ins.b as string,
          words: wordSegments(op.a as string, ins.b as string),
        });
        k = insertIdxs[0]!;
      } else {
        lines.push({
          originalNumber: ai,
          outputNumber: null,
          op: 'delete',
          original: op.a as string,
          output: null,
        });
      }
    } else {
      bi += 1;
      lines.push({
        originalNumber: null,
        outputNumber: bi,
        op: 'insert',
        original: null,
        output: op.b as string,
      });
    }
  }
  return lines;
}

/** Inline (stacked) variant for mobile rendering. */
export function inlineSegments(before: string, after: string, maxSegments = 600): WordSegment[] {
  const a = tokenizeWords(before.length > 20000 ? before.slice(0, 20000) : before);
  const b = tokenizeWords(after.length > 20000 ? after.slice(0, 20000) : after);
  if (a.length > MAX_TOKENS_PER_PAIR * 4 || b.length > MAX_TOKENS_PER_PAIR * 4) {
    return [
      { op: 'delete', text: before.slice(0, 2000) },
      { op: 'insert', text: after.slice(0, 2000) },
    ];
  }
  const ops = lcsOps(a, b, (x, y) => x === y);
  const segments: WordSegment[] = [];
  let pendingDelete = '';
  let pendingInsert = '';
  const flush = (): void => {
    if (pendingDelete.length > 0) {
      segments.push({ op: 'delete', text: pendingDelete });
      pendingDelete = '';
    }
    if (pendingInsert.length > 0) {
      segments.push({ op: 'insert', text: pendingInsert });
      pendingInsert = '';
    }
  };
  for (const op of ops) {
    if (segments.length > maxSegments) break;
    if (op.op === 'equal') {
      flush();
      segments.push({ op: 'equal', text: op.a as string });
    } else if (op.op === 'delete') {
      pendingDelete += op.a as string;
    } else {
      pendingInsert += op.b as string;
    }
  }
  flush();
  return segments;
}
