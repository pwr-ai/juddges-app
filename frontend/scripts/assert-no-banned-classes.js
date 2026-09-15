/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Banned-class ratchet for the Editorial migration (#637, #638).
 *
 * Counts pre-Editorial "AI slop" tells in the frontend source and fails when
 * any family's count rises above `scripts/banned-classes.baseline.json`.
 * Each migration PR lowers the baseline; once every count is zero the gate
 * becomes a hard fail (#642).
 *
 *   node scripts/assert-no-banned-classes.js                  # check
 *   node scripts/assert-no-banned-classes.js --update-baseline # rewrite baseline to current counts
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'banned-classes.baseline.json');
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks'];
const SCAN_EXTENSIONS = new Set(['.tsx', '.ts', '.css']);
const ALLOWLIST_PREFIXES = ['components/editorial/', 'components/ui/skeleton.tsx'];

const HUES =
  'purple|indigo|violet|fuchsia|blue|sky|cyan|teal|emerald|green|amber|orange|rose|pink|slate|gray';

// Name → regex. Keep in sync with DESIGN.md "Avoid" and the #638 issue body.
const PATTERNS = {
  glass: /backdrop-blur|\bglass-/g,
  gradient: /bg-gradient-to-|bg-linear-to-|bg-clip-text/g,
  hue: new RegExp(`\\b(bg|text|border|from|to|via|ring)-(${HUES})-\\d`, 'g'),
  'transition-all': /transition-all/g,
  radius: /rounded-(xl|2xl|3xl|\[\d+px\]|\[[\d.]+rem\])\b/g,
  'hover-fx': /hover:scale-|shadow-(xl|2xl)\b/g,
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

function compareToBaseline(counts, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [name, actual] of Object.entries(counts)) {
    const expected = baseline[name] ?? 0;
    if (actual > expected) regressions.push({ name, baseline: expected, actual });
    else if (actual < expected) improvements.push({ name, baseline: expected, actual });
  }
  return { regressions, improvements };
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

function formatRow({ name, baseline, actual }) {
  return `  ${name.padEnd(16)} baseline ${String(baseline).padStart(5)}  actual ${String(actual).padStart(5)}`;
}

function main(argv) {
  const counts = countBannedPatterns(readSourceFiles());

  if (argv.includes('--update-baseline')) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, BASELINE_PATH)}`);
    return 0;
  }

  const baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const { regressions, improvements } = compareToBaseline(counts, baseline);

  if (regressions.length > 0) {
    console.error(
      [
        'Banned classes increased above scripts/banned-classes.baseline.json (#637):',
        ...regressions.map(formatRow),
        '',
        'Use the Editorial primitives in components/editorial/ (docs/reference/DESIGN.md) instead.',
      ].join('\n')
    );
    return 1;
  }

  if (improvements.length > 0) {
    console.log(
      [
        'Banned classes dropped below the baseline — lower it with',
        '`node scripts/assert-no-banned-classes.js --update-baseline`:',
        ...improvements.map(formatRow),
      ].join('\n')
    );
  }

  return 0;
}

module.exports = { PATTERNS, countBannedPatterns, compareToBaseline, isAllowlisted };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
