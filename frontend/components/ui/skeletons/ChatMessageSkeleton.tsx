import { SkeletonText } from './SkeletonText';
import { cn } from '@/lib/utils';

interface ChatMessageSkeletonProps {
  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Number of message lines
   * @default 3
   */
  lines?: number;
}

/**
 * ChatMessageSkeleton - Chat message loading skeleton
 *
 * Displays a placeholder for a chat message with avatar and text content.
 * Used in chat interfaces while AI is generating responses.
 *
 * @example
 * ```tsx
 * <ChatMessageSkeleton />
 * <ChatMessageSkeleton lines={5} />
 * ```
 */
export function ChatMessageSkeleton({
  className,
  lines = 3
}: ChatMessageSkeletonProps) {
  return (
    <div
      className={cn("flex gap-3 p-4", className)}
      role="status"
      aria-label="Loading message"
    >
      {/* Avatar skeleton */}
      <div
        className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0"
        aria-hidden="true"
      />

      {/* Message content skeleton */}
      <div className="flex-1 space-y-2">
        {/* Username/timestamp */}
        <div
          className="h-4 w-24 bg-muted rounded animate-pulse"
          aria-hidden="true"
        />

        {/* Message text */}
        <SkeletonText lines={lines} />
      </div>

      <span className="sr-only">Loading message...</span>
    </div>
  );
}
