import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ClipboardCopy,
  ClipboardPaste,
  Eye,
  RotateCcw,
  Undo2,
  Redo2,
  FileText,
} from 'lucide-react';
import { Button, EmptyState, IconButton } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { useSession } from './session';
import { useToast } from '../../components/toast';
import { applyRedactions, annotationsFor } from '../../lib/redaction/apply';
import { downloadTextFile } from '../../lib/files';

/**
 * Sanitized output: computed from the original text + user decisions only.
 * Copy/download operate on the sanitized text (never the original). The
 * re-identification view is explicit, warning-gated, and local-only.
 */
export function OutputPanel() {
  const {
    text,
    result,
    decisions,
    getPseudonymStore,
    hasPseudonymMap,
    pseudonymCount,
    forgetPseudonyms,
    reidentify,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSession();
  const { showToast } = useToast();
  const [reidentifyOpen, setReidentifyOpen] = useState(false);
  const [showReidentified, setShowReidentified] = useState(false);

  const outcome = useMemo(() => {
    if (result === null || decisions.length === 0) return null;
    return applyRedactions(text, result.detections, decisions, getPseudonymStore());
  }, [text, result, decisions, getPseudonymStore]);

  const reidentified = useMemo(() => {
    if (!showReidentified || outcome === null) return null;
    return reidentify(outcome.text);
  }, [showReidentified, outcome, reidentify]);

  const displayText = reidentified !== null ? reidentified.text : (outcome?.text ?? '');

  const onCopy = (): void => {
    window.navigator.clipboard
      .writeText(displayText)
      .then(() => showToast('success', 'Sanitized text copied.'))
      .catch(() => {
        // Manual fallback: select the output for hand-copying.
        const el = document.getElementById('sanitized-output-text');
        if (el !== null && el instanceof HTMLTextAreaElement) {
          el.focus();
          el.select();
        }
        showToast(
          'error',
          'Clipboard unavailable — the sanitized text is selected below. Copy it manually.',
        );
      });
  };

  const onCopyWithAnnotations = (): void => {
    if (outcome === null || result === null) return;
    const annotated = `${annotationsFor(outcome.edits, result.detections)}\n\n${outcome.text}`;
    window.navigator.clipboard
      .writeText(annotated)
      .then(() =>
        showToast('success', 'Copied with an annotation header (categories only, no values).'),
      )
      .catch(() =>
        showToast('error', 'Clipboard unavailable — try the plain copy action instead.'),
      );
  };

  const timestamp = (): string => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');

  const onDownload = (format: 'txt' | 'md'): void => {
    if (outcome === null) return;
    const content = format === 'md' ? `# Sanitized prompt\n\n${outcome.text}\n` : outcome.text;
    downloadTextFile(
      `promptshield-sanitized-${timestamp()}.${format}`,
      content,
      format === 'md' ? 'text/markdown' : 'text/plain',
    );
    showToast('success', `Downloaded sanitized .${format} — contains no original values.`);
  };

  const decidedCount = decisions.length;

  return (
    <section
      aria-labelledby="output-heading"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <div>
          <h2 id="output-heading" className="text-sm font-semibold text-ink">
            Sanitized output
          </h2>
          <p className="mt-0.5 text-2xs text-ink-faint">
            {decidedCount > 0
              ? `${decidedCount} replacement${decidedCount > 1 ? 's' : ''} applied on your choices — original kept above until you clear it.`
              : 'Appears after you review findings and apply redactions.'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Undo last redaction action" onClick={undo} disabled={!canUndo}>
            <Undo2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo redaction action" onClick={redo} disabled={!canRedo}>
            <Redo2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {outcome === null ? (
        <EmptyState
          icon={<FileText aria-hidden="true" />}
          title="No sanitized output yet"
          description="Redactions are never applied automatically. Choose actions on findings; the sanitized prompt appears here for copying or download."
        />
      ) : (
        <>
          {reidentified !== null && (
            <p
              role="status"
              className="border-b border-sev-high/40 bg-sev-high-soft px-4 py-2 text-2xs font-medium text-sev-high"
            >
              Re-identified view: {reidentified.replaced} placeholder
              {reidentified.replaced === 1 ? '' : 's'} restored from the session map. This text
              contains original sensitive values — copy carefully and never share it onward.
            </p>
          )}
          <label htmlFor="sanitized-output-text" className="sr-only">
            Sanitized prompt text
          </label>
          <textarea
            id="sanitized-output-text"
            readOnly
            value={displayText}
            spellCheck={false}
            className="prompt-text scroll-slim h-64 w-full resize-y border-0 bg-transparent px-4 py-3 text-ink focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-2.5">
            <Button
              size="sm"
              variant="primary"
              onClick={onCopy}
              icon={<ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Copy sanitized
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onCopyWithAnnotations}
              icon={<ClipboardPaste aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              Copy with annotations
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDownload('txt')}
              icon={<ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              .txt
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDownload('md')}
              icon={<ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />}
            >
              .md
            </Button>
            {hasPseudonymMap && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning"
                  title="A reversible pseudonymization map exists in memory for this tab only. It is never saved, synced, or exported."
                >
                  <Eye aria-hidden="true" className="h-3 w-3" />
                  Reversible map: {pseudonymCount} entr{pseudonymCount === 1 ? 'y' : 'ies'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReidentifyOpen(true)}
                  icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  Re-identify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    forgetPseudonyms();
                    setShowReidentified(false);
                    showToast(
                      'info',
                      'Pseudonym mapping forgotten. Placeholders can no longer be restored.',
                    );
                  }}
                >
                  Forget mapping
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={reidentifyOpen}
        title="Re-identify placeholders in the output?"
        body="This replaces pseudonym placeholders ([PERSON_1]…) with the original values from the in-memory session map. The restored text contains the sensitive values you removed. It stays in this tab, is never sent anywhere, and the mapping must still exist."
        confirmLabel="Restore original values"
        danger
        onConfirm={() => {
          setShowReidentified(true);
          setReidentifyOpen(false);
        }}
        onCancel={() => setReidentifyOpen(false)}
      />
      {showReidentified && (
        <div className="border-t border-line bg-surface-2 px-4 py-2">
          <button
            type="button"
            onClick={() => setShowReidentified(false)}
            className="text-2xs font-medium text-accent-ink underline hover:no-underline dark:text-accent"
          >
            Back to sanitized view
          </button>
        </div>
      )}
    </section>
  );
}
