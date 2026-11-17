import { useMemo } from 'react';
import { GitCompare } from 'lucide-react';
import { useSession } from './session';
import { applyRedactions } from '../../lib/redaction/apply';
import { diffLines, inlineSegments } from '../../lib/diff';
import type { WordSegment } from '../../lib/diff';
import { EmptyState } from '../../components/ui';

/**
 * Before/after diff: aligned side-by-side rows on wide screens, inline
 * flow on narrow screens. Only replacement results are shown — the raw
 * removed values are never surfaced in titles, aria-labels, or metadata
 * beyond what the user already sees in their own editor.
 */
export function DiffView() {
  const { text, result, decisions, getPseudonymStore } = useSession();

  const outcome = useMemo(() => {
    if (result === null || decisions.length === 0) return null;
    return applyRedactions(text, result.detections, decisions, getPseudonymStore());
  }, [text, result, decisions, getPseudonymStore]);

  const lines = useMemo(
    () => (outcome === null ? [] : diffLines(text, outcome.text)),
    [text, outcome],
  );

  const inline = useMemo(
    () => (outcome === null ? [] : inlineSegments(text, outcome.text)),
    [text, outcome],
  );

  const changedCount = lines.filter((l) => l.op !== 'equal').length;

  return (
    <section
      aria-labelledby="diff-heading"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
    >
      <div className="border-b border-line bg-surface-2 px-4 py-2.5">
        <h2 id="diff-heading" className="text-sm font-semibold text-ink">
          Before / after
        </h2>
        <p className="mt-0.5 text-2xs text-ink-faint">
          {outcome !== null
            ? `${changedCount} changed line${changedCount === 1 ? '' : 's'} — left: original, right: sanitized.`
            : 'Compare the original with the sanitized version once redactions are applied.'}
        </p>
      </div>

      {outcome === null ? (
        <EmptyState
          icon={<GitCompare aria-hidden="true" />}
          title="No diff yet"
          description="Apply a redaction to see exactly what was removed or replaced."
        />
      ) : (
        <>
          {/* Side-by-side (desktop) */}
          <div className="scroll-slim hidden max-h-96 overflow-auto lg:grid lg:grid-cols-2 lg:gap-0">
            <div className="border-r border-line">
              <p className="sticky top-0 border-b border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold text-ink-faint">
                Original
              </p>
              {lines.map((line, i) => (
                <DiffRow key={i} line={line} side="original" />
              ))}
            </div>
            <div>
              <p className="sticky top-0 border-b border-line bg-surface-2 px-3 py-1.5 text-2xs font-semibold text-ink-faint">
                Sanitized
              </p>
              {lines.map((line, i) => (
                <DiffRow key={i} line={line} side="sanitized" />
              ))}
            </div>
          </div>

          {/* Inline (mobile/tablet) */}
          <div className="scroll-slim max-h-96 overflow-auto px-4 py-3 lg:hidden">
            <p className="sr-only" aria-live="polite">
              Diff with {changedCount} changed lines.
            </p>
            <p className="prompt-text whitespace-pre-wrap break-words leading-relaxed">
              {inline.map((seg, i) => (
                <InlineSegment key={i} segment={seg} />
              ))}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function DiffRow({
  line,
  side,
}: {
  line: ReturnType<typeof diffLines>[number];
  side: 'original' | 'sanitized';
}) {
  const num = side === 'original' ? line.originalNumber : line.outputNumber;
  const content = side === 'original' ? line.original : line.output;
  if (num === null && content === null) {
    // No counterpart on this side: render a placeholder row to keep alignment.
    return (
      <div
        className="border-b border-line/50 bg-sev-informational-soft/30 px-3 py-1"
        aria-hidden="true"
      >
        {'\u00A0'}
      </div>
    );
  }
  const isDelete = line.op === 'delete' && side === 'original';
  const isInsert = line.op === 'insert' && side === 'sanitized';
  const isChangedPair = line.op === 'delete';
  return (
    <div
      className={`prompt-text flex gap-2 border-b border-line/50 px-3 py-1 ${
        isDelete ? 'bg-sev-high-soft/50' : isInsert ? 'bg-success-soft/50' : ''
      }`}
    >
      <span
        className="w-8 shrink-0 select-none text-right text-2xs text-ink-faint"
        aria-hidden="true"
      >
        {num}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words flex-1">
        {isChangedPair && line.words !== undefined
          ? line.words.map((seg, i) => <WordSeg key={i} segment={seg} side={side} />)
          : (content ?? '')}
      </span>
    </div>
  );
}

function WordSeg({ segment, side }: { segment: WordSegment; side: 'original' | 'sanitized' }) {
  if (segment.op === 'equal') return <span>{segment.text}</span>;
  const relevant =
    (side === 'original' && segment.op === 'delete') ||
    (side === 'sanitized' && segment.op === 'insert');
  if (!relevant) return null;
  return (
    <span
      className={
        segment.op === 'delete'
          ? 'rounded-sm bg-danger-soft text-sev-high line-through'
          : 'rounded-sm bg-success-soft text-success'
      }
    >
      {segment.text}
    </span>
  );
}

function InlineSegment({ segment }: { segment: WordSegment }) {
  if (segment.op === 'equal') return <span>{segment.text}</span>;
  if (segment.op === 'delete') {
    return (
      <del className="rounded-sm bg-danger-soft text-sev-high line-through">{segment.text}</del>
    );
  }
  return <ins className="rounded-sm bg-success-soft text-success no-underline">{segment.text}</ins>;
}
