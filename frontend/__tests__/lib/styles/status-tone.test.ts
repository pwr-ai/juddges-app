import { getStatusTone } from '@/lib/styles/status-tone';

describe('getStatusTone', () => {
  it('maps the normalized extraction statuses onto the three editorial tones', () => {
    expect(getStatusTone('completed')).toBe('ink');
    expect(getStatusTone('processing')).toBe('gold');
    expect(getStatusTone('pending')).toBe('gold');
    expect(getStatusTone('failed')).toBe('oxblood');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(getStatusTone('FAILED')).toBe('oxblood');
    expect(getStatusTone('In Progress')).toBe('gold');
  });

  it('falls back to ink for unknown raw backend statuses — callers must normalize first', () => {
    // `revoked` / `failure` are backend spellings that only the page-level
    // normalizers know about; passing them raw would render as success.
    expect(getStatusTone('revoked')).toBe('ink');
    expect(getStatusTone(undefined)).toBe('ink');
  });
});
