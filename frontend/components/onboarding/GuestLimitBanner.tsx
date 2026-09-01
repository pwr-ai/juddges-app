"use client";

import { EditorialButton, Eyebrow } from "@/components/editorial";
import {
  type GuestAllowance,
  isGuestLimitReached,
  shouldPromptSignUp,
} from "@/lib/guest/session";

const SIGN_UP_HREF = "/auth/sign-up";

interface GuestLimitBannerProps {
  /** Allowance reported by the last search; nullish when signed in. */
  allowance: GuestAllowance | null | undefined;
}

/**
 * Sign-up prompt for a signed-out visitor (issue #510).
 *
 * Stays out of the way until the allowance is nearly spent, then hardens into a
 * wall once it is. The counts come from the backend on every search, so this
 * component holds no state of its own.
 */
export function GuestLimitBanner({
  allowance,
}: GuestLimitBannerProps): React.JSX.Element | null {
  const limitReached = isGuestLimitReached(allowance);
  if (!limitReached && !shouldPromptSignUp(allowance)) return null;

  const remaining = allowance?.remaining ?? 0;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="mb-6 flex flex-col gap-4 border-l-2 border-[color:var(--oxblood)] bg-[color:var(--parchment-deep)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <Eyebrow>{limitReached ? "Free searches used" : "Guest access"}</Eyebrow>
        <p className="mt-1 text-[15px] text-[color:var(--ink)]">
          {limitReached ? (
            <>
              You have used all of your free searches. Create a free account to
              keep searching.
            </>
          ) : (
            <>
              <span className="font-medium">
                {remaining} {remaining === 1 ? "search" : "searches"}
              </span>{" "}
              left as a guest.
            </>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-[color:var(--ink-soft)]">
          An account adds unlimited search, saved collections, and extraction.
        </p>
      </div>
      <EditorialButton
        href={SIGN_UP_HREF}
        variant={limitReached ? "primary" : "secondary"}
        size="sm"
        className="shrink-0"
      >
        Create free account
      </EditorialButton>
    </aside>
  );
}
