/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Fails a production build whose browser-facing output points at a local
 * origin (issue #578).
 *
 * The production image was built from the developer's `.env`, so
 * `NEXT_PUBLIC_API_BASE_URL=http://localhost:8004` ended up in what every
 * visitor's browser received. In a visitor's browser `localhost` is *their*
 * machine, so any request to it fails.
 *
 * Scanned: everything the browser downloads from the build output
 *   - `.next/static/**\/*.js`           client chunks
 *   - `.next/server/app/**\/*.{html,rsc}` prerendered pages (they carry the
 *     inline `window.__env` baseline rendered at build time)
 * Server-only chunks are NOT scanned: a server-side fallback such as
 * `http://localhost:8004` in a route handler never reaches the browser.
 *
 * Run by the frontend Dockerfile after `npm run build`; not part of
 * `npm run build`, because CI's route-contract build deliberately points at a
 * local stub server. Usage: `node scripts/assert-no-local-origins.js [.next]`.
 */
const fs = require('node:fs');
const path = require('node:path');

// http(s)://localhost, 127.x.x.x, 0.0.0.0 and [::1], with optional port.
const LOCAL_ORIGIN_PATTERN =
  /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d{1,5})?/gi;

// Literals shipped by third-party libraries that never configure our app.
// @supabase/auth-js's GoTrueClient defaults `url` to http://localhost:9999;
// the app always passes the real Supabase URL, so the default is dead.
const ALLOWED_LOCAL_ORIGINS = new Set(['http://localhost:9999']);

/** Local origins in `text` that are not on the allowlist (deduplicated). */
function findLocalOrigins(text) {
  const found = new Set();
  for (const match of text.matchAll(LOCAL_ORIGIN_PATTERN)) {
    const origin = match[0].toLowerCase();
    if (!ALLOWED_LOCAL_ORIGINS.has(origin)) found.add(origin);
  }
  return [...found];
}

function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(entry.name)) out.push(full);
  }
  return out;
}

/** Browser-facing files of a Next.js build directory. */
function browserFacingFiles(nextDir) {
  return [
    ...walk(path.join(nextDir, 'static'), (name) => name.endsWith('.js')),
    ...walk(path.join(nextDir, 'server', 'app'), (name) =>
      name.endsWith('.html') || name.endsWith('.rsc')
    ),
  ];
}

/** Map of file (relative to `nextDir`) -> offending origins. */
function scanBuild(nextDir) {
  const offenders = {};
  for (const file of browserFacingFiles(nextDir)) {
    const origins = findLocalOrigins(fs.readFileSync(file, 'utf8'));
    if (origins.length > 0) offenders[path.relative(nextDir, file)] = origins;
  }
  return offenders;
}

function formatReport(offenders) {
  const files = Object.keys(offenders);
  const origins = [...new Set(files.flatMap((f) => offenders[f]))].sort();
  const shown = files.slice(0, 10).map((f) => `  ${f}: ${offenders[f].join(', ')}`);
  if (files.length > shown.length) shown.push(`  ... and ${files.length - shown.length} more`);
  return [
    `Production build ships local origins to the browser: ${origins.join(', ')}`,
    ...shown,
    '',
    'A visitor\'s browser resolves these to its own machine, so the requests fail (#578).',
    'Do not pass dev values as NEXT_PUBLIC_* build args. The image reads them at',
    'runtime via /runtime-env.js; leave the build args empty or set public origins.',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const nextDir = path.resolve(argv[0] || '.next');
  if (!fs.existsSync(nextDir)) {
    console.error(`No build output at ${nextDir}. Run \`npm run build\` first.`);
    return 1;
  }
  const offenders = scanBuild(nextDir);
  if (Object.keys(offenders).length > 0) {
    console.error(formatReport(offenders));
    return 1;
  }
  process.stdout.write(`No local origins in browser-facing build output (${nextDir}).\n`);
  return 0;
}

module.exports = { findLocalOrigins, scanBuild, formatReport, ALLOWED_LOCAL_ORIGINS };

if (require.main === module) {
  process.exit(main());
}
