import { MessageSquare } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface EmptyChatHistoryProps {
  /**
   * Callback to start a new chat
   */
  onStartChat: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptyChatHistory - Empty state for chat history
 *
 * Displayed when a user has no previous chat conversations.
 * Guides them to start their first conversation.
 *
 * @example
 * ```tsx
 * <EmptyChatHistory onStartChat={() => router.push('/chat')} />
 * ```
 */
export function EmptyChatHistory({ onStartChat, className }: EmptyChatHistoryProps) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No conversations yet"
      description="Start a conversation with our AI assistant to get help with legal research and analysis of court judgments."
      action={{
        label: "Start new chat",
        onClick: onStartChat,
        variant: 'default'
      }}
      className={className}
    />
  );
}
