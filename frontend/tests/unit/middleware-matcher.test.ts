/** @jest-environment node */

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

import { config } from '@/middleware';

function doesMiddlewareMatch(pathname: string): boolean {
  return unstable_doesMiddlewareMatch({
    config,
    url: `https://juddges.test${pathname}`,
  });
}

describe('middleware matcher security boundaries', () => {
  it.each([
    '/blog/admin/secret.txt',
    '/blog/admin/nested/draft.css',
    '/collections/secret.txt',
    '/collections/theme.css',
    '/publications/admin/secret.txt',
    '/publications/admin/nested/draft.js',
    '/schemas/abcdef01-1234-4abc-8def-1234567890ab.css',
    '/api/schemas/abcdef01-1234-4abc-8def-1234567890ab.css',
  ])('runs middleware for protected asset-like route %s', (pathname) => {
    expect(doesMiddlewareMatch(pathname)).toBe(true);
  });

  it.each([
    '/_next/static/chunks/app.css',
    '/blog/published-image.png',
    '/collection/secret.txt',
    '/collections-public/secret.txt',
    '/publications/publication.xml',
  ])('keeps ordinary asset-like public route outside middleware %s', (pathname) => {
    expect(doesMiddlewareMatch(pathname)).toBe(false);
  });
});
