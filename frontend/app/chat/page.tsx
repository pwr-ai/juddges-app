"use client";

import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChatContext } from "@/contexts/ChatContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import logger from "@/lib/logger";
import { MessageSquare, FileText, Scale, BarChart, Gavel, BookOpen } from "lucide-react";
import { ChatInterface, ChatInput, LoadingIndicator, PageContainer } from "@/lib/styles/components";
import { getExampleQuestions } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Typing animation component for header text
 */
function TypingHeader({ 
  text, 
  className,
  speed = 50 
}: { 
  text: string; 
  className?: string;
  speed?: number;
}): React.JSX.Element {
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);
  const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setDisplayedText("");
    indexRef.current = 0;
    
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      } else {
        clearInterval(interval);
        // Blink cursor after typing is complete
        cursorIntervalRef.current = setInterval(() => {
          setShowCursor((prev) => !prev);
        }, 530);
      }
    }, speed);

    return () => {
      clearInterval(interval);
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
    };
  }, [text, speed]);

  return (
    <h2 className={className}>
      {displayedText}
      {showCursor && (
        <motion.span
          className="inline-block w-0.5 h-[1.2em] bg-primary ml-1 align-middle"
          animate={{
            opacity: [1, 1, 0, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            times: [0, 0.45, 0.5, 1],
          }}
        />
      )}
    </h2>
  );
}

