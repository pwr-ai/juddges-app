import { useState, useRef, useEffect } from "react";
import type { Message } from "@/types/message";
import { streamChatQuestion, DocumentRetrievalInput } from "@/lib/api";
import type { Source } from "@/lib/styles/components";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import logger from "@/lib/logger";

function findPrevUserIndex(messages: Message[], fromIndex: number): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

/**
 * Check if an error is related to Weaviate/document database issues
 */
function isWeaviateError(error: Error): boolean {
  const errorMessageLower = error.message.toLowerCase();
  const errorDetails = (error as Error & { details?: unknown })?.details;
  const errorDetailsStr = errorDetails ? JSON.stringify(errorDetails).toLowerCase() : '';
  
  return (
    errorMessageLower.includes('weaviate') ||
    errorDetailsStr.includes('weaviate') ||
    errorMessageLower.includes('document was not found') ||
    errorMessageLower.includes('hallucinated')
  );
}

/**
 * Generate a user-friendly error message based on the error type
 */
function getUserFriendlyErrorMessage(error: Error, context: 'send' | 'edit' | 'regenerate' = 'send'): string {
  const contextMessages = {
    send: "I apologize, but I'm having trouble processing your request right now. ",
    edit: "I apologize, but I'm having trouble processing your edited message right now. ",
    regenerate: "I apologize, but I'm having trouble regenerating that response right now. "
  };
  
  let userMessage = contextMessages[context];

  // Check for Weaviate errors first
  if (isWeaviateError(error)) {
    return "I'm sorry, but I cannot load the source information at this time. The document database is temporarily unavailable. Please try again later.";
  }

  if (error.message.includes('500')) {
    userMessage += "Our system is experiencing technical difficulties. Please try again in a moment.";
  } else if (error.message.includes('timeout') || error.message.includes('ECONNABORTED')) {
    userMessage += "The request took too long to process. Please try again or simplify your question.";
  } else if (error.message.includes('network') || error.message.includes('fetch')) {
    userMessage += "There seems to be a connection issue. Please check your internet connection and try again.";
  } else if (error.message.includes('401') || error.message.includes('403')) {
    userMessage += "Authentication issue detected. Please refresh the page and try again.";
  } else if (error.message.includes('404')) {
    userMessage += "The service endpoint could not be found. Please contact support if this continues.";
  } else {
    userMessage += "Please try again, and if the problem persists, contact support.";
  }

  return userMessage;
}


