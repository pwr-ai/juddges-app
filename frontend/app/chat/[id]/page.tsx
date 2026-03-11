"use client";

import { useChatContext } from "@/contexts/ChatContext";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { MessageSquare, MessageCircleX } from "lucide-react";
import logger from "@/lib/logger";
import { ChatInterface, LoadingIndicator, EmptyState } from "@/lib/styles/components";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatDetailPage(): React.JSX.Element {
 const pageLogger = logger.child('ChatDetailPage');
 const params = useParams();
 const pathname = usePathname();
 const router = useRouter();
 const chatId = params.id as string;
 const { loadExistingChat, chatId: currentChatId, messages, isLoadingChat, deletingChats } = useChatContext();
 const [isLoading, setIsLoading] = useState(true);
 const [chatNotFound, setChatNotFound] = useState(false);
 const chatNotFoundRef = useRef(false);
 const hasAttemptedLoadRef = useRef<string | null>(null);
 const isLoadingRef = useRef(false);

 // Check if current chat is being deleted
 const isDeletingCurrentChat = deletingChats.has(chatId);

 useEffect(() => {
 async function loadChat(): Promise<void> {
 // Prevent concurrent loads
 if (isLoadingRef.current) {
 return;
 }

 // CRITICAL: Only load if we're actually on the detail page
 // This prevents loading when navigating away to /chat
 const expectedPath = `/chat/${chatId}`;
 if (pathname !== expectedPath) {
 setIsLoading(false);
 isLoadingRef.current = false;
 return;
 }

 // If no chatId in URL, stop loading
 if (!chatId) {
 setIsLoading(false);
 isLoadingRef.current = false;
 return;
 }

 // If chat is already loaded and matches, stop loading
 // CRITICAL: Only skip loading if BOTH chatId matches AND we have messages
 // This ensures we always load when switching between chats
 if (chatId === currentChatId && messages.length > 0) {
 setIsLoading(false);
 setChatNotFound(false);
 chatNotFoundRef.current = false;
 isLoadingRef.current = false;
 hasAttemptedLoadRef.current = null;
 return;
 }

 // Prevent infinite loops: if we already attempted to load this chat and it wasn't found, don't try again
 if (hasAttemptedLoadRef.current === chatId && chatNotFoundRef.current) {
 setIsLoading(false);
 isLoadingRef.current = false;
 return;
 }

 // Load the chat if we have a chatId and it's different from current
 // This handles both initial page load (currentChatId is null) and switching between chats
 // CRITICAL: Always load if chatId doesn't match, even if messages exist (they might be from wrong chat)
 if (chatId !== currentChatId || (hasAttemptedLoadRef.current !== chatId && chatId === currentChatId && messages.length === 0)) {
 setIsLoading(true);
 setChatNotFound(false);
 chatNotFoundRef.current = false;
 isLoadingRef.current = true;
 hasAttemptedLoadRef.current = chatId;
 const result = await loadExistingChat(chatId);
 if (result.success) {
 setChatNotFound(false);
 chatNotFoundRef.current = false;
 } else if (result.notFound) {
 pageLogger.warn('Chat not found', { chatId });
 setChatNotFound(true);
 chatNotFoundRef.current = true;
 } else {
 pageLogger.error('Failed to load chat', { chatId, error: result.error });
 // For other errors, we might want to retry, so don't set chatNotFound
 }
 setIsLoading(false);
 isLoadingRef.current = false;
 } else if (chatId === currentChatId && messages.length === 0 && hasAttemptedLoadRef.current !== chatId) {
 // Chat ID matches but no messages - might be loading or error state
 // Wait for isLoadingChat from context to handle this
 setIsLoading(false);
 isLoadingRef.current = false;
 }
 }

 // Only run if we have a chatId from URL AND we're actually on that page
 if (chatId && pathname === `/chat/${chatId}`) {
 loadChat();
 } else {
 // No chatId or not on detail page, stop loading
 setIsLoading(false);
 setChatNotFound(false);
 chatNotFoundRef.current = false;
 hasAttemptedLoadRef.current = null;
 isLoadingRef.current = false;
 }
 }, [chatId, currentChatId, loadExistingChat, messages.length, pathname, pageLogger]);

 // Show error if chat not found
 if (chatNotFound && !isLoading && !isLoadingChat) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.3 }}
 className="flex flex-col h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-slate-50/50"
 >
 <div className="flex-1 flex items-center justify-center px-4">
 <EmptyState
 icon={MessageCircleX}
 title="Chat Not Found"
 description="The chat you're looking for doesn't exist or has been deleted."
 primaryAction={{
 label: "Go to Chats",
 onClick: () => router.push('/chat'),
 icon: MessageSquare
 }}
 variant="default"
 />
 </div>
 </motion.div>
 );
 }

 // Show loading while chat is being deleted
 if (isDeletingCurrentChat) {
 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={{ duration: 0.2 }}
 className="flex flex-col h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-slate-50/50"
 >
 <div className="flex-1 flex items-center justify-center">
 <div className="text-center space-y-6">
 <LoadingIndicator
 message="Deleting chat..."
 subtitle="Removing chat from your history"
 subtitleIcon={MessageSquare}
 variant="centered"
 size="lg"
 />
 </div>
 </div>
 </motion.div>
 );
 }

 // Show loading while chat is being loaded
 if (isLoading || isLoadingChat) {
 return (
 <motion.div
 initial={{ opacity: 0, scale: 0.98 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
 className="flex flex-col h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-background to-slate-50/50"
 >
 <div className="flex-1 flex items-center justify-center">
 <div className="text-center space-y-6">
 <LoadingIndicator
 message="Loading conversation..."
 subtitle="Preparing your chat"
 subtitleIcon={MessageSquare}
 variant="centered"
 size="lg"
 />
 </div>
 </div>
 </motion.div>
 );
 }

 return (
 <AnimatePresence mode="wait">
 <motion.div
 key={`chat-${chatId}`}
 initial={{ opacity: 0, scale: 0.98 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.98 }}
 transition={{
 duration: 0.2,
 ease: [0.4, 0, 0.2, 1]
 }}
 className="h-full"
 >
 <ChatInterface />
 </motion.div>
 </AnimatePresence>
 );
}
