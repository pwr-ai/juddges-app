import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const APP_BASE_URL = 'http://127.0.0.1:3006';
const ADAPTER_BASE_URL = 'http://127.0.0.1:4311';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const SCHEMA_DETAIL_SELECT =
  'id,name,description,type,category,text,dates,status,is_verified,created_at,updated_at,user_id';

const IDS = {
  chat: {
    known: '10000000-0000-4000-8000-000000000001',
    missing: '10000000-0000-4000-8000-000000000002',
    hidden: '10000000-0000-4000-8000-000000000003',
  },
  collection: {
    known: 'known-collection',
    missing: 'missing-collection',
    hidden: 'hidden-collection',
  },
  document: {
    known: 'known-document',
    missing: 'missing-document',
    hidden: 'hidden-document',
  },
  schema: {
    known: '20000000-0000-4000-8000-000000000001',
    missing: '20000000-0000-4000-8000-000000000002',
    hidden: '20000000-0000-4000-8000-000000000003',
  },
  extraction: {
    known: '30000000-0000-4000-8000-000000000001',
    missing: '30000000-0000-4000-8000-000000000002',
    hidden: '30000000-0000-4000-8000-000000000003',
    invalid: '30000000-0000-4000-8000-000000000004',
    rateLimited: '30000000-0000-4000-8000-000000000005',
    unavailable: '30000000-0000-4000-8000-000000000006',
  },
} as const;

type SessionMode = 'valid' | 'invalid' | 'outage';

interface AdapterRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  unexpected?: boolean;
}

