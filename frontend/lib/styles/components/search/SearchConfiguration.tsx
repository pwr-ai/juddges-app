/**
 * Search Configuration Component
 * Configuration card for search query settings (document type, mode, language)
 * Separate from SearchFilters which is for filtering results
 * Provides toggles for document types, search mode, and language selection
 */

"use client";

import React, { useEffect, useRef } from 'react';
import { Zap, Brain, Scale, Calculator, Rabbit } from 'lucide-react';
import { DocumentType } from '@/types/search';
import { FilterToggleGroup, AIBadge } from '@/lib/styles/components';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/styles/components/tooltip';
import { cn } from '@/lib/utils';

interface Language {
 code: string;
 name: string;
 flag: string;
}

export interface SearchConfigurationProps {
 documentTypes: DocumentType[];
 onDocumentTypeToggle: (type: DocumentType) => void;
 searchType: 'rabbit' | 'thinking';
 onSearchTypeChange: (type: 'rabbit' | 'thinking') => void;
 selectedLanguages: Set<string>;
 onLanguageToggle: (language: string) => void;
 isSearching?: boolean;
}

const availableDocumentTypes = [
 { value: DocumentType.JUDGMENT, label: 'Judgment', icon: Scale },
 { value: DocumentType.TAX_INTERPRETATION, label: 'Tax Interpretation', icon: Calculator },
];

const availableLanguages: Language[] = [
 { code: 'pl', name: 'Polish', flag: '🇵🇱' },
 { code: 'uk', name: 'English', flag: '🇬🇧' },
];

