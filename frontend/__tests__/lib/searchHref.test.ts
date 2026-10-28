import { buildSearchHref } from '@/lib/searchHref';

describe('buildSearchHref', () => {
  it('encodes q once, including spaces and diacritics', () => {
    const href = buildSearchHref({ q: 'Udzielanie narkotyków małoletnim' });
    expect(href).not.toContain('%25');
    expect(href).toBe(
      '/search?q=Udzielanie%20narkotyk%C3%B3w%20ma%C5%82oletnim'
    );
  });

  it('skips empty values and round-trips', () => {
    const href = buildSearchHref({ q: '100% & więcej', lang: 'pl', mode: undefined });
    const p = new URL(href, 'http://x').searchParams;
    expect(p.get('q')).toBe('100% & więcej');
    expect(p.get('lang')).toBe('pl');
    expect(p.has('mode')).toBe(false);
  });
});
