/**
 * Message component
 * Provides consistent message styling for chat interfaces
 *
 * Uses centralized color definitions from lib/styles/colors/message.ts
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';
import { ErrorCard } from '../error-card';
import { VariantButton } from '../variant-button';
// Color definitions are in lib/styles/colors/message.ts for reference
// Using static Tailwind classes for JIT compiler compatibility

/**
 * Message variant types
 */
export type MessageVariant = 'user' | 'assistant' | 'error';

/**
 * Message component props
 */
export interface MessageProps {
 children: React.ReactNode;
 variant?: MessageVariant;
 className?: string;
 isEditing?: boolean;
 showErrorHeader?: boolean; // Whether to show error header with icon (for error variant)
}

/**
 * Message Component
 * Unified message component with variant support
 *
 * @example
 * <Message variant="user">
 * User message content
 * </Message>
 *
 * @example
 * <Message variant="assistant">
 * Assistant message content
 * </Message>
 *
 * @example
 * <Message variant="error">
 * Error message content
 * </Message>
 */
export function Message({
 children,
 variant = 'assistant',
 className,
 isEditing = false,
 ...props
}: MessageProps & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
 const isUser = variant === 'user';
 const isError = variant === 'error';

 return (
 <div
 {...props}
 className={cn(
 // Layout
 isUser
 ? isEditing ? 'w-full' : 'w-fit'
 : 'mx-auto',
 isUser ? 'ml-auto max-w-[70%] mb-3' : 'max-w-4xl',
 'break-words',
 'text-justify',

 // Geometry - Editorial: Sharp corners
 'rounded-none',

 // Surface
 isUser
 ? 'bg-parchment-deep border border-rule'
 : isError
 ? 'bg-parchment-deep border border-oxblood/40'
 : 'bg-transparent border-0',

 // Padding
 isUser ? (isEditing ? 'p-0' : 'px-5 py-3') : 'px-5 py-4',

 // Typography
 isUser ? 'text-ink text-sm leading-relaxed' : 'text-foreground',

 className
 )}
 >
 <div className="relative">
 {children}
 </div>
 </div>
 );
}

/**
 * User Message Component
 * Alias for Message with variant="user"
 *
 * @example
 * <UserMessage>
 * User message content
 * </UserMessage>
 */
export function UserMessage({
 children,
 className,
 isEditing = false,
}: Omit<MessageProps, 'variant'>): React.JSX.Element {
 return (
 <Message variant="user"className={className} isEditing={isEditing}>
 {children}
 </Message>
 );
}

/**
 * Assistant Message Component
 * Alias for Message with variant="assistant"
 *
 * @example
 * <AssistantMessage>
 * Assistant message content
 * </AssistantMessage>
 */
export function AssistantMessage({
 children,
 className,
 ...props
}: Omit<MessageProps, 'variant' | 'isEditing'> & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
 return (
 <Message variant="assistant"className={className} {...props}>
 {children}
 </Message>
 );
}

/**
 * Error Message Component
 * Alias for Message with variant="error"
 *
 * @example
 * <ErrorMessage>
 * Error message content
 * </ErrorMessage>
 *
 * @example
 * <ErrorMessage showErrorHeader>
 * Error message with header icon
 * </ErrorMessage>
 */
export function ErrorMessage({
 children,
 className,
 showErrorHeader = true,
 onRetry,
}: Omit<MessageProps, 'variant' | 'isEditing'> & {
 showErrorHeader?: boolean;
 onRetry?: () => void;
}): React.JSX.Element {
 // Recursively extract text content from React children
 const extractTextContent = (node: React.ReactNode): string => {
 if (typeof node === 'string') {
 return node;
 }
 if (typeof node === 'number') {
 return String(node);
 }
 if (Array.isArray(node)) {
 return node.map(extractTextContent).join('');
 }
 if (React.isValidElement(node)) {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 return extractTextContent((node.props as any).children);
 }
 return '';
 };

 let messageText = extractTextContent(children) || 'An error occurred';

 // Clean and normalize error message text
 messageText = messageText
 .replace(/regenerating/gi, 'generating') // Use"generating"instead of"regenerating"
 .replace(/If the problem persists, please email us directly for assistance\./gi, '')
 .replace(/Please try again, and if the problem persists, contact support\./gi, 'Please try again.')
 .replace(/\s+/g, ' ') // Normalize whitespace
 .trim();

 return (
 <div className={cn('mx-auto max-w-4xl', className)}>
 <ErrorCard
 title={showErrorHeader ? "Error": ''}
 message={messageText}
 showRetry={false}
 variant="red-rose"
 >
 <div className="mt-4 space-y-3">
 {/* Troubleshooting tips section */}
 <div className="bg-parchment rounded-none p-3 border border-rule">
 <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink mb-2">
 Troubleshooting tips:
 </p>
 <ul className="font-mono text-xs text-ink-soft space-y-1 ml-4 list-disc">
 <li>Check your internet connection</li>
 <li>Wait a moment and try regenerating the message</li>
 </ul>
 </div>

 {/* Support message */}
 <div className="pt-3 border-t border-rule">
 <p className="font-mono text-xs text-ink-soft leading-relaxed">
 Still having issues? Please{" "}
 <a
 href="mailto:lukasz.augustyniak@pwr.edu.pl"
 className="font-medium text-oxblood hover:text-oxblood-deep underline underline-offset-2 decoration-oxblood/40 hover:decoration-oxblood transition-colors"
 >
 contact our support team
 </a>
 {" "}for assistance.
 </p>
 </div>
 </div>
 </ErrorCard>

 {/* Regenerate button below the error card */}
 {onRetry && (
 <div className="mt-3 flex justify-end">
 <VariantButton intent="text" onClick={onRetry} icon={RotateCcw} iconPosition="left">
 Regenerate Message
 </VariantButton>
 </div>
 )}
 </div>
 );
}
