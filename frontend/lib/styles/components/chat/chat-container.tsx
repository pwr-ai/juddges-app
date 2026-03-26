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
 // Base container styling - Inset Glass Console
 'relative',
 // Minimum height: 3.5rem (56px) - Large and inviting
 'min-h-[3.5rem]',
 // Corner radius: 1.5rem (24px) - Smooth Pills
 'rounded-[1.5rem]',
 'overflow-hidden',
 // Background: Inset Glass (Sunken)
 // Light Mode: rgba(255, 255, 255, 0.60)
 // Dark Mode: rgba(15, 23, 42, 0.60)
 'bg-white/60',
 // Border: Top highlight
 // Light Mode: 1px solid rgba(255, 255, 255, 1.0)
 // Dark Mode: 1px solid rgba(255, 255, 255, 0.1)
 'border border-white',
 // Shadow: Inner (sunken feel) + Outer (ambient glow)
 'shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_10px_30px_rgba(0,0,0,0.05)]',
 '',
 // Focus ring
 'focus-within:ring-2 focus-within:ring-blue-500/30',
 'focus-within:ring-offset-0',
 // Interactive states
 'transition-all duration-300',
 className
 )}
 >
 {children}
 </div>
 );
}
