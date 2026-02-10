"use client";

import React, { createContext, useContext, ReactNode, useState } from "react";
import { useChatLogic } from "@/hooks/useChatLogic";
import { Chat } from "@/types/chat";
import logger from "@/lib/logger";
import type { Message } from "@/types/message";

const contextLogger = logger.child('ChatContext');

// Create the context
type ChatContextValue = Omit<ReturnType<typeof useChatLogic>, "loadExistingChat"> & {
  maxDocuments: number;
  setMaxDocuments: (value: number) => void;
  responseFormat: "short" | "detailed" | "adaptive";
  setResponseFormat: (value: "short" | "detailed" | "adaptive") => void;
  chatHistory: Chat[];
  loadChatHistory: (bypassCache?: boolean) => Promise<void>;
  loadExistingChat: (chatId: string) => Promise<{ success: boolean; notFound?: boolean; error?: string }>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, newTitle: string) => Promise<void>;
  forkChat: (chatId: string, messageId?: string) => Promise<string | null>;
  isLoadingChat: boolean;
  isLoadingChatHistory: boolean;
  deletingChats: Set<string>;
  setDeletingChats: React.Dispatch<React.SetStateAction<Set<string>>>;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);


/**
 * Collapse timeline with strict backend order:
 * - Keep all user messages.
 * - For each user message, keep ONLY the latest assistant that follows it.
 */
export function collapseMessages(messages: Message[]): Message[] {
  // Map: index of user message -> index of its latest following assistant
  const lastAssistantByUserIdx: Record<number, number> = {};

  // First pass: record the last assistant after each user (in given order)
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;

    // Find nearest previous user index
    let u = i - 1;
    while (u >= 0 && messages[u].role !== "user") u--;
    if (u >= 0) lastAssistantByUserIdx[u] = i; // always prefer the latest we see
  }

  // Second pass: keep users and only the chosen assistant per user
  return messages.filter((m, i) => {
    if (m.role === "user") return true;
    // Assistant: keep only if it's the recorded latest for its preceding user
    let u = i - 1;
    while (u >= 0 && messages[u].role !== "user") u--;
    if (u < 0) return true; // orphan assistant (legacy) — keep
    return lastAssistantByUserIdx[u] === i;
  });
}

// Provider component
export function ChatProvider({
  children,
  initialMaxDocuments = 20,
  initialResponseFormat = "adaptive",
}: {
  children: ReactNode;
  initialMaxDocuments?: number;
  initialResponseFormat?: "short" | "detailed" | "adaptive";
}) {
  const [maxDocuments, setMaxDocuments] = useState(initialMaxDocuments);
  const [responseFormat, setResponseFormat] = useState<"short" | "detailed" | "adaptive">(initialResponseFormat);
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false);
  const [deletingChats, setDeletingChats] = useState<Set<string>>(new Set());
  const chatLogic = useChatLogic({ maxDocuments, responseFormat });
  const { loadExistingChat: loadExistingChatFromLogic, ...chatLogicRest } = chatLogic;

  // Load chat history from the API
  const loadChatHistory = async (bypassCache: boolean = false) => {
    setIsLoadingChatHistory(true);
    try {
      // Add cache-busting header if bypassCache is true
      const headers: HeadersInit = bypassCache 
        ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        : {};
      
      const response = await fetch("/api/chats", { headers });
      if (response.ok) {
        const chats = await response.json();
        setChatHistory(chats);
      } else {
        contextLogger.error('Failed to load chat history', null, {
          status: response.status,
          statusText: response.statusText
        });
      }
    } catch (error) {
      contextLogger.error('Error loading chat history', error);
    } finally {
      setIsLoadingChatHistory(false);
    }
  };

  // Load an existing chat and its messages
  // Returns: { success: true } on success, { success: false, notFound: true } if chat not found, { success: false, error: string } on other errors
  const loadExistingChat = async (chatId: string): Promise<{ success: boolean; notFound?: boolean; error?: string }> => {
    setIsLoadingChat(true);
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`);
      if (response.ok) {
        const messages = await response.json();

        // Collapse regenerated assistant answers; preserve original order
        const visibleMessages = collapseMessages(messages);

        // Use the loadExistingChat method from useChatLogic
        await loadExistingChatFromLogic(chatId, visibleMessages);
        return { success: true };
      } else if (response.status === 404) {
        // Chat not found - clear the chat state to prevent infinite loops
        contextLogger.warn('Chat not found', { chatId, status: response.status });
        // Clear chat state to prevent infinite loading
        await chatLogic.resetConversation();
        return { success: false, notFound: true };
      } else {
        contextLogger.error('Failed to load chat messages', null, {
          chatId,
          status: response.status,
          statusText: response.statusText
        });
        return { success: false, error: `Failed to load chat: ${response.statusText}` };
      }
    } catch (error: any) {
      contextLogger.error('Error loading chat', error, { chatId });
      return { success: false, error: error?.message || 'Unknown error occurred' };
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Rename a chat
  const renameChat = async (chatId: string, newTitle: string) => {
    try {
      contextLogger.info('Renaming chat', { chatId, newTitle });
      const response = await fetch('/api/chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, title: newTitle }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        contextLogger.error('Failed to rename chat', null, {
          chatId,
          status: response.status,
          errorData
        });
        throw new Error(`Failed to rename chat: ${response.status}`);
      }

      // Update local state
      setChatHistory((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat
        )
      );

      contextLogger.info('Chat renamed successfully', { chatId, newTitle });
    } catch (error) {
      contextLogger.error('Error renaming chat', error, { chatId });
      throw error;
    }
  };

  // Fork a chat (create a new chat from messages up to a specific point)
  const forkChat = async (chatId: string, messageId?: string): Promise<string | null> => {
    try {
      contextLogger.info('Forking chat', { chatId, messageId });
      const response = await fetch(`/api/chats/${chatId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        contextLogger.error('Failed to fork chat', null, {
          chatId,
          status: response.status,
          errorData
        });
        throw new Error(`Failed to fork chat: ${response.status}`);
      }

      const forkedChat = await response.json();

      // Reload chat history to include the new forked chat
      await loadChatHistory(true);

      contextLogger.info('Chat forked successfully', {
        sourceChatId: chatId,
        newChatId: forkedChat.id
      });

      return forkedChat.id;
    } catch (error) {
      contextLogger.error('Error forking chat', error, { chatId });
      throw error;
    }
  };

  // Delete a chat
  const deleteChat = async (chatId: string) => {
    try {
      contextLogger.info('Deleting chat', { chatId });
      const response = await fetch(`/api/chats?id=${chatId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        contextLogger.error('Failed to delete chat', null, {
          chatId,
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Failed to delete chat: ${response.status} ${response.statusText}`);
      }

      // Remove from local state
      setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

      // If this is the current chat, reset the conversation
      if (chatLogic.chatId === chatId) {
        await chatLogic.resetConversation();
      }
      
      contextLogger.info('Chat deleted successfully', { chatId });
    } catch (error) {
      contextLogger.error('Error deleting chat', error, { chatId });
      throw error; // Re-throw to allow caller to handle
    }
  };

  return (
    <ChatContext.Provider
      value={{
        ...chatLogicRest,
        maxDocuments,
        setMaxDocuments,
        responseFormat,
        setResponseFormat,
        chatHistory,
        loadChatHistory,
        loadExistingChat,
        deleteChat,
        renameChat,
        forkChat,
        isLoadingChat,
        isLoadingChatHistory,
        deletingChats,
        setDeletingChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// Custom hook for using the context
export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}
