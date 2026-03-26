/**
 * Chat Interface Component
 * Main orchestrator for chat UI with scrolling, message display, and input
 */

'use client';

import { FileText, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChatInput } from './chat-input';
import { ChatMessageList } from './chat-message-list';
import { LoadingIndicator } from '@/lib/styles/components';
import { useChatContext } from '@/contexts/ChatContext';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import logger from '@/lib/logger';
import { cn } from '@/lib/utils';
import { ExportChatDialog } from '@/components/chat/ExportChatDialog';

/**
 * ChatInterface Component
 *
 * Features:
 * - Layout structure and scrolling management
 * - Auto-scroll on new messages and streaming
 * - Loading states
 * - Responsive padding and spacing
 * - Proper coordination of ChatMessageList and ChatInput
 *
 * @example
 * <ChatInterface />
 */
export function ChatInterface(): React.JSX.Element {
 const pageLogger = logger.child('ChatInterface');
 const pathname = usePathname();
 const router = useRouter();
 const {
 messages,
 isLoading,
 fragments,
 messagesEndRef,
 handleSendMessage,
 stopGeneration,
 responseFormat,
 setResponseFormat,
 handleRegenerateMessage,
 handleEditMessage,
 chatId,
 isLoadingChat,
 forkChat,
 } = useChatContext();

 const handleForkFromMessage = async (messageId: string): Promise<void> => {
 if (!chatId) return;
 try {
 const newChatId = await forkChat(chatId, messageId);
 if (newChatId) {
 toast.success("Conversation forked");
 router.push(`/chat/${newChatId}`);
 }
 } catch {
 toast.error("Failed to fork conversation");
 }
 };

 const [formatValue, setFormatValue] = useState(responseFormat);
 const [showExportDialog, setShowExportDialog] = useState(false);

 // CRITICAL: Only render on chat pages
 // This prevents ChatInterface from mounting on wrong pages (like /)
 const isChatPage = pathname === '/chat' || (pathname?.startsWith('/chat/') && pathname.length > 6);

 // All hooks must be called before any conditional returns
 const lastMessageRef = useRef<HTMLDivElement | null>(null);
 const scrollContainerRef = useRef<HTMLDivElement | null>(null);
 const isInitialLoadRef = useRef<boolean>(true);
 const prevMessageCountRef = useRef<number>(0);
 const prevIsLoadingRef = useRef<boolean>(isLoading);
 const lastMessageContentRef = useRef<string>('');

 useEffect(() => {
 if (!isChatPage) {
 pageLogger.error('ChatInterface mounted on wrong page', { pathname, chatId });
 return;
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 useEffect(() => {
 setFormatValue(responseFormat);
 }, [responseFormat]);

 // Set initial position to (0,0) on mount
 useEffect(() => {
 if (scrollContainerRef.current) {
 scrollContainerRef.current.scrollTop = 0;
 }
 }, []);

 // Scroll to the end when messages change or loading state changes
 // Also scroll during streaming when message content grows
 useEffect(() => {
 const hasNewMessage = messages.length > prevMessageCountRef.current;
 const isLoadingStarted = !prevIsLoadingRef.current && isLoading;
 const isLoadingFinished = prevIsLoadingRef.current && !isLoading;

 // Check if last message content changed (streaming in progress)
 const lastMessage = messages[messages.length - 1];
 const lastMessageContent = lastMessage?.content || '';
 const contentChanged = lastMessageContent !== lastMessageContentRef.current;

 prevMessageCountRef.current = messages.length;
 prevIsLoadingRef.current = isLoading;
 lastMessageContentRef.current = lastMessageContent;

 const scrollToEnd = (): void => {
 if (!scrollContainerRef.current) return;

 const container = scrollContainerRef.current;
 // Scroll to the very bottom of the container
 container.scrollTop = container.scrollHeight;
 };

 // Scroll when loading starts (new message sent) - to show loading badge
 if (isLoadingStarted && messages.length > 0 && !isLoadingChat && scrollContainerRef.current) {
 // Wait for DOM to update with the new message and loading indicator
 setTimeout(() => {
 requestAnimationFrame(() => {
 scrollToEnd();
 });
 }, 50);
 }

 // Scroll when message finishes loading - to show complete message
 if (isLoadingFinished && messages.length > 0 && !isLoadingChat && scrollContainerRef.current) {
 // Wait for DOM to update with the complete message
 setTimeout(() => {
 requestAnimationFrame(() => {
 scrollToEnd();
 });
 }, 100);
 }

 // Scroll when a new message is added
 if (hasNewMessage && messages.length > 0 && !isLoadingChat && scrollContainerRef.current) {
 setTimeout(() => {
 requestAnimationFrame(() => {
 scrollToEnd();
 });
 }, 50);
 }

 // NEW: Scroll during streaming when content changes
 if (contentChanged && isLoading && messages.length > 0 && !isLoadingChat && scrollContainerRef.current) {
 requestAnimationFrame(() => {
 scrollToEnd();
 });
 }

 // Mark initial load as complete after first scroll
 if (isInitialLoadRef.current && messages.length > 0 && !isLoadingChat) {
 isInitialLoadRef.current = false;
 }
 }, [messages, isLoading, isLoadingChat]);

 return (
 <div className="relative flex flex-col h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-slate-50/50">
 {/* Export button - top right of chat area */}
 {chatId && messages.length > 0 && !isLoading && (
 <div className="absolute top-2 right-4 z-10">
 <button
 onClick={() => setShowExportDialog(true)}
 className={cn(
"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
"text-slate-500",
"hover:text-slate-700",
"hover:bg-slate-100/80",
"border border-transparent hover:border-slate-200/50"
 )}
 title="Export conversation"
 data-testid="export-chat-button"
 >
 <Download size={14} />
 <span className="hidden sm:inline">Export</span>
 </button>
 </div>
 )}

 {/* Export dialog */}
 {chatId && (
 <ExportChatDialog
 open={showExportDialog}
 onOpenChange={setShowExportDialog}
 chatId={chatId}
 />
 )}

 <div
 ref={scrollContainerRef}
 className={cn('flex-1 overflow-y-auto py-6 px-4 md:px-6', messages.length === 0 ? 'flex items-center justify-center' : '')}
 style={{ scrollBehavior: 'smooth' }}
 >
 <div className="w-full max-w-3xl mx-auto">
 {messages.length === 0 && !isLoading ? null : (
 <>
 {messages.length > 0 && (
 <ChatMessageList
 messages={messages}
 fragments={fragments}
 onRegenerateMessage={handleRegenerateMessage}
 onEditMessage={handleEditMessage}
 onForkFromMessage={chatId ? handleForkFromMessage : undefined}
 onLastMessageRef={(ref) => {
 lastMessageRef.current = ref;
 }}
 isLoading={isLoading}
 />
 )}
 {isLoading &&
 (() => {
 // Hide loading indicator if the last message is an assistant message with content (streaming)
 const lastMessage = messages[messages.length - 1];
 const isStreaming = lastMessage?.role === 'assistant' && lastMessage?.content?.length > 0;

 if (isStreaming) return null;

 return (
 <div className={messages.length > 0 ? 'mt-6' : ''}>
 <LoadingIndicator message="Thinking and generating a response for you"variant="inline"size="sm"/>
 </div>
 );
 })()}
 <div ref={messagesEndRef} />
 </>
 )}
 </div>
 </div>

 {/* Chat Input - fixed at bottom */}
 <div className="w-full px-4 md:px-6 flex-shrink-0 border-t border-slate-200/50 py-4">
 <div className="container mx-auto max-w-3xl">
 <ChatInput
 onSend={handleSendMessage}
 onStopGeneration={stopGeneration}
 isLoading={isLoading}
 placeholder="Type your message..."
 tools={[
 {
 id: 'responseFormat',
 icon: <FileText size={16} />,
 label: 'Response Format',
 type: 'dropdown',
 value: formatValue,
 onChange: (value) => {
 const format = value as 'short' | 'detailed' | 'adaptive';
 setFormatValue(format);
 setResponseFormat(format);
 },
 options: [
 { value: 'adaptive', label: 'Adaptive (AI decides)' },
 { value: 'short', label: 'Short Answer' },
 { value: 'detailed', label: 'Detailed Answer' },
 ],
 },
 ]}
 />
 </div>
 </div>
 </div>
 );
}
