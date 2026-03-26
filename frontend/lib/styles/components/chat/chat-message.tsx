/**
 * Chat Message Component
 * Renders individual chat messages with markdown, editing, and feedback
 * Uses ItemFeedback for generic feedback functionality
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { PencilIcon, Save, Undo } from 'lucide-react';
import { AIDisclaimerBadge, IconButton } from '@/lib/styles/components';
import { ItemFeedback } from '../item-feedback';
import { UserMessage, AssistantMessage, ErrorMessage } from './chat-message-styles';

// Define the pattern handler type
export interface PatternHandler {
 pattern: RegExp;
 component: React.ComponentType<{
 match: RegExpExecArray;
 children: React.ReactNode;
 }>;
}

// Define a generic action button interface (for non-feedback buttons)
export interface ActionButton {
 id: string;
 icon: React.ReactNode;
 onClick: () => void;
 title?: string;
 className?: string;
 position?: 'inside' | 'outside'; // Whether button should appear inside or outside the message
}

export interface ChatMessageProps {
 content: string;
 sender: 'user' | 'assistant';
 messageId: string; // Required for feedback tracking
 actionButtons?: ActionButton[]; // Custom action buttons (excluding feedback - handled by ItemFeedback)
 editable?: boolean; // Whether this message can be edited
 onEdit?: (content: string) => void;
 patternHandlers?: PatternHandler[];
 sourcesBadge?: React.ReactNode; // Sources badge to display in grid with feedback buttons
 className?: string;
 contentClassName?: string; // Additional className for the content container
 isStreaming?: boolean; // Whether this message is currently streaming
 onRegenerate?: () => void; // Callback for regenerating error messages
 showFeedback?: boolean; // Whether to show feedback buttons (default: true for assistant, false for user)
}

/**
 * ChatMessage Component
 *
 * Features:
 * - Markdown rendering with ReactMarkdown
 * - Pattern handlers for special content (source references)
 * - Edit mode for user messages with keyboard shortcuts
 * - ItemFeedback integration for assistant messages
 * - Action buttons (regenerate, etc.)
 * - Proper semantic HTML and accessibility
 * - WCAG AA compliant
 *
 * @example
 * <ChatMessage
 * content="Hello, how can I help? "
 * sender="assistant"
 * messageId="msg-123"
 * showFeedback={true}
 * />
 */
