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

const IDS = {
  chat: {
    known: '10000000-0000-4000-8000-000000000001',
    missing: '10000000-0000-4000-8000-000000000002',
    hidden: '10000000-0000-4000-8000-000000000003',
  },
  collection: {
    missing: 'missing-collection',
    hidden: 'hidden-collection',
  },
  document: {
    missing: 'missing-document',
    hidden: 'hidden-document',
  },
  schema: {
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
  query: Record<string, string>;
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
  const matching = requests.filter(
    (request) =>
      request.method === 'GET' &&
      request.path === path &&
      Object.entries(query).every(([key, value]) => request.query[key] === value),
  );
  expect(matching).toHaveLength(1);
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

  test('serves a known extraction through an authenticated browser navigation', async ({
    context,
    request,
  }) => {
    await setSyntheticSession(context, 'valid');
    const body = await navigate(
      context,
      `/extractions/${IDS.extraction.known}`,
      200,
    );
    expect(body).toContain(IDS.extraction.known);

    expectOneCall(
      await adapterRequests(request),
      `/extractions/${IDS.extraction.known}`,
      { include_results: 'false' },
    );
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
      for (const path of routeCase.paths) {
        await navigate(context, path, 404);
      }
    }

    const requests = await adapterRequests(request);
    for (const routeCase of cases) {
      for (const id of routeCase.ids) {
        if (routeCase.adapterPath === '/rest/v1/chats') {
          expectOneCall(requests, routeCase.adapterPath, { id: `eq.${id}` });
        } else if (routeCase.adapterPath === '/rest/v1/extraction_schemas') {
          expectOneCall(requests, routeCase.adapterPath, { id: `eq.${id}` });
        } else {
          const suffix = routeCase.adapterPath.startsWith('/documents/')
            ? `${id}/metadata`
            : id;
          expectOneCall(requests, `${routeCase.adapterPath}${suffix}`);
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
      const body = await navigate(context, `/extractions/${id}`, status);
      expect(body).toContain(`Extraction service ${status}`);
    }

    const requests = await adapterRequests(request);
    for (const [id] of statuses) {
      expectOneCall(requests, `/extractions/${id}`, {
        include_results: 'false',
      });
    }
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
});
