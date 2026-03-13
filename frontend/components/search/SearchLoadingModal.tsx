// components/search/SearchLoadingModal.tsx

'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles } from 'lucide-react';
import { DocumentShuffleAnimation } from './DocumentShuffleAnimation';
import { LoadingMessage } from './LoadingMessage';
import { useSearchMessages } from '@/hooks/useSearchMessages';
import { SEARCH_MESSAGES, EXTENDED_MESSAGES } from '@/lib/search-messages';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/lib/styles/components';

interface SearchLoadingModalProps {
 isOpen: boolean;
 onCancel?: () => void;
 searchQuery?: string;
 mode?: string;
}

export function SearchLoadingModal({
 isOpen,
 onCancel,
 searchQuery,
 mode ="rabbit",
}: SearchLoadingModalProps) {
 const { currentMessage, fadeState } = useSearchMessages({
 messages: SEARCH_MESSAGES,
 extendedMessages: EXTENDED_MESSAGES,
 extendedThreshold: 10000,
 });

 // Escape key handler
 useEffect(() => {
 if (!isOpen || !onCancel) return;

 const handleEscape = (e: KeyboardEvent) => {
 if (e.key === 'Escape') {
 onCancel();
 }
 };

 window.addEventListener('keydown', handleEscape);
 document.body.style.overflow = 'hidden';

 return () => {
 window.removeEventListener('keydown', handleEscape);
 document.body.style.overflow = '';
 };
 }, [isOpen, onCancel]);

 if (!isOpen) return null;

 return createPortal(
 <div
 className="fixed inset-0 bg-slate-900/50
 backdrop-blur-xl backdrop-saturate-150 z-50 flex items-center justify-center p-4
 animate-fade-in"
 onClick={onCancel}
 role="presentation"
 >
 <div
 className={cn(
"relative max-w-lg w-full rounded-[24px]",
 // Legal Glassmorphism 2.0 - Heavy Glass Card (Light Mode) - More White with transparency
"bg-white/95 backdrop-blur-[32px] backdrop-saturate-[200%]",
 // Rim Light: 1px Solid White Border (#FFFFFF) at 100% Opacity
"border-[1px] border-solid border-[#FFFFFF]",
 // Colored Shadow: Blue-Grey (rgba(148, 163, 184, 0.15))
"shadow-[0_8px_30px_rgba(148,163,184,0.15)]",
 // Legal Glass Night Mode - Dark Mode
"",
"",
"",
"p-6 sm:p-8 animate-scale-in",
"overflow-hidden"
 )}
 onClick={(e) => e.stopPropagation()}
 role="dialog"
 aria-modal="true"
 aria-labelledby="search-loading-title"
 aria-describedby="search-loading-description"
 >

 {/* Close button */}
 {onCancel && (
 <button
 onClick={onCancel}
 className="absolute top-4 right-4 p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-white/30 backdrop-blur-sm transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50 z-20"
 type="button"
 aria-label="Close"
 >
 <X className="h-4 w-4"/>
 </button>
 )}

 {/* Content layer - positioned above glass effects */}
 <div className="relative z-10">
 {/* Animation Container */}
 <div className="mb-6">
 <DocumentShuffleAnimation />
 </div>

 {/* Text Container */}
 <div className="text-center space-y-4">
 <div>
 <h2
 id="search-loading-title"
 className="text-2xl font-bold mb-2 text-slate-900"
 >
 {mode === "thinking"? (
 <span className="flex items-center justify-center gap-2">
 Searching with <Sparkles className="h-5 w-5 text-blue-600"/>
 <span className="text-blue-600">AI</span>
 </span>
 ) : (
"Searching"
 )}
 </h2>
 {searchQuery && (
 <p className="text-sm font-medium text-muted-foreground/80">
 for &quot;{searchQuery.length > 50 ? searchQuery.slice(0, 50) + '...' : searchQuery}&quot;
 </p>
 )}
 </div>

 {/* Rotating Message */}
 <LoadingMessage message={currentMessage} fadeState={fadeState} />
 </div>

 {/* Progress Bar */}
 <div
 className="mt-6 h-1.5 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm border border-white/20"
 role="progressbar"
 aria-label="Search progress"
 aria-valuemin={0}
 aria-valuemax={100}
 >
 <div
 className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 rounded-full animate-progress-shimmer shadow-lg shadow-blue-500/30"
 style={{
 backgroundSize: '200% 100%',
 }}
 />
 </div>

 {/* Cancel Button */}
 {onCancel && (
 <GlassButton
 onClick={onCancel}
 className="mt-6 w-full"
 type="button"
 >
 Cancel search
 </GlassButton>
 )}
 </div>

 {/* Screen reader only description */}
 <div id="search-loading-description"className="sr-only">
 Your search is in progress. {currentMessage.text}
 </div>
 </div>
 </div>,
 document.body
 );
}
