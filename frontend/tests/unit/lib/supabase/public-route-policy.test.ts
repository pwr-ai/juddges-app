import { isPublicRequest } from '@/lib/supabase/public-route-policy';

const CHAT_ID = '11111111-2222-4333-8444-555555555555';
const EXTRACTION_ID = '22222222-3333-4444-8555-666666666666';

const EXACT_PUBLIC_PAGES = [
  '/',
  '/about',
  '/search',
  '/ecosystem',
  '/onboarding',
  '/status',
  '/offline',
  '/accessibility',
  '/contact',
  '/cookies',
  '/privacy',
  '/team',
  '/terms',
  '/opengraph-image',
  '/twitter-image',
] as const;

const PUBLIC_PAGE_SUBTREE_CASES = [
  '/auth',
  '/auth/login',
  '/auth/forgot-password',
  '/legal',
  '/legal/disclaimer',
  '/blog',
  '/blog/published-slug',
  '/publications',
  '/publications/future-public-detail',
  '/use-cases',
  '/use-cases/uk-judgments',
] as const;

const PUBLIC_READ_APIS = [
  '/api/health',
  '/api/health/status',
  '/api/health/dependencies',
  '/api/dashboard/stats',
  '/api/contact',
  '/api/blog/categories',
  '/api/blog/posts',
  '/api/blog/posts/published-slug',
  '/api/publications',
  '/api/publications/publication-1',
  `/api/chats/${CHAT_ID}/messages`,
  `/api/chats/${CHAT_ID.toUpperCase()}/messages`,
  '/api/search/documents',
  '/api/search/suggest',
  '/api/search/autocomplete',
  '/api/example_questions',
  '/api/documents/visible-doc/similar',
  '/api/documents/visible-doc/html',
] as const;

const PROTECTED_PAGE_CASES = [
  '/search/extractions',
  '/chat',
  '/collections',
  '/documents',
  '/blog/admin',
  '/blog/admin/new',
  '/blog/admin/secret.txt',
  '/blog/admin/nested/draft.css',
  '/publications/admin',
  '/publications/admin/publication-1',
  '/publications/admin/secret.txt',
  '/publications/admin/nested/draft.js',
] as const;

const LOOKALIKE_CASES = [
  '/about-private',
  '/about/team',
  '/authentic',
  '/blogger',
  '/blog-private',
  '/publications-private',
  '/use-cases-private',
  '/api/healthcheck',
  '/api/dashboard/stats-preview',
  '/api/blogger',
  '/api/publications-private',
  '/api/contact-form',
  '/api/graphql/',
  '/api/graphql/nested',
  '/api/chats/not-a-uuid/messages',
  '/api/chats/11111111-2222-3333-4444-555555555555/messages',
  `/api/chats/${CHAT_ID}/messages/extra`,
  `/api/chats/${CHAT_ID}/messages-archive`,
  `/api/chats/${CHAT_ID}//messages`,
  '/searchable',
  '/search/nested',
  '/api/search',
  '/api/search/documents/nested',
  '/api/search/documentss',
  '/api/example_questions/nested',
  '/api/documents/visible-doc/similar/nested',
  '/api/documents/visible-doc/htmls',
  '/api/documents/nested/visible-doc/html',
] as const;

