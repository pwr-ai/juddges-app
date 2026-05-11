#!/usr/bin/env node
/**
 * Playwright-driven screenshot capture for the in-app onboarding tour and
 * MkDocs tutorial. Logs in once via the real Supabase auth UI, walks each
 * step listed in STEPS, and writes PNGs to frontend/public/docs/onboarding/.
 *
 * Both /onboarding (in-app) and docs/tutorials/first-30-minutes.md reference
 * those PNG paths, so a single `npm run docs:screens` keeps both in sync.
 *
 * Requirements (mirrors the Playwright e2e harness):
 *   - TEST_USER_EMAIL / TEST_USER_PASSWORD set in env (auto-loaded from
 *     repo-root .env or frontend/.env.local)
 *   - A running frontend at FRONTEND_BASE_URL (default http://localhost:3026 — dev)
 *
 * Run:
 *   npm run docs:screens                    # capture every step
 *   npm run docs:screens -- dashboard       # capture a single step by name
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Mirror playwright.config: prefer frontend/.env.local, then repo-root .env.
for (const candidate of [
  path.join(REPO_ROOT, 'frontend', '.env.local'),
  path.join(REPO_ROOT, '.env'),
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    console.log(`[docs:screens] loaded env from ${candidate}`);
    break;
  }
}

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3026';

/**
 * Each capture writes to both locations so the in-app /onboarding route
 * (served from frontend/public) and the MkDocs tutorial (served from docs/)
 * reference the same PNGs without absolute-URL coupling.
 */
const OUTPUT_DIRS = [
  path.join(REPO_ROOT, 'frontend', 'public', 'docs', 'onboarding'),
  path.join(REPO_ROOT, 'docs', 'assets', 'onboarding'),
];

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error(
    '[docs:screens] TEST_USER_EMAIL and TEST_USER_PASSWORD must be set ' +
      '(repo-root .env or frontend/.env.local).',
  );
  process.exit(1);
}

/**
 * Each step is one captured screenshot. `prepare` runs after navigation and
 * before the screenshot — use it for ensuring deterministic state (waiting
 * on selectors, dismissing overlays, scrolling).
 *
 * Add a step here, run `npm run docs:screens`, reference the PNG from
 * /onboarding and the tutorial. That's the whole loop.
 */
const STEPS = [
  {
    name: 'dashboard',
    url: '/',
    prepare: async (page) => {
      await page.getByText('Database Overview', { exact: false }).first().waitFor({ state: 'visible' });
    },
  },
  {
    name: 'step-3-chat',
    url: '/chat',
    waitUntil: 'load', // chat page keeps a persistent connection open
    prepare: async (page) => {
      // Wait for the input box and at least one example-question chip to
      // render; then a settle so the typing animation in the header has
      // completed.
      await page.getByPlaceholder(/Ask JuDDGES|Ask Juddges/i).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'step-2-collections',
    url: '/collections',
    prepare: async (page) => {
      await Promise.race([
        page.getByText(/Showing .* of .* collections?/i).first().waitFor({ state: 'visible', timeout: 20_000 }),
        page.getByText(/No collections|Create your first collection/i).waitFor({ state: 'visible', timeout: 20_000 }),
      ]).catch(() => {});
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'step-1-search',
    // Evergreen demo query — short, English, recognisable legal concept that
    // reliably returns UK results and showcases the hybrid ranking signals.
    url: '/search?q=unfair+dismissal',
    prepare: async (page) => {
      // Wait for either a result heading or the no-results panel — both are
      // valid terminal states for the screenshot.
      await Promise.race([
        page.getByText(/Showing/).first().waitFor({ state: 'visible', timeout: 30_000 }),
        page.getByText(/No matching documents/i).waitFor({ state: 'visible', timeout: 30_000 }),
      ]).catch(() => {
        // Fall through to a small settle delay rather than failing the run.
      });
      await page.waitForTimeout(1500);
    },
  },
  // Phase 3+: step-2-collections, step-3-chat, step-4-base-schema
];

async function login(page) {
  await page.goto(`${BASE_URL}/auth/login`);
  await page.locator('#email').waitFor({ state: 'visible' });
  await page.locator('#email').fill(TEST_USER_EMAIL);
  await page.locator('#password').fill(TEST_USER_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });
}

async function captureStep(page, step) {
  const target = `${BASE_URL}${step.url}`;
  console.log(`[docs:screens] → ${step.name}: ${target}`);
  // Pages with long-polling / SSE never reach `networkidle`. Steps can
  // opt out via `waitUntil: 'load'`; default stays strict.
  await page.goto(target, { waitUntil: step.waitUntil ?? 'networkidle' });

  if (step.prepare) {
    await step.prepare(page);
  }

  // Suppress the onboarding banner so screenshots don't include the prompt
  // to start the tour they're trying to illustrate.
  await page.evaluate(() => {
    try {
      window.localStorage.setItem('onboarding-dismissed', 'true');
    } catch {
      // Ignore — storage may be unavailable in private modes.
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  if (step.prepare) {
    await step.prepare(page);
  }

  const [primary, ...mirrors] = OUTPUT_DIRS.map((d) =>
    path.join(d, `${step.name}.png`),
  );
  await page.screenshot({ path: primary, fullPage: false });
  console.log(`[docs:screens]   wrote ${path.relative(REPO_ROOT, primary)}`);

  const buf = await fs.readFile(primary);
  for (const mirrorPath of mirrors) {
    await fs.writeFile(mirrorPath, buf);
    console.log(`[docs:screens]   mirrored ${path.relative(REPO_ROOT, mirrorPath)}`);
  }
}

async function main() {
  for (const dir of OUTPUT_DIRS) {
    await fs.mkdir(dir, { recursive: true });
  }

  const requested = process.argv.slice(2);
  const steps = requested.length === 0
    ? STEPS
    : STEPS.filter((s) => requested.includes(s.name));

  if (requested.length > 0 && steps.length === 0) {
    console.error(`[docs:screens] no steps matched: ${requested.join(', ')}`);
    console.error(`[docs:screens] available: ${STEPS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await login(page);
    for (const step of steps) {
      await captureStep(page, step);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[docs:screens] failed:', err);
  process.exit(1);
});
