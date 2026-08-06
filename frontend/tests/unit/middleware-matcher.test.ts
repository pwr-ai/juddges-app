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
    '/publications/admin/secret.txt',
    '/publications/admin/nested/draft.js',
  ])('runs middleware for protected asset-like admin route %s', (pathname) => {
    expect(doesMiddlewareMatch(pathname)).toBe(true);
  });

  it.each([
    '/blog/published-image.png',
    '/publications/publication.xml',
  ])('keeps ordinary asset-like public route outside middleware %s', (pathname) => {
    expect(doesMiddlewareMatch(pathname)).toBe(false);
  });
});
