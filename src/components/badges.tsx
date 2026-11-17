import type { ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  HelpCircle,
  Info,
  MinusCircle,
} from 'lucide-react';
import type { Confidence, Severity } from '../lib/detection/types';

/**
 * Severity and confidence badges. Color is never the only indicator:
 * every badge pairs an icon with an explicit text label.
 */
const SEVERITY_META: Record<Severity, { label: string; className: string; icon: ReactNode }> = {
  critical: {
    label: 'Critical',
    className: 'bg-sev-critical-soft text-sev-critical border-sev-critical/30',
    icon: <AlertOctagon aria-hidden="true" className="h-3 w-3" />,
  },
  high: {
    label: 'High',
    className: 'bg-sev-high-soft text-sev-high border-sev-high/30',
    icon: <AlertTriangle aria-hidden="true" className="h-3 w-3" />,
  },
  medium: {
    label: 'Medium',
    className: 'bg-sev-medium-soft text-sev-medium border-sev-medium/30',
    icon: <CircleAlert aria-hidden="true" className="h-3 w-3" />,
  },
  low: {
    label: 'Low',
    className: 'bg-sev-low-soft text-sev-low border-sev-low/30',
    icon: <MinusCircle aria-hidden="true" className="h-3 w-3" />,
  },
  informational: {
    label: 'Info',
    className: 'bg-sev-informational-soft text-sev-informational border-sev-informational/30',
    icon: <Info aria-hidden="true" className="h-3 w-3" />,
  },
};

const CONFIDENCE_META: Record<Confidence, { label: string; className: string; icon: ReactNode }> = {
  high: {
    label: 'High confidence',
    className: 'bg-success-soft text-success border-success/30',
    icon: <CheckCircle2 aria-hidden="true" className="h-3 w-3" />,
  },
  medium: {
    label: 'Medium confidence',
    className: 'bg-info-soft text-info border-info/30',
    icon: <HelpCircle aria-hidden="true" className="h-3 w-3" />,
  },
  low: {
    label: 'Low confidence',
    className: 'bg-sev-informational-soft text-sev-informational border-sev-informational/30',
    icon: <CircleDashed aria-hidden="true" className="h-3 w-3" />,
  },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function CategoryBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
      {children}
    </span>
  );
}

/** Small helper for the "findings summary" chips. */
export function StatChip({
  icon,
  label,
  count,
  className,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      <span>{label}</span>
      <span className="inline-flex items-center gap-0.5 font-semibold">
        <ArrowRight aria-hidden="true" className="h-3 w-3 opacity-60" />
        {count}
      </span>
    </span>
  );
}
