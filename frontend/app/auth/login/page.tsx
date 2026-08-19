import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { LoginFormEnhanced } from "@/components/login-form-enhanced";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your JuDDGES account to access AI-powered judgments analysis and extraction tools.",
};

type LoginSearchParams = { next?: string | string[] };

/**
 * Placeholder shown while the interactive sign-in form loads.
 *
 * It mirrors the two-column layout of `LoginFormEnhanced` (marketing panel on
 * the left from `lg` upwards, sign-in form on the right) so the page does not
 * flash a blank screen, and it announces what is happening for screen readers.
 */
function LoginFormFallback() {
  return (
    <div
      className="flex w-full"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading the sign-in form…</span>

      {/* Left: marketing panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between gap-12 bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5 p-12">
        <div className="space-y-6">
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-10 w-4/5" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
          </div>
        </div>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 p-4">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-4 w-56 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = sanitizeNextPath(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginFormEnhanced />
    </Suspense>
  );
}
