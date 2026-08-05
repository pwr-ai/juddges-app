import { isPublicRequest } from '@/lib/supabase/public-route-policy';

const CHAT_ID = '11111111-2222-4333-8444-555555555555';

const EXACT_PUBLIC_PAGES = [
  '/',
  '/about',
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
  '/legal/terms',
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
] as const;

const PROTECTED_PAGE_CASES = [
  '/search',
  '/chat',
  '/collections',
  '/documents',
  '/blog/admin',
  '/blog/admin/new',
  '/publications/admin',
  '/publications/admin/publication-1',
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
