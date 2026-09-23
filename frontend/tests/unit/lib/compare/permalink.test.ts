import { buildComparePermalink, buildPairPermalink } from '@/lib/compare/permalink';
import { decodeFilters } from '@/lib/extractions/use-extracted-data-filters';

describe('compare permalinks', () => {
  it('encodes filters with the same blob /search/extractions uses', () => {
    const url = new URL(buildComparePermalink({ appellant: ['offender'] }, 'fraud', 'https://juddges.com'));
    expect(url.pathname).toBe('/compare');
    expect(url.searchParams.get('q')).toBe('fraud');
    expect(decodeFilters(url.searchParams.get('f'))).toEqual({ appellant: ['offender'] });
  });

  it('omits empty params', () => {
    expect(buildComparePermalink({}, '', 'https://juddges.com')).toBe('https://juddges.com/compare');
  });

  it('builds the pair permalink', () => {
    expect(buildPairPermalink('p1', 'https://juddges.com')).toBe('https://juddges.com/compare/p1');
  });
});