export function SearchConfiguration({
 documentTypes,
 onDocumentTypeToggle,
 searchType,
 onSearchTypeChange,
 selectedLanguages,
 onLanguageToggle,
 isSearching = false,
}: SearchConfigurationProps): React.JSX.Element {
 const [isThinkingPopoverOpen, setIsThinkingPopoverOpen] = React.useState(false);
 const [isFastPopoverOpen, setIsFastPopoverOpen] = React.useState(false);
 const previousSearchTypeRef = useRef<'rabbit' | 'thinking' | null>(null);

 // Only open popover when mode actually changes (not on initial mount)
 useEffect(() => {
 const previousSearchType = previousSearchTypeRef.current;

 // Only show popover if we're switching modes (not on initial mount)
 if (previousSearchType !== null && previousSearchType !== searchType) {
 if (searchType === 'thinking') {
 setIsThinkingPopoverOpen(true);
 setIsFastPopoverOpen(false);
 } else if (searchType === 'rabbit') {
 setIsFastPopoverOpen(true);
 setIsThinkingPopoverOpen(false);
 }
 }

 // Update the ref for next comparison
 previousSearchTypeRef.current = searchType;
 }, [searchType]);

 // Auto-close popover when search is triggered
 useEffect(() => {
 if (isSearching) {
 setIsFastPopoverOpen(false);
 setIsThinkingPopoverOpen(false);
 }
 }, [isSearching]);

 return (
 <div className="glass-card glass-card--hero">
 <div className="space-y-4">
 <h3 className="text-sm font-medium text-slate-900 mb-1">Search Configuration</h3>

 <div className="grid grid-cols-2 gap-4">
 {/* Row 1: Search In - Spans full width */}
 <div className="flex flex-row items-center gap-1 col-span-2">
 <label className="text-xs font-medium text-slate-900 w-20 shrink-0">Search In:</label>
 <div className="relative flex h-12 rounded-lg p-2 flex-1 gap-2.5">
 {availableDocumentTypes.map((type) => {
 const isSelected = documentTypes.includes(type.value);
 const Icon = type.icon;
 const displayLabel = type.label === 'Tax Interpretation' ? 'Tax Interpretations' : type.label;

 return (
 <button
 key={type.value}
 type="button"
 onClick={() => !isSearching && onDocumentTypeToggle(type.value)}
 disabled={isSearching}
 className={cn(
"neo-chip flex-1",
 isSelected &&"neo-chip--active",
 isSearching &&"opacity-50 cursor-not-allowed"
 )}
 >
 <Icon className="h-5 w-5 shrink-0"/>
 <span className="whitespace-nowrap text-sm font-medium">{displayLabel}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Row 2, Col 1: Mode */}
 <div className="flex flex-row items-center gap-1">
 <label className="text-xs font-medium text-slate-900 w-20 shrink-0">Mode:</label>
 <Popover open={searchType === 'rabbit' ? isFastPopoverOpen : searchType === 'thinking' ? isThinkingPopoverOpen : false} onOpenChange={(open) => {
 if (searchType === 'rabbit') setIsFastPopoverOpen(open);
 if (searchType === 'thinking') setIsThinkingPopoverOpen(open);
 }}>
 <PopoverTrigger asChild>
 <div className="flex-1">
 {/* iOS-style segmented control */}
 <div className="relative flex h-12 rounded-lg p-2 w-full gap-2.5">
 {/* Fast option */}
 <Tooltip>
 <TooltipTrigger asChild>
 <button
 type="button"
 onClick={() => !isSearching && onSearchTypeChange('rabbit')}
 disabled={isSearching}
 className={cn(
"neo-chip flex-1",
 searchType === 'rabbit' &&"neo-chip--active",
 isSearching &&"opacity-50 cursor-not-allowed"
 )}
 aria-label="Fast mode - Keyword-based search"
 >
 <Rabbit className="h-5 w-5 shrink-0"/>
 <span className="text-sm font-medium leading-none whitespace-nowrap">Fast</span>
 </button>
 </TooltipTrigger>
 <TooltipContent side="top"className="max-w-xs">
 <p className="text-xs">Keyword-based search</p>
 </TooltipContent>
 </Tooltip>
 {/* Thinking option */}
 <Tooltip>
 <TooltipTrigger asChild>
 <button
 type="button"
 onClick={() => !isSearching && onSearchTypeChange('thinking')}
 disabled={isSearching}
 className={cn(
"neo-chip flex-1",
 searchType === 'thinking' &&"neo-chip--active",
 isSearching &&"opacity-50 cursor-not-allowed"
 )}
 aria-label="Deep mode - Semantic search with smarter ranking"
 >
 <Brain className="h-5 w-5 shrink-0"/>
 <span className="text-sm font-medium leading-none whitespace-nowrap">Deep</span>
 </button>
 </TooltipTrigger>
 <TooltipContent side="top"className="max-w-xs">
 <p className="text-xs">Semantic search with smarter ranking / summaries</p>
 </TooltipContent>
 </Tooltip>
 </div>
 </div>
 </PopoverTrigger>
 <PopoverContent className="w-80 p-4"align="start"side="bottom"sideOffset={8}>
 <div className="space-y-3">
 {searchType === 'rabbit' ? (
 <>
 <div className="flex items-center gap-2">
 <div className="p-2 rounded-lg bg-primary/10">
 <Rabbit className="h-4 w-4 text-primary"/>
 </div>
 <h4 className="text-sm font-semibold text-foreground">Fast Search</h4>
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">
 Fast mode provides quick results based on your exact query. Results may be obtained faster but can be less accurate as the quality depends on how well you phrase your search terms.
 </p>
 </>
 ) : searchType === 'thinking' ? (
 <>
 <div className="flex items-center gap-2">
 <div className="p-2 rounded-lg bg-primary/10">
 <Brain className="h-4 w-4 text-primary"/>
 </div>
 <h4 className="text-sm font-semibold text-foreground">AI-Powered Search</h4>
 <AIBadge size="sm"/>
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed">
 Thinking mode automatically refines and expands your query using advanced reasoning to find the most relevant documents. Your natural language description is optimized for better results.
 </p>
 </>
 ) : null}
 </div>
 </PopoverContent>
 </Popover>
 </div>

 {/* Row 2, Col 2: Language */}
 <div className="flex flex-row items-center gap-1">
 <label className="text-xs font-medium text-slate-900 w-20 shrink-0">Language:</label>
 <div className="relative flex h-12 rounded-lg p-2 flex-1 gap-2.5">
 {availableLanguages.map((lang) => {
 const hasOnlyTaxInterpretation =
 documentTypes.length === 1 && documentTypes.includes(DocumentType.TAX_INTERPRETATION);
 const isEnglish = lang.code === 'en' || lang.code === 'uk';
 const isTaxInterpretationDisabled = hasOnlyTaxInterpretation && isEnglish;
 const isSelected = selectedLanguages.has(lang.code);
 const isDisabled = isTaxInterpretationDisabled;

 return (
 <button
 key={lang.code}
 type="button"
 onClick={() => {
 if (!isDisabled && !isSearching) {
 onLanguageToggle(lang.code);
 }
 }}
 disabled={isSearching || isDisabled}
 className={cn(
"neo-chip flex-1",
 isSelected &&"neo-chip--active",
 (isSearching || isDisabled) &&"opacity-50 cursor-not-allowed"
 )}
 >
 <span className="text-lg shrink-0">{lang.flag}</span>
 <span className="text-sm font-medium whitespace-nowrap">{lang.name}</span>
 </button>
 );
 })}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
