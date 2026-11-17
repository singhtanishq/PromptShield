#!/usr/bin/env node
/**
 * Validate that every screenshot in docs/screenshots/ is embedded directly as a
 * Markdown image in the root README.md (with a heading and description), and
 * that every referenced image exists. Exit 1 on any violation.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS_DIR = join(ROOT, 'docs', 'screenshots');
const README = readFileSync(join(ROOT, 'README.md'), 'utf-8');

const violations = [];
const imageRefs = [...README.matchAll(/!\[([^\]]*)\]\((docs\/screenshots\/[^)]+)\)/g)].map((m) => ({
  alt: m[1],
  path: m[2],
}));

// 1. Every screenshot file is referenced in the README as an image embed.
const files = readdirSync(SHOTS_DIR)
  .filter((f) => f.endsWith('.png'))
  .sort();
if (files.length === 0) {
  violations.push('docs/screenshots/ contains no PNG screenshots.');
}
for (const file of files) {
  const ref = imageRefs.find((r) => r.path === `docs/screenshots/${file}`);
  if (ref === undefined) {
    violations.push(`${file} exists but is not embedded in README.md as an image.`);
  } else if (ref.alt.trim().length === 0) {
    violations.push(`${file} is embedded with an empty alt text.`);
  }
}

// 2. Every referenced image exists and is a plausible PNG.
for (const ref of imageRefs) {
  const full = join(ROOT, ref.path);
  if (!existsSync(full)) {
    violations.push(`README references missing image: ${ref.path}`);
    continue;
  }
  const stat = statSync(full);
  if (stat.size < 10_000) {
    violations.push(`${ref.path} looks truncated (${stat.size} bytes).`);
  }
  const magic = readFileSync(full).subarray(0, 4);
  if (!(magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47)) {
    violations.push(`${ref.path} is not a valid PNG.`);
  }
}

// 3. No plain hyperlinks to screenshots (embeds required, not links).
const linkedShots = [...README.matchAll(/\((docs\/screenshots\/[^)]+)\)/g)]
  .map((m) => m[1])
  .filter((path) => !imageRefs.some((r) => r.path === path));
for (const path of linkedShots) {
  violations.push(`${path} appears as a plain link instead of an image embed.`);
}

// 4. Each embed is preceded by a descriptive heading (### or stronger) nearby.
for (const ref of imageRefs) {
  const idx = README.indexOf(`![${ref.alt}](${ref.path})`);
  if (idx < 0) continue;
  const before = README.slice(Math.max(0, idx - 800), idx);
  if (!/^#{2,4} /m.test(before)) {
    violations.push(`${ref.path} embed has no preceding descriptive heading.`);
  }
}

console.log(
  `README validation: ${imageRefs.length} embeds checked against ${files.length} screenshots.`,
);
if (violations.length > 0) {
  console.error('\nVIOLATIONS:');
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log(
  'All screenshots are embedded directly in README.md with headings, alt text, and valid PNG data.',
);
