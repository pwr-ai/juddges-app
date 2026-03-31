/**
 * Tests for document utility functions.
 */

import { cleanDocumentIdForUrl } from '@/lib/document-utils';

describe('cleanDocumentIdForUrl', () => {
  it('removes /doc/ prefix from document ID', () => {
    expect(cleanDocumentIdForUrl('/doc/863364CFD5')).toBe('863364CFD5');
  });

  it('leaves IDs without /doc/ prefix unchanged', () => {
    const id = '155025500002506_V_K_001055_2013_Uz_2013-11-14_001';
    expect(cleanDocumentIdForUrl(id)).toBe(id);
  });

  it('handles empty string', () => {
    expect(cleanDocumentIdForUrl('')).toBe('');
  });

  it('only removes leading /doc/ prefix, not embedded occurrences', () => {
    expect(cleanDocumentIdForUrl('abc/doc/xyz')).toBe('abc/doc/xyz');
  });

  it('handles /doc/ prefix with long IDs', () => {
    expect(cleanDocumentIdForUrl('/doc/abc123def456')).toBe('abc123def456');
  });
});
