/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Banned-class gate for the Editorial migration (#637, #638, #642).
 *
 * Counts pre-Editorial "AI slop" tells in the frontend source and fails if
 * any are found. This was a ratchet against
 * `scripts/banned-classes.baseline.json` while #638-#641 and #676 drove the
 * counts down; every family reached zero in #642, so the baseline is gone and
 * any hit is now a hard failure.
 *
 *   node scripts/assert-no-banned-classes.js   # check (exit 1 on any hit)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks'];
const SCAN_EXTENSIONS = new Set(['.tsx', '.ts', '.css']);
const ALLOWLIST_PREFIXES = ['components/editorial/', 'components/ui/skeleton.tsx'];

const HUES =
  'purple|indigo|violet|fuchsia|blue|sky|cyan|teal|emerald|green|amber|orange|rose|pink|slate|gray|red|yellow';

// Name → regex. Keep in sync with DESIGN.md "Avoid" and the #638 issue body.
const PATTERNS = {
  glass: /backdrop-blur|\bglass-/g,
  gradient: /bg-gradient-to-|bg-linear-to-|bg-clip-text/g,
  hue: new RegExp(`\\b(bg|text|border|from|to|via|ring)-(${HUES})-\\d`, 'g'),
  'transition-all': /transition-all/g,
  radius: /rounded-(xl|2xl|3xl|\[\d+px\]|\[[\d.]+rem\])\b/g,
  // `(?<!-)` keeps this on utility classes: `--shadow-xl: var(--shadow-lg)` in
  // globals.css is the cap that neutralises the oversized shadow, not a use of it.
  'hover-fx': /hover:scale-|(?<!-)shadow-(xl|2xl)\b/g,
  motion: /animate-(ping|bounce|shimmer)\b|repeat:\s*Infinity/g,
  'ai-glyph': /\bSparkles\b|\bWand2\b/g,
};

function isAllowlisted(relativePath) {
  return ALLOWLIST_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function countBannedPatterns(files) {
  const counts = Object.fromEntries(Object.keys(PATTERNS).map((name) => [name, 0]));
  for (const { content } of files) {
    for (const [name, pattern] of Object.entries(PATTERNS)) {
      counts[name] += (content.match(pattern) ?? []).length;
    }
  }
  return counts;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function readSourceFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const full of walk(abs)) {
      const relativePath = path.relative(ROOT, full);
      if (isAllowlisted(relativePath)) continue;
      files.push({ path: relativePath, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return files;
}

function formatRow({ name, count, files }) {
  const where = files.slice(0, 3).join(', ') + (files.length > 3 ? `, +${files.length - 3} more` : '');
  return `  ${name.padEnd(16)} ${String(count).padStart(4)}  ${where}`;
}

function findOffenders(files) {
  const offenders = [];
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    let count = 0;
    const hit = [];
    for (const file of files) {
      const n = (file.content.match(pattern) ?? []).length;
      if (n > 0) {
        count += n;
        hit.push(file.path);
      }
    }
    if (count > 0) offenders.push({ name, count, files: hit });
  }
  return offenders;
}

function main() {
  const offenders = findOffenders(readSourceFiles());

  if (offenders.length > 0) {
    console.error(
      [
        'Banned pre-Editorial classes found (#637):',
        ...offenders.map(formatRow),
        '',
        'Use the Editorial primitives in components/editorial/ (docs/reference/DESIGN.md) instead.',
        'These patterns are a hard failure - there is no baseline to raise.',
      ].join('\n')
    );
    return 1;
  }

  return 0;
}

module.exports = { PATTERNS, countBannedPatterns, findOffenders, isAllowlisted };

if (require.main === module) {
  process.exit(main());
}
