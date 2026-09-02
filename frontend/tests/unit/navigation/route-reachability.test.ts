/**
 * Route reachability contract (issue #511).
 *
 * The bug this guards against: a route ships fully built and no nav surface
 * ever links to it, so no amount of clicking gets a user there. `/chat` and
 * the whole `/admin` subtree sat in that state for months.
 *
 * The contract: every static route under `app/` is either linked from one of
 * the PRIMARY_NAV_SURFACES, or listed in DEEP_LINK_ONLY_ROUTES with the reason
 * it is not. Nothing is allowed to sit in limbo.
 *
 * Dynamic routes (`[id]`, `[slug]`) are exempt by construction — they are
 * reached with an interpolated href, which no static scan can attribute.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const FRONTEND_ROOT = process.cwd();

/** The chrome a user can click through without already knowing a URL. */
const PRIMARY_NAV_SURFACES = [
  'components/app-sidebar.tsx',
  'components/command-palette.tsx',
  'components/footer/CompactFooter.tsx',
  'components/navbar.tsx',
  'components/admin/AdminSidebar.tsx',
] as const;

/**
 * Routes deliberately kept off the nav surfaces. Every entry states where the
 * route is actually entered from. Adding one is a product decision, not a shrug.
 */
const DEEP_LINK_ONLY_ROUTES: ReadonlyMap<string, string> = new Map([
  ['/accessibility', 'Accessibility statement; entered by direct URL only.'],
  ['/auth/error', 'Rendered by app/auth/confirm on a failed confirmation.'],
  ['/auth/forgot-password', 'Entered from the login form.'],
  ['/auth/update-password', 'Entered from the password-recovery email link.'],
  ['/blog', 'Public blog index; entered from post permalinks and external links.'],
  ['/blog/admin', 'Author tool; entered from the blog admin editors.'],
  ['/blog/admin/new', 'Entered from /blog/admin.'],
  ['/cookies', 'Entered from the privacy policy.'],
  ['/ecosystem', 'Entered from /about and the landing page.'],
  ['/legal/disclaimer', 'Entered from the AI disclaimer badge.'],
  ['/onboarding', 'Entered from the dashboard onboarding prompt.'],
  ['/publications/admin', 'Editor tool; entered from /publications.'],
  ['/publications/admin/new', 'Entered from /publications/admin.'],
  ['/reasoning-lines', 'Entered from a reasoning-line detail page.'],
  ['/schema-chat', 'Entered from the dashboard and the schema pages.'],
  ['/schemas', 'Entered from the extraction and schema detail pages.'],
  ['/settings', 'Entered from the user card menu.'],
  ['/statistics', 'Entered from the dashboard, settings and dataset comparison.'],
  ['/use-cases', 'Entered from /about and the login form.'],
  ['/use-cases/uk-judgments', 'Entered from /use-cases.'],
]);

/** The orphans fixed by #511 — each must stay on a primary nav surface. */
const NAV_LINKED_ROUTES = [
  '/chat',
  '/admin',
  '/search/extractions',
  '/precedents',
  '/argumentation-analysis',
  '/judge-fingerprint',
  '/status',
] as const;

const HREF_PATTERN = /(?:href|to)\s*[:=]\s*\{?\s*["'`](\/[^"'`#?]*)/g;

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRoute(pageFilePath: string): string {
  const segments = relative(join(FRONTEND_ROOT, 'app'), pageFilePath)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function listStaticRoutes(): string[] {
  const pageFiles = collectSourceFiles(join(FRONTEND_ROOT, 'app')).filter(
    (filePath) => filePath.endsWith(`${sep}page.tsx`),
  );

  return [...new Set(pageFiles.map(toRoute))]
    .filter((route) => !route.includes('['))
    .sort();
}

function collectNavLinkedPaths(): Set<string> {
  const linked = new Set<string>();

  for (const surface of PRIMARY_NAV_SURFACES) {
    const source = readFileSync(join(FRONTEND_ROOT, surface), 'utf8');
    HREF_PATTERN.lastIndex = 0;
    let match = HREF_PATTERN.exec(source);
    while (match !== null) {
      const trimmed = match[1].replace(/\/+$/, '');
      linked.add(trimmed === '' ? '/' : trimmed);
      match = HREF_PATTERN.exec(source);
    }
  }

  return linked;
}

describe('route reachability', () => {
  const staticRoutes = listStaticRoutes();

  it('finds the app routes it is supposed to be checking', () => {
    expect(staticRoutes).toContain('/');
    expect(staticRoutes).toContain('/search');
    expect(staticRoutes.length).toBeGreaterThan(30);
  });

  it('leaves no route unreachable and undeclared', () => {
    const navLinked = collectNavLinkedPaths();
    const undeclared = staticRoutes.filter(
      (route) => !navLinked.has(route) && !DEEP_LINK_ONLY_ROUTES.has(route),
    );

    expect(undeclared).toEqual([]);
  });

  it('keeps the deep-link-only allowlist free of stale entries', () => {
    const stale = [...DEEP_LINK_ONLY_ROUTES.keys()].filter(
      (route) => !staticRoutes.includes(route),
    );

    expect(stale).toEqual([]);
  });

  it('keeps the routes fixed by #511 on a primary nav surface', () => {
    const navLinked = collectNavLinkedPaths();

    for (const route of NAV_LINKED_ROUTES) {
      expect([...navLinked]).toContain(route);
    }
  });
});
