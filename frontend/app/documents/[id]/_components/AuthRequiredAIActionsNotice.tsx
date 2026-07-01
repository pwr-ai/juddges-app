import React from 'react';
import Link from 'next/link';

export function AuthRequiredAIActionsNotice({
  message,
}: {
  message: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        {message}{' '}
        <Link href="/auth/login" className="font-medium underline underline-offset-4">
          Sign in
        </Link>{' '}
        to use AI analysis on this document.
      </p>
    </div>
  );
}
