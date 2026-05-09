import { cleanDocumentIdForUrl } from '@/lib/document-utils';

describe('cleanDocumentIdForUrl', () => {
  it('strips leading /doc/ prefix', () => {
    expect(cleanDocumentIdForUrl('/doc/863364CFD5')).toBe('863364CFD5');
  });

  it('returns id unchanged when no prefix', () => {
    const id = '155025500002506_V_K_001055_2013_Uz_2013-11-14_001';
    expect(cleanDocumentIdForUrl(id)).toBe(id);
  });

  it('only removes a leading /doc/ (not occurrences mid-string)', () => {
    expect(cleanDocumentIdForUrl('id/doc/keep')).toBe('id/doc/keep');
  });

  it('returns empty string unchanged', () => {
    expect(cleanDocumentIdForUrl('')).toBe('');
  });

  it('keeps only a single /doc/ prefix removed when nested', () => {
    expect(cleanDocumentIdForUrl('/doc//doc/abc')).toBe('/doc/abc');
  });

  it('preserves special characters in the id body', () => {
    expect(cleanDocumentIdForUrl('/doc/abc-123_XYZ.456')).toBe('abc-123_XYZ.456');
  });
});
