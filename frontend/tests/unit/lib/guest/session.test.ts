import {
  GUEST_SEARCHES_REMAINING_HEADER,
  GUEST_SEARCH_LIMIT_HEADER,
  GUEST_UPGRADE_PROMPT_REMAINING,
  isGuestLimitReached,
  readGuestAllowance,
  shouldPromptSignUp,
} from '@/lib/guest/session';

function headers(limit?: string, remaining?: string): Headers {
  const value = new Headers();
  if (limit !== undefined) value.set(GUEST_SEARCH_LIMIT_HEADER, limit);
  if (remaining !== undefined) value.set(GUEST_SEARCHES_REMAINING_HEADER, remaining);
  return value;
}

describe('readGuestAllowance', () => {
  it('reads the allowance a metered search advertised', () => {
    expect(readGuestAllowance(headers('5', '3'))).toEqual({ limit: 5, remaining: 3 });
  });

  it('returns null for a response that was not metered', () => {
    expect(readGuestAllowance(headers())).toBeNull();
  });

  it.each([
    ['only a limit', headers('5', undefined)],
    ['only a remaining count', headers(undefined, '3')],
    ['a non-numeric count', headers('5', 'lots')],
    ['a fractional count', headers('5', '2.5')],
    ['a negative count', headers('5', '-1')],
    ['a zero limit', headers('0', '0')],
  ])('returns null for %s', (_label, value) => {
    expect(readGuestAllowance(value)).toBeNull();
  });

  it('never reports more remaining than the limit allows', () => {
    expect(readGuestAllowance(headers('5', '9'))).toEqual({ limit: 5, remaining: 5 });
  });
});

describe('shouldPromptSignUp', () => {
  it('stays quiet while the visitor has room to explore', () => {
    expect(
      shouldPromptSignUp({ limit: 5, remaining: GUEST_UPGRADE_PROMPT_REMAINING + 1 }),
    ).toBe(false);
  });

  it('nudges once the allowance is nearly spent', () => {
    expect(
      shouldPromptSignUp({ limit: 5, remaining: GUEST_UPGRADE_PROMPT_REMAINING }),
    ).toBe(true);
  });

  it('defers to the hard wall once nothing is left', () => {
    expect(shouldPromptSignUp({ limit: 5, remaining: 0 })).toBe(false);
  });

  it.each([null, undefined])('stays quiet for a %s allowance', (allowance) => {
    expect(shouldPromptSignUp(allowance)).toBe(false);
  });
});

describe('isGuestLimitReached', () => {
  it('is false while searches remain', () => {
    expect(isGuestLimitReached({ limit: 5, remaining: 1 })).toBe(false);
  });

  it('is true once the allowance is spent', () => {
    expect(isGuestLimitReached({ limit: 5, remaining: 0 })).toBe(true);
  });

  it.each([null, undefined])('is false for a %s allowance (signed in)', (allowance) => {
    expect(isGuestLimitReached(allowance)).toBe(false);
  });
});
