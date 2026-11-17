import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookOpen,
  Github,
  Info,
  Moon,
  Scale,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Wand2,
  X,
} from 'lucide-react';
import { routeHref, useRoute } from './router';
import type { RouteId } from './router';
import { useSettings } from './settings';
import { useToast } from '../components/toast';
import { IconButton } from '../components/ui';

const NAV_ITEMS: Array<{ id: RouteId; label: string; icon: ReactNode }> = [
  { id: 'sanitizer', label: 'Sanitizer', icon: <Wand2 aria-hidden="true" className="h-4 w-4" /> },
  { id: 'rules', label: 'Rules', icon: <Scale aria-hidden="true" className="h-4 w-4" /> },
  {
    id: 'settings',
    label: 'Settings',
    icon: <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />,
  },
  { id: 'privacy', label: 'Privacy', icon: <ShieldCheck aria-hidden="true" className="h-4 w-4" /> },
  { id: 'guides', label: 'Guides', icon: <BookOpen aria-hidden="true" className="h-4 w-4" /> },
  { id: 'about', label: 'About', icon: <Info aria-hidden="true" className="h-4 w-4" /> },
];

const PRODUCT_URL = 'https://singhtanishq.github.io/PromptShield/';

function BrandMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" className="fill-[#0b1220]" />
      <path
        d="M32 10 L50 17 V31 C50 43.5 42.6 51.4 32 55 C21.4 51.4 14 43.5 14 31 V17 Z"
        fill="none"
        stroke="#14b8a6"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M23.5 32.5 L29.5 38.5 L41 26.5"
        fill="none"
        stroke="#5eead4"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeToggle() {
  const { settings, update } = useSettings();
  const resolvedDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <IconButton
      label={
        settings.theme === 'system'
          ? 'Theme: system — switch to light'
          : resolvedDark
            ? 'Theme: dark — switch to light'
            : 'Theme: light — switch to dark'
      }
      onClick={() => {
        const next = resolvedDark ? 'light' : 'dark';
        update({ theme: next });
      }}
    >
      {resolvedDark ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </IconButton>
  );
}

function ShareButton() {
  const { showToast } = useToast();
  const onShare = (): void => {
    // Shares the product URL and generic copy only — never the current prompt or scan data.
    const shareData: ShareData = {
      title: 'PromptShield — Private AI Prompt Sanitizer',
      text: 'Share the prompt. Not the sensitive bits.',
      url: PRODUCT_URL,
    };
    if (typeof navigator.share === 'function') {
      navigator.share(shareData).catch(() => {
        /* user dismissed the share sheet — nothing to report */
      });
    } else {
      window.navigator.clipboard
        .writeText(PRODUCT_URL)
        .then(() => showToast('success', 'Product link copied. It contains no prompt data.'))
        .catch(() => showToast('error', 'Could not access the clipboard. Copy the URL manually.'));
    }
  };
  return (
    <IconButton
      label="Share PromptShield (product link only — never your prompt)"
      onClick={onShare}
    >
      <Share2 aria-hidden="true" className="h-4 w-4" />
    </IconButton>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile nav whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [route]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-workspace items-center gap-3 px-4 sm:px-6">
          <a href={routeHref('sanitizer')} className="flex items-center gap-2.5 rounded-md">
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-ink">PromptShield</span>
              <span className="hidden text-2xs text-ink-faint sm:block">
                Private AI Prompt Sanitizer
              </span>
            </span>
          </a>

          <nav aria-label="Primary" className="ml-6 hidden items-center gap-0.5 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={routeHref(item.id)}
                aria-current={route === item.id ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  route === item.id
                    ? 'bg-accent-soft font-semibold text-accent-ink'
                    : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                }`}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ShareButton />
            <a
              href="https://github.com/singhtanishq/PromptShield"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="PromptShield on GitHub (opens in a new tab)"
              className="hidden h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink sm:inline-flex"
            >
              <Github aria-hidden="true" className="h-4 w-4" />
            </a>
            <ThemeToggle />
            <IconButton
              label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              {mobileNavOpen ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </svg>
              )}
            </IconButton>
          </div>
        </div>

        {mobileNavOpen && (
          <nav
            id="mobile-nav"
            aria-label="Primary mobile"
            className="border-t border-line bg-surface px-4 pb-3 pt-2 md:hidden"
          >
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={routeHref(item.id)}
                    aria-current={route === item.id ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${
                      route === item.id
                        ? 'bg-accent-soft font-semibold text-accent-ink'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-workspace flex-1 px-4 py-6 sm:px-6"
      >
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-workspace flex-col items-start justify-between gap-3 px-4 py-4 text-2xs text-ink-faint sm:flex-row sm:items-center sm:px-6">
          <p>
            PromptShield runs entirely in your browser. Prompt text is never transmitted by the
            application. Detection is heuristic — review every change before sharing.
          </p>
          <div className="flex items-center gap-3">
            <a href={routeHref('privacy')} className="hover:text-ink hover:underline">
              Privacy
            </a>
            <a href={routeHref('guides')} className="hover:text-ink hover:underline">
              Guides
            </a>
            <a href={routeHref('about')} className="hover:text-ink hover:underline">
              About
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
