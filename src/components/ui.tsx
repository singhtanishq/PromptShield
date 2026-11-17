import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-strong dark:text-[#04211e] dark:hover:bg-accent-strong border border-transparent',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-hover dark:hover:bg-surface-2',
  ghost:
    'bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink border border-transparent',
  subtle:
    'bg-accent-soft text-accent-ink hover:brightness-95 dark:hover:brightness-110 border border-transparent',
  danger:
    'bg-danger text-white hover:brightness-95 dark:hover:brightness-110 border border-transparent dark:text-[#2b0209]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-2xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-1.5',
  lg: 'h-10 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center rounded-md font-medium
        transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', active = false, className = '', children, ...rest },
  ref,
) {
  const dims = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-md border border-transparent
        transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${VARIANT_CLASSES[variant]} ${dims} ${active ? 'bg-accent-soft text-accent-ink' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/** A titled content panel — the base surface for workspace sections. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  contentClassName = '',
  as: Tag = 'section',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return (
    <Tag
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-panel ${className}`}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <div className="min-w-0">
            {typeof title === 'string' ? (
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
            ) : (
              title
            )}
            {subtitle !== undefined && (
              <p className="mt-0.5 text-2xs leading-snug text-ink-faint">{subtitle}</p>
            )}
          </div>
          {actions !== undefined && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={`min-w-0 flex-1 ${contentClassName}`}>{children}</div>
    </Tag>
  );
}

/** Accessible switch (role="switch") with label text and description. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p
          id={`switch-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
          className="text-sm font-medium text-ink"
        >
          {label}
        </p>
        {description !== undefined && (
          <p className="mt-0.5 text-2xs leading-snug text-ink-faint">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`switch-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors
          disabled:cursor-not-allowed disabled:opacity-50
          ${checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-2'}`}
        style={{ height: '1.375rem' }}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform
            ${checked ? 'translate-x-[1.4rem]' : 'translate-x-[0.19rem]'}`}
        />
      </button>
    </div>
  );
}

/** Fieldset of radio options rendered as selectable cards. */
export function RadioCards<T extends string>({
  legend,
  options,
  value,
  onChange,
  columns = 3,
}: {
  legend: string;
  options: Array<{ value: T; label: string; description?: string; icon?: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div
        className={`grid gap-2 ${columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : ''}`}
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors
                ${selected ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface hover:bg-surface-hover'}`}
            >
              {opt.icon !== undefined && (
                <span aria-hidden="true" className="mt-0.5 text-ink-muted">
                  {opt.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{opt.label}</span>
                {opt.description !== undefined && (
                  <span className="mt-0.5 block text-2xs leading-snug text-ink-faint">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Simple styled native select (keyboard/screen-reader friendly). */
export function SelectInput({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
}) {
  const id = `select-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="py-2">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full max-w-72 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink
          transition-colors hover:bg-surface-hover focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint !== undefined && <p className="mt-1.5 text-2xs leading-snug text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-ink-faint" />
    </span>
  );
}

/** Generic, honest empty state. */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div
        aria-hidden="true"
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-faint"
      >
        {icon}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-2xs leading-relaxed text-ink-faint">{description}</p>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
      {children}
    </kbd>
  );
}
