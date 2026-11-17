import { useEffect, useState } from 'react';

/**
 * Minimal hash-based router. Hash routing is used deliberately: it works on any
 * static host (including GitHub Pages) with no server-side SPA fallback, and
 * prompt text can never appear in route paths.
 */
export const ROUTES = ['sanitizer', 'rules', 'settings', 'privacy', 'guides', 'about'] as const;

export type RouteId = (typeof ROUTES)[number];

const ROUTE_SET: ReadonlySet<string> = new Set<string>(ROUTES);

export function parseHash(hash: string): RouteId {
  const candidate = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0] ?? '';
  return ROUTE_SET.has(candidate) ? (candidate as RouteId) : 'sanitizer';
}

export function routeHref(id: RouteId): string {
  return `#/${id}`;
}

export function navigate(id: RouteId): void {
  window.location.hash = `/${id}`;
}

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return route;
}
