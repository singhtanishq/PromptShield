import { useMemo, useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Fingerprint,
  Layers,
  Replace,
  ScanSearch,
  Scissors,
  ShieldOff,
  Undo2,
  Wrench,
  Zap,
} from 'lucide-react';
import type { Detection, DetectorCategory, RedactionMode } from '../../lib/detection/types';
import { CATEGORY_LABELS } from '../../lib/detection/types';
import { lineColumnAt } from '../../lib/detection/spans';
import {
  defaultReplacementFor,
  maskPlaceholderFor,
  supportsPartialMask,
  untrustedQuoteFor,
} from '../../lib/redaction/apply';
import { ConfidenceBadge, SeverityBadge, StatChip } from '../../components/badges';
import { Button, EmptyState } from '../../components/ui';
import { ConfirmDialog, Dialog } from '../../components/dialog';
import { Menu } from '../../components/menu';
import { useSession } from './session';
import { useToast } from '../../components/toast';

/**
 * Findings review and redaction control. Findings show masked previews only —
 * raw matched values never reach this component. Prompt-risk findings are a
 * separate review workflow: they are never included in bulk redaction and
 * offer "quote as untrusted data" instead of silent rewrites.
 */
export function FindingsPanel() {
  const {
    text,
    scan,
    result,
    ignoredIds,
    allowlist,
    decisions,
    ignoreFinding,
    clearIgnored,
    allowlistValue,
    removeFromAllowlist,
    decide,
    undecide,
    setDecisions,
  } = useSession();
  const { showToast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<DetectorCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allowlistCandidate, setAllowlistCandidate] = useState<Detection | null>(null);
  const [customCandidate, setCustomCandidate] = useState<Detection | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const detections = useMemo(() => {
    if (result === null) return [];
    return result.detections.filter((d) => !ignoredIds.includes(d.id));
  }, [result, ignoredIds]);

  const decidedIds = useMemo(() => new Set(decisions.map((d) => d.findingId)), [decisions]);

  const bulkCandidates = useMemo(
    () =>
      result?.detections.filter(
        (d) =>
          !ignoredIds.includes(d.id) && d.category !== 'prompt-risk' && d.confidence === 'high',
      ) ?? [],
    [result, ignoredIds],
  );

  const visible = useMemo(
    () => detections.filter((d) => categoryFilter === 'all' || d.category === categoryFilter),
    [detections, categoryFilter],
  );

  const presentCategories = useMemo(() => {
    if (result === null) return [] as DetectorCategory[];
    const set = new Set<DetectorCategory>();
    for (const d of result.detections) set.add(d.category);
    return [...set];
  }, [result]);

  const ignoredDetections = useMemo(() => {
    if (result === null) return [];
    return result.detections.filter((d) => ignoredIds.includes(d.id));
  }, [result, ignoredIds]);

  const location = (d: Detection): string => {
    const { line, column } = lineColumnAt(text, d.range.start);
    return `line ${line}, col ${column}`;
  };

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onAllowlistConfirm = (): void => {
    if (allowlistCandidate === null) return;
    const value = text.slice(allowlistCandidate.range.start, allowlistCandidate.range.end);
    allowlistValue(value, allowlistCandidate.preview);
    setAllowlistCandidate(null);
    showToast(
      'info',
      'Value added to the session allowlist (in memory only). Run a new scan to exclude it from results.',
    );
  };

  const onCustomConfirm = (): void => {
    if (customCandidate === null) return;
    decide({ findingId: customCandidate.id, mode: 'custom', replacement: customValue });
    setCustomCandidate(null);
    setCustomValue('');
    showToast('success', 'Custom replacement recorded. Output updated below.');
  };

  const onBulkConfirm = (): void => {
    setDecisions(bulkCandidates.map((d) => ({ findingId: d.id, mode: 'mask' as RedactionMode })));
    setBulkOpen(false);
    showToast(
      'success',
      `${bulkCandidates.length} high-confidence finding${bulkCandidates.length === 1 ? '' : 's'} marked for redaction. Undo any of them individually from its action menu.`,
    );
  };

  const actionItemsFor = (d: Detection) => {
    const items = [
      {
        id: 'mask',
        label: `Mask as ${defaultReplacementFor(d, 'mask')}`,
        icon: <Replace className="h-4 w-4" aria-hidden="true" />,
        description: 'Category placeholder',
      },
      {
        id: 'pseudonymize',
        label: 'Pseudonymize ([PERSON_1] style)',
        icon: <Fingerprint className="h-4 w-4" aria-hidden="true" />,
        description: 'Consistent per entity, reversible in-session',
      },
      {
        id: 'context-placeholder',
        label: `Context placeholder (${defaultReplacementFor(d, 'context-placeholder')})`,
        icon: <Wrench className="h-4 w-4" aria-hidden="true" />,
        description: 'Readable typed alias',
      },
      {
        id: 'custom',
        label: 'Custom replacement…',
        icon: <Replace className="h-4 w-4" aria-hidden="true" />,
        description: 'Type your own text, with preview',
      },
    ];
    if (supportsPartialMask(d)) {
      items.push({
        id: 'partial',
        label: 'Keep last 4 digits only',
        icon: <Scissors className="h-4 w-4" aria-hidden="true" />,
        description: 'Partial mask for cards/IDs/phones',
      });
    }
    if (d.category === 'prompt-risk') {
      items.push({
        id: 'quote-untrusted',
        label: 'Quote as untrusted data',
        icon: <Layers className="h-4 w-4" aria-hidden="true" />,
        description: 'Wrap in <untrusted_content> tags for the AI tool',
      });
    }
    items.push({
      id: 'remove',
      label: 'Remove entirely',
      icon: <Scissors className="h-4 w-4" aria-hidden="true" />,
      description: 'Warning: sentence meaning may change',
    });
    return items;
  };

  const onAction = (d: Detection, actionId: string): void => {
    switch (actionId) {
      case 'mask':
      case 'pseudonymize':
      case 'context-placeholder':
      case 'partial':
        decide({ findingId: d.id, mode: actionId as RedactionMode });
        showToast('success', 'Replacement applied to the sanitized output below.');
        break;
      case 'remove':
        decide({ findingId: d.id, mode: 'remove' });
        showToast('info', 'Span removed from the sanitized output. Undo is available.');
        break;
      case 'custom':
        setCustomCandidate(d);
        setCustomValue(defaultReplacementFor(d, 'context-placeholder'));
        break;
      case 'quote-untrusted': {
        const value = text.slice(d.range.start, d.range.end);
        decide({ findingId: d.id, mode: 'custom', replacement: untrustedQuoteFor(value) });
        showToast('info', 'Wrapped as untrusted content in the sanitized output.');
        break;
      }
      default:
        break;
    }
  };

  const scanning = scan.status === 'scanning';
  const severityStats = result?.stats.bySeverity;

  return (
    <section
      aria-labelledby="findings-heading"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel"
    >
      <div className="border-b border-line bg-surface-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="findings-heading" className="text-sm font-semibold text-ink">
              Findings
            </h2>
            <p className="mt-0.5 text-2xs text-ink-faint">
              Suggestions only — you choose what to redact.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {bulkCandidates.length > 0 && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setBulkOpen(true)}
                icon={<Zap aria-hidden="true" className="h-3.5 w-3.5" />}
              >
                Redact {bulkCandidates.length} high-confidence
              </Button>
            )}
            {ignoredIds.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-2xs text-ink-faint">
                <EyeOff aria-hidden="true" className="h-3 w-3" />
                {ignoredIds.length} ignored
                <button
                  type="button"
                  onClick={clearIgnored}
                  className="ml-1 underline hover:text-ink"
                >
                  restore
                </button>
              </span>
            )}
            {allowlist.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-2xs text-ink-faint">
                <ShieldOff aria-hidden="true" className="h-3 w-3" />
                {allowlist.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => removeFromAllowlist(a.value)}
                    title={`Re-enable detection for ${a.preview} (remove from session allowlist)`}
                    className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 px-1.5 font-mono hover:text-ink"
                  >
                    {a.preview} ×
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
        {severityStats !== undefined && result !== null && result.stats.total > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Findings summary by severity">
            {severityStats.critical > 0 && (
              <StatChip
                icon={<Ban className="h-3 w-3" aria-hidden="true" />}
                label="Critical"
                count={severityStats.critical}
                className="border-sev-critical/30 bg-sev-critical-soft text-sev-critical"
              />
            )}
            {severityStats.high > 0 && (
              <StatChip
                icon={<Ban className="h-3 w-3" aria-hidden="true" />}
                label="High"
                count={severityStats.high}
                className="border-sev-high/30 bg-sev-high-soft text-sev-high"
              />
            )}
            {severityStats.medium > 0 && (
              <StatChip
                icon={<ScanSearch className="h-3 w-3" aria-hidden="true" />}
                label="Medium"
                count={severityStats.medium}
                className="border-sev-medium/30 bg-sev-medium-soft text-sev-medium"
              />
            )}
            {severityStats.low > 0 && (
              <StatChip
                icon={<ScanSearch className="h-3 w-3" aria-hidden="true" />}
                label="Low"
                count={severityStats.low}
                className="border-sev-low/30 bg-sev-low-soft text-sev-low"
              />
            )}
            {severityStats.informational > 0 && (
              <StatChip
                icon={<ScanSearch className="h-3 w-3" aria-hidden="true" />}
                label="Info"
                count={severityStats.informational}
                className="border-sev-informational/30 bg-sev-informational-soft text-sev-informational"
              />
            )}
          </div>
        )}
        {presentCategories.length > 1 && (
          <div
            className="mt-2 flex flex-wrap gap-1"
            role="group"
            aria-label="Filter findings by category"
          >
            <FilterChip
              active={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              label="All"
            />
            {presentCategories.map((c) => (
              <FilterChip
                key={c}
                active={categoryFilter === c}
                onClick={() => setCategoryFilter(c)}
                label={CATEGORY_LABELS[c]}
              />
            ))}
          </div>
        )}
      </div>

      {scanning ? (
        <EmptyState
          icon={<ScanSearch aria-hidden="true" />}
          title="Scanning in the background worker…"
          description="Your text never leaves this browser tab during the scan."
        />
      ) : scan.status === 'idle' || scan.status === 'cancelled' ? (
        <EmptyState
          icon={<ScanSearch aria-hidden="true" />}
          title="No findings to review"
          description="Run a scan to see detected sensitive information and risk indicators grouped by type, severity, and confidence."
        />
      ) : detections.length === 0 ? (
        <EmptyState
          icon={<ScanSearch aria-hidden="true" />}
          title="No findings detected"
          description="No heuristic matches in this text at the current sensitivity. Detection can miss sensitive content — review manually before sharing. Raising sensitivity catches more (with more false positives)."
        />
      ) : (
        <ul className="scroll-slim flex max-h-[36rem] flex-col divide-y divide-line overflow-y-auto">
          {visible.map((d) => {
            const subs = result?.subFindings[d.id] ?? [];
            const isExpanded = expanded.has(d.id);
            const isDecided = decidedIds.has(d.id);
            const decision = decisions.find((dec) => dec.findingId === d.id);
            return (
              <li
                key={d.id}
                className={`flex flex-col gap-2 px-4 py-3 ${isDecided ? 'bg-success-soft/30' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={d.severity} />
                  <ConfidenceBadge confidence={d.confidence} />
                  <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                    {CATEGORY_LABELS[d.category]} ·{' '}
                    {d.subtype.startsWith('rule:') ? d.subtype.slice(5) : d.subtype}
                  </span>
                  {isDecided && decision !== undefined && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-soft px-2 py-0.5 text-2xs font-medium text-success">
                      <Replace aria-hidden="true" className="h-3 w-3" />
                      {decision.mode === 'remove'
                        ? 'Will be removed'
                        : `→ ${
                            decision.mode === 'mask'
                              ? maskPlaceholderFor(d)
                              : (decision.replacement ?? decision.mode)
                          }`}
                    </span>
                  )}
                  <span className="ml-auto text-2xs text-ink-faint">{location(d)}</span>
                </div>
                <p
                  className="prompt-text rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-ink"
                  aria-label="Masked preview of the detected value"
                >
                  {d.preview}
                </p>
                <p className="text-2xs leading-snug text-ink-muted">{d.explanation}</p>
                {d.evidence !== undefined && (
                  <p className="text-2xs text-ink-faint">Evidence: {d.evidence}</p>
                )}
                <p className="text-2xs leading-snug text-accent-ink dark:text-accent">
                  {d.remediation}
                </p>
                {subs.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(d.id)}
                      aria-expanded={isExpanded}
                      className="flex items-center gap-1 text-2xs font-medium text-ink-muted hover:text-ink"
                    >
                      {isExpanded ? (
                        <ChevronDown aria-hidden="true" className="h-3 w-3" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="h-3 w-3" />
                      )}
                      {subs.length} related detail{subs.length > 1 ? 's' : ''} (overlapping)
                    </button>
                    {isExpanded && (
                      <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-line pl-3">
                        {subs.map((sub, i) => (
                          <li key={i} className="text-2xs leading-snug text-ink-faint">
                            <span className="font-medium text-ink-muted">{sub.subtype}</span>{' '}
                            {sub.preview} — {sub.explanation}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Menu
                    triggerLabel={`Redaction actions for ${d.subtype} finding`}
                    items={actionItemsFor(d)}
                    onAction={(actionId) => onAction(d, actionId)}
                    trigger={({ open, toggle, menuId }) => (
                      <Button
                        size="sm"
                        variant={isDecided ? 'secondary' : 'primary'}
                        onClick={toggle}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={open ? menuId : undefined}
                        icon={<Replace aria-hidden="true" className="h-3.5 w-3.5" />}
                      >
                        {isDecided ? 'Change action' : 'Choose action'}
                      </Button>
                    )}
                  />
                  {isDecided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        undecide(d.id);
                        showToast('info', 'Action undone for this finding.');
                      }}
                      icon={<Undo2 aria-hidden="true" className="h-3.5 w-3.5" />}
                    >
                      Undo this
                    </Button>
                  )}
                  {!isDecided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        ignoreFinding(d.id);
                        showToast(
                          'info',
                          'Finding hidden for this session. Restore from the ignored counter.',
                        );
                      }}
                      icon={<EyeOff aria-hidden="true" className="h-3.5 w-3.5" />}
                    >
                      Not sensitive
                    </Button>
                  )}
                  {!isDecided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAllowlistCandidate(d)}
                      icon={<ShieldOff aria-hidden="true" className="h-3.5 w-3.5" />}
                    >
                      Allowlist value
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ignoredDetections.length > 0 && (
        <div className="border-t border-line px-4 py-1.5">
          <p className="text-2xs text-ink-faint">
            {ignoredDetections.length} finding{ignoredDetections.length > 1 ? 's' : ''} ignored this
            session (restore via the counter above). Nothing was altered.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={allowlistCandidate !== null}
        title="Allowlist this exact value?"
        body={
          <>
            The value{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">
              {allowlistCandidate?.preview ?? ''}
            </code>{' '}
            (shown masked) will be excluded from future scans this session. The allowlist is kept
            only in memory for this tab, is never saved to disk, and never included in exports.
            Allowlisting does not make the text “safe” — it only silences this exact match.
          </>
        }
        confirmLabel="Add to session allowlist"
        onConfirm={onAllowlistConfirm}
        onCancel={() => setAllowlistCandidate(null)}
      />

      <ConfirmDialog
        open={bulkOpen}
        title={`Redact ${bulkCandidates.length} high-confidence findings?`}
        body={
          <>
            This masks {bulkCandidates.length} finding{bulkCandidates.length === 1 ? '' : 's'} with
            high confidence across categories (excluding prompt-risk indicators, which stay a review
            workflow). You can undo any of them individually, or undo everything. Preview the result
            in the output panel before copying anything.
          </>
        }
        confirmLabel={`Redact ${bulkCandidates.length} findings`}
        onConfirm={onBulkConfirm}
        onCancel={() => setBulkOpen(false)}
      />

      <Dialog
        open={customCandidate !== null}
        title="Custom replacement"
        description="The matched span will be replaced by exactly this text in the sanitized output."
        size="sm"
        onClose={() => {
          setCustomCandidate(null);
          setCustomValue('');
        }}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCustomCandidate(null);
                setCustomValue('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={onCustomConfirm}>
              Apply replacement
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-2xs font-medium text-ink-faint">Detected value (masked):</p>
            <p className="prompt-text rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
              {customCandidate?.preview ?? ''}
            </p>
          </div>
          <div>
            <label
              htmlFor="custom-replacement-input"
              className="mb-1 block text-2xs font-medium text-ink-faint"
            >
              Replacement text
            </label>
            <input
              id="custom-replacement-input"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="[CUSTOMER_NAME]"
              className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 font-mono text-sm text-ink focus:border-accent"
            />
            <p className="mt-1.5 text-2xs text-ink-faint">
              Preview: the span will read exactly{' '}
              <span className="font-mono">{customValue.length > 0 ? customValue : '…'}</span>
            </p>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-medium transition-colors ${
        active
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line bg-surface text-ink-faint hover:text-ink'
      }`}
    >
      <Layers aria-hidden="true" className="h-3 w-3" />
      {label}
    </button>
  );
}
