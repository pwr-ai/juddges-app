"use client";

import { ErrorCard } from '@/lib/styles/components';
import { useRouter } from 'next/navigation';
import { Home, LogIn } from 'lucide-react';
import { use } from 'react';

export default function Page({ searchParams }: { searchParams: Promise<{ error: string }> }) {
  const params = use(searchParams);
  const router = useRouter();

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-md">
        <ErrorCard
          title="Authentication Error"
          message={
            params?.error
              ? `An error occurred during authentication: ${params.error}`
              : "An unspecified authentication error occurred. Please try again."
          }
          onRetry={() => router.push("/auth/login")}
          retryLabel="Back to Login"
          secondaryAction={{
            label: "Go Home",
            onClick: () => router.push("/"),
            icon: Home,
          }}
        />
        <p className="text-sm text-muted-foreground text-center mt-4">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
}
