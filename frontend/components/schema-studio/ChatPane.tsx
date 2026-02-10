"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge, UserMessage, AssistantMessage, AIBadge } from "@/lib/styles/components";
import { Loader2, User, Bot, FileJson, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/lib/styles/components";
import type { SchemaMessage } from "./types";
import { ExtractionInstructionsPanel } from "./ExtractionInstructionsPanel";

/**
 * Props for the ChatPane component
 */
interface ChatPaneProps {
  /** Session identifier for the schema */
  sessionId: string;
  /** Optional collection ID */
  collectionId?: string;
  /** Optional collection name for display */
  collectionName?: string;
  /** Optional schema ID for updating existing schema */
  schemaId?: string;
  /** Optional schema name */
  schemaName?: string;
  /** Optional schema description */
  schemaDescription?: string;
  /** Initial extraction instructions value */
  extractionInstructions?: string;
  /** Current schema fields (for extending existing schema) */
  currentSchemaFields?: Record<string, unknown>;
  /** Callback when schema is generated */
  onSchemaGenerated?: (schema: Record<string, unknown>, generatedPrompt: string) => void;
  /** Callback when extraction instructions change */
  onInstructionsChange?: (instructions: string) => void;
}

/**
 * ChatPane - Right sidebar of the Schema Studio with AI chat interface
 *
 * Provides AI-powered schema generation from natural language descriptions.
 *
 * @example
 * ```tsx
 * <ChatPane
 *   sessionId="session-123"
 *   collectionId="collection-456"
 *   collectionName="Tax Documents"
 *   onSchemaGenerated={(schema, prompt) => console.log(schema)}
 * />
 * ```
 */
export function ChatPane({
  sessionId,
  collectionId,
  collectionName,
  schemaId,
  schemaName,
  schemaDescription,
  extractionInstructions: initialInstructions = "",
  currentSchemaFields,
  onSchemaGenerated,
  onInstructionsChange,
}: ChatPaneProps) {
  // State management
  const [messages, setMessages] = useState<SchemaMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractionInstructions, setExtractionInstructions] = useState(initialInstructions);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Handle extraction instructions change
  const handleInstructionsChange = useCallback(
    (newInstructions: string) => {
      setExtractionInstructions(newInstructions);
      onInstructionsChange?.(newInstructions);
    },
    [onInstructionsChange]
  );

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    // Find the ScrollArea viewport element
    const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    if (viewport) {
      // Use scrollTop to scroll within the container, not the page
      viewport.scrollTop = viewport.scrollHeight;
    }
  };

  useEffect(() => {
    // Only scroll when messages actually change (new message added)
    if (messages.length > 0) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages.length]);

  /**
   * Handle sending a message to the AI
   */
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isGenerating) return;

    // Add user message
    const userMessage: SchemaMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);

    try {
      // Convert existing fields to the format expected by the API
      const existingFields = currentSchemaFields
        ? Object.entries(currentSchemaFields).map(([name, field]) => ({
            field_name: name,
            field_type: (field as Record<string, unknown>).type || "string",
            description: (field as Record<string, unknown>).description || "",
          }))
        : null;

      // Call the simple schema generation API
      const response = await fetch('/api/schema-generator/simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          schema_name: schemaName || "InformationExtraction",
          schema_description: schemaDescription || null,
          existing_fields: existingFields,
          extraction_instructions: extractionInstructions || null,
          session_id: sessionId,
          collection_id: collectionId || null,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to generate schema: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.schema) {
        // Extract field names for the affected_fields display
        const affectedFields = Object.keys(data.schema.properties || {});

        const assistantMessage: SchemaMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: data.message || "Schema generated successfully.",
          timestamp: new Date(),
          schema: data.schema,
          affected_fields: affectedFields,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Notify parent component about the generated schema
        onSchemaGenerated?.(data.schema, data.generated_prompt || "");
      } else {
        throw new Error(data.message || "Failed to generate schema");
      }

    } catch (error) {
      console.error("Error in schema generation:", error);

      const errorMessage: SchemaMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: error instanceof Error
          ? `Sorry, I encountered an error: ${error.message}. Please try again.`
          : "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    handleSendMessage(input.trim());
    setInput("");
  };

  // Suggested prompts for new users (hidden but kept in code)
  const suggestedPrompts = [
    "Extract all legal entities and their roles from the documents",
    "I need to extract dates, monetary amounts, and case numbers",
    "Create a schema for contract details including parties and terms",
    "Extract tax-related information like rates and deductions",
    "Generate a schema for court decisions and justifications",
  ];

  const hasSchema = messages.some((m) => m.schema);

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* Glassmorphism 2.0 Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/20 to-white/10 dark:from-slate-900/40 dark:via-slate-900/20 dark:to-slate-900/10 backdrop-blur-2xl border-l border-white/20 dark:border-slate-700/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/20 dark:border-slate-700/20">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              AI Schema Generator
            </h3>
            <AIBadge text="AI" />
          </div>
        </div>

        {/* Scrollable content area - messages + input together */}
        <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-3 py-4 flex flex-col min-h-full">
              {/* Messages from top */}
              <div className="flex-1">
                {messages.length === 0 ? (
                  /* Empty state hint */
                  <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Describe what information to extract. Use questions like "Is there a penalty?" for boolean fields, or specify field types directly.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Message list */
                  <div className="space-y-3 mb-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-2",
                          message.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.role === "assistant" && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-400/20 to-purple-400/20 dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-purple-500/20 flex items-center justify-center mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                        {message.role === "user" ? (
                          <UserMessage className="max-w-[90%]">
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          </UserMessage>
                        ) : (
                          <AssistantMessage className="max-w-[90%]">
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>
                            {message.schema && (
                              <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                  <FileJson className="h-2.5 w-2.5 mr-1" />
                                  Schema Updated
                                </Badge>
                                {message.affected_fields && message.affected_fields.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {message.affected_fields.length} field(s)
                                  </span>
                                )}
                              </div>
                            )}
                          </AssistantMessage>
                        )}
                        {message.role === "user" && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-0.5">
                            <User className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Loading indicator */}
                    {isGenerating && (
                      <div className="flex gap-2 justify-start">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-400/20 to-purple-400/20 dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-purple-500/20 flex items-center justify-center mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
                        </div>
                        <div className="rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60 shadow-sm px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Generating schema...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input area - right after messages */}
              <div className="sticky bottom-0 pt-2">
                {/* Extraction Instructions - collapsible */}
                <ExtractionInstructionsPanel
                  value={extractionInstructions}
                  onChange={handleInstructionsChange}
                  disabled={isGenerating}
                />

                {/* Chat input */}
                <div className="mt-2">
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder="Describe fields to extract..."
                    disabled={isGenerating}
                    isLoading={isGenerating}
                  />
                </div>
              </div>

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

/**
 * TODO: Implementation checklist
 *
 * [x] Create base UI structure with message display
 * [x] Implement suggested prompts for new users
 * [x] Add auto-scroll to latest message
 * [x] Handle user input and submission
 * [x] Connect to actual chat API endpoint (simple LangChain chain)
 * [x] Parse schema changes from AI responses
 * [x] Show affected fields count in messages
 * [ ] Implement real-time message streaming
 * [ ] Highlight affected fields in messages
 * [ ] Add message reactions/feedback
 * [ ] Implement message history persistence
 * [ ] Add contextual tips based on schema state
 * [ ] Support message editing/regeneration
 * [ ] Add file upload for example documents
 * [ ] Implement conversation branching
 */
