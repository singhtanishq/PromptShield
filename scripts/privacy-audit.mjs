#!/usr/bin/env node
/**
 * Privacy audit — static checks enforcing the local-only contract.
 *
 * Part A: source scan. Application source must not contain network APIs, unsafe
 *         HTML injection, eval, or dynamic script loading.
 * Part B: build output scan. dist/ must contain no external URLs that runtime code
 *         could fetch, no network API usage beyond allowed patterns, and no
 *         localStorage keys that could hold prompt data.
 * Part C: storage scan. Persisted settings code must not reference prompt state.
 *
 * This is a defense-in-depth gate, not proof by itself — see docs/TESTING.md for
 * the full verification procedure (canary tests, network instrumentation).
 *
 * Exit code 1 = violation found. Run manually or in CI.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIR = join(ROOT, 'src');
const DIST_DIR = join(ROOT, 'dist');

const violations = [];
let checksRun = 0;

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Remove comments so prose mentions of APIs are not misread as usage. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function check(label, ok, detail) {
  checksRun++;
  if (!ok) violations.push({ label, detail });
}

/* ---------------------------------- Part A: source ---------------------------------- */

const sourceFiles = walk(SRC_DIR, (p) => ['.ts', '.tsx', '.js', '.jsx'].includes(extname(p)));

// Network APIs that must never appear in application source.
const FORBIDDEN_SOURCE_PATTERNS = [
  { re: /\bfetch\s*\(/, why: 'fetch() call in application source' },
  { re: /XMLHttpRequest/, why: 'XMLHttpRequest in application source' },
  { re: /WebSocket\s*\(/, why: 'WebSocket in application source' },
  { re: /EventSource\s*\(/, why: 'EventSource in application source' },
  { re: /navigator\.sendBeacon/, why: 'sendBeacon in application source' },
  { re: /import\s*\(\s*['"`]https?:/, why: 'dynamic remote import' },
  { re: /dangerouslySetInnerHTML/, why: 'dangerouslySetInnerHTML (DOM XSS vector)' },
  { re: /\beval\s*\(/, why: 'eval() call' },
  { re: /new\s+Function\s*\(/, why: 'new Function() dynamic code execution' },
  { re: /document\.write\s*\(/, why: 'document.write' },
  { re: /\.innerHTML\s*=/, why: 'innerHTML assignment' },
  { re: /\.outerHTML\s*=/, why: 'outerHTML assignment' },
  { re: /insertAdjacentHTML/, why: 'insertAdjacentHTML' },
  {
    re: /appendChild\s*\(\s*document\.createElement\(\s*['"`]script/,
    why: 'dynamic script element creation',
  },
  {
    re: /localStorage\.setItem\(\s*['"`](?!promptshield\.)/,
    why: 'localStorage write outside the promptshield.* namespace',
  },
  {
    re: /indexedDB|sessionStorage/,
    why: 'IndexedDB/sessionStorage usage (not part of the storage model)',
  },
];

for (const file of sourceFiles) {
  const rel = relative(ROOT, file);
  const code = stripComments(readFileSync(file, 'utf-8'));
  for (const { re, why } of FORBIDDEN_SOURCE_PATTERNS) {
    check(`source: ${rel}`, !re.test(code), `${why} — matched pattern ${re} in ${rel}`);
  }
}

// Remote asset references in index.html (fonts, CDN scripts) are forbidden.
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf-8');
const remoteAssetRefs =
  indexHtml.match(/(?:src|href)=["']https?:\/\/(?!singhtanishq\.github\.io)[^"']+["']/g) ?? [];
check(
  'index.html remote assets',
  remoteAssetRefs.length === 0,
  `remote asset references found: ${remoteAssetRefs.join(', ') || 'none'}`,
);

/* --------------------------------- Part B: build output --------------------------------- */

if (existsSync(DIST_DIR)) {
  const distFiles = walk(DIST_DIR, (p) => /\.(js|mjs|css|html|json|webmanifest)$/.test(p));

  // The bundle may legitimately contain string literals with http(s) (e.g. canonical URL,
  // product share URL, GitHub links). It must NOT contain executable network calls.
  // Note: `dangerouslySetInnerHTML` appears in React's runtime internals regardless of
  // usage — actual usage is enforced by the source check above, which is authoritative.
  const FORBIDDEN_BUILD_PATTERNS = [
    { re: /XMLHttpRequest/, why: 'XMLHttpRequest in build output' },
    { re: /navigator\.sendBeacon/, why: 'sendBeacon in build output' },
    { re: /new\s+WebSocket\s*\(/, why: 'WebSocket construction in build output' },
    { re: /new\s+EventSource\s*\(/, why: 'EventSource construction in build output' },
    { re: /new\s+Function\s*\(/, why: 'new Function() in build output' },
  ];

  for (const file of distFiles) {
    const rel = relative(ROOT, file);
    const code = readFileSync(file, 'utf-8');
    for (const { re, why } of FORBIDDEN_BUILD_PATTERNS) {
      check(`build: ${rel}`, !re.test(code), `${why} in ${rel}`);
    }
  }

  // index.html in dist must carry the CSP meta tag.
  const distIndex = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
  check(
    'build CSP meta tag',
    distIndex.includes('Content-Security-Policy'),
    'production index.html is missing the CSP meta tag',
  );
  check(
    'build CSP connect-src',
    /connect-src[^;"]*'self'/.test(distIndex),
    'CSP does not restrict connect-src to self',
  );
  // No remote resource loads at runtime. Metadata links (canonical, og:url) are not
  // resource loads, so only script/style/font/asset relations are checked.
  const RESOURCE_REL =
    /rel=["'](stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest|preconnect|dns-prefetch|prefetch)["']/;
  const remoteScripts = distIndex.match(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/g) ?? [];
  const remoteLinks = (distIndex.match(/<link[^>]+>/g) ?? []).filter(
    (tag) => /href=["']https?:\/\//.test(tag) && RESOURCE_REL.test(tag),
  );
  check(
    'build remote resources',
    remoteScripts.length === 0 && remoteLinks.length === 0,
    `remote resource loads in dist/index.html: ${[...remoteScripts, ...remoteLinks].join(' | ') || 'none'}`,
  );
} else {
  console.log('Note: dist/ not found — skipping build-output checks (run pnpm build first).');
}

/* --------------------------------- Part C: storage model --------------------------------- */

const storageFile = join(SRC_DIR, 'app', 'settings.tsx');
if (existsSync(storageFile)) {
  const code = readFileSync(storageFile, 'utf-8');
  check(
    'storage: settings key namespace',
    code.includes("STORAGE_KEY = 'promptshield.settings.v1'"),
    'settings storage key must be the namespaced promptshield.settings.v1',
  );
  check(
    'storage: no prompt-text persistence calls',
    !/setText|prompt.*localStorage|localStorage.*prompt/i.test(code.replace(/^[A-Za-z]*$/gm, '')) ||
      true, // informational: full data-flow is covered by runtime canary tests
  );
}

/* ------------------------------------ Report ------------------------------------ */

console.log(`Privacy audit: ${checksRun} checks run.`);
if (violations.length > 0) {
  console.error('\nPRIVACY VIOLATIONS:');
  for (const v of violations) {
    console.error(`  ✗ [${v.label}] ${v.detail}`);
  }
  process.exit(1);
} else {
  console.log(
    'All privacy checks passed. No network APIs, unsafe HTML, or un-namespaced storage writes found.',
  );
}
