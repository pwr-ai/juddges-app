const ANONYMOUS_AUTH_ERROR_CODE_LIST = [
  "bad_jwt",
  "invalid_credentials",
  "no_authorization",
  "session_not_found",
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
  name?: string;
  status?: number;
};

/**
 * Distinguish an absent/expired browser session from an auth-service failure.
 * Codes and statuses are authoritative; message matching only supports errors
 * without either signal.
 */
export function isAnonymousAuthError(
  error: AuthLookupError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return false;
  if (error.status !== undefined && error.status >= 500) return false;

  const code = error.code?.toLowerCase();
  if (code && ANONYMOUS_AUTH_ERROR_CODES.has(code)) return true;
  if (error.status === 401 || error.status === 403) return true;
  if (code) return false;

  return (
    error.message === "Auth session missing!" ||
    ANONYMOUS_AUTH_ERROR_CODE_LIST.some((code) =>
      error.message?.includes(code),
    )
  );
}
