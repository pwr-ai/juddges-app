"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useChatContext } from "@/contexts/ChatContext";
import { useRouter, usePathname } from "next/navigation";
import { Chat } from "@/types/chat";
import {
 MessageSquare,
 Trash2,
 Plus,
 ChevronDown,
 ChevronRight,
 Search,
 X,
 Pencil,
 GitFork,
 Check
} from "lucide-react";
import {
 SidebarMenuButton,
 SidebarMenuItem,
 SidebarMenuSub,
 SidebarMenuSubButton,
 SidebarMenuSubItem,
 useSidebar,
} from "@/components/ui/sidebar";
import {
 Collapsible,
 CollapsibleContent,
 CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { showSuccessToast, DeleteConfirmationDialog, LoadingIndicator } from "@/lib/styles/components";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";

export function ChatHistory(): React.JSX.Element {
 const {
 chatHistory,
 loadChatHistory,
 deleteChat,
 renameChat,
 forkChat,
 resetConversation,
 chatId: currentChatId,
 messages,
 isLoadingChatHistory,
 deletingChats,
 setDeletingChats
 } = useChatContext();
 const { iconMode } = useSidebar();
 const router = useRouter();
 const pathname = usePathname();
 const [isOpen, setIsOpen] = useState(true);
 const [searchQuery, setSearchQuery] = useState("");
 const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
 const [chatToDelete, setChatToDelete] = useState<string | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 // Track pending deletions (fake deleted chats that will be actually deleted when toast expires)
 const [pendingDeletions, setPendingDeletions] = useState<Map<string, { chat: Chat }>>(new Map());
 // Track cancelled deletions across all deletion operations (persists across renders)
 const cancelledDeletionsRef = useRef<Set<string>>(new Set());
 // Rename state
 const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
 const [renameValue, setRenameValue] = useState("");
 const renameInputRef = useRef<HTMLInputElement>(null);
 // Track if we're processing pending deletions (for loading animation)
 const [isProcessingPendingDeletions, setIsProcessingPendingDeletions] = useState(false);

 // Process pending deletions from sessionStorage
 const processPendingDeletions = useCallback(async (): Promise<void> => {
 try {
 // Get pending deletions from sessionStorage
 const storedPending = sessionStorage.getItem('pendingChatDeletions');
 if (!storedPending) {
 setIsProcessingPendingDeletions(false);
 return;
 }

 const pendingDeletionsData: Array<{ chatId: string; chat: Chat; deletionInitiatedAt: number }> = JSON.parse(storedPending);

 if (pendingDeletionsData.length === 0) {
 setIsProcessingPendingDeletions(false);
 return;
 }

 // Set loading state
 setIsProcessingPendingDeletions(true);

 const TOAST_DURATION = 5000; // Must match toast duration (5 seconds)
 const now = Date.now();
 const deletionsToProcess: typeof pendingDeletionsData = [];
 const deletionsToKeep: typeof pendingDeletionsData = [];

 // Separate deletions that have expired from those still within toast window
 for (const deletion of pendingDeletionsData) {
 const timeElapsed = now - deletion.deletionInitiatedAt;

 if (timeElapsed >= TOAST_DURATION) {
 // Toast has expired, can delete
 deletionsToProcess.push(deletion);
 } else {
 // Still within toast window, keep for later
 deletionsToKeep.push(deletion);
 }
 }

 // Process each expired deletion
 for (const { chatId } of deletionsToProcess) {
 // Check if it was cancelled (from sessionStorage)
 const storedCancelled = sessionStorage.getItem('cancelledChatDeletions');
 const cancelledIds = storedCancelled ? JSON.parse(storedCancelled) : [];

 if (cancelledIds.includes(chatId)) {
 // Was cancelled, remove from storage
 const updatedCancelled = cancelledIds.filter((id: string) => id !== chatId);
 if (updatedCancelled.length > 0) {
 sessionStorage.setItem('cancelledChatDeletions', JSON.stringify(updatedCancelled));
 } else {
 sessionStorage.removeItem('cancelledChatDeletions');
 }
 continue; // Skip this deletion
 }

 // Actually delete from database
 try {
 await deleteChat(chatId);
 logger.warn('[Chat Delete] Processed expired deletion:', chatId);
 } catch (error) {
 logger.error(`Failed to delete chat ${chatId} from database:`, error);
 }
 }

 // Update sessionStorage with remaining deletions (those still within toast window)
 if (deletionsToKeep.length > 0) {
 sessionStorage.setItem('pendingChatDeletions', JSON.stringify(deletionsToKeep));
 } else {
 sessionStorage.removeItem('pendingChatDeletions');
 }

 // Only clear cancelled deletions if we processed all pending deletions
 if (deletionsToKeep.length === 0) {
 sessionStorage.removeItem('cancelledChatDeletions');
 }

 // Clear loading state
 setIsProcessingPendingDeletions(false);
 } catch (error) {
 logger.error('Error processing pending deletions:', error);
 setIsProcessingPendingDeletions(false);
 }
 }, [deleteChat]);

 // Track if we've processed pending deletions on mount to avoid duplicate processing
 const hasProcessedOnMountRef = useRef(false);

 // Load chat history on component mount and ensure pending deletions are processed
 useEffect(() => {
 // Only process once on mount
 if (hasProcessedOnMountRef.current) return;

 const loadHistoryWithPendingDeletions = async (): Promise<void> => {
 // First, process any pending deletions
 await processPendingDeletions();
 // Then load the chat history
 await loadChatHistory(true); // Use bypassCache to ensure fresh data
 };

 loadHistoryWithPendingDeletions();
 hasProcessedOnMountRef.current = true;
 // The dependency `loadChatHistory` is a function from a context. If it's not wrapped in useCallback
 // in the context provider, it can cause an infinite loop. We run this only once on mount.
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 // Track previous pathname to detect actual navigation changes
 const previousPathnameRef = useRef(pathname);

 // Track previous chatId to detect new chat creation
 const previousChatIdRef = useRef<string | null>(currentChatId);

 // Refresh chat history when a new chat is created
 useEffect(() => {
 // Only refresh if:
 // 1. chatId changed from null/undefined to a value (new chat created)
 // 2. OR chatId exists and is not in the current history (chat was created but not yet in list)
 // 3. AND we have messages (chat is active)
 if (currentChatId && messages.length > 0) {
 const isNewChat = !previousChatIdRef.current && currentChatId;
 const isChatNotInHistory = !chatHistory.some(chat => chat.id === currentChatId);

 if (isNewChat || isChatNotInHistory) {
 // Small delay to ensure the chat is fully created in the database
 const timeoutId = setTimeout(() => {
 loadChatHistory(true); // Use bypassCache to ensure fresh data
 }, 500);

 previousChatIdRef.current = currentChatId;
 return () => clearTimeout(timeoutId);
 }
 }

 // Update previous chatId ref when it changes
 if (currentChatId !== previousChatIdRef.current) {
 previousChatIdRef.current = currentChatId;
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [currentChatId, messages.length]);

 // On navigation changes, process any pending deletions and reload history only if needed
 useEffect(() => {
 // Only process if pathname actually changed (not on initial mount)
 if (previousPathnameRef.current === pathname) return;

 previousPathnameRef.current = pathname;

 const handleNavigation = async (): Promise<void> => {
 // Check if there are any pending deletions before processing
 const storedPending = sessionStorage.getItem('pendingChatDeletions');
 const hasPendingDeletions = storedPending && JSON.parse(storedPending).length > 0;

 // Only process and reload if there are pending deletions
 if (hasPendingDeletions) {
 // Process pending deletions on navigation
 await processPendingDeletions();
 // Reload history to ensure it's up to date after deletions
 await loadChatHistory(true); // Use bypassCache to ensure fresh data
 }
 // If no pending deletions, don't reload - just let the user switch chats normally
 };

 handleNavigation();
 // Only depend on pathname, not on functions to avoid infinite loops
 }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

 // No cleanup needed anymore since we are using toast onDismiss callback

 const handleChatSelect = async (chat: Chat): Promise<void> => {
 // Navigate to the chat detail page
 router.push(`/chat/${chat.id}`);
 };

 const handleDeleteChat = async (e: React.MouseEvent, chatId: string): Promise<void> => {
 e.stopPropagation();
 setChatToDelete(chatId);
 setDeleteDialogOpen(true);
 };

 const handleStartRename = (e: React.MouseEvent, chat: Chat): void => {
 e.stopPropagation();
 setRenamingChatId(chat.id);
 setRenameValue(chat.title || chat.firstMessage || "");
 // Focus the input after it renders
 setTimeout(() => renameInputRef.current?.focus(), 50);
 };

 // Guard ref to prevent onBlur + onClick double-fire
 const isRenamingRef = useRef(false);

 const handleConfirmRename = async (): Promise<void> => {
 // Prevent double-fire from onBlur + onClick race condition
 if (isRenamingRef.current) return;
 if (!renamingChatId || !renameValue.trim()) {
 setRenamingChatId(null);
 return;
 }
 isRenamingRef.current = true;
 try {
 await renameChat(renamingChatId, renameValue.trim());
 toast.success("Chat renamed");
 } catch {
 toast.error("Failed to rename chat");
 }
 setRenamingChatId(null);
 isRenamingRef.current = false;
 };

 const handleCancelRename = (): void => {
 setRenamingChatId(null);
 setRenameValue("");
 };

 const handleForkChat = async (e: React.MouseEvent, chatId: string): Promise<void> => {
 e.stopPropagation();
 try {
 const newChatId = await forkChat(chatId);
 if (newChatId) {
 toast.success("Conversation forked");
 router.push(`/chat/${newChatId}`);
 }
 } catch {
 toast.error("Failed to fork conversation");
 }
 };

 const confirmDeleteChat = async (): Promise<void> => {
 if (!chatToDelete || isDeleting) {
 return;
 }

 setIsDeleting(true);
 try {
 // Store chat data for undo
 const chatToRestore = chatHistory.find(chat => chat.id === chatToDelete);

 if (!chatToRestore) {
 setIsDeleting(false);
 toast.error("Chat not found");
 setDeleteDialogOpen(false);
 setChatToDelete(null);
 return;
 }

 // Close dialog immediately
 setDeleteDialogOpen(false);
 setChatToDelete(null);
 setIsDeleting(false);

 // Capture chatToDelete in a const to use in closures
 const chatIdToDelete = chatToDelete;

 // Add to deleting chats to show loading animation
 // Use flushSync to force synchronous state update and DOM render
 flushSync(() => {
 setDeletingChats(prev => {
 const next = new Set(prev);
 next.add(chatIdToDelete);
 return next;
 });
 });

 // Wait for React to render the loading state - use multiple animation frames
 await new Promise(resolve => {
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 setTimeout(resolve, 100);
 });
 });
 });
 });

 // Wait a short time to show the loading animation (pretend we're doing something)
 const loadingDelay = 1000; // 1 second delay to ensure animation is visible
 await new Promise(resolve => setTimeout(resolve, loadingDelay));

 // Redirect BEFORE removing from deletingChats to prevent chat from briefly reappearing
 // Only redirect if we're on the chat detail page for this chat
 // Don't redirect if already on main chat page to avoid unmounting
 if (pathname === `/chat/${chatIdToDelete}`) {
 router.push('/chat');
 // Small delay to ensure navigation starts before state updates
 await new Promise(resolve => setTimeout(resolve, 50));
 }

 // Remove from deleting chats and add to pending deletions (this will remove it from UI)
 flushSync(() => {
 setDeletingChats(prev => {
 const next = new Set(prev);
 next.delete(chatIdToDelete);
 return next;
 });

 // Add to pending deletions (this will remove it from UI)
 setPendingDeletions(prev => {
 const next = new Map(prev);
 next.set(chatIdToDelete, { chat: chatToRestore });

 // Also store in sessionStorage for persistence across page reloads
 // Include timestamp so we only delete after toast duration expires
 try {
 const storedPending = sessionStorage.getItem('pendingChatDeletions');
 const pendingArray = storedPending ? JSON.parse(storedPending) : [];
 pendingArray.push({
 chatId: chatIdToDelete,
 chat: chatToRestore,
 deletionInitiatedAt: Date.now() // Track when deletion was initiated
 });
 sessionStorage.setItem('pendingChatDeletions', JSON.stringify(pendingArray));
 } catch (error) {
 logger.error('Failed to store pending deletion in sessionStorage:', error);
 }

 return next;
 });
 });

 // Function to handle when toast is dismissed (either by timeout or manual dismissal)
 // This triggers the time-based deletion processing
 const performActualDeletion = async (): Promise<void> => {
 logger.warn('[Chat Delete] Toast dismissed, triggering deletion processing');
 // Trigger the pending deletions processor
 // It will check if enough time has passed and handle cancellations
 await processPendingDeletions();
 };

 // Show toast with undo option
 const toastDuration = 5000; // 5 seconds
 const chatTitle = truncateTitle(chatToRestore);
 showSuccessToast({
 title: "Chat deleted",
 description: chatTitle
 ? (
 <>
 The chat has been deleted.
 <br />
 <span className="font-semibold text-foreground">&quot;{chatTitle}&quot;</span>
 </>
 )
 : "The chat has been deleted.",
 secondaryAction: {
 label: "Undo",
 onClick: async () => {
 try {
 logger.warn('[Chat Delete] Undo clicked, cancelling deletion:', chatIdToDelete);
 // Mark this specific deletion as cancelled FIRST
 cancelledDeletionsRef.current.add(chatIdToDelete);
 logger.warn('[Chat Delete] Added to cancelled deletions:', Array.from(cancelledDeletionsRef.current));

 // Also store in sessionStorage for persistence
 try {
 const storedCancelled = sessionStorage.getItem('cancelledChatDeletions');
 const cancelledArray = storedCancelled ? JSON.parse(storedCancelled) : [];
 if (!cancelledArray.includes(chatIdToDelete)) {
 cancelledArray.push(chatIdToDelete);
 sessionStorage.setItem('cancelledChatDeletions', JSON.stringify(cancelledArray));
 }
 } catch (error) {
 logger.error('Failed to store cancelled deletion in sessionStorage:', error);
 }

 // Remove from sessionStorage pending deletions
 try {
 const storedPending = sessionStorage.getItem('pendingChatDeletions');
 if (storedPending) {
 const pendingArray = JSON.parse(storedPending);
 const updated = pendingArray.filter((item: { chatId: string }) => item.chatId !== chatIdToDelete);
 if (updated.length > 0) {
 sessionStorage.setItem('pendingChatDeletions', JSON.stringify(updated));
 } else {
 sessionStorage.removeItem('pendingChatDeletions');
 }
 }
 } catch (error) {
 logger.error('Failed to remove from sessionStorage:', error);
 }

 // Use flushSync to restore chat in UI synchronously
 flushSync(() => {
 setPendingDeletions(prev => {
 const next = new Map(prev);
 next.delete(chatIdToDelete);
 return next;
 });
 });

 // Wait for React to update the DOM
 await new Promise(resolve => {
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 setTimeout(resolve, 100);
 });
 });
 });

 toast.success("Chat restored");

 // Navigate to the restored chat - the chat still exists in the database
 // so the detail page will load it successfully
 router.push(`/chat/${chatIdToDelete}`);
 } catch (error) {
 logger.error('Failed to restore chat:', error);
 toast.error("Failed to restore chat. Please try again.");
 }
 },
 },
 icon: null, // No icon for delete toast
 duration: toastDuration,
 onDismiss: performActualDeletion, // Trigger actual deletion when toast is dismissed
 });
 } catch (error) {
 logger.error('Failed to delete chat:', error);
 setIsDeleting(false);
 // Remove from deleting chats if there was an error
 if (chatToDelete) {
 setDeletingChats(prev => {
 const next = new Set(prev);
 next.delete(chatToDelete);
 return next;
 });
 }
 toast.error("Failed to delete chat. Please try again.");
 // Don't close dialog on error so user can retry
 }
 };

 const handleNewChat = useCallback(async (): Promise<void> => {
 // Reset conversation first to clear state
 await resetConversation();

 // Then navigate to main chat page
 // Use replace if already on /chat, push otherwise
 if (pathname === "/chat") {
 // Already on /chat, just need to ensure state is clean (which we did above)
 router.replace("/chat");
 } else {
 // Navigate from detail page to main chat
 router.push("/chat");
 }
 }, [router, resetConversation, pathname]);

 // Keyboard shortcuts
 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent): void => {
 // Cmd/Ctrl + N: New Chat
 if ((e.metaKey || e.ctrlKey) && e.key === 'n' && pathname.startsWith("/chat")) {
 e.preventDefault();
 if (!((!messages || messages.length === 0) && !currentChatId)) {
 handleNewChat();
 }
 }
 // Cmd/Ctrl + F: Focus search (when chat history is open)
 if ((e.metaKey || e.ctrlKey) && e.key === 'f' && isOpen) {
 e.preventDefault();
 const searchInput = document.querySelector('input[placeholder="Search chats..."]') as HTMLInputElement;
 if (searchInput) {
 searchInput.focus();
 }
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [pathname, messages, currentChatId, isOpen, handleNewChat]);

 const truncateTitle = (chat: Chat): string => {
 // Use first message content if available, otherwise fallback to title or"New Chat"
 const content = chat.firstMessage || chat.title || "New Chat";
 return content.length > 50 ? content.substring(0, 47) +"...": content;
 };

 // Filter chats based on search query and exclude pending deletions
 const filteredChatHistory = useMemo(() => {
 // Exclude chats that are pending deletion (fake deleted)
 // Keep chats that are in deletingChats (they should show loading animation)
 const chats = chatHistory.filter(chat =>
 chat.firstMessage !== null && !pendingDeletions.has(chat.id)
 );
 if (!searchQuery.trim()) {
 return chats;
 }
 const query = searchQuery.toLowerCase();
 return chats.filter(chat => {
 const title = truncateTitle(chat).toLowerCase();
 const firstMessage = (chat.firstMessage || "").toLowerCase();
 return title.includes(query) || firstMessage.includes(query);
 });
 }, [chatHistory, searchQuery, pendingDeletions]);

 // Helper to check if a chat is in deleting state
 const isChatDeleting = (chatId: string): boolean => deletingChats.has(chatId);

 return (
 <SidebarMenuItem data-testid="chat-history-sidebar">
 <Collapsible open={isOpen} onOpenChange={setIsOpen}>
 <div className="flex items-center justify-between w-full gap-2">
 <CollapsibleTrigger asChild>
 <SidebarMenuButton className="flex-1 group/trigger">
 <div className="flex items-center gap-2">
 <MessageSquare className="h-4 w-4 transition-transform duration-200 group-hover/trigger:scale-110 group-hover/trigger:rotate-3"/>
 <span>Chat</span>
 </div>
 {!iconMode && (
 <>
 {isOpen ? (
 <ChevronDown className="h-4 w-4 transition-transform duration-200"/>
 ) : (
 <ChevronRight className="h-4 w-4 transition-transform duration-200"/>
 )}
 </>
 )}
 </SidebarMenuButton>
 </CollapsibleTrigger>
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 handleNewChat();
 }}
 disabled={(!messages || messages.length === 0) && !currentChatId}
 className={cn(
"group/plus relative h-8 w-8 p-0 rounded-lg transition-all duration-200",
"bg-transparent border-0",
"text-[#64748B] font-bold",
"disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:grayscale-[0.3]",
"hover:scale-[1.2] hover:bg-transparent hover:text-[#0F172A] hover: "
 )}
 >
 <Plus className="h-4 w-4 relative z-10 stroke-[2.5]"/>
 </Button>
 </div>
 <CollapsibleContent>
 <SidebarMenuSub className="mt-2 space-y-1.5 !mx-0 !px-0 !border-0 w-full">
 {/* Search Input */}
 {chatHistory.filter(chat => chat.firstMessage !== null).length > 0 && (
 <div className="px-2 mb-2">
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
 <Input
 type="text"
 placeholder="Search chats..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-8 pl-8 pr-8 text-xs bg-slate-50/50 border-slate-200/50 focus-visible:ring-1 focus-visible:ring-primary/50"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery("")}
 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover:bg-slate-200/50 transition-colors"
 >
 <X className="h-3 w-3 text-muted-foreground"/>
 </button>
 )}
 </div>
 </div>
 )}

 {isProcessingPendingDeletions || isLoadingChatHistory ? (
 <SidebarMenuSubItem>
 {isProcessingPendingDeletions ? (
 <div className="px-3 py-2.5 flex items-center justify-center">
 <LoadingIndicator
 message="Processing pending actions..."
 variant="inline"
 size="sm"
 transparentBackground
 containerClassName="!p-0 !px-0 !py-0"
 />
 </div>
 ) : (
 <div className="px-3 py-2.5 space-y-2">
 <Skeleton className="h-8 w-full"/>
 <Skeleton className="h-8 w-full"/>
 <Skeleton className="h-8 w-3/4"/>
 </div>
 )}
 </SidebarMenuSubItem>
 ) : filteredChatHistory.length === 0 ? (
 <SidebarMenuSubItem>
 <div className="px-3 py-2.5 rounded-lg bg-slate-50/50 border border-slate-200/50">
 <span className="text-xs text-muted-foreground">
 {searchQuery ? "No chats found": "No chat history"}
 </span>
 </div>
 </SidebarMenuSubItem>
 ) : (
 filteredChatHistory.map((chat) => {
 // Only mark as active when we're on the chat detail page for this specific chat
 // This happens in two cases:
 // 1. User clicks on the chat (navigates to /chat/${chat.id})
 // 2. User enters chat via direct link (navigates to /chat/${chat.id})
 const isActive = pathname === `/chat/${chat.id}`;
 const isDeletingChat = isChatDeleting(chat.id);

 return (
 <SidebarMenuSubItem key={chat.id} data-testid="chat-history-item">
 <div className={cn(
"group relative flex items-center justify-between w-full",
 isDeletingChat &&"pointer-events-none"
 )}>
 {isDeletingChat ? (
 <div className="flex-1 px-3 py-2.5 flex items-center gap-2 min-h-[40px]">
 <LoadingIndicator
 message="Deleting chat..."
 variant="inline"
 size="sm"
 transparentBackground
 containerClassName="!p-0 !px-0 !py-0"
 />
 </div>
 ) : renamingChatId === chat.id ? (
 <div className="flex-1 flex items-center gap-1 px-1">
 <Input
 ref={renameInputRef}
 type="text"
 value={renameValue}
 onChange={(e) => setRenameValue(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleConfirmRename();
 if (e.key === 'Escape') handleCancelRename();
 }}
 onBlur={(e) => {
 // Don't trigger rename if focus moved to confirm/cancel buttons
 const relatedTarget = e.relatedTarget as HTMLElement | null;
 if (relatedTarget?.closest('[data-rename-action]')) return;
 handleConfirmRename();
 }}
 className="h-7 text-xs flex-1"
 maxLength={200}
 />
 <Button
 variant="ghost"
 size="sm"
 data-rename-action="confirm"
 onClick={handleConfirmRename}
 className="h-7 w-7 p-0 shrink-0"
 >
 <Check className="h-3.5 w-3.5 text-green-600"/>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 data-rename-action="cancel"
 onClick={handleCancelRename}
 className="h-7 w-7 p-0 shrink-0"
 >
 <X className="h-3.5 w-3.5 text-muted-foreground"/>
 </Button>
 </div>
 ) : (
 <SidebarMenuSubButton
 onClick={() => handleChatSelect(chat)}
 isActive={isActive}
 className="flex-1 cursor-pointer"
 >
 <span className="text-sm truncate block">
 {truncateTitle(chat)}
 </span>
 </SidebarMenuSubButton>
 )}
 {!isDeletingChat && renamingChatId !== chat.id && (
 <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 mr-1 pointer-events-auto">
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => handleStartRename(e, chat)}
 title="Rename chat"
 data-testid="rename-chat-button"
 className="h-7 w-7 p-0 rounded-md transition-all duration-200 hover:scale-110 text-slate-500 hover:text-slate-700 relative z-10"
 >
 <Pencil className="h-3.5 w-3.5"/>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => handleForkChat(e, chat.id)}
 title="Fork conversation"
 data-testid="fork-chat-button"
 className="h-7 w-7 p-0 rounded-md transition-all duration-200 hover:scale-110 text-slate-500 hover:text-blue-600 relative z-10"
 >
 <GitFork className="h-3.5 w-3.5"/>
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 handleDeleteChat(e, chat.id);
 }}
 title="Delete chat"
 data-testid="delete-chat-button"
 className="h-7 w-7 p-0 rounded-md transition-all duration-200 hover:scale-110 text-slate-500 hover:text-red-600 relative z-10"
 >
 <Trash2 className="h-3.5 w-3.5"/>
 </Button>
 </div>
 )}
 </div>
 </SidebarMenuSubItem>
 );
 })
 )}
 </SidebarMenuSub>
 </CollapsibleContent>
 </Collapsible>

 {/* Delete Confirmation Dialog */}
 <DeleteConfirmationDialog
 open={deleteDialogOpen}
 onOpenChange={(open) => {
 setDeleteDialogOpen(open);
 if (!open) {
 setChatToDelete(null);
 setIsDeleting(false);
 }
 }}
 title="Delete Chat"
 itemName="chat"
 itemTitle={chatToDelete ? (() => {
 const chat = chatHistory.find(chat => chat.id === chatToDelete);
 return chat ? truncateTitle(chat) : undefined;
 })() : undefined}
 isDeleting={isDeleting}
 onConfirm={confirmDeleteChat}
 />
 </SidebarMenuItem>
 );
}
