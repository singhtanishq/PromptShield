import type { Config } from 'tailwindcss';

/**
 * Design tokens are defined as CSS variables in src/styles/global.css (light + dark),
 * referenced here so utilities like `bg-surface`, `text-ink`, `border-line` adapt to theme.
 * Color is never the only state indicator — every severity/state also carries an icon
 * and text label in the UI.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        'bg-subtle': 'rgb(var(--c-bg-subtle) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-hover': 'rgb(var(--c-surface-hover) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--c-accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--c-danger-soft) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--c-warning-soft) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        'success-soft': 'rgb(var(--c-success-soft) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        'info-soft': 'rgb(var(--c-info-soft) / <alpha-value>)',
        sev: {
          critical: 'rgb(var(--c-sev-critical) / <alpha-value>)',
          'critical-soft': 'rgb(var(--c-sev-critical-soft) / <alpha-value>)',
          high: 'rgb(var(--c-sev-high) / <alpha-value>)',
          'high-soft': 'rgb(var(--c-sev-high-soft) / <alpha-value>)',
          medium: 'rgb(var(--c-sev-medium) / <alpha-value>)',
          'medium-soft': 'rgb(var(--c-sev-medium-soft) / <alpha-value>)',
          low: 'rgb(var(--c-sev-low) / <alpha-value>)',
          'low-soft': 'rgb(var(--c-sev-low-soft) / <alpha-value>)',
          informational: 'rgb(var(--c-sev-informational) / <alpha-value>)',
          'informational-soft': 'rgb(var(--c-sev-informational-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        pop: '0 4px 16px 0 rgb(0 0 0 / 0.12)',
        overlay: '0 8px 40px 0 rgb(0 0 0 / 0.28)',
      },
      maxWidth: {
        workspace: '80rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
