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
            <div className="inline-flex items-start gap-2 px-4 py-3 rounded-none bg-parchment-deep border border-rule">
              <Lightbulb className="h-4 w-4 text-ink mt-0.5 flex-shrink-0" />
              <p className="text-xs font-mono text-muted-foreground leading-relaxed text-left">
                <span className="font-semibold text-ink">Tip:</span> Try switching to{' '}
                <span className="font-semibold text-ink">Thinking Mode</span>{' '}
                for more comprehensive results. It uses extended reasoning to find relevant documents.
              </p>
            </div>
          ) : lastSearchMode === 'thinking' ? (
            <div className="inline-flex items-start gap-2 px-4 py-3 rounded-none bg-parchment-deep border border-rule">
              <Lightbulb className="h-4 w-4 text-ink mt-0.5 flex-shrink-0" />
              <p className="text-xs font-mono text-muted-foreground leading-relaxed text-left">
                <span className="font-semibold text-ink">Tip:</span> Try our{' '}
                <span className="font-semibold text-ink">AI Assistant</span>{' '}
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
