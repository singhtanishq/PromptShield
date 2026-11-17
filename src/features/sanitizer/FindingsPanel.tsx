import { useMemo, useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Layers,
  ScanSearch,
  ShieldOff,
} from 'lucide-react';
import type { Detection, DetectorCategory } from '../../lib/detection/types';
import { CATEGORY_LABELS } from '../../lib/detection/types';
import { lineColumnAt } from '../../lib/detection/spans';
import { ConfidenceBadge, SeverityBadge, StatChip } from '../../components/badges';
import { Button, EmptyState } from '../../components/ui';
import { ConfirmDialog } from '../../components/dialog';
import { useSession } from './session';
import { useToast } from '../../components/toast';

/**
 * Findings review: summary by severity, category filter, and per-finding
 * details. Findings show masked previews only — raw matched values never
 * reach this component (they never leave the engine at all).
 */
export function FindingsPanel() {
  const { text, scan, result, ignoredIds, allowlist, ignoreFinding, clearIgnored, allowlistValue } =
    useSession();
  const { showToast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<DetectorCategory | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allowlistCandidate, setAllowlistCandidate] = useState<Detection | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);

  const detections = useMemo(() => {
    if (result === null) return [];
    return result.detections.filter((d) => !ignoredIds.includes(d.id));
  }, [result, ignoredIds]);

  const visible = useMemo(
    () =>
      detections.filter((d) => {
        if (categoryFilter === 'all') return true;
        return d.category === categoryFilter;
      }),
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
    allowlistValue(value);
    setAllowlistCandidate(null);
    showToast(
      'info',
      'Value added to the session allowlist (in memory only). Run a new scan to exclude it from results.',
    );
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
          {(ignoredIds.length > 0 || allowlist.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
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
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-2xs text-ink-faint"
                  title="Exact values in the session allowlist are excluded from new scans. Stored in memory only."
                >
                  <ShieldOff aria-hidden="true" className="h-3 w-3" />
                  {allowlist.length} allowlisted (session)
                </span>
              )}
            </div>
          )}
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
        <ul className="scroll-slim flex max-h-[32rem] flex-col divide-y divide-line overflow-y-auto">
          {visible.map((d) => {
            const subs = result?.subFindings[d.id] ?? [];
            const isExpanded = expanded.has(d.id);
            return (
              <li key={d.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={d.severity} />
                  <ConfidenceBadge confidence={d.confidence} />
                  <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                    {CATEGORY_LABELS[d.category]} ·{' '}
                    {d.subtype.startsWith('rule:') ? d.subtype.slice(5) : d.subtype}
                  </span>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllowlistCandidate(d)}
                    icon={<ShieldOff aria-hidden="true" className="h-3.5 w-3.5" />}
                  >
                    Allowlist this value
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ignoredDetections.length > 0 && showIgnored && (
        <div className="border-t border-line bg-surface-2 px-4 py-2">
          <p className="text-2xs font-medium text-ink-faint">Ignored this session:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {ignoredDetections.map((d) => (
              <li key={d.id} className="text-2xs text-ink-faint">
                {d.subtype} — {d.preview}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ignoredDetections.length > 0 && !showIgnored && (
        <div className="border-t border-line px-4 py-1.5">
          <button
            type="button"
            onClick={() => setShowIgnored(true)}
            className="text-2xs text-ink-faint underline hover:text-ink"
          >
            Show {ignoredDetections.length} ignored finding{ignoredDetections.length > 1 ? 's' : ''}
          </button>
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
