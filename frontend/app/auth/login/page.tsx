import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { LoginFormEnhanced } from "@/components/login-form-enhanced";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/next-path";

export const metadata: Metadata = {
  title: "Sign In | JuDDGES",
  description:
    "Sign in to your JuDDGES account to access AI-powered judgments analysis and extraction tools.",
};

type LoginSearchParams = { next?: string | string[] };

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
    <Suspense fallback={null}>
      <LoginFormEnhanced />
    </Suspense>
  );
}
