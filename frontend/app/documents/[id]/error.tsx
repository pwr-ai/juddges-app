'use client';

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ErrorCard, PageContainer } from '@/lib/styles/components';
import logger from '@/lib/logger';

export default function DocumentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    logger.error('Document page failed to load', error);
  }, [error]);

  return (
    <PageContainer width="screen" fillViewport className="py-8">
      <div className="flex min-h-[calc(100vh-8rem)] w-full items-center justify-center">
        <div className="w-full max-w-2xl px-6">
          <ErrorCard
            title="Document temporarily unavailable"
            message="The document service could not load this judgment. Please try again."
            onRetry={reset}
            retryLabel="Retry"
            secondaryAction={{
              label: 'Go Back',
              onClick: () => router.back(),
              icon: ArrowLeft,
            }}
          />
        </div>
      </div>
    </PageContainer>
  );
}
