/**
 * Chat Message List Component
 * Renders an array of chat messages with proper spacing and empty states
 * Coordinates ChatMessage components and sources display
 */

'use client';

import React, { useState, useMemo, useRef } from 'react';
import type { Message as MessageType } from '@/types/message';
import { EmptyState } from '@/lib/styles/components';
import { ChatMessage, type PatternHandler } from './chat-message';
import { MessageSources } from '@/components/chat/MessageSources';
import { MessageSquare, RotateCcw, GitFork } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/lib/styles/components/tooltip';

interface Source {
  title: string;
  content: string;
}

// Export the Source interface so it can be imported by other components
export type { Source };

interface ChatMessageListProps {
  messages: MessageType[];
  fragments?: Source[];
  onRegenerateMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onForkFromMessage?: (messageId: string) => void;
  chatInput?: React.ReactNode;
  onLastMessageRef?: (ref: HTMLDivElement | null) => void;
  isLoading?: boolean; // Whether a message is currently being generated
}

/**
 * ChatMessageList Component
 *
 * Features:
 * - Maps message array to ChatMessage components
 * - Coordinates sources display with tooltips
 * - Empty state handling
 * - Proper spacing between messages
 * - Accessible list structure
 *
 * @example
 * <ChatMessageList
 *   messages={messages}
 *   fragments={sources}
 *   onRegenerateMessage={handleRegenerate}
 *   onEditMessage={handleEdit}
 *   isLoading={isGenerating}
 * />
 */
export function ChatMessageList({
  messages,
  fragments = [],
  onRegenerateMessage,
  onEditMessage,
  onForkFromMessage,
  chatInput,
  onLastMessageRef,
  isLoading = false,
}: ChatMessageListProps): React.JSX.Element {
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const lastMessageRef = useRef<HTMLDivElement | null>(null);

  // Get the last non-empty message
  const lastMessage = useMemo(() => {
    const nonEmptyMessages = messages.filter((m) => (m.role === 'assistant' ? m.content.trim() : true));
    return nonEmptyMessages[nonEmptyMessages.length - 1];
  }, [messages]);

  // Create a pattern handler for source references
  const sourcePatternHandler: PatternHandler[] = useMemo(() => {
    if (!fragments || fragments.length === 0) return [];

    return [
      {
        pattern: /\[(\d+)\]/g,
        component: ({ match, children }: { match: RegExpExecArray; children: React.ReactNode }) => {
          const sourceNum = match[1];
          const index = parseInt(sourceNum, 10) - 1;

          if (index >= 0 && index < fragments.length) {
            const fragment = fragments[index];

            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium text-primary underline underline-offset-4 cursor-help">{children}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm p-4">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-white">{fragment.title}</p>
                      <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Reference to document</p>
                      <p className="text-xs text-white/70 font-mono break-all line-clamp-2 mt-2">
                        {fragment.content.replace('Reference to document ', '')}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return <>{children}</>;
        },
      },
    ];
  }, [fragments]);

  // Empty state with chat input
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full py-6 px-6">
        <div className="w-full max-w-3xl mx-auto space-y-6">
          <EmptyState icon={MessageSquare} title="Welcome to AI Assistant" description="Ask a question about indexed legal documents to get started." />
          {chatInput && <div className="w-full">{chatInput}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-4 pb-4">
      {messages.map((message) => {
        // Skip empty assistant messages (these are placeholders during loading)
        if (message.role === 'assistant' && !message.content.trim()) {
          return null;
        }

        const isLastMessage = lastMessage && message.id === lastMessage.id;

        // Check if this message is currently streaming
        const isStreaming = isLoading && isLastMessage && message.role === 'assistant' && message.content.length > 0;

        // Prepare sources badge for assistant messages - only show when not streaming
        const sourcesBadge =
          message.role === 'assistant' && message.document_ids && !isStreaming ? (
            <MessageSources
              documentIds={message.document_ids}
              renderBadgeOnly={true}
              isExpanded={expandedSources[message.id] || false}
              onToggle={() => setExpandedSources((prev) => ({ ...prev, [message.id]: !prev[message.id] }))}
            />
          ) : undefined;

        // Prepare action buttons for regenerate and fork (non-feedback buttons)
        const actionButtons: Array<{id: string; icon: React.ReactNode; onClick: () => void; title: string; position: 'inside' | 'outside'}> = [];

        if (message.role === 'assistant' && !isStreaming) {
          if (onRegenerateMessage) {
            actionButtons.push({
              id: 'regenerate',
              icon: <RotateCcw size={16} className="transition-colors hover:text-blue-500" />,
              onClick: () => onRegenerateMessage(message.id),
              title: 'Regenerate answer',
              position: 'inside' as const,
            });
          }
          if (onForkFromMessage) {
            actionButtons.push({
              id: 'fork',
              icon: <GitFork size={16} className="transition-colors hover:text-indigo-500" />,
              onClick: () => onForkFromMessage(message.id),
              title: 'Fork conversation from here',
              position: 'inside' as const,
            });
          }
        }

        return (
          <div
            key={message.id}
            ref={(el) => {
              if (isLastMessage) {
                lastMessageRef.current = el;
                if (onLastMessageRef) {
                  onLastMessageRef(el);
                }
              }
            }}
          >
            <ChatMessage
              content={message.content || ''}
              sender={message.role === 'user' ? 'user' : 'assistant'}
              messageId={message.id}
              patternHandlers={message.role === 'assistant' ? sourcePatternHandler : []}
              actionButtons={actionButtons}
              editable={message.role === 'user'}
              onEdit={message.role === 'user' && onEditMessage ? (newContent) => onEditMessage(message.id, newContent) : undefined}
              sourcesBadge={sourcesBadge}
              isStreaming={isStreaming}
              onRegenerate={
                message.role === 'assistant' && onRegenerateMessage
                  ? () => onRegenerateMessage(message.id)
                  : undefined
              }
              showFeedback={!isStreaming}
            />
            {/* Show expanded sources for assistant messages that have document_ids */}
            {message.role === 'assistant' && message.document_ids && (
              <MessageSources
                documentIds={message.document_ids}
                renderExpandedOnly={true}
                isExpanded={expandedSources[message.id] || false}
                onToggle={() => setExpandedSources((prev) => ({ ...prev, [message.id]: !prev[message.id] }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