export function ChatMessage({
 content,
 sender,
 messageId,
 actionButtons = [],
 editable = false,
 onEdit,
 patternHandlers = [],
 sourcesBadge,
 className,
 contentClassName,
 isStreaming = false,
 onRegenerate,
 showFeedback = true,
}: ChatMessageProps): React.JSX.Element {
 const [isEditing, setIsEditing] = useState(false);
 const [editedContent, setEditedContent] = useState(content);

 // Detect if this is an error message
 const isErrorMessage = React.useMemo(() => {
 if (sender !== 'assistant') return false;
 const errorIndicators = [
"I apologize, but I'm having trouble",
"I apologize, but I don't have access",
 'Sorry, I encountered an error',
"I'm sorry, but I can't",
 ];
 return errorIndicators.some((indicator) => content.trim().startsWith(indicator));
 }, [content, sender]);

 const handleSaveEdit = (): void => {
 setIsEditing(false);
 if (onEdit && editedContent !== content) {
 onEdit(editedContent);
 }
 };

 // Handle keyboard events for the edit textarea
 const handleKeyDown = (e: React.KeyboardEvent): void => {
 if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
 handleSaveEdit();
 } else if (e.key === 'Escape') {
 setIsEditing(false);
 setEditedContent(content);
 }
 };

 // Function to create professional ReactMarkdown components
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const createMarkdownComponents = (): Record<string, React.ComponentType<any>> => {
 return {
 // Professional heading styles
 h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
 <h1 {...props} className="text-xl font-bold mb-4 mt-6 pb-2 border-b border-border text-foreground">
 {children}
 </h1>
 ),
 h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
 <h2 {...props} className="text-lg font-semibold mb-3 mt-5 text-foreground">
 {children}
 </h2>
 ),
 h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
 <h3 {...props} className="text-base font-medium mb-2 mt-4 text-foreground">
 {children}
 </h3>
 ),
 // Enhanced paragraph styling
 p: ({ children, ...props }: React.ComponentProps<'p'>) => (
 <p {...props} className="text-sm sm:text-base leading-relaxed mb-3 text-foreground">
 {children}
 </p>
 ),
 // Strong emphasis
 strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
 <strong {...props} className="font-semibold text-foreground">
 {children}
 </strong>
 ),
 // Emphasized text
 em: ({ children, ...props }: React.ComponentProps<'em'>) => (
 <em {...props} className="italic text-foreground">
 {children}
 </em>
 ),
 // Professional list styling
 ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
 <ul {...props} className="list-disc list-outside my-3 ml-6 space-y-1 text-foreground">
 {children}
 </ul>
 ),
 ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
 <ol {...props} className="list-decimal list-outside my-3 ml-6 space-y-1 text-foreground">
 {children}
 </ol>
 ),
 li: ({ children, ...props }: React.ComponentProps<'li'>) => (
 <li {...props} className="mb-1 text-sm sm:text-base leading-relaxed text-foreground">
 {children}
 </li>
 ),
 // Legal blockquotes
 blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
 <blockquote {...props} className="border-l-4 border-primary pl-4 my-3 italic text-muted-foreground">
 {children}
 </blockquote>
 ),
 // Code for legal references
 code: ({ children, ...props }: React.ComponentProps<'code'>) => (
 <code {...props} className="bg-muted text-foreground px-1.5 py-0.5 rounded font-mono text-sm">
 {children}
 </code>
 ),
 };
 };

 // Function to process content with pattern handlers
 const processContent = (text: string): React.ReactElement | null => {
 if (!text || patternHandlers.length === 0) {
 return null;
 }

 const segments: Array<React.ReactNode> = [];
 let lastIndex = 0;

 for (const { pattern, component: Component } of patternHandlers) {
 // Reset the lastIndex to ensure we find all matches
 pattern.lastIndex = 0;

 let match;
 while ((match = pattern.exec(text)) !== null) {
 // Add text before the match
 if (match.index > lastIndex) {
 segments.push(text.substring(lastIndex, match.index));
 }

 // Add the processed match
 segments.push(
 <Component key={`pattern-${match.index}`} match={match}>
 {match[0]}
 </Component>
 );

 lastIndex = pattern.lastIndex;
 }
 }

 // Add remaining text
 if (lastIndex < text.length) {
 segments.push(text.substring(lastIndex));
 }

 // If no matches were found, return null so we use the standard rendering
 if (segments.length === 0) {
 return null;
 }

 return <>{segments}</>;
 };

 // Filter buttons by position (non-feedback buttons only)
 const insideButtons = actionButtons.filter((btn) => btn.position !== 'outside');
 const outsideButtons = actionButtons.filter((btn) => btn.position === 'outside');

 // Render message content (same for all variants)
 const messageContent = (
 <div className={cn('relative', contentClassName)}>
 {isEditing ? (
 <textarea
 className={cn(
 'w-full rounded-[1.5rem] px-4 py-3',
 'border border-white',
 'bg-white/60',
 'focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-0',
 'placeholder:text-muted-foreground/70 focus:outline-none resize-none',
 'text-slate-900',
 'text-sm md:text-base leading-relaxed',
 'transition-all duration-300'
 )}
 value={editedContent}
 onChange={(e) => setEditedContent(e.target.value)}
 onKeyDown={handleKeyDown}
 rows={3}
 autoFocus
 aria-label="Edit message"
 />
 ) : (
 <div>
 <div
 className={cn(
 'prose prose-sm sm:prose-base max-w-none',
 'prose-slate',
 // ErrorMessage wrapper handles all error styling, so keep content neutral
 'prose-headings:text-foreground prose-strong:text-foreground',
 isErrorMessage ? 'prose-a:text-red-700' : 'prose-a:text-primary',
 'prose-h1:text-xl prose-h1:font-bold prose-h1:mb-4 prose-h1:mt-6 prose-h1:border-b prose-h1:border-border prose-h1:pb-2',
 'prose-h2:text-lg prose-h2:font-semibold prose-h2:mb-3 prose-h2:mt-5',
 'prose-h3:text-base prose-h3:font-medium prose-h3:mb-2 prose-h3:mt-4',
 'prose-p:text-foreground prose-p:text-sm sm:prose-p:text-base prose-p:leading-relaxed prose-p:mb-3',
 'prose-strong:font-semibold prose-strong:text-foreground',
 'prose-ul:my-3 prose-ul:space-y-1 prose-ul:text-foreground',
 'prose-ol:my-3 prose-ol:space-y-1 prose-ol:text-foreground',
 'prose-li:mb-1 prose-li:text-sm sm:prose-li:text-base prose-li:text-foreground',
 'prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3 prose-blockquote:text-muted-foreground',
 'prose-code:bg-muted prose-code:text-foreground prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono'
 )}
 >
 {patternHandlers.length > 0 ? (
 React.createElement(
 ReactMarkdown,
 {
 components: {
 ...createMarkdownComponents(),
 // Override paragraph for pattern handling
 p: ({ children, ...props }: React.ComponentProps<'p'>) => {
 // Extract text content from children, handling both strings and React elements
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
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 if (React.isValidElement(node) && (node.props as any)?.children) {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 return extractTextContent((node.props as any).children);
 }
 return '';
 };

 const textContent = extractTextContent(children);
 const processedContent = processContent(textContent);

 return processedContent ? (
 <p {...props} className="text-sm sm:text-base leading-relaxed mb-3 text-foreground">
 {processedContent}
 </p>
 ) : (
 <p {...props} className="text-sm sm:text-base leading-relaxed mb-3 text-foreground">
 {children}
 </p>
 );
 },
 },
 },
 content
 )
 ) : (
 <ReactMarkdown components={createMarkdownComponents()}>{content}</ReactMarkdown>
 )}
 </div>

 {/* AI Disclaimer Footer - Only for non-error, completed assistant messages */}
 {sender === 'assistant' && !isEditing && !isErrorMessage && !isStreaming && <AIDisclaimerBadge />}
 </div>
 )}

 {/* Inside action buttons, sources badge, and feedback in grid */}
 {!isEditing && (insideButtons.length > 0 || sourcesBadge || (sender === 'assistant' && showFeedback && !isErrorMessage && !isStreaming)) && (
 <div className="mt-2 grid grid-cols-2 gap-2 items-center">
 {/* Column 1: Sources badge */}
 <div className="flex justify-start">{sourcesBadge}</div>
 {/* Column 2: Action buttons and feedback */}
 <div className="flex justify-end items-center gap-1">
 {/* Non-feedback action buttons */}
 {insideButtons.map((button) => (
 <button
 key={button.id}
 onClick={button.onClick}
 className={cn(
 'text-slate-600 hover:text-slate-900 transition-all duration-200 p-2 rounded-lg hover:bg-slate-100 hover:shadow-sm active:scale-95 border border-transparent',
 button.className
 )}
 title={button.title}
 aria-label={button.title}
 >
 {button.icon}
 </button>
 ))}
 {/* ItemFeedback component for assistant messages */}
 {sender === 'assistant' && showFeedback && !isErrorMessage && !isStreaming && (
 <ItemFeedback itemId={messageId} itemType="message"/>
 )}
 </div>
 </div>
 )}
 </div>
 );

 return (
 <>
 <div
 className={cn('group relative', className)}
 data-testid="chat-message"
 data-role={sender}
 >
 {sender === 'user' ? (
 <UserMessage isEditing={isEditing}>{messageContent}</UserMessage>
 ) : isErrorMessage ? (
 <ErrorMessage showErrorHeader={true} onRetry={onRegenerate}>
 {messageContent}
 </ErrorMessage>
 ) : (
 <AssistantMessage data-testid="chat-message-assistant">{messageContent}</AssistantMessage>
 )}

 {/* Outside action buttons - only visible on hover */}
 {!isEditing && outsideButtons.length > 0 && (
 <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-1 translate-x-full pl-2">
 {outsideButtons.map((button) => (
 <button
 key={button.id}
 onClick={button.onClick}
 className={cn(
 'group relative text-slate-600 hover:text-slate-900 transition-all duration-200 p-2 rounded-lg hover:bg-slate-100 hover:shadow-sm hover:shadow-primary/5 active:scale-95 bg-gradient-to-br from-white via-slate-50/80 to-white border border-slate-200/50 hover:border-primary/20',
 button.className
 )}
 title={button.title}
 aria-label={button.title}
 >
 <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"/>
 <span className="relative z-10 group-hover:scale-110 transition-transform duration-200">{button.icon}</span>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Edit button - always visible below message, outside main container div */}
 {!isEditing && editable && onEdit && sender === 'user' && (
 <div className="mt-2 flex justify-end ml-auto max-w-lg">
 <IconButton icon={PencilIcon} onClick={() => setIsEditing(true)} aria-label="Edit message"variant="muted"size="sm"/>
 </div>
 )}

 {/* Edit mode buttons - outside message bubble */}
 {isEditing && sender === 'user' && (
 <div className="mt-2 flex justify-end gap-2 ml-auto max-w-[70%]">
 <button
 onClick={() => {
 setIsEditing(false);
 setEditedContent(content);
 }}
 className="text-slate-600 hover:text-slate-900 transition-all duration-200 p-2 rounded-lg hover:bg-slate-100 hover:shadow-sm active:scale-95"
 title="Cancel"
 aria-label="Cancel editing"
 >
 <Undo height={18} />
 </button>
 <button
 onClick={handleSaveEdit}
 disabled={editedContent === content}
 className={cn(
 'transition-all duration-200 p-2 rounded-lg hover:shadow-sm active:scale-95',
 editedContent === content
 ? 'text-slate-400 cursor-not-allowed opacity-50'
 : 'text-primary hover:text-primary/80 hover:bg-primary/10'
 )}
 title="Save"
 aria-label="Save changes"
 >
 <Save height={18} />
 </button>
 </div>
 )}
 </>
 );
}
