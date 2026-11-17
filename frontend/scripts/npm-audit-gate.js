#!/usr/bin/env node
/**
 * CI gate over `npm audit --json` output.
 *
 * Fails on any HIGH/CRITICAL advisory unless it is listed in
 * npm-audit-allowlist.json with a reason and an expiry date that has not yet
 * passed. An expired entry blocks again, so every exception is re-reviewed.
 *
 * Usage: node scripts/npm-audit-gate.js <audit.json> [allowlist.json]
 */
/* eslint-disable no-console -- CLI gate: stdout is its report */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

const BLOCKING = new Set(['high', 'critical']);

/** Advisory id (GHSA-...) from an advisory URL, falling back to the numeric source. */
function advisoryId(via) {
  const match = /GHSA-[a-z0-9-]+/i.exec(via.url || '');
  return match ? match[0] : String(via.source);
}

/** Unique HIGH/CRITICAL advisories from an npm audit (v2 JSON) report. */
function blockingAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via);
      if (!found.has(id)) {
        found.set(id, { id, package: via.name, severity: via.severity, title: via.title });
      }
    }
  }
  return [...found.values()];
}

/**
 * Split advisories into blocking and allowed.
 * @param today ISO date (YYYY-MM-DD); an entry is valid through its expiry date.
 */
function evaluate(advisories, allowlist, today) {
  const byId = new Map(allowlist.map((entry) => [entry.id, entry]));
  const blocking = [];
  const allowed = [];
  for (const adv of advisories) {
    const entry = byId.get(adv.id);
    if (entry && entry.reason && entry.expires && entry.expires >= today) {
      allowed.push({ ...adv, reason: entry.reason, expires: entry.expires });
    } else {
      blocking.push({ ...adv, expired: Boolean(entry) });
    }
  }
  const present = new Set(advisories.map((a) => a.id));
  const stale = allowlist.filter((entry) => !present.has(entry.id)).map((entry) => entry.id);
  return { blocking, allowed, stale };
}

function main() {
  const [reportPath, allowPath = path.join(__dirname, '..', 'npm-audit-allowlist.json')] =
    process.argv.slice(2);
  if (!reportPath) {
    console.error('usage: npm-audit-gate.js <audit.json> [allowlist.json]');
    process.exit(2);
  }
  const raw = fs.readFileSync(reportPath, 'utf8');
  if (!raw.trim()) {
    console.error('npm audit produced no output - failing closed');
    process.exit(1);
  }
  const report = JSON.parse(raw);
  const allowlist = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : [];
  const today = new Date().toISOString().slice(0, 10);
  const { blocking, allowed, stale } = evaluate(blockingAdvisories(report), allowlist, today);

  for (const a of allowed) {
    console.log(`ALLOWED until ${a.expires}: ${a.package} ${a.id} (${a.severity}) - ${a.reason}`);
  }
  for (const id of stale) {
    console.log(`NOTE: allowlist entry ${id} no longer matches any advisory - remove it`);
  }
  if (blocking.length) {
    console.log('BLOCKING (HIGH/CRITICAL):');
    for (const a of blocking) {
      const why = a.expired ? ' [allowlist entry expired or incomplete]' : '';
      console.log(`  - ${a.package} ${a.id} (${a.severity}) ${a.title}${why}`);
    }
    process.exit(1);
  }
  console.log('No blocking HIGH/CRITICAL npm vulnerabilities');
}

module.exports = { advisoryId, blockingAdvisories, evaluate };

if (require.main === module) {
  main();
}
