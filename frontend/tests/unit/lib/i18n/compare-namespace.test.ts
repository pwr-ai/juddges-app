import { en } from '@/lib/i18n/translations/en';
import { pl } from '@/lib/i18n/translations/pl';

describe('compare i18n namespace', () => {
  it('exists in both locales with identical keys', () => {
    expect(Object.keys(en.compare).sort()).toEqual(Object.keys(pl.compare).sort());
    expect(Object.keys(en.compare).length).toBeGreaterThanOrEqual(30);
  });

  it('keeps interpolation placeholders in sync', () => {
    for (const key of Object.keys(en.compare) as Array<keyof typeof en.compare>) {
      const holes = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
      expect(holes(pl.compare[key])).toEqual(holes(en.compare[key]));
    }
  });

  it('has the sidebar label', () => {
    expect(en.navigation.compare).toBe('Compare PL / UK');
    expect(pl.navigation.compare).toBe('Porównaj PL / UK');
  });
});