describe('isPublicRequest', () => {
  it.each(EXACT_PUBLIC_PAGES)('allows exact public page GET %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(true);
  });

  it.each(EXACT_PUBLIC_PAGES)('allows exact public page HEAD %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'HEAD' })).toBe(true);
  });

  it.each(['/about/', '/contact/', '/terms/'])(
    'allows one terminal slash for exact page %s',
    (pathname) => {
      expect(isPublicRequest({ pathname, method: 'HEAD' })).toBe(true);
    },
  );

  it.each(PUBLIC_PAGE_SUBTREE_CASES)(
    'allows segment-aware public page %s',
    (pathname) => {
      expect(isPublicRequest({ pathname, method: 'GET' })).toBe(true);
    },
  );

  it.each(PUBLIC_PAGE_SUBTREE_CASES)(
    'allows segment-aware public page HEAD %s',
    (pathname) => {
      expect(isPublicRequest({ pathname, method: 'HEAD' })).toBe(true);
    },
  );

  it.each(PROTECTED_PAGE_CASES)('protects page %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(false);
  });

  it.each(LOOKALIKE_CASES)('protects lookalike %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(false);
  });

  it('does not normalize repeated page slashes', () => {
    expect(isPublicRequest({ pathname: '/contact//', method: 'GET' })).toBe(false);
  });

  it.each(PUBLIC_READ_APIS)('allows public API GET %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(true);
  });

  it.each(PUBLIC_READ_APIS)('allows public API HEAD %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'HEAD' })).toBe(true);
  });

  it.each(['GET', 'HEAD'])(
    'allows exact extraction detail BFF %s with one canonical job_id',
    (method) => {
      expect(
        isPublicRequest({
          pathname: '/api/extractions',
          method,
          searchParams: new URLSearchParams({ job_id: EXTRACTION_ID }),
        }),
      ).toBe(true);
    },
  );

  it.each(['GET', 'HEAD'])(
    'allows exact schema detail BFF %s to reach route validation',
    (method) => {
      for (const segment of [
        'abcdef01-1234-4abc-8def-1234567890ab',
        'not-a-uuid',
        'abcdef01-1234-4abc-8def-1234567890ab.css',
      ]) {
        expect(
          isPublicRequest({ pathname: `/api/schemas/${segment}`, method }),
        ).toBe(true);
      }
    },
  );

  it.each([
    ['POST', '/api/schemas/abcdef01-1234-4abc-8def-1234567890ab'],
    ['GET', '/api/schemas/abcdef01-1234-4abc-8def-1234567890ab/nested'],
    ['GET', '/api/schemas/nested/value.css'],
  ] as const)('protects schema BFF lookalike %s %s', (method, pathname) => {
    expect(isPublicRequest({ pathname, method })).toBe(false);
  });

  it.each([
    new URLSearchParams(),
    new URLSearchParams({ job_id: 'not-a-uuid' }),
    new URLSearchParams({ job_id: '22222222-3333-3333-4555-666666666666' }),
    new URLSearchParams(`job_id=${EXTRACTION_ID}&job_id=${EXTRACTION_ID}`),
  ])('protects malformed extraction detail BFF query %s', (searchParams) => {
    expect(
      isPublicRequest({
        pathname: '/api/extractions',
        method: 'GET',
        searchParams,
      }),
    ).toBe(false);
  });

  it.each(['/api/extractions/', '/api/extractions/detail'])(
    'protects extraction detail BFF lookalike %s',
    (pathname) => {
      expect(
        isPublicRequest({
          pathname,
          method: 'GET',
          searchParams: new URLSearchParams({ job_id: EXTRACTION_ID }),
        }),
      ).toBe(false);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'protects extraction detail BFF method %s',
    (method) => {
      expect(
        isPublicRequest({
          pathname: '/api/extractions',
          method,
          searchParams: new URLSearchParams({ job_id: EXTRACTION_ID }),
        }),
      ).toBe(false);
    },
  );

  it.each(['GET', 'HEAD'])(
    'allows exact document metadata BFF %s',
    (method) => {
      expect(
        isPublicRequest({
          pathname: '/api/documents/visible-doc/metadata',
          method,
        }),
      ).toBe(true);
    },
  );

  it.each([
    '/api/documents/visible-doc/metadata/',
    '/api/documents/visible-doc/metadata/nested',
    '/api/documents/nested/visible-doc/metadata',
    '/api/documents//metadata',
  ])('protects document metadata BFF lookalike %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'protects document metadata BFF method %s',
    (method) => {
      expect(
        isPublicRequest({
          pathname: '/api/documents/visible-doc/metadata',
          method,
        }),
      ).toBe(false);
    },
  );

  // Issue #510 — guests may search and read judgments.
  it.each(['GET', 'HEAD'] as const)(
    'allows anonymous judgment detail page %s',
    (method) => {
      for (const pathname of [
        '/documents/judgment-1',
        '/documents/PL_SN_2020_ABC.123',
        '/documents/uk_ewca_civ_2019_1234',
      ]) {
        expect(isPublicRequest({ pathname, method })).toBe(true);
      }
    },
  );

  it.each([
    '/documents',
    '/documents/',
    '/documents//',
    '/documents/judgment-1/',
    '/documents/judgment-1/versions',
    '/documents/nested/judgment-1',
    '/documents/has spaces',
    '/documents/has%2Fslash',
  ])('protects judgment detail lookalike %s', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'protects judgment detail page method %s',
    (method) => {
      expect(
        isPublicRequest({ pathname: '/documents/judgment-1', method }),
      ).toBe(false);
    },
  );

  it('allows anonymous product-analytics writes so guest activity is attributable', () => {
    expect(isPublicRequest({ pathname: '/api/events', method: 'POST' })).toBe(true);
  });

  it.each([
    ['GET', '/api/events'],
    ['PUT', '/api/events'],
    ['DELETE', '/api/events'],
    ['POST', '/api/events/'],
    ['POST', '/api/events/nested'],
  ] as const)('protects analytics lookalike %s %s', (method, pathname) => {
    expect(isPublicRequest({ pathname, method })).toBe(false);
  });

  // Acceptance criterion 3: identity-bearing surfaces stay behind auth.
  it.each([
    '/collections',
    '/collections/my-collection',
    '/history',
    '/chat',
    '/search/extractions',
    '/extractions',
    '/schemas',
    '/api/search/analytics/history',
    '/api/search/topics/my-clicks',
    '/api/collections',
    '/api/documents/search',
    '/api/documents/batch',
  ])('keeps identity-bearing surface %s behind auth', (pathname) => {
    expect(isPublicRequest({ pathname, method: 'GET' })).toBe(false);
  });

  it.each([
    ['POST', '/api/search/topic-click'],
    ['POST', '/api/documents/search'],
    ['POST', '/api/documents/batch'],
    ['DELETE', '/api/search/analytics/history'],
  ] as const)('keeps %s %s behind auth', (method, pathname) => {
    expect(isPublicRequest({ pathname, method })).toBe(false);
  });

  it.each([
    ['POST', '/api/health/invalidate'],
    ['POST', '/contact'],
    ['POST', '/blog'],
    ['POST', '/api/dashboard/stats'],
    ['POST', '/api/blog/posts'],
    ['POST', '/api/publications'],
    ['PUT', '/api/publications/publication-1'],
    ['PATCH', '/api/publications/publication-1'],
    ['DELETE', '/api/publications/publication-1'],
    ['OPTIONS', '/api/publications'],
    ['PUT', '/api/contact'],
    ['DELETE', '/api/contact'],
    ['POST', '/api/contact/nested'],
    ['POST', `/api/chats/${CHAT_ID}/messages`],
    ['OPTIONS', `/api/chats/${CHAT_ID}/messages`],
    ['GET', '/api/contact/'],
    ['GET', '/api/dashboard/stats/'],
    ['GET', '/api/blog/categories/'],
  ] as const)('protects %s %s', (method, pathname) => {
    expect(isPublicRequest({ pathname, method })).toBe(false);
  });

  it('allows only exact POST /api/contact as public ingress', () => {
    expect(isPublicRequest({ pathname: '/api/contact', method: 'POST' })).toBe(true);
  });

  it.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'lets exact retired GraphQL %s reach the router',
    (method) => {
      expect(isPublicRequest({ pathname: '/api/graphql', method })).toBe(true);
    },
  );

  it('requires canonical uppercase read methods', () => {
    expect(isPublicRequest({ pathname: '/api/publications', method: 'get' })).toBe(false);
  });
});
