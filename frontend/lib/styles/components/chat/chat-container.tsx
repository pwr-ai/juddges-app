/**
 * Chat Container Component
 * Reusable container for chat inputs with consistent styling
 * Used in chat and schema studio pages
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface ChatContainerProps {
 children: React.ReactNode;
 className?: string;
}

/**
 * Chat Container
 * Provides consistent styling for chat input containers
 *
 * Uses centralized color definitions from the color system.
 * Colors are defined in lib/styles/colors/chat.ts for easy maintenance.
 *
 * @example
 * <ChatContainer>
 * <Textarea placeholder="Type your message..."/>
 * <Button>Send</Button>
 * </ChatContainer>
 */
export function ChatContainer({
 children,
 className,
}: ChatContainerProps): React.JSX.Element {
 return (
 <div
 className={cn(
 'relative',
 'min-h-[3.5rem]',
 'rounded-none',
 'overflow-hidden',
 'bg-parchment',
 'border border-rule',
 'focus-within:border-rule-strong focus-within:ring-1 focus-within:ring-ink',
 'focus-within:ring-offset-0',
 'transition-colors',
 className
 )}
 >
 {children}
 </div>
 );
}
