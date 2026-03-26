/**
 * ChatInput Component
 * Unified chat input component that works for both chat page (with tools/examples)
 * and studio page (simplified without tools)
 */

'use client';

import * as React from 'react';
import { Send, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Loader } from '@/components/ui/loader';
import { ChatContainer } from './chat-container';
import { DropdownButton } from '../dropdown-button';
import { getIconButtonStyle } from '../buttons';

export interface ChatInputProps {
 // Controlled mode (for studio)
 value?: string;
 onChange?: (value: string) => void;
 onSubmit?: (e: React.FormEvent) => void;

 // Uncontrolled mode (for chat page)
 onSend?: (message: string) => void;

 onStopGeneration?: () => void;
 isLoading?: boolean;
 placeholder?: string;
 disabled?: boolean;
 className?: string;
 helpText?: string;
 tools?: {
 icon: React.ReactNode;
 label: string;
 id: string;
 type?: 'toggle' | 'dropdown';
 options?: { value: string; label: string }[];
 value?: string;
 onChange?: (value: string) => void;
 }[];
}

export const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
 (
 {
 className,
 // Controlled mode (studio)
 value,
 onChange,
 onSubmit,
 // Uncontrolled mode (chat page)
 onSend,
 onStopGeneration,
 isLoading = false,
 placeholder = 'Message...',
 disabled = false,
 helpText,
 tools = [],
 ...props
 },
 ref
 ) => {
 // Determine if we're in controlled or uncontrolled mode
 const isControlled = value !== undefined && onChange !== undefined;
 const [input, setInput] = React.useState('');
 const [activeTools, setActiveTools] = React.useState<string[]>([]);
 const textareaRef = React.useRef<HTMLTextAreaElement>(null);
 const toolbarRef = React.useRef<HTMLDivElement>(null);

 // Get browser language for keyboard detection
 const browserLang = React.useMemo(() => {
 if (typeof window !== 'undefined' && navigator.language) {
 return navigator.language.split('-')[0]; // Get language code (e.g., 'en' from 'en-US')
 }
 return 'en'; // Default to English
 }, []);

 // Current value (controlled or uncontrolled)
 const currentValue = isControlled ? value : input;
 const hasTools = tools.length > 0;

 // Handle merged refs
 const mergedRef = React.useMemo(
 () => (node: HTMLTextAreaElement | null) => {
 if (node) {
 if (typeof ref === 'function') ref(node);
 else if (ref) ref.current = node;
 textareaRef.current = node;
 }
 },
 [ref]
 );

 // Handle sending message
 const handleSendMessage = React.useCallback(
 (e: React.FormEvent) => {
 e.preventDefault();
 const message = isControlled ? value : input;
 if (!message?.trim() || isLoading || disabled) return;

 if (isControlled && onSubmit) {
 onSubmit(e);
 } else if (onSend) {
 onSend(message.trim());
 setInput('');
 }
 },
 [isControlled, value, input, isLoading, disabled, onSubmit, onSend]
 );

 // Toggle tool selection
 const toggleTool = React.useCallback((id: string) => {
 setActiveTools((prev) =>
 prev.includes(id) ? prev.filter((tool) => tool !== id) : [...prev, id]
 );
 }, []);

 // Auto-focus textarea when user starts typing (like search input)
 React.useEffect(() => {
 // Don't set up auto-focus if disabled
 if (disabled) {
 return;
 }

 const handleKeyDown = (e: KeyboardEvent): void => {
 // Don't focus if user is typing in an input, textarea, or contenteditable element
 const target = e.target as HTMLElement;
 if (
 target.tagName === 'INPUT' ||
 target.tagName === 'TEXTAREA' ||
 target.isContentEditable ||
 document.activeElement === textareaRef.current
 ) {
 return;
 }

 // Focus textarea when user types a printable character
 if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
 textareaRef.current?.focus();
 // Set the input value if empty (only when textarea was not focused and not loading)
 // During loading, just focus - don't set value to allow normal typing
 if (!currentValue && textareaRef.current && !isLoading) {
 // Use setTimeout to ensure the focus happens first, then set the value
 setTimeout(() => {
 if (isControlled && onChange) {
 onChange(e.key);
 } else {
 setInput(e.key);
 }
 }, 0);
 }
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [currentValue, isControlled, onChange, disabled, isLoading]);

 // Adjust textarea padding based on toolbar height (only when tools are present)
 React.useEffect(() => {
 if (!hasTools) return;

 const adjustPadding = (): void => {
 if (textareaRef.current && toolbarRef.current) {
 textareaRef.current.style.paddingBottom = `${
 toolbarRef.current.offsetHeight + 8
 }px`;
 }
 };

 adjustPadding();

 // Observe toolbar size changes
 const resizeObserver = new ResizeObserver(adjustPadding);
 if (toolbarRef.current) resizeObserver.observe(toolbarRef.current);

 return () => resizeObserver.disconnect();
 }, [activeTools.length, hasTools]);

 // Auto-resize textarea based on content
 const adjustTextareaHeight = React.useCallback(() => {
 const textarea = textareaRef.current;
 if (!textarea) return;

 // Reset height to auto to get the correct scrollHeight
 textarea.style.height = 'auto';

 // Calculate the new height (min 24px, max 200px)
 const minHeight = 24;
 const maxHeight = 200;
 const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

 textarea.style.height = `${newHeight}px`;

 // Add scroll if content exceeds max height
 textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
 }, []);

 // Adjust height when value changes
 React.useEffect(() => {
 adjustTextareaHeight();
 }, [currentValue, adjustTextareaHeight]);

 // Simple layout (no tools) - EXACT SAME styling as with tools, just without toolbar
 if (!hasTools) {
 return (
 <div className={cn('relative w-full max-w-[800px] mx-auto', className)}>
 <form onSubmit={handleSendMessage} className="relative">
 <ChatContainer>
 {/* Subtle gradient overlay */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/10 opacity-0 focus-within:opacity-50 transition-opacity duration-300 rounded-2xl -z-10"/>

 <div className="flex items-end gap-2 px-4 py-3">
 <textarea
 ref={mergedRef}
 placeholder={placeholder}
 className={cn(
"flex-1 border-none bg-transparent focus:outline-none focus-visible:outline-none focus-visible:!border-none focus-visible:!ring-0 resize-none text-sm md:text-base leading-relaxed min-h-[24px] overflow-hidden",
 // Text Color
 // Light Mode: #0F172A (Midnight)
 // Dark Mode: #F8FAFC (Off-White)
"text-slate-900",
 // Placeholder
 // Light Mode: #94A3B8 (Slate 400)
 // Dark Mode: #64748B (Slate 500)
"placeholder:text-slate-400"
 )}
 value={currentValue || ''}
 onChange={(e) => {
 if (isControlled && onChange) {
 onChange(e.target.value);
 } else {
 setInput(e.target.value);
 }
 // Trigger height adjustment after state update
 requestAnimationFrame(adjustTextareaHeight);
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
 e.preventDefault();
 handleSendMessage(e);
 }
 }}
 rows={1}
 disabled={disabled}
 autoComplete="off"
 spellCheck="true"
 lang={browserLang}
 {...props}
 />

 {/* Send button next to textarea */}
 <div className="flex-shrink-0">
 {isLoading ? (
 <div className="flex items-center gap-2">
 <Loader size="sm"variant="ghost"/>
 {onStopGeneration && (
 <Button
 type="button"
 onClick={onStopGeneration}
 size="sm"
 variant="ghost"
 className={getIconButtonStyle('destructive', 'h-7 w-7', 'flex items-center justify-center')}
 >
 <div className="absolute inset-0 rounded-full transition-opacity duration-200"/>
 <Square size={14} className="fill-destructive relative z-10 group-hover:scale-110 transition-transform duration-200"/>
 <span className="sr-only">Stop generation</span>
 </Button>
 )}
 </div>
 ) : (
 <Button
 type="submit"
 size="sm"
 variant="ghost"
 disabled={!currentValue?.trim() || isLoading}
 className={cn(
 currentValue?.trim()
 ? getIconButtonStyle('primary', 'h-7 w-7', 'flex items-center justify-center')
 : 'h-7 w-7 rounded-full flex-shrink-0 p-0 text-muted-foreground cursor-not-allowed transition-all duration-200'
 )}
 >
 <div className={cn(
 'absolute inset-0 rounded-full transition-opacity duration-200',
 currentValue?.trim()
 ? 'opacity-0 group-hover:opacity-80'
 : ''
 )} />
 <Send size={14} className={cn(
 'relative z-10 transition-transform duration-200',
 currentValue?.trim() && 'group-hover:scale-110 group-hover:translate-x-0.5'
 )} />
 <span className="sr-only">Send message</span>
 </Button>
 )}
 </div>
 </div>
 </ChatContainer>
 </form>
 {helpText && (
 <p className="text-xs text-muted-foreground mt-2">
 {helpText}
 </p>
 )}
 </div>
 );
 }

 // Full layout (with tools) - like chat page
 return (
 <div className={cn('relative w-full max-w-[800px] mx-auto', className)}>
 <form onSubmit={handleSendMessage} className="relative">
 <ChatContainer>
 {/* Subtle gradient overlay */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/10 opacity-0 focus-within:opacity-50 transition-opacity duration-300 rounded-2xl -z-10"/>

 <textarea
 ref={mergedRef}
 placeholder={placeholder}
 className={cn(
"w-full border-none pt-4 !pb-3 !px-6 focus:outline-none focus-visible:outline-none focus-visible:!border-none focus-visible:!ring-0 resize-none mb-12 bg-transparent text-sm md:text-base leading-relaxed min-h-[24px] overflow-hidden",
 // Text Color
 // Light Mode: #0F172A (Midnight)
 // Dark Mode: #F8FAFC (Off-White)
"text-slate-900",
 // Placeholder
 // Light Mode: #94A3B8 (Slate 400)
 // Dark Mode: #64748B (Slate 500)
"placeholder:text-slate-400"
 )}
 value={currentValue || ''}
 onChange={(e) => {
 if (isControlled && onChange) {
 onChange(e.target.value);
 } else {
 setInput(e.target.value);
 }
 // Trigger height adjustment after state update
 requestAnimationFrame(adjustTextareaHeight);
 }}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
 e.preventDefault();
 handleSendMessage(e);
 }
 }}
 rows={1}
 disabled={disabled}
 autoComplete="off"
 spellCheck="true"
 lang={browserLang}
 {...props}
 />

 <div
 ref={toolbarRef}
 className="absolute bottom-0 left-0 right-0 flex border-none items-center px-3 py-2 pb-3 border-t border-border/50 bg-gradient-to-t from-background/80 via-transparent to-transparent"
 >
 <div className="flex flex-wrap gap-1">
 {tools.map((tool) => (
 <React.Fragment key={tool.id}>
 {tool.type === 'dropdown' ? (
 <DropdownButton
 icon={tool.icon}
 label={tool.label}
 value={tool.value}
 options={tool.options || []}
 onChange={tool.onChange}
 disabled={isLoading}
 />
 ) : (
 <Toggle
 pressed={activeTools.includes(tool.id)}
 onPressedChange={() => toggleTool(tool.id)}
 size="sm"
 variant="outline"
 className={cn(
 'group relative h-7 rounded-md px-2 flex items-center gap-1 text-xs me-2 transition-all duration-300',
 activeTools.includes(tool.id)
 ? 'bg-gradient-to-br from-primary/20 via-indigo-400/10 to-transparent text-foreground shadow-sm shadow-primary/10 border-primary/30 hover:scale-105 hover:shadow-md hover:shadow-primary/20'
 : 'text-muted-foreground hover:bg-muted/50 hover:scale-105 hover:shadow-sm border-border/50'
 )}
 disabled={isLoading}
 >
 <span className={cn(
 'transition-transform duration-300',
 activeTools.includes(tool.id) && 'scale-110'
 )}>
 {tool.icon}
 </span>
 <span className="hidden sm:inline">{tool.label}</span>
 </Toggle>
 )}
 </React.Fragment>
 ))}
 </div>

 <div className="ml-auto">
 {isLoading ? (
 <div className="flex items-center gap-2">
 <Loader size="sm"variant="ghost"/>
 {onStopGeneration && (
 <Button
 type="button"
 onClick={onStopGeneration}
 size="sm"
 variant="ghost"
 className="group relative rounded-full text-destructive hover:text-destructive flex-shrink-0 p-0 h-7 w-7 flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-destructive/20"
 >
 <div className="absolute inset-0 rounded-full bg-destructive/10 opacity-0 group-hover:opacity-80 transition-opacity duration-200"/>
 <Square size={14} className="fill-destructive relative z-10 group-hover:scale-110 transition-transform duration-200"/>
 <span className="sr-only">Stop generation</span>
 </Button>
 )}
 </div>
 ) : (
 <Button
 type="submit"
 size="sm"
 variant="ghost"
 disabled={!currentValue?.trim() || isLoading}
 className={cn(
 'group relative h-7 w-7 rounded-full flex-shrink-0 p-0 transition-all duration-200',
 currentValue?.trim()
 ? 'text-primary hover:text-primary hover:scale-110 hover:shadow-lg hover:shadow-primary/20'
 : 'text-muted-foreground cursor-not-allowed'
 )}
 >
 <div className={cn(
 'absolute inset-0 rounded-full transition-opacity duration-200',
 currentValue?.trim()
 ? 'bg-primary/10 opacity-0 group-hover:opacity-80'
 : ''
 )} />
 <Send size={14} className={cn(
 'relative z-10 transition-transform duration-200',
 currentValue?.trim() && 'group-hover:scale-110 group-hover:translate-x-0.5'
 )} />
 <span className="sr-only">Send message</span>
 </Button>
 )}
 </div>
 </div>
 </ChatContainer>
 </form>
 </div>
 );
 }
);

ChatInput.displayName = 'ChatInput';
