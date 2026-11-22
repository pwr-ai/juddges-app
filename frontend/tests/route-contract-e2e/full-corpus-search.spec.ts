import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  ADAPTER_BASE_URL,
  expectNoUnexpectedStubRequests,
  setSyntheticSession,
  type AdapterRequest,
} from './synthetic-session';

/**
 * Full-corpus search (Weaviate v2, #867) for a signed-in user, PR-gated:
 * `/search` opens on the full corpus by default and keeps it in `?engine=`,
 * and a hit without a `judgments` row opens `/judgments/full/<id>`.
 *
 * The stub's hit is an NSA ruling, whose id is a path (`/doc/39FBE5DB09`).
 * Its link is `/judgments/full/%2Fdoc%2F39FBE5DB09`, so this spec proves an
 * encoded slash survives Next routing: client-side `<Link>` navigation and a
 * hard load both reach the page, and the BFF forwards the id to the backend.
 */

/** Mirrors `FULL_CORPUS` in `stub-services.mjs`. */
const FULL_CORPUS = {
  judgmentId: '/doc/39FBE5DB09',
  signature: 'II FSK 1/21',
  fullText: 'Route contract full-corpus judgment text.',
};
const DETAIL_PATH = `/judgments/full/${encodeURIComponent(FULL_CORPUS.judgmentId)}`;

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

async function adapterRequests(request: APIRequestContext): Promise<AdapterRequest[]> {
  const response = await request.get(`${ADAPTER_BASE_URL}/__route-contract/requests`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { requests: AdapterRequest[] }).requests;
}

test.describe('full-corpus search contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
    await setSyntheticSession(context);
  });

  test.afterEach(async ({ request }) => {
    await expectNoUnexpectedStubRequests(request);
  });

  test('defaults to the full corpus and opens an NSA hit by its encoded id', async ({
    page,
    request,
  }) => {
    await page.goto('/search');

    await expect(page.getByRole('radio', { name: /Polish native|Polski natywny/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page).toHaveURL(/[?&]engine=full(&|$)/);

    const box = page.getByRole('searchbox', { name: 'Zapytanie (pełna baza)' });
    await box.fill('podatek od spadków');
    await box.press('Enter');

    await expect(
      page.getByText(/Results from the full Polish corpus|Wyniki z pełnej bazy polskiej/),
    ).toBeVisible();
    const hit = page.getByRole('link', { name: FULL_CORPUS.signature });
    await expect(hit).toHaveAttribute('href', DETAIL_PATH);

    // Client-side navigation through <Link>.
    await hit.click();
    await expect(
      page.getByRole('heading', { level: 1, name: FULL_CORPUS.signature }),
    ).toBeVisible();
    await expect(page.getByText(FULL_CORPUS.fullText)).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Orzeczenie z pełnej bazy (bez ekstrakcji).');

    const paths = (await adapterRequests(request)).map(({ path }) => path);
    expect(paths).toContain('/search/v2');
    expect(paths.some((path) => path.startsWith('/search/v2/judgments/'))).toBe(true);
  });

  test('serves the full-corpus page and BFF on a hard load of an encoded id', async ({
    page,
    request,
  }) => {
    const response = await page.goto(DETAIL_PATH);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: FULL_CORPUS.signature }),
    ).toBeVisible();

    const bff = await page.request.get(`/api/search/v2/judgments/${encodeURIComponent('/doc/missing')}`);
    expect(bff.status()).toBe(404);
    expect(bff.headers()['content-type']).toContain('application/json');

    const paths = (await adapterRequests(request)).map(({ path }) => path);
    // The BFF reached the backend with the id still one encoded segment, for
    // the page's own read (React Query may read it more than once) and the
    // direct BFF call.
    const detailPaths = new Set(
      paths.filter((path) => path.startsWith('/search/v2/judgments/')),
    );
    expect(detailPaths).toEqual(
      new Set([
        `/search/v2/judgments/${encodeURIComponent(FULL_CORPUS.judgmentId)}`,
        `/search/v2/judgments/${encodeURIComponent('/doc/missing')}`,
      ]),
    );
  });
});
