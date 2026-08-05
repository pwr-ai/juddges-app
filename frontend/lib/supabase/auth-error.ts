const ANONYMOUS_AUTH_ERROR_CODE_LIST = [
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
] as const;
const ANONYMOUS_AUTH_ERROR_CODES = new Set<string>(
  ANONYMOUS_AUTH_ERROR_CODE_LIST,
);

type AuthLookupError = {
  code?: string;
  message?: string;
};

/**
 * Distinguish an absent/expired browser session from an auth-service failure.
 * Codes are authoritative; message matching only supports errors without one.
 */
export function isAnonymousAuthError(
  error: AuthLookupError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code) return ANONYMOUS_AUTH_ERROR_CODES.has(error.code);

  return (
    error.message === "Auth session missing!" ||
    ANONYMOUS_AUTH_ERROR_CODE_LIST.some((code) =>
      error.message?.includes(code),
    )
  );
}
