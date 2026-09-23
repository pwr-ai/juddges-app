/**
 * @jest-environment node
 */
import { buildComparePermalink } from '@/lib/compare/permalink';

describe('buildComparePermalink outside a browser (SSR / RSC)', () => {
  it('does not touch `window` and returns a relative href when no origin is given', () => {
    expect(() => buildComparePermalink({}, '', undefined)).not.toThrow();
    const href = buildComparePermalink({}, '', undefined);
    expect(href).toBe('/compare');
    expect(href.startsWith('/compare')).toBe(true);
  });
});
