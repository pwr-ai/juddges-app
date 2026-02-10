"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Sparkles } from "lucide-react";
import Link from "next/link";

interface GuestLimitBannerProps {
  remainingSearches: number;
}

export function GuestLimitBanner({ remainingSearches }: GuestLimitBannerProps) {
  const isLimitReached = remainingSearches === 0;
  const shouldPrompt = remainingSearches <= 2 && remainingSearches > 0;

  if (!shouldPrompt && !isLimitReached) {
    return null;
  }

  if (isLimitReached) {
    return (
      <Alert className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
              You&apos;ve reached the guest search limit
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Sign up for free to continue searching and save your research
            </p>
          </div>
          <Button asChild className="flex-shrink-0">
            <Link href="/auth/sign-up">Sign Up Free</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
      <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
            {remainingSearches} {remainingSearches === 1 ? 'search' : 'searches'} remaining as a guest
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Sign up to get unlimited searches, save results, and access advanced features
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="flex-shrink-0">
          <Link href="/auth/sign-up">Sign Up Free</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
