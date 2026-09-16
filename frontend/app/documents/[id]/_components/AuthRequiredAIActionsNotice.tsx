import React from 'react';
import Link from 'next/link';

export function AuthRequiredAIActionsNotice({
  message,
}: {
  message: string;
}): React.JSX.Element {
  return (
    <div className="rounded-none border border-gold/40 bg-parchment-deep px-4 py-3 font-mono text-xs text-ink">
      <p>
        {message}{' '}
        <Link href="/auth/login" className="font-semibold text-oxblood underline underline-offset-4 hover:text-oxblood-deep">
          Sign in
        </Link>{' '}
        to use AI analysis on this document.
      </p>
    </div>
  );
}
