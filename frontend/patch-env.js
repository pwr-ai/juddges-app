#!/usr/bin/env node
/**
 * Runtime environment injection for Next.js standalone builds.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time.  This script patches the
 * built files at container startup so that empty build-time values are
 * replaced with the actual runtime values.
 */
const fs = require("fs");
const path = require("path");

const url = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!url) {
  console.log("  NEXT_PUBLIC_API_BASE_URL not set, skipping patch");
  process.exit(0);
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(js|html|rsc)$/.test(entry.name)) files.push(full);
  }
  return files;
}

let patched = 0;
for (const file of walk(".next")) {
  let content = fs.readFileSync(file, "utf8");
  if (!content.includes("NEXT_PUBLIC_API_BASE_URL")) continue;

  const original = content;

  // Pattern 1: JS object  —  NEXT_PUBLIC_API_BASE_URL:""
  content = content.split('NEXT_PUBLIC_API_BASE_URL:""').join(
    'NEXT_PUBLIC_API_BASE_URL:"' + url + '"'
  );

  // Pattern 2: JSON  —  "NEXT_PUBLIC_API_BASE_URL":""
  content = content.split('"NEXT_PUBLIC_API_BASE_URL":""').join(
    '"NEXT_PUBLIC_API_BASE_URL":"' + url + '"'
  );

  // Pattern 3: Escaped JSON (3 backslashes before each quote)
  // Literal file bytes: \\\"NEXT_PUBLIC_API_BASE_URL\\\":\\\"\\\"
  const esc = '\\\\\\\"'; // literal: \\\" (3 chars: backslash backslash backslash quote)
  content = content.split(
    esc + "NEXT_PUBLIC_API_BASE_URL" + esc + ":" + esc + esc
  ).join(
    esc + "NEXT_PUBLIC_API_BASE_URL" + esc + ":" + esc + url + esc
  );

  if (content !== original) {
    fs.writeFileSync(file, content);
    patched++;
  }
}

console.log("  Patched " + patched + " files");
