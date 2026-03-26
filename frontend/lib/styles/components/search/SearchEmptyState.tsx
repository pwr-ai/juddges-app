"use client";

import { SearchX, ArrowLeft, RefreshCw, MessageSquare, Brain, Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/lib/styles/components';

interface SearchEmptyStateProps {
 error: boolean;
 query: string;
 lastSearchMode: 'rabbit' | 'thinking' | null;
 onBack: () => void;
 onRetry?: () => void;
 onSwitchToThinking?: () => void;
}

export function SearchEmptyState({
 error,
 query,
 lastSearchMode,
 onBack,
 onRetry,
 onSwitchToThinking,
}: SearchEmptyStateProps): React.JSX.Element {
 const router = useRouter();

 if (error) {
 return (
 <EmptyState
 icon={SearchX}
 title="Search Error"
 description="We encountered an issue while searching. Please try again. If this problem persists, please contact support."
 query={query}
 variant="search"
 secondaryAction={{
 label: 'Back',
 onClick: onBack,
 icon: ArrowLeft,
 size: 'md',
 }}
 primaryAction={
 onRetry
 ? {
 label: 'Retry Search',
 onClick: onRetry,
 icon: RefreshCw,
 size: 'md',
 }
 : undefined
 }
 />
 );
 }

 // No results found
 return (
 <EmptyState
 icon={SearchX}
 title="No results found"
 description="We couldn't find any documents matching your search query"
 query={query}
 variant="search"
 tip={
 lastSearchMode === 'rabbit' ? (
 <div className="inline-flex items-start gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-blue-50/60 via-cyan-50/40 to-blue-50/40 backdrop-blur-sm border border-blue-200/50 shadow-sm">
 <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0"/>
 <p className="text-sm text-muted-foreground/80 leading-relaxed text-left">
 <span className="font-semibold text-foreground/90">Tip:</span> Try switching to{' '}
 <span className="font-semibold bg-gradient-to-br from-primary via-blue-600 to-cyan-600 bg-clip-text text-transparent">
 Thinking Mode
 </span>{' '}
 for more comprehensive results. It uses{' '}
 <span className="font-semibold bg-gradient-to-br from-primary via-blue-600 to-cyan-600 bg-clip-text text-transparent">
 extended AI reasoning
 </span>{' '}
 to find relevant documents.
 </p>
 </div>
 ) : lastSearchMode === 'thinking' ? (
 <div className="inline-flex items-start gap-2 px-4 py-3 rounded-xl bg-gradient-to-br from-blue-50/60 via-cyan-50/40 to-blue-50/40 backdrop-blur-sm border border-blue-200/50 shadow-sm">
 <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0"/>
 <p className="text-sm text-muted-foreground/80 leading-relaxed text-left">
 <span className="font-semibold text-foreground/90">Tip:</span> Try our{' '}
 <span className="font-semibold bg-gradient-to-br from-primary via-blue-600 to-cyan-600 bg-clip-text text-transparent">
 AI Assistant
 </span>{' '}
 instead. It uses conversational AI to understand your needs, retrieve relevant documents, and provide
 detailed explanations in a natural dialogue.
 </p>
 </div>
 ) : undefined
 }
 secondaryAction={{
 label: 'Back',
 onClick: onBack,
 icon: ArrowLeft,
 size: 'md',
 }}
 primaryAction={
 lastSearchMode === 'thinking'
 ? {
 label: 'Talk with AI Assistant',
 onClick: () => {
 router.push('/chat');
 },
 icon: MessageSquare,
 size: 'md',
 }
 : lastSearchMode === 'rabbit' && onSwitchToThinking
 ? {
 label: 'Switch to Thinking Mode',
 onClick: onSwitchToThinking,
 icon: Brain,
 size: 'md',
 }
 : undefined
 }
 />
 );
}
