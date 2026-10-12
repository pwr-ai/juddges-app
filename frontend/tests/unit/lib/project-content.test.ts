import { getInitials } from '@/lib/project-content';

describe('getInitials', () => {
  it('drops title tokens', () => {
    expect(getInitials('Prof. Michał Bernaczyk')).toBe('MB');
    expect(getInitials('Dr inż. Jan Kowalski')).toBe('JK');
  });

  it('uses the first two words', () => {
    expect(getInitials('Kamil Tagowski')).toBe('KT');
    expect(getInitials('Łukasz Augustyniak')).toBe('ŁA');
  });
});
