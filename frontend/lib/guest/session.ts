/**
 * Guest search allowance — shared contract between the search BFF and the UI
 * (issue #510).
 *
 * The counter is authoritative on the backend, in Redis, keyed by an HttpOnly
 * `guest_session_id` cookie. This module carries only the names and thresholds
 * both sides agree on; it never counts anything itself. The superseded
 * localStorage counter it replaces was resettable from devtools and gave the
 * server no way to attribute guest activity.
 */

export const GUEST_SESSION_COOKIE = 'guest_session_id';

export const GUEST_SESSION_ID_HEADER = 'x-guest-session-id';
export const GUEST_SEARCH_LIMIT_HEADER = 'x-guest-search-limit';
export const GUEST_SEARCHES_REMAINING_HEADER = 'x-guest-searches-remaining';

/** Matches SESSION_EXPIRY_HOURS in backend/app/guest_sessions.py. */
export const GUEST_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Remaining-search count at or below which the sign-up nudge appears. Mirrors
 * UPGRADE_WARNING_THRESHOLD in backend/app/guest_sessions.py: with a limit of 5
 * the banner surfaces once three searches are spent.
 */
export const GUEST_UPGRADE_PROMPT_REMAINING = 2;

export interface GuestAllowance {
  limit: number;
  remaining: number;
}

function parseCount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Read the allowance a search response advertised. Returns null for a signed-in
 * visitor, and whenever the backend could not evaluate the quota — in both
 * cases there is nothing to show and nothing to enforce.
 */
export function readGuestAllowance(headers: Headers): GuestAllowance | null {
  const limit = parseCount(headers.get(GUEST_SEARCH_LIMIT_HEADER));
  const remaining = parseCount(headers.get(GUEST_SEARCHES_REMAINING_HEADER));
  if (limit === null || remaining === null || limit === 0) return null;
  return { limit, remaining: Math.min(remaining, limit) };
}

/** True once the guest is close enough to the limit to be worth nudging. */
export function shouldPromptSignUp(
  allowance: GuestAllowance | null | undefined,
): boolean {
  if (!allowance) return false;
  return (
    allowance.remaining > 0 &&
    allowance.remaining <= GUEST_UPGRADE_PROMPT_REMAINING
  );
}

/** True once the free allowance is spent and searching is blocked. */
export function isGuestLimitReached(
  allowance: GuestAllowance | null | undefined,
): boolean {
  if (!allowance) return false;
  return allowance.remaining <= 0;
}