async function resetAdapter(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${ADAPTER_BASE_URL}/__route-contract/reset`);
  expect(response.status()).toBe(204);
}

async function adapterRequests(
  request: APIRequestContext,
): Promise<AdapterRequest[]> {
  const response = await request.get(
    `${ADAPTER_BASE_URL}/__route-contract/requests`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { requests: AdapterRequest[] };
  return payload.requests;
}

function domainRequests(requests: AdapterRequest[]): AdapterRequest[] {
  return requests.filter(({ path }) => path !== '/auth/v1/user');
}

async function setSyntheticSession(
  context: BrowserContext,
  mode: SessionMode,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const session = {
    access_token: `route-contract-${mode}`,
    refresh_token: `route-contract-${mode}-refresh`,
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'route-contract@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-08-06T00:00:00.000Z',
    },
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString('base64url');

  await context.clearCookies();
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${encoded}`,
      url: APP_BASE_URL,
      expires: expiresAt,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

async function expectWireStatus(
  request: APIRequestContext,
  method: string,
  path: string,
  status: number,
): Promise<APIResponse> {
  const response = await request.fetch(path, {
    method,
    maxRedirects: 0,
  });
  expect(response.status()).toBe(status);
  return response;
}

async function navigate(
  context: BrowserContext,
  path: string,
  status: number,
): Promise<string> {
  const page: Page = await context.newPage();
  const response = await page.goto(path, { waitUntil: 'commit' });
  expect(response, `missing main-resource response for ${path}`).not.toBeNull();
  expect(response?.status()).toBe(status);
  expect(page.url()).toBe(`${APP_BASE_URL}${path}`);
  const body = await response!.text();
  await page.close();
  return body;
}

function expectOneCall(
  requests: AdapterRequest[],
  path: string,
  query: Record<string, string> = {},
): void {
  expect(domainRequests(requests)).toEqual([
    { method: 'GET', path, query },
  ]);
}

test.describe.serial('production route status contract', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.clearCookies();
    await resetAdapter(request);
  });

  test.afterEach(async ({ request }) => {
    const requests = await adapterRequests(request);
    expect(requests.filter(({ unexpected }) => unexpected)).toEqual([]);
  });

  test('serves every known dynamic detail page through authenticated browser navigation', async ({
    browser,
    request,
  }) => {
    const navigationContext = await browser.newContext({
      baseURL: APP_BASE_URL,
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    });
    await setSyntheticSession(navigationContext, 'valid');
    const cases = [
      {
        pagePath: `/chat/${IDS.chat.known}`,
        marker: IDS.chat.known,
        adapterPath: '/rest/v1/chats',
        query: {
          select: 'id',
          id: `eq.${IDS.chat.known}`,
          user_id: `eq.${USER_ID}`,
        },
      },
      {
        pagePath: `/collections/${IDS.collection.known}`,
        marker: 'Route contract collection',
        adapterPath: `/collections/${IDS.collection.known}`,
        query: { limit: '20' },
      },
      {
        pagePath: `/documents/${IDS.document.known}`,
        marker: 'Route contract judgment',
        adapterPath: `/documents/${IDS.document.known}/metadata`,
        query: {},
      },
      {
        pagePath: `/schemas/${IDS.schema.known}`,
        marker: IDS.schema.known,
        adapterPath: '/rest/v1/extraction_schemas',
        query: {
          select: SCHEMA_DETAIL_SELECT,
          id: `eq.${IDS.schema.known}`,
          limit: '1',
        },
      },
      {
        pagePath: `/extractions/${IDS.extraction.known}`,
        marker: IDS.extraction.known,
        adapterPath: `/extractions/${IDS.extraction.known}`,
        query: { include_results: 'false' },
      },
    ] as const;

    try {
      for (const routeCase of cases) {
        await resetAdapter(request);
        const body = await navigate(
          navigationContext,
          routeCase.pagePath,
          200,
        );
        expect(body).toContain(routeCase.marker);
        expectOneCall(
          await adapterRequests(request),
          routeCase.adapterPath,
          routeCase.query,
        );
      }
    } finally {
      await navigationContext.close();
    }
  });

  test('returns route-owned 404s for missing and hidden dynamic resources', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'valid');
    const cases = [
      {
        paths: [`/chat/${IDS.chat.missing}`, `/chat/${IDS.chat.hidden}`],
        adapterPath: '/rest/v1/chats',
        queryKey: 'id',
        ids: [IDS.chat.missing, IDS.chat.hidden],
      },
      {
        paths: [
          `/collections/${IDS.collection.missing}`,
          `/collections/${IDS.collection.hidden}`,
        ],
        adapterPath: '/collections/',
        ids: [IDS.collection.missing, IDS.collection.hidden],
      },
      {
        paths: [
          `/documents/${IDS.document.missing}`,
          `/documents/${IDS.document.hidden}`,
        ],
        adapterPath: '/documents/',
        ids: [IDS.document.missing, IDS.document.hidden],
      },
      {
        paths: [
          `/schemas/${IDS.schema.missing}`,
          `/schemas/${IDS.schema.hidden}`,
        ],
        adapterPath: '/rest/v1/extraction_schemas',
        queryKey: 'id',
        ids: [IDS.schema.missing, IDS.schema.hidden],
      },
      {
        paths: [
          `/extractions/${IDS.extraction.missing}`,
          `/extractions/${IDS.extraction.hidden}`,
        ],
        adapterPath: '/extractions/',
        ids: [IDS.extraction.missing, IDS.extraction.hidden],
      },
    ] as const;

    for (const routeCase of cases) {
      for (const [index, path] of routeCase.paths.entries()) {
        await resetAdapter(request);
        await navigate(context, path, 404);
        const id = routeCase.ids[index];
        const requests = await adapterRequests(request);
        if (routeCase.adapterPath === '/rest/v1/chats') {
          expectOneCall(requests, routeCase.adapterPath, {
            select: 'id',
            id: `eq.${id}`,
            user_id: `eq.${USER_ID}`,
          });
        } else if (routeCase.adapterPath === '/rest/v1/extraction_schemas') {
          expectOneCall(requests, routeCase.adapterPath, {
            select: SCHEMA_DETAIL_SELECT,
            id: `eq.${id}`,
            limit: '1',
          });
        } else {
          const suffix = routeCase.adapterPath.startsWith('/documents/')
            ? `${id}/metadata`
            : id;
          expectOneCall(
            requests,
            `${routeCase.adapterPath}${suffix}`,
            routeCase.adapterPath === '/collections/'
              ? { limit: '20' }
              : routeCase.adapterPath === '/extractions/'
                ? { include_results: 'false' }
                : {},
          );
        }
      }
    }
  });

  test('preserves exact extraction upstream failures with one adapter read each', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'valid');
    const statuses = [
      [IDS.extraction.missing, 404],
      [IDS.extraction.invalid, 422],
      [IDS.extraction.rateLimited, 429],
      [IDS.extraction.unavailable, 503],
    ] as const;

    for (const [id, status] of statuses) {
      await resetAdapter(request);
      const body = await navigate(context, `/extractions/${id}`, status);
      expect(body).toContain(`Extraction service ${status}`);
      expectOneCall(await adapterRequests(request), `/extractions/${id}`, {
        include_results: 'false',
      });
    }
  });

  test('hydrates fixture content for client-rendered known pages', async ({
    context,
  }) => {
    await setSyntheticSession(context, 'valid');
    const cases = [
      {
        pagePath: `/chat/${IDS.chat.known}`,
        marker: 'Route contract chat message',
      },
      {
        pagePath: `/schemas/${IDS.schema.known}`,
        marker: 'Route contract schema',
      },
      {
        pagePath: `/extractions/${IDS.extraction.known}`,
        marker: 'Route contract extraction schema',
      },
    ] as const;

    for (const routeCase of cases) {
      const page = await context.newPage();
      const response = await page.goto(routeCase.pagePath);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByText(routeCase.marker, { exact: true }),
      ).toBeVisible();
      await page.close();
    }
  });

  test('keeps extraction schema metadata after the detail page polls', async ({
    context,
  }) => {
    // This assertion used to be a race, and that is what made this whole check
    // flaky (#524): the page painted `schema_name` from the SSR snapshot, then the
    // first poll answered with it nulled and the row disappeared. Whether the
    // check passed depended on whether it read the DOM before or after that
    // response — 1 in 10 on main, 8 in 9 once client-bundle timing shifted.
    //
    // So wait for the poll response explicitly and assert after it, rather than
    // sampling the DOM at an arbitrary moment. The job is SUCCESS, which is
    // terminal, so exactly one poll fires and there is a well-defined "after".
    await setSyntheticSession(context, 'valid');
    const page = await context.newPage();

    const pollResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/extractions?job_id=') &&
        response.request().method() === 'GET',
    );
    const response = await page.goto(`/extractions/${IDS.extraction.known}`);
    expect(response?.status()).toBe(200);

    const marker = page.getByText('Route contract extraction schema', {
      exact: true,
    });
    await expect(marker).toBeVisible();

    const polled = await pollResponse;
    expect(polled.status()).toBe(200);
    // The stub serves no extraction_jobs row, so the BFF cannot resolve the name
    // from Supabase — the page must hold the value it already had.
    await expect(marker).toBeVisible();

    await page.close();
  });

  test('models a hidden chat row behind the ownership filter', async ({
    request,
  }) => {
    const query = new URLSearchParams({
      select: 'id',
      id: `eq.${IDS.chat.hidden}`,
      user_id: `eq.${OTHER_USER_ID}`,
    });
    const response = await request.get(
      `${ADAPTER_BASE_URL}/rest/v1/chats?${query.toString()}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([{ id: IDS.chat.hidden }]);

    expectOneCall(await adapterRequests(request), '/rest/v1/chats', {
      select: 'id',
      id: `eq.${IDS.chat.hidden}`,
      user_id: `eq.${OTHER_USER_ID}`,
    });
  });

  test('keeps an authenticated unknown route as a plain 404 with no domain read', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'valid');
    await navigate(context, '/__route-contract-missing', 404);
    expect(domainRequests(await adapterRequests(request))).toEqual([]);
  });

  test('rejects unsupported extraction detail methods without a domain read', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'valid');

    for (const method of ['POST', 'DELETE']) {
      const response = await expectWireStatus(
        context.request,
        method,
        `/extractions/${IDS.extraction.known}`,
        405,
      );
      expect(response.headers()['allow']).toBe('GET, HEAD');
    }

    expect(domainRequests(await adapterRequests(request))).toEqual([]);
  });

  test('redirects an anonymous page and returns exact anonymous BFF responses', async ({
    context,
    request,
  }) => {
    const pagePath = `/extractions/${IDS.extraction.known}`;
    const pageResponse = await expectWireStatus(
      context.request,
      'GET',
      pagePath,
      307,
    );
    const location = new URL(
      pageResponse.headers()['location'],
      APP_BASE_URL,
    );
    expect(`${location.pathname}${location.search}`).toBe(
      `/auth/login?next=${encodeURIComponent(pagePath)}`,
    );

    const bffPath = `/api/extractions?job_id=${IDS.extraction.known}`;
    const bff = await expectWireStatus(context.request, 'GET', bffPath, 401);
    expect(bff.headers()['content-type']).toContain('application/json');
    expect(await bff.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    const bffHead = await expectWireStatus(
      context.request,
      'HEAD',
      bffPath,
      401,
    );
    expect(await bffHead.text()).toBe('');

    expect(domainRequests(await adapterRequests(request))).toEqual([]);
  });

  test('treats an invalid synthetic session as anonymous for pages and BFF reads', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'invalid');
    const pagePath = `/extractions/${IDS.extraction.known}`;
    const pageResponse = await expectWireStatus(
      context.request,
      'GET',
      pagePath,
      307,
    );
    const location = new URL(
      pageResponse.headers()['location'],
      APP_BASE_URL,
    );
    expect(`${location.pathname}${location.search}`).toBe(
      `/auth/login?next=${encodeURIComponent(pagePath)}`,
    );

    const bff = await expectWireStatus(
      context.request,
      'GET',
      `/api/extractions?job_id=${IDS.extraction.known}`,
      401,
    );
    expect(await bff.json()).toMatchObject({ code: 'UNAUTHORIZED' });

    const requests = await adapterRequests(request);
    expect(requests.some(({ path }) => path === '/auth/v1/user')).toBe(true);
    expect(domainRequests(requests)).toEqual([]);
  });

  test('returns auth-outage 503s for a page and BFF without a domain read', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'outage');
    const pageBody = await navigate(
      context,
      `/documents/${IDS.document.missing}`,
      503,
    );
    expect(pageBody).toContain('Document service 503');

    const bff = await expectWireStatus(
      context.request,
      'GET',
      `/api/documents/${IDS.document.missing}/metadata`,
      503,
    );
    expect(bff.headers()['content-type']).toContain('application/json');
    expect(await bff.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });

    const requests = await adapterRequests(request);
    expect(requests.some(({ path }) => path === '/auth/v1/user')).toBe(true);
    expect(domainRequests(requests)).toEqual([]);
  });

  test('redacts non-contract query fields from adapter diagnostics', async ({
    request,
  }) => {
    const response = await request.get(
      `${ADAPTER_BASE_URL}/rest/v1/chats?select=id&id=eq.${IDS.chat.missing}` +
        `&user_id=eq.${USER_ID}&access_token=must-not-leak`,
    );
    expect(response.status()).toBe(200);

    const requests = await adapterRequests(request);
    expect(requests).toEqual([
      {
        method: 'GET',
        path: '/rest/v1/chats',
        query: {
          select: 'id',
          id: `eq.${IDS.chat.missing}`,
          user_id: `eq.${USER_ID}`,
          access_token: '[redacted]',
        },
      },
    ]);
  });
});