export default function ChatPage(): React.JSX.Element {
  const pageLogger = logger.child('ChatPage');
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { chatId, messages, resetConversation, handleSendMessage, isLoading, stopGeneration, responseFormat, setResponseFormat } = useChatContext();
  
  const [formatValue, setFormatValue] = useState(responseFormat);
  const [inputValue, setInputValue] = useState("");
  const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
  const [isLoadingExamples, setIsLoadingExamples] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const questionsSetRef = useRef(false);
  const isClearingRef = useRef(false);
  const isSendingMessageRef = useRef(false);
  const previousPathnameRef = useRef<string | null>(pathname);
  const hasLoggedNewChatRef = useRef(false);

  // Fallback questions if API fails
  const fallbackQuestions = useMemo(() => [
    "Jakie są konsekwencje prawne nieterminowego złożenia zeznania podatkowego?",
    "Czy umowa o dzieło podlega obowiązkowi ubezpieczenia społecznego?",
    "Kiedy przysługuje prawo do odliczenia VAT?",
    "Jakie są wymagania dla IP Box w Polsce?"
  ], []);

  // Log mount only once
  useEffect(() => {
    pageLogger.info('ChatPage mounted', {
      userId: user?.id,
      userEmail: user?.email,
      hasUser: !!user,
      authLoading,
      currentChatId: chatId,
      messageCount: messages.length
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return;
    }

    if (!user) {
      pageLogger.warn('User not authenticated, redirecting');
      router.push('/auth/login');
      return;
    }

    // FAST PATH: If we're on /chat and state is already clean, skip all checks
    if (pathname === '/chat' && !chatId && messages.length === 0 && !isClearingRef.current && !isSendingMessageRef.current) {
      previousPathnameRef.current = pathname;
      return; // Nothing to do, state is clean
    }

    // If we're on /chat (new chat page)
    if (pathname === '/chat') {
      // Check if we just navigated from a detail page (indicates reset was clicked)
      const cameFromDetailPage = previousPathnameRef.current?.startsWith('/chat/') && previousPathnameRef.current !== pathname;
      
      // CRITICAL: If we just came from a detail page, ALWAYS skip redirects and clear state
      // This prevents the redirect loop when clicking + button
      if (cameFromDetailPage) {
        pageLogger.info('Just navigated from detail page, preventing redirects', { 
          previousPath: previousPathnameRef.current,
          chatId,
          messageCount: messages.length 
        });
        isClearingRef.current = true;
        // Clear state if it exists
        if (chatId || messages.length > 0) {
          resetConversation();
        }
        previousPathnameRef.current = pathname;
        return; // CRITICAL: Don't redirect!
      }
      
      // If we're in the middle of clearing, skip all logic including redirects
      if (isClearingRef.current) {
        // Check if state is now clean
        if (!chatId && messages.length === 0) {
          isClearingRef.current = false;
          previousPathnameRef.current = pathname;
          pageLogger.info('State cleared, resetting flag');
        } else {
          pageLogger.info('Still clearing, waiting for state to clear', { chatId, messageCount: messages.length });
        }
        return; // CRITICAL: Don't redirect while clearing!
      }
      
      // If a chat was just created, redirect to chat detail page IMMEDIATELY
      // This happens when user sends a message and a chat is created
      // The AI response will stream on the detail page instead of here
      if (chatId && isSendingMessageRef.current && !isTransitioning) {
        // Reset the flag
        isSendingMessageRef.current = false;
        
        // Start transition animation
        setIsTransitioning(true);
        
        // Redirect immediately with animation
        router.replace(`/chat/${chatId}`);
        previousPathnameRef.current = pathname;
        // Reset transitioning state quickly
        setTimeout(() => setIsTransitioning(false), 250);
        
        return;
      }
      
      // CRITICAL: If there's a chatId or messages while on /chat page, we're clearing
      // BUT: Don't clear if we're currently sending a message (isSendingMessageRef.current OR isLoading)
      // This prevents clearing messages while they're being sent
      // Don't redirect - wait for state to clear first
      // This MUST come after the "chat created" check to prevent clearing newly created chats
      if ((chatId || messages.length > 0) && !isSendingMessageRef.current && !isLoading) {
        pageLogger.info('Force clearing chatId on /chat page', { chatId, messageCount: messages.length });
        isClearingRef.current = true;
        resetConversation();
        previousPathnameRef.current = pathname;
        return; // Return immediately - useEffect will run again after state updates
      }
      
      // State is clean - nothing to do
      previousPathnameRef.current = pathname;
      return;
    }
    
    // Update previous pathname for next render
    previousPathnameRef.current = pathname;

    // If we're on a chat detail page but there's no chatId (after reset), redirect to /chat
    if (pathname.startsWith('/chat/') && !chatId) {
      pageLogger.info('No chatId on detail page, redirecting to /chat', { currentPath: pathname });
      router.replace('/chat');
      return;
    }

    // Only redirect if we're NOT on /chat and there's an active chat with messages
    // This prevents redirects when user explicitly wants to create a new chat
    // Triple-check pathname to ensure we're not on /chat before redirecting
    if (pathname !== '/chat' && !pathname.startsWith('/chat/') && chatId && messages.length > 0) {
      // Only redirect if we're not already on the chat detail page
      if (!pathname.startsWith(`/chat/${chatId}`)) {
        pageLogger.info('Redirecting to chat detail page', { chatId, currentPath: pathname });
        router.push(`/chat/${chatId}`);
      }
      return;
    }
  }, [user, authLoading, chatId, messages.length, router, pathname, resetConversation, isLoading, isTransitioning, pageLogger]);


  const handleExampleClick = useCallback(async (question: string): Promise<void> => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      // Don't send if empty
      return;
    }
    
    // Reset conversation to start a new chat
    // Handle cases: existing chat, messages present, or coming from a specific chat page
    if (chatId || messages.length > 0 || pathname.startsWith('/chat/')) {
      await resetConversation();
      // Wait for state to clear and isLoading to reset
      // Use multiple animation frames to ensure React state has updated
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 300);
          });
        });
      });
    }
    
    // Navigate to /chat if not already there (to ensure we're on new chat page)
    // Handle cases: coming from /chat/[id] or any other page
    if (pathname !== '/chat') {
      router.replace('/chat');
      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Set flag to indicate we're sending a message
    // This prevents the useEffect from clearing the newly created chat
    isSendingMessageRef.current = true;
    
    // Call handleSendMessage with the question to create new chat
    // The useEffect will automatically redirect to /chat/${chatId} after chat is created
    // Await to catch any errors and ensure it completes
    try {
      await handleSendMessage(trimmedQuestion);
    } catch (error) {
      pageLogger.error('Error sending message from example click', error, { question: trimmedQuestion });
      isSendingMessageRef.current = false;
    }
  }, [handleSendMessage, chatId, messages.length, resetConversation, pathname, router, pageLogger]);

  useEffect(() => {
    setFormatValue(responseFormat);
  }, [responseFormat]);

  const handleResponseFormatChange = (value: string): void => {
    const format = value as "short" | "detailed" | "adaptive";
    setFormatValue(format);
    setResponseFormat(format);
  };

  // Fetch example questions on mount
  useEffect(() => {
    // Only fetch if we're on the new chat page and have no messages
    if (pathname !== '/chat' || messages.length > 0) {
      // If not on chat page or has messages, ensure loading is false
      if (isLoadingExamples) {
        setIsLoadingExamples(false);
      }
      // Use fallback if no questions set yet
      if (exampleQuestions.length === 0 && !questionsSetRef.current) {
        setExampleQuestions(fallbackQuestions);
        questionsSetRef.current = true;
      }
      return;
    }

    // Only fetch once per page load
    if (questionsSetRef.current) {
      // Already fetched, ensure loading is false
      if (isLoadingExamples) {
        setIsLoadingExamples(false);
      }
      return;
    }

    const fetchExamples = async (): Promise<void> => {
      try {
        setIsLoadingExamples(true);
        // Fetch a reasonable number of questions to have variety (reduced from 50+50)
        const allQuestions = await getExampleQuestions(20, 20);
        if (allQuestions && allQuestions.length > 0) {
          // Randomly shuffle and select 4 questions
          const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, 4);
          setExampleQuestions(selected);
          questionsSetRef.current = true;
        } else {
          // Use fallback if API returns empty
          setExampleQuestions(fallbackQuestions);
          questionsSetRef.current = true;
        }
      } catch (error) {
        pageLogger.error('Failed to fetch example questions', { error });
        // Use fallback on error
        setExampleQuestions(fallbackQuestions);
        questionsSetRef.current = true;
      } finally {
        setIsLoadingExamples(false);
      }
    };

    fetchExamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, messages.length]);

  // Reset questions ref when navigating to /chat with no messages (new chat)
  useEffect(() => {
    if (pathname === '/chat' && messages.length === 0) {
      // Reset to allow fresh fetch of example questions
      questionsSetRef.current = false;
    }
  }, [pathname, messages.length]);

  // Memoize example questions mapping to avoid re-computation on every render
  // Categorize questions based on keywords
  // Note: Icon backgrounds removed - using tinted glass squircle instead (bg-current/10)
  const currentExamples = useMemo(() => {
    const questions = exampleQuestions.length > 0 ? exampleQuestions : fallbackQuestions;
    const colorSchemes = [
      { icon: BarChart, color: "text-amber-600 dark:text-amber-400" },
      { icon: Scale, color: "text-emerald-600 dark:text-emerald-400" },
      { icon: Gavel, color: "text-indigo-600 dark:text-indigo-400" },
      { icon: BookOpen, color: "text-purple-600 dark:text-purple-400" }
    ];
    
    return questions.map((q, idx) => {
      const lowerQ = q.toLowerCase();
      let category = "General";
      
      if (lowerQ.includes("vat") || lowerQ.includes("podatk") || lowerQ.includes("tax") || lowerQ.includes("ip box") || lowerQ.includes("ubezpieczen")) {
        category = "Tax Law";
      } else if (lowerQ.includes("sąd") || lowerQ.includes("court") || lowerQ.includes("judgment") || lowerQ.includes("orzeczen") || lowerQ.includes("wyrok")) {
        category = "Court Judgments";
      } else if (lowerQ.includes("umowa") || lowerQ.includes("contract") || lowerQ.includes("legal")) {
        category = "Legal Regulations";
      }
      
      // Use index-based color scheme to ensure unique colors
      const colorScheme = colorSchemes[idx % colorSchemes.length];
      
      return {
        query: q,
        category,
        icon: colorScheme.icon,
        iconColor: colorScheme.color
      };
    });
  }, [exampleQuestions, fallbackQuestions]);

  const chatInputComponent = (
    <ChatInput
      value={inputValue}
      onChange={(value) => setInputValue(value)}
      onSubmit={(e) => {
        e.preventDefault();
        if (inputValue.trim()) {
          // Set flag to indicate we're sending a message
          // This allows the redirect logic to work properly
          isSendingMessageRef.current = true;
          handleSendMessage(inputValue.trim());
          setInputValue("");
        }
      }}
      onStopGeneration={stopGeneration}
      isLoading={isLoading}
      placeholder="Ask about tax law, court judgments, or legal regulations..."
      tools={[
        {
          id: "responseFormat",
          icon: <FileText size={16} />,
          label: "Response Format",
          type: "dropdown",
          value: formatValue,
          onChange: handleResponseFormatChange,
          options: [
            { value: "adaptive", label: "Adaptive (AI decides)" },
            { value: "short", label: "Short Answer" },
            { value: "detailed", label: "Detailed Answer" },
          ],
        },
      ]}
    />
  );

  // Track new chat sessions (must be before any conditional returns)
  useEffect(() => {
    if (pathname === '/chat' && messages.length === 0 && !hasLoggedNewChatRef.current) {
      hasLoggedNewChatRef.current = true;
    } else if (messages.length > 0) {
      // Reset the flag when messages are added (chat started)
      hasLoggedNewChatRef.current = false;
    }
  }, [pathname, messages.length, exampleQuestions.length, fallbackQuestions, pageLogger]);

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] relative overflow-hidden">
        {/* Loading indicator */}
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator
            message="Loading chat..."
            subtitle="Preparing your AI assistant"
            subtitleIcon={MessageSquare}
            variant="centered"
            size="lg"
          />
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (handled by useEffect, but guard here too)
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingIndicator message="Loading..." variant="centered" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Dashboard Mesh Background - Clean Room Environment */}
      {/* Light Mode: Off-White (#F8FAFC) + Pale Blue/Steel Blobs */}
      {/* Dark Mode: Deep Slate (#020617) + Indigo/Void Blobs */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 dark:hidden"
        style={{
          background: `
            radial-gradient(circle at 85% 15%, rgba(219, 234, 254, 0.15) 0, transparent 55%),
            radial-gradient(circle at 80% 85%, rgba(199, 210, 254, 0.10) 0, transparent 55%),
            linear-gradient(135deg, #F8FAFC 0%, #F8FAFC 50%, #F8FAFC 100%)
          `,
          backgroundAttachment: 'fixed',
        }}
      />
      <div 
        className="absolute inset-0 pointer-events-none z-0 hidden dark:block"
        style={{
          background: `
            radial-gradient(circle at 85% 15%, rgba(30, 58, 138, 0.15) 0, transparent 55%),
            radial-gradient(circle at 80% 85%, rgba(55, 48, 163, 0.10) 0, transparent 55%),
            linear-gradient(135deg, #020617 0%, #020617 50%, #020617 100%)
          `,
          backgroundAttachment: 'fixed',
        }}
      />

      {/* Content container with AnimatePresence */}
      <AnimatePresence mode="wait">
        {!isTransitioning && (
          <motion.div
            key="chat-main"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ 
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="flex flex-col h-full min-h-0 relative z-10"
          >
        {/* Show welcome page if we're on /chat (new chat page) */}
        {/* Show ChatInterface only if we have a valid chat (chatId AND messages) AND we're NOT on /chat */}
        {/* This handles both cases:
            1. New Chat button: pathname === '/chat' → always show welcome page
            2. Card click: creates chat → redirects to /chat/${chatId} → shows ChatInterface */}
        {pathname === '/chat' || !chatId || messages.length === 0 ? (
          <PageContainer width="narrow" fillViewport className="flex items-center justify-center">
            {/* Content area - centered with proper spacing, max-width 48rem (768px) or 56rem (896px) */}
            <div className="w-full max-w-[56rem] space-y-8">
              {/* Chat Header */}
              <div className="w-full">
                <TypingHeader 
                  text="What legal question can I help you with today?"
                  className="text-xl md:text-2xl font-semibold leading-relaxed text-black dark:text-foreground text-left"
                />
              </div>

              {/* Chat Input - centered */}
              <div className="w-full">
                {chatInputComponent}
              </div>

              {/* Suggested Queries - Below Chat Input */}
              <div className="w-full">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-black dark:text-muted-foreground tracking-wide">
                    Example Questions
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isLoadingExamples ? (
                    // Show skeleton cards while loading
                    Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"
                      />
                    ))
                  ) : (
                    currentExamples.slice(0, 4).map((example) => (
                      <button
                        key={example.query}
                        onClick={() => handleExampleClick(example.query)}
                        className={cn(
                          // Base: Floating Card - Glass Tile
                          "p-6 rounded-2xl text-left group transition-all duration-300",
                          // Surface (Idle)
                          // Light Mode: rgba(255, 255, 255, 0.50)
                          // Dark Mode: rgba(30, 41, 59, 0.40)
                          "bg-white/50 dark:bg-slate-800/40",
                          // Border
                          // Light Mode: #FFFFFF (Solid)
                          // Dark Mode: rgba(255, 255, 255, 0.08)
                          "border border-white dark:border-white/8",
                          // Shadow (Idle)
                          "shadow-sm",
                          // Hover: Physical Lift
                          "hover:-translate-y-0.5 hover:scale-[1.01]",
                          // Surface (Hover)
                          // Light Mode: #FFFFFF (Solid Porcelain)
                          // Dark Mode: rgba(30, 41, 59, 0.80)
                          "hover:bg-white dark:hover:bg-slate-800/80",
                          // Shadow (Hover) - Doubles in size/opacity
                          "hover:shadow-[0_12px_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)]"
                        )}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-2.5">
                            {/* Tinted Glass Squircle Icon - No Pastels */}
                            <div 
                              className={cn(
                                "p-2 rounded-lg",
                                // Background: CurrentColor at 10% opacity
                                "bg-current/10",
                                // Icon stroke: CurrentColor (inherits text)
                                example.iconColor
                              )}
                            >
                              {React.createElement(example.icon, { 
                                className: cn("size-5", example.iconColor, "stroke-current")
                              })}
                            </div>
                            <h3 className={cn(
                              "text-sm font-semibold",
                              // Text (Title)
                              // Light Mode: #0F172A (Midnight)
                              // Dark Mode: #F1F5F9 (White)
                              "text-slate-900 dark:text-slate-100"
                            )}>
                              {example.category}
                            </h3>
                          </div>
                          <p className={cn(
                            "text-sm leading-relaxed",
                            // Text (Body)
                            // Light Mode: #64748B (Slate)
                            // Dark Mode: #94A3B8 (Grey)
                            "text-slate-600 dark:text-slate-400"
                          )}>
                            {example.query}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </PageContainer>
        ) : (
          // Render ChatInterface when there are messages AND we have a chatId (or are on a chat detail page)
          <div className="flex-1 min-h-0">
            <ChatInterface />
          </div>
        )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 