export function useChatLogic(options = { maxDocuments: 20, responseFormat: "adaptive" as "short" | "detailed" | "adaptive" }) {
  const hookLogger = logger.child('useChatLogic');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fragments, setFragments] = useState<Source[]>([]);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Always-current messages ref to avoid stale closures after async operations
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  // Track the current assistant message ID being generated to ignore responses from aborted generations
  const currentAssistantMessageIdRef = useRef<string | null>(null);

  // Initialize a new chat or load existing chat
  // const initializeChat = async () => {
  //   if (chatId) return; // Already initialized
  //
  //   try {
  //     // Get the current user
  //     const supabase = createClient();
  //     const {
  //       data: { user },
  //     } = await supabase.auth.getUser();
  //     if (!user) {
  //       hookLogger.error('Cannot initialize chat: User not authenticated');
  //       return;
  //     }
  //
  //     // Create a new chat
  //     const newChatId = uuidv4();
  //     const now = new Date().toISOString();
  //
  //     const { data, error } = await createClient()
  //       .from("chats")
  //       .insert({
  //         id: newChatId,
  //         user_id: user.id,
  //         title: null, // Will be updated with the first user message
  //         created_at: now,
  //         updated_at: now,
  //       })
  //       .select()
  //       .single();
  //
  //     if (error) {
  //       hookLogger.error('Error creating chat', error, { context: 'initializeChat' });
  //       return;
  //     }
  //
  //     setChatId(newChatId);
  //     hookLogger.info('Chat initialized successfully', { chatId: newChatId, userId: user.id });
  //   } catch (error) {
  //     hookLogger.error('Error initializing chat', error, { context: 'initializeChat' });
  //   }
  // };

  // Save message to Supabase
  const saveMessageToSupabase = async (message: Message, chatId: string) => {
    try {
      // Validate message content - never save empty messages
      if (!message.content || message.content.trim().length === 0) {
        hookLogger.warn('Attempting to save empty message - using fallback error message', {
          messageId: message.id,
          role: message.role,
          chatId,
        });
        
        // If it's an assistant message with no content, use a fallback error message
        // This message format is recognized by ChatMessage component as an error (see error indicators)
        if (message.role === "assistant") {
          message.content = "I apologize, but I'm having trouble generating a response right now. Please try again.";
        } else {
          // For user messages, this should never happen, but log and skip
          hookLogger.error('Attempted to save empty user message - skipping', {
            messageId: message.id,
            chatId,
          });
          return;
        }
      }

      hookLogger.debug('Persisting message to Supabase', {
        chatId,
        messageId: message.id,
        role: message.role,
        contentLength: message.content.length,
        reason: 'assistant-final',
        generationId: message.id,
      });

      // Get the current user
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (!user) {
        hookLogger.error('Cannot save message: User not authenticated');
        return;
      }

      // Save the message
      const { error } = await createClient().from("messages").insert({
        id: message.id,
        chat_id: chatId,
        user_id: user.id,
        role: message.role,
        content: message.content,
        document_ids: message.document_ids || null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        hookLogger.error('Error saving message', error, { context: 'saveMessage' });
      } else {
        hookLogger.info('Message saved to Supabase', {
          chatId,
          messageId: message.id,
          role: message.role,
          contentLength: message.content.length,
          reason: 'assistant-final',
          generationId: message.id,
        });
      }

      // If this is the first user message, update the chat title
      if (message.role === "user") {
        const existingMessages = await createClient()
          .from("messages")
          .select("id")
          .eq("chat_id", chatId);

        if (existingMessages.count === 1) {
          // This is the first message, set it as the chat title (truncated)
          const title =
            message.content.length > 50
              ? message.content.substring(0, 47) + "..."
              : message.content;

          await createClient().from("chats").update({ title }).eq("id", chatId);
        }
      }
    } catch (error) {
      hookLogger.error('Error saving message to database', error, { context: 'saveMessageToDatabase' });
    }
  };

  // Scroll behavior is handled by ChatInterface component
  // This hook no longer manages scrolling to avoid conflicts

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
      // Clear the current assistant message ID to ignore any future responses
      currentAssistantMessageIdRef.current = null;
    }
  };

  const resetConversation = async () => {
    hookLogger.info("Resetting conversation", { chatId, messageCount: messages.length });
    setMessages([]);
    setFragments([]);
    stopGeneration();
    
    // Always ensure isLoading is false after reset
    // This is critical for allowing new messages to be sent immediately after reset
    setIsLoading(false);
    setAbortController(null);

    // Reset chat ID - new chat will be created when first message is sent
    setChatId(null);
  };

  // Load an existing chat with its messages
  const loadExistingChat = async (
    existingChatId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chatMessages: any[]
  ) => {
    // Stop any ongoing generation
    stopGeneration();

    // Set the chat ID
    setChatId(existingChatId);

    // Convert and set the messages
    const convertedMessages: Message[] = chatMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      document_ids: msg.document_ids || undefined,
    }));

    setMessages(convertedMessages);
    setFragments([]); // Clear fragments for now, could be enhanced later

    // Scroll behavior is handled by ChatInterface component
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    hookLogger.info('Starting message edit', {
      messageId,
      newContentLength: newContent.length,
      currentChatId: chatId,
      totalMessages: messages.length,
      isCurrentlyLoading: isLoading
    });

    // If generation is in progress, abort it first
    if (isLoading) {
      hookLogger.info('Aborting current generation to proceed with edit');
      stopGeneration();
      // Remove any partial assistant message that might have been added (empty content)
      setMessages(prev => prev.filter(m => !(m.role === "assistant" && !m.content)));
    }

    // Read latest messages from ref to avoid stale closure after async abort
    const currentMessages = messagesRef.current.filter(m => !(m.role === "assistant" && !m.content));

    // Find the message to edit
    const messageIndex = currentMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      hookLogger.error('Message not found', { messageId });
      return;
    }

    const messageToEdit = currentMessages[messageIndex];
    if (messageToEdit.role !== "user") {
      hookLogger.error('Can only edit user messages', {
        messageId,
        role: messageToEdit.role
      });
      return;
    }

    // If content hasn't changed, do nothing
    if (messageToEdit.content === newContent) {
      hookLogger.debug('Content unchanged, skipping edit');
      return;
    }

    hookLogger.info('Editing message', {
      messageIndex,
      oldContentLength: messageToEdit.content.length,
      newContentLength: newContent.length
    });

    // Get all messages after this one (to be deleted)
    const messagesToDelete = currentMessages.slice(messageIndex + 1);
    hookLogger.debug('Messages to delete after edit', { count: messagesToDelete.length });

    // Update the message content
    const updatedMessage = {
      ...messageToEdit,
      content: newContent
    };

    // Remove all messages after the edited message
    const messagesUpToEdit = currentMessages.slice(0, messageIndex);
    setMessages([...messagesUpToEdit, updatedMessage]);
    setFragments([]); // Clear fragments

    // Delete messages from database
    if (chatId && messagesToDelete.length > 0) {
      hookLogger.debug('Deleting messages from database', { count: messagesToDelete.length });
      try {
        const supabase = createClient();
        const messageIdsToDelete = messagesToDelete.map(m => m.id);

        const { error } = await supabase
          .from("messages")
          .delete()
          .in("id", messageIdsToDelete);

        if (error) {
          hookLogger.error('Error deleting messages', error, {
            messageIds: messageIdsToDelete,
            context: 'handleEditMessage'
          });
        } else {
          hookLogger.debug('Successfully deleted messages from database');
        }
      } catch (error) {
        hookLogger.error('Error deleting messages from database', error, { context: 'handleEditMessage' });
      }
    }

    // Update the message in the database
    if (chatId) {
      hookLogger.debug('Updating message in database', { messageId });
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("messages")
          .update({
            content: newContent
          })
          .eq("id", messageId);

        if (error) {
          hookLogger.error('Error updating message', error, { messageId, context: 'handleEditMessage' });
        } else {
          hookLogger.debug('Successfully updated message in database');
        }
      } catch (error) {
        hookLogger.error('Error updating message in database', error, { context: 'handleEditMessage' });
      }
    }

    // Now regenerate the answer for the edited message
    hookLogger.info('Regenerating answer for edited message');

    // Set loading state
    setIsLoading(true);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Prepare the query for the API using messages up to the edited message as chat history
      const chatHistoryForAPI = messagesUpToEdit.map(({ content, role }) => ({
        content,
        role: role === "user" ? "human" as const : "ai" as const,
      }));

      const query: DocumentRetrievalInput = {
        question: newContent,
        chat_history: chatHistoryForAPI,
        max_documents: options.maxDocuments,
        response_format: options.responseFormat,
      };

      // Prepared API query for regeneration
    hookLogger.info('Regenerating message', {
        questionLength: newContent.length,
        chatHistoryLength: chatHistoryForAPI.length,
        maxDocuments: options.maxDocuments,
        responseFormat: options.responseFormat
      });

      // Create an initial assistant message
      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      };

      hookLogger.debug('Creating new assistant message', { assistantMessageId });
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Track this assistant message ID as the current one being generated
      currentAssistantMessageIdRef.current = assistantMessageId;

      // Make API call to get the answer with streaming
      const apiStartTime = Date.now();
      
      let streamedDocumentIds: string[] | undefined;
      
      await streamChatQuestion(
        query,
        {
          onToken: (token: string) => {
            if (currentAssistantMessageIdRef.current !== assistantMessageId) {
              return;
            }
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: token, // Always replace
                };
              }
              return newMessages;
            });
          },
          onComplete: (fullText: string, documentIds?: string[]) => {
            if (currentAssistantMessageIdRef.current !== assistantMessageId) {
              return;
            }

            const apiDuration = Date.now() - apiStartTime;
            hookLogger.info('Edit regeneration streaming complete', {
              duration: `${apiDuration}ms`,
              textLength: fullText.length,
              documentIdsCount: documentIds?.length || 0
            });

            // Validate that we have actual content
            if (!fullText || fullText.trim().length === 0) {
              hookLogger.warn('Received empty response from API after edit', {
                assistantMessageId,
                chatId,
                duration: `${apiDuration}ms`
              });
              
              // Use fallback error message that matches ChatMessage error indicators
              fullText = "I apologize, but I'm having trouble generating a response right now. Please try again.";
            }

            streamedDocumentIds = documentIds;

            if (documentIds && documentIds.length > 0) {
              const docFragments = documentIds.map((id, index) => ({
                id,
                title: `Document ${index + 1}`,
                content: `Reference to document ${id}`,
              }));
              setFragments(docFragments);
            } else {
              setFragments([]);
            }

            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: fullText,
                  document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
                };
              }
              return newMessages;
            });

            hookLogger.info('Message edit and regeneration completed successfully', {
              totalDuration: `${apiDuration}ms`
            });

            // Save the complete message to Supabase
            if (chatId) {
              const finalMessage = {
                id: assistantMessageId,
                role: "assistant" as const,
                content: fullText,
                document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
              };
              
              saveMessageToSupabase(finalMessage, chatId).catch((err) => {
                hookLogger.error('Failed to save edited message to Supabase', err);
              });
            }
          },
          onError: (error: Error) => {
            hookLogger.error('Error regenerating after edit', error);
            setMessages((prev) => prev.filter(m => m.id !== assistantMessageId));
            
            const userMessage = getUserFriendlyErrorMessage(error, 'edit');
            const errorMessage: Message = {
              id: uuidv4(),
              role: "assistant",
              content: userMessage,
            };
            setMessages((prev) => [...prev, errorMessage]);
            
            if (chatId) {
              saveMessageToSupabase(errorMessage, chatId).catch((err) => {
                hookLogger.error('Failed to save error message', err);
              });
            }
            
            setIsLoading(false);
            setAbortController(null);
            if (currentAssistantMessageIdRef.current === assistantMessageId) {
              currentAssistantMessageIdRef.current = null;
            }
          },
        },
        controller.signal
      );
    } catch (error) {
      // Check if this is an abort error
      if (error instanceof Error && error.name === "AbortError") {
        hookLogger.debug('Request was aborted by user');
        return;
      }

      hookLogger.error('Error regenerating after edit', error, {
        messageId,
        chatId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        context: 'handleEditMessage'
      });

      // Create user-friendly error message
      const userMessage = error instanceof Error 
        ? getUserFriendlyErrorMessage(error, 'edit')
        : "I apologize, but I'm having trouble processing your edited message right now. Please try again, and if the problem persists, contact support.";

      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: userMessage,
      };

      setMessages((prev) => [...prev, errorMessage]);

      // Save error message to Supabase
      if (chatId) {
        await saveMessageToSupabase(errorMessage, chatId);
      }
    } finally {
      hookLogger.debug('Cleaning up after edit request');
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    hookLogger.info('Starting message regeneration', {
      messageId,
      currentChatId: chatId,
      totalMessages: messages.length
    });

    if (isLoading) {
      hookLogger.warn('Cannot regenerate - already loading');
      return;
    }

    // Read latest messages from ref to avoid stale closure
    const currentMessages = messagesRef.current;

    // Find the message to regenerate
    const messageIndex = currentMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      hookLogger.error('Message not found', { messageId });
      return;
    }

    const messageToRegenerate = currentMessages[messageIndex];
    if (messageToRegenerate.role !== "assistant") {
      hookLogger.error('Can only regenerate assistant messages', {
        messageId,
        role: messageToRegenerate.role
      });
      return;
    }

    // Find the user message that preceded this assistant message
    let userMessageIndex = messageIndex - 1;

    // Ensure we're matching the right user message.
    // Regenerations can reorder messages, so find the proper index.
    if (currentMessages[userMessageIndex].role !== "user") {
      userMessageIndex = findPrevUserIndex(currentMessages, messageIndex);
    }

    if (userMessageIndex < 0) {
      hookLogger.error('No preceding user message found', {
        messageId,
        messageIndex,
        userMessageIndex
      });
      return;
    }

    const userMessage = currentMessages[userMessageIndex];
    hookLogger.debug('Found user message to regenerate', {
      userMessageId: userMessage.id,
      userMessageLength: userMessage.content.length
    });

    // Remove the assistant message that we're regenerating
    const messagesUpToUser = currentMessages.slice(0, userMessageIndex + 1);
    setMessages(messagesUpToUser);
    setFragments([]); // Clear fragments

    // Set loading state
    setIsLoading(true);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Prepare the query for the API using messages up to the user message as chat history
      const chatHistoryForAPI = messagesUpToUser.slice(0, -1).map(({ content, role }) => ({
        content,
        role: role === "user" ? "human" as const : "ai" as const,
      }));

      const query: DocumentRetrievalInput = {
        question: userMessage.content,
        chat_history: chatHistoryForAPI,
        max_documents: options.maxDocuments,
        response_format: options.responseFormat,
      };

      // Prepared API query for regeneration
    hookLogger.info('Regenerating message', {
        questionLength: userMessage.content.length,
        chatHistoryLength: chatHistoryForAPI.length,
        maxDocuments: options.maxDocuments,
        responseFormat: options.responseFormat
      });

      // Create an initial assistant message
      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      };

      hookLogger.debug('Creating new assistant message', { assistantMessageId });
      setMessages((prev) => [...prev, assistantMessage]);

      // Make API call to get the regenerated answer with streaming
      const apiStartTime = Date.now();
      
      let streamedDocumentIds: string[] | undefined;
      
      await streamChatQuestion(
        query,
        {
          onToken: (token: string) => {
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: token, // Always replace
                };
              }
              return newMessages;
            });
          },
          onComplete: (fullText: string, documentIds?: string[]) => {
            const apiDuration = Date.now() - apiStartTime;

            hookLogger.info('Received regenerated streaming response complete', {
              duration: `${apiDuration}ms`,
              textLength: fullText.length,
              documentIdsCount: documentIds?.length || 0
            });

            // Validate that we have actual content
            if (!fullText || fullText.trim().length === 0) {
              hookLogger.warn('Received empty response from API during regeneration', {
                assistantMessageId,
                chatId,
                duration: `${apiDuration}ms`
              });
              
              // Use fallback error message that matches ChatMessage error indicators
              fullText = "I apologize, but I'm having trouble generating a response right now. Please try again.";
            }

            streamedDocumentIds = documentIds;

            if (documentIds && documentIds.length > 0) {
              hookLogger.debug('Processing document references', {
                documentCount: documentIds.length,
                documentIds
              });

              const docFragments = documentIds.map((id, index) => ({
                id,
                title: `Document ${index + 1}`,
                content: `Reference to document ${id}`,
              }));

              setFragments(docFragments);
            } else {
              hookLogger.debug('No document references found in response');
              setFragments([]);
            }

            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: fullText,
                  document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
                };
              }
              return newMessages;
            });

            hookLogger.info('Message regeneration completed successfully', {
              totalDuration: `${apiDuration}ms`
            });

            // Save the complete message to Supabase
            if (chatId) {
              const finalMessage = {
                id: assistantMessageId,
                role: "assistant" as const,
                content: fullText,
                document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
              };
              
              saveMessageToSupabase(finalMessage, chatId).catch((err) => {
                hookLogger.error('Failed to save regenerated message to Supabase', err);
              });
            }
          },
          onError: (error: Error) => {
            hookLogger.error('Error regenerating message', error);
            setMessages((prev) => prev.filter(m => m.id !== assistantMessageId));
            
            const userMessage = getUserFriendlyErrorMessage(error, 'regenerate');
            const errorMessage: Message = {
              id: uuidv4(),
              role: "assistant",
              content: userMessage,
            };
            setMessages((prev) => [...prev, errorMessage]);
            
            if (chatId) {
              saveMessageToSupabase(errorMessage, chatId).catch((err) => {
                hookLogger.error('Failed to save error message', err);
              });
            }
            
            setIsLoading(false);
            setAbortController(null);
          },
        },
        controller.signal
      );
    } catch (error) {
      // Check if this is an abort error
      if (error instanceof Error && error.name === "AbortError") {
        hookLogger.debug('Request was aborted by user');
        return;
      }

      hookLogger.error('Error regenerating message', error, {
        messageId,
        chatId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        context: 'handleRegenerateMessage'
      });

      // Create user-friendly error message
      const userMessage = error instanceof Error 
        ? getUserFriendlyErrorMessage(error, 'regenerate')
        : "I apologize, but I'm having trouble regenerating that response right now. Please try again, and if the problem persists, contact support.";

      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: userMessage,
      };

      setMessages((prev) => [...prev, errorMessage]);

      // Save error message to Supabase
      if (chatId) {
        await saveMessageToSupabase(errorMessage, chatId);
      }
    } finally {
      hookLogger.debug('Cleaning up after regeneration request');
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleSendMessage = async (input: string) => {
    hookLogger.info('Starting message handling', {
      inputLength: input.length,
      currentChatId: chatId,
      existingMessagesCount: messages.length,
      isCurrentlyLoading: isLoading
    });

    if (!input.trim() || isLoading) {
      hookLogger.warn('Invalid state - cannot send message', {
        inputEmpty: !input.trim(),
        isLoading,
        reason: !input.trim() ? 'empty input' : 'already loading'
      });
      return;
    }

    let currentChatId = chatId;

    // Create chat only when first message is sent
    if (!currentChatId) {
      hookLogger.info('Creating new chat for first message', {
        isFirstMessage: true,
        existingMessagesCount: messages.length
      });
      try {
        // Get the current user
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!user) {
          hookLogger.error('Cannot create chat: User not authenticated', null, {
            userExists: !!user,
            authState: 'unauthenticated',
            context: 'handleSendMessage'
          });
          return;
        }

        hookLogger.debug('User authenticated, creating chat', {
          userId: user.id,
          userEmail: user.email
        });

        // Create a new chat
        const newChatId = uuidv4();
        const now = new Date().toISOString();

        const { error } = await createClient()
          .from("chats")
          .insert({
            id: newChatId,
            user_id: user.id,
            title: null, // Will be updated with the first user message
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (error) {
          hookLogger.error('Error creating chat in Supabase', error, {
            newChatId,
            context: 'handleSendMessage'
          });
          return;
        }

        currentChatId = newChatId;
        setChatId(newChatId);
        hookLogger.info('Chat created successfully', {
          chatId: newChatId,
          userId: user.id,
          createdAt: now
        });
      } catch (error) {
        hookLogger.error('Unexpected error creating chat', error, {
          context: 'handleSendMessage'
        });
        return;
      }
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input,
    };

    // Prepare the query for the API using current messages as chat history
    const chatHistoryForAPI = messages.map(({ content, role }) => ({
      content,
      role: role === "user" ? "human" as const : "ai" as const,
    }));

    const query: DocumentRetrievalInput = {
      question: input,
      chat_history: chatHistoryForAPI,
      max_documents: options.maxDocuments,
      response_format: options.responseFormat,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Save user message to Supabase
    await saveMessageToSupabase(userMessage, currentChatId);

    // Create new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    hookLogger.debug('Sending query to API');

    // Declare assistantMessageId outside try block so it's accessible in catch
    let assistantMessageId: string | null = null;

    try {
      // Create an initial assistant message
      assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      // Track this assistant message ID as the current one being generated
      currentAssistantMessageIdRef.current = assistantMessageId;

      // Make API call to get the answer with streaming
      const apiStartTime = Date.now();
      
      let streamedDocumentIds: string[] | undefined;
      let hasReceivedTokens = false;
      
      await streamChatQuestion(
        query,
        {
          onToken: (token: string) => {
            // Check if this response is for the current generation (not aborted)
            if (currentAssistantMessageIdRef.current !== assistantMessageId) {
              return; // Ignore this token
            }

            hasReceivedTokens = true;

            // Update the assistant message
            // Backend sends progressively growing complete text, so ALWAYS replace
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: token, // Always replace with the latest complete text
                };
              }
              return newMessages;
            });
          },
          onComplete: (fullText: string, documentIds?: string[]) => {
            // Check if this response is for the current generation (not aborted)
            if (currentAssistantMessageIdRef.current !== assistantMessageId) {
              hookLogger.debug('Ignoring completion for aborted generation', {
                expectedId: currentAssistantMessageIdRef.current,
                receivedId: assistantMessageId
              });
              return; // Ignore this completion
            }

            const apiDuration = Date.now() - apiStartTime;

            hookLogger.info('Received streaming response complete', {
              duration: `${apiDuration}ms`,
              textLength: fullText.length,
              documentIdsCount: documentIds?.length || 0,
              documentIds: documentIds || [],
              hasReceivedTokens
            });

            // Validate that we have actual content
            if (!fullText || fullText.trim().length === 0) {
              hookLogger.warn('Received empty response from API', {
                assistantMessageId,
                chatId: currentChatId,
                duration: `${apiDuration}ms`,
                hasReceivedTokens
              });
              
              // Use fallback error message that matches ChatMessage error indicators
              fullText = "I apologize, but I'm having trouble generating a response right now. Please try again.";
            }

            streamedDocumentIds = documentIds;

            // Extract document references if available
            if (documentIds && documentIds.length > 0) {
              const docFragments = documentIds.map((id, index) => ({
                id,
                title: `Document ${index + 1}`,
                content: `Reference to document ${id}`,
              }));

              setFragments(docFragments);
            } else {
              setFragments([]);
            }

            // Final update with complete text and document_ids
            // This is important if we didn't receive tokens progressively (non-streaming mode)
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessageIndex = newMessages.findIndex(
                (m) => m.id === assistantMessageId
              );
              if (lastMessageIndex >= 0) {
                // If we didn't receive tokens, set the full text now
                // Otherwise, just update document_ids
                newMessages[lastMessageIndex] = {
                  ...newMessages[lastMessageIndex],
                  content: hasReceivedTokens ? newMessages[lastMessageIndex].content : fullText,
                  document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
                };
              }
              return newMessages;
            });

            hookLogger.info('Message handling completed successfully', {
              totalDuration: `${apiDuration}ms`,
              finalMessageCount: messages.length + 2
            });

            // Save the complete message to Supabase
            if (currentChatId) {
              if (!assistantMessageId) {
                hookLogger.warn('Skipping save: assistant message ID missing', {
                  chatId: currentChatId,
                });
              } else {
                const finalMessage: Message = {
                  id: assistantMessageId,
                  role: "assistant",
                  content: fullText,
                  document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
                };
                
                saveMessageToSupabase(finalMessage, currentChatId).catch((err) => {
                  hookLogger.error('Failed to save streaming message to Supabase', err);
                });
              }
            }
          },
          onError: (error: Error) => {
            hookLogger.error('Error in streaming chat', error, {
              chatId: currentChatId,
              inputLength: input.length,
              messagesLength: messages.length,
              maxDocuments: options.maxDocuments,
              errorType: error.constructor.name,
              errorMessage: error.message,
              context: 'handleSendMessage-stream'
            });

            // Remove any partial assistant message that was added before the error
            setMessages((prev) => prev.filter(m => m.id !== assistantMessageId));

            // Create user-friendly error message
            const userMessage = getUserFriendlyErrorMessage(error, 'send');

            const errorMessage: Message = {
              id: uuidv4(),
              role: "assistant",
              content: userMessage,
            };

            setMessages((prev) => [...prev, errorMessage]);

            // Save error message to Supabase
            if (currentChatId) {
              saveMessageToSupabase(errorMessage, currentChatId).catch((err) => {
                hookLogger.error('Failed to save error message', err);
              });
            }
            
            // Ensure loading state is cleared on error
            setIsLoading(false);
            setAbortController(null);
            if (currentAssistantMessageIdRef.current === assistantMessageId) {
              currentAssistantMessageIdRef.current = null;
            }
          },
        },
        controller.signal
      );
    } catch (error) {
      // Check if this is an abort error, which we don't want to show to the user
      if (error instanceof Error && error.name === "AbortError") {
        hookLogger.debug('Request was aborted by user', {
          chatId: currentChatId,
          abortReason: 'user_initiated',
          messagesLength: messages.length
        });
        // Remove any partial assistant message that was added
        setMessages((prev) => prev.filter(m => !(m.role === "assistant" && !m.content)));
        // Clean up loading state
        setIsLoading(false);
        setAbortController(null);
        if (assistantMessageId && currentAssistantMessageIdRef.current === assistantMessageId) {
          currentAssistantMessageIdRef.current = null;
        }
        return;
      }

      hookLogger.error('Error processing chat message', error, {
        chatId: currentChatId,
        inputLength: input.length,
        messagesLength: messages.length,
        maxDocuments: options.maxDocuments,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        isNetworkError: error instanceof Error && (error.message.includes('fetch') || error.message.includes('API error')),
        context: 'handleSendMessage'
      });

      // Remove any partial assistant message that was added before the error
      setMessages((prev) => prev.filter(m => !(m.role === "assistant" && !m.content)));

      // Create user-friendly error message
      const userMessage = error instanceof Error 
        ? getUserFriendlyErrorMessage(error, 'send')
        : "I apologize, but I'm having trouble processing your request right now. Please try again, and if the problem persists, contact support.";

      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: userMessage,
      };

      setMessages((prev) => [...prev, errorMessage]);

      // Save error message to Supabase
      if (currentChatId) {
        await saveMessageToSupabase(errorMessage, currentChatId);
      } else {
        hookLogger.warn('Cannot save error message - no chatId available', { context: 'handleSendMessage' });
      }
      
      // Ensure loading state is cleared on error
      setIsLoading(false);
      setAbortController(null);
      if (assistantMessageId && currentAssistantMessageIdRef.current === assistantMessageId) {
        currentAssistantMessageIdRef.current = null;
      }
    } finally {
      // Only clean up if this is still the current generation
      // If ref was cleared (null), it was aborted and already cleaned up
      // If ref points to different ID, a new generation started - don't clean up
      if (assistantMessageId && currentAssistantMessageIdRef.current === assistantMessageId) {
        // This is still the current generation - clean up normally
        setIsLoading(false);
        setAbortController(null);
        currentAssistantMessageIdRef.current = null;
      } else if (currentAssistantMessageIdRef.current === null && isLoading) {
        // Ref was cleared (aborted) but isLoading might still be true - ensure it's cleared
        setIsLoading(false);
        setAbortController(null);
      }
      // If ref points to different ID, a new generation started - don't clean up
    }
  };

  return {
    messages,
    isLoading,
    fragments,
    messagesEndRef,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    stopGeneration,
    resetConversation,
    loadExistingChat,
    chatId,
  };
}
