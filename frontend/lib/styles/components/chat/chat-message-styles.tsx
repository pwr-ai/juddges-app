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
import { TextButton } from '../text-button';
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
 isUser ? 'ml-auto max-w-[70%] mb-3' : 'max-w-4xl', // mb-3 = 12px spacing between bubbles
 'break-words',
 'text-justify',

 // Geometry - Gemini Style: Pure Capsule (Material 3 super-rounded)
 isUser
 ? 'rounded-[24px]' // Super-rounded, no sharp corners
 : 'rounded-2xl',

 // Background - Gemini"Electric"Indigo-Blue Gradient (defined in components.css)
 isUser
 ? '' // Gradient applied via data attribute and CSS
 : isError
 ? 'bg-gradient-to-br from-red-400/30 via-rose-400/20 to-purple-400/15'
 : 'bg-transparent',

 // Border - No border in dark mode, subtle top highlight in light mode
 isUser
 ? 'border-0 border-t border-t-white/20' // No border in dark mode
 : isError
 ? 'border border-red-200/50 hover:border-red-300/50'
 : 'border-0',

 // Shadows - Gemini Satin Glow (defined in components.css)
 isUser
 ? '' // Box-shadow applied via data attribute and CSS
 : isError
 ? 'shadow-lg hover:shadow-2xl hover:shadow-red-500/10'
 : '',

 // Transitions
 isUser || isError
 ? 'transition-all duration-300'
 : '',

 // Padding - Spacious/Comfortable (Gemini Style)
 // No padding when editing (textarea has its own padding)
 isUser ? (isEditing ? 'p-0' : 'px-6 py-[14px]') : 'px-5 py-4', // px-6 = 24px

 // Text color - Pure White (Gemini Style)
 isUser
 ? 'text-white'
 : 'text-foreground',

 // Typography - Light and airy (Gemini Style)
 isUser
 ? 'text-[15px] leading-[1.6] tracking-[0.01em] font-normal' // font-normal = 400
 : '',

 // Physics - Hardware acceleration
 isUser
 ? '[transform:translateZ(0)]'
 : '',

 className
 )}
 data-user-message-gemini={isUser ? '' : undefined}
 data-user-message-shadow={isUser ? '' : undefined}
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
 <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-200/50">
 <p className="text-sm font-medium text-slate-700 mb-2">
 💡 Troubleshooting tips:
 </p>
 <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
 <li>Check your internet connection</li>
 <li>Wait a moment and try regenerating the message</li>
 </ul>
 </div>

 {/* Support message */}
 <div className="pt-3 border-t border-red-200/50">
 <p className="text-sm font-medium text-slate-700 leading-relaxed">
 Still having issues? Please{""}
 <a
 href="mailto:lukasz.augustyniak@pwr.edu.pl"
 className="font-semibold text-red-600 hover:text-red-700 underline underline-offset-2 decoration-red-400/50 hover:decoration-red-500 transition-all duration-200"
 >
 contact our support team
 </a>
 {""}for assistance.
 </p>
 </div>
 </div>
 </ErrorCard>

 {/* Regenerate button below the error card */}
 {onRetry && (
 <div className="mt-3 flex justify-end">
 <TextButton onClick={onRetry} icon={RotateCcw} iconPosition="left">
 Regenerate Message
 </TextButton>
 </div>
 )}
 </div>
 );
}
