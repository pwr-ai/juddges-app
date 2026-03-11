"use client";

import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserMessage, AssistantMessage } from "@/lib/styles/components";
import { Send, Loader2, User, Bot, FileJson } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/lib/styles/components";

interface SchemaMessage {
 id: string;
 role: "user"|"assistant";
 content: string;
 timestamp: Date;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 schema?: any;
}

interface SchemaChatProps {
 messages: SchemaMessage[];
 onSendMessage: (message: string) => void;
 isGenerating: boolean;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 currentSchema: any;
 selectedCollection: string;
 collections?: Array<{ id: string; name: string; }>;
}

export function SchemaChat({
 messages,
 onSendMessage,
 isGenerating,
 currentSchema,
 selectedCollection,
 collections = [],
}: SchemaChatProps) {
 const [input, setInput] = useState("");
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const scrollAreaRef = useRef<HTMLDivElement>(null);

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

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!input.trim() || isGenerating) return;

 onSendMessage(input.trim());
 setInput("");
 };

 const suggestedPrompts = [
"Extract all legal entities and their roles from the documents",
"I need to extract dates, monetary amounts, and case numbers",
"Create a schema to extract contract details including parties, terms, and obligations",
"Extract tax-related information including rates, deductions, and filing dates",
"Generate a schema for extracting court decisions and their justifications",
 ];

 return (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2">
 <div className="h-[600px] flex flex-col bg-background border border-border rounded-lg overflow-hidden">
 {/* Header */}
 <div className="border-b px-6 py-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold">Schema Generation Chat</h2>
 {currentSchema && (
 <Badge variant="secondary"className="flex items-center gap-1">
 <FileJson className="h-3 w-3"/>
 Schema Ready
 </Badge>
 )}
 </div>
 </div>

 {/* Messages */}
 <div ref={scrollAreaRef} className="flex-1">
 <ScrollArea className="h-full px-6 py-4">
 {messages.length === 0 && (
 <div className="space-y-4">
 <div className="text-center py-4">
 <h3 className="text-lg font-medium mb-2">
 Let&apos;s create an extraction schema
 </h3>
 <p className="text-sm text-muted-foreground">
 Describe what information you want to extract from your documents
 {selectedCollection && selectedCollection !=="none"&& (
 <span className="block mt-1 text-primary font-medium">
 Working with: {collections.find(c => c.id === selectedCollection)?.name || 'Selected Collection'}
 </span>
 )}
 </p>
 </div>
 <div className="space-y-2">
 <p className="text-sm font-medium text-muted-foreground">
 Example prompts:
 </p>
 {suggestedPrompts.map((prompt, index) => (
 <button
 key={index}
 onClick={() => setInput(prompt)}
 className="block w-full text-left px-4 py-3 rounded-2xl bg-gradient-to-br from-slate-50/80 via-white to-slate-50/60 border border-slate-200/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 text-sm text-slate-800"
 >
 {prompt}
 </button>
 ))}
 </div>
 {(!selectedCollection || selectedCollection === "none") && (
 <div className="bg-muted/30 border border-dashed rounded-lg p-4 text-center">
 <p className="text-sm text-muted-foreground">
 💡 <strong>Tip:</strong> You can create schemas without selecting a collection.
 They can be applied to any collection later.
 </p>
 </div>
 )}
 </div>
 )}

 {messages.map((message) => (
 <div
 key={message.id}
 className={cn(
"mb-4 flex gap-3",
 message.role === "user"? "justify-end": "justify-start"
 )}
 >
 {message.role === "assistant"&& (
 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
 <Bot className="h-4 w-4 text-primary"/>
 </div>
 )}
 {message.role === "user"? (
 <UserMessage>
 <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
 </UserMessage>
 ) : (
 <AssistantMessage>
 <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
 {message.schema && (
 <div className="mt-2 pt-2 border-t border-border/50">
 <Badge variant="secondary"className="text-xs">
 Schema Updated
 </Badge>
 </div>
 )}
 </AssistantMessage>
 )}
 {message.role === "user"&& (
 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
 <User className="h-4 w-4 text-primary-foreground"/>
 </div>
 )}
 </div>
 ))}

 {isGenerating && (
 <div className="mb-4 flex gap-3 justify-start">
 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
 <Bot className="h-4 w-4 text-primary animate-pulse"/>
 </div>
 <div className="rounded-2xl bg-gradient-to-br from-white via-slate-50/50 to-white border border-slate-200/60 shadow-sm px-5 py-4">
 <Loader2 className="h-4 w-4 animate-spin text-primary"/>
 </div>
 </div>
 )}
 <div ref={messagesEndRef} />
 </ScrollArea>
 </div>

 {/* Input form */}
 <div className="p-6 border-t">
 <ChatInput
 value={input}
 onChange={setInput}
 onSubmit={handleSubmit}
 placeholder="Describe what you want to extract..."
 disabled={isGenerating}
 isLoading={isGenerating}
 helpText="Press Enter to send, Shift+Enter for new line"
 />
 </div>
 </div>
 </div>

 <div className="space-y-4">
 <div className="bg-background border border-border rounded-lg p-6">
 <h3 className="text-base font-semibold mb-4">Tips for Schema Creation</h3>
 <div className="space-y-3">
 <div className="text-sm space-y-2">
 <p className="font-medium">Be specific about:</p>
 <ul className="list-disc list-inside space-y-1 text-muted-foreground">
 <li>Types of data to extract (dates, amounts, names)</li>
 <li>Relationships between entities</li>
 <li>Required vs optional fields</li>
 <li>Format preferences (structured lists, summaries)</li>
 </ul>
 </div>
 <div className="text-sm space-y-2">
 <p className="font-medium">You can refine by saying:</p>
 <ul className="list-disc list-inside space-y-1 text-muted-foreground">
 <li>&quot;Add a field for...&quot;</li>
 <li>&quot;Make the date field required&quot;</li>
 <li>&quot;Group related items together&quot;</li>
 <li>&quot;Include validation rules&quot;</li>
 </ul>
 </div>
 </div>
 </div>

 {currentSchema && (
 <div className="bg-background border border-border rounded-lg p-6">
 <h3 className="text-base font-semibold mb-4">Current Schema Status</h3>
 <div className="space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-muted-foreground">Fields:</span>
 <span className="font-medium">
 {Object.keys(currentSchema.schema || currentSchema).length}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Required:</span>
 <span className="font-medium">
 {
 Object.values(currentSchema.schema || currentSchema).filter(
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 (field: any) => field.required
 ).length
 }
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-muted-foreground">Status:</span>
 <Badge variant="default"className="text-xs">
 Ready to Test
 </Badge>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}
