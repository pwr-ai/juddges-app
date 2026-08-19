/**
 * Forced-state test for the `/search` first paint.
 *
 * `SearchPageContent` blocks on a `mounted` flag that only flips inside an
 * effect, so before hydration the component used to `return null` — a blank
 * screen. Server-rendering the page is the cheapest way to force exactly that
 * pre-effect state: `renderToStaticMarkup` never runs effects, so `mounted`
 * stays false and we see what the user sees on first paint.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import SearchPage from '@/app/search/page';
import { SearchPageSkeleton } from '@/components/search/search-page-skeleton';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
}));

describe('/search first paint', () => {
  it('renders the search skeleton rather than a blank screen', () => {
    const html = renderToStaticMarkup(<SearchPage />);

    expect(html).not.toBe('');
    // The skeleton is made of animated placeholder blocks; a blank screen has none.
    expect(html).toContain('animate-pulse');
    expect(html).toEqual(renderToStaticMarkup(<SearchPageSkeleton />));
  });
});
