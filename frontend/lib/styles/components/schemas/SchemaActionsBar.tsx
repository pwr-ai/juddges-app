"use client";

import React, { useRef, useEffect } from 'react';
import { Search, X, Plus, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { VariantButton } from '@/lib/styles/components';
import { cn } from '@/lib/utils';

export interface SchemaActionsBarProps {
 searchValue: string;
 onSearchChange: (value: string) => void;
 onAddSchema?: () => void;
 showFilters?: boolean;
 onToggleFilters?: () => void;
}

export function SchemaActionsBar({
 searchValue,
 onSearchChange,
 onAddSchema,
 showFilters = false,
 onToggleFilters,
}: SchemaActionsBarProps): React.JSX.Element {
 const searchInputRef = useRef<HTMLInputElement>(null);

 // Auto-focus search input when user starts typing anywhere on the page
 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent): void => {
 const target = e.target as HTMLElement;

 // Don't trigger if user is typing in an input, textarea, or contenteditable
 if (
 target.tagName === 'INPUT' ||
 target.tagName === 'TEXTAREA' ||
 target.isContentEditable
 ) {
 // If already in search input, handle Escape to clear
 if (target === searchInputRef.current && e.key === 'Escape') {
 e.preventDefault();
 onSearchChange('');
 searchInputRef.current?.blur();
 }
 return;
 }

 // Focus search input when user types a printable character
 if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
 searchInputRef.current?.focus();
 // Set the input value if empty
 if (!searchValue && searchInputRef.current) {
 onSearchChange(e.key);
 }
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [searchValue, onSearchChange]);

 return (
 <div className="mb-3 relative">
 <div className="flex items-center gap-3">
 {/* Search input */}
 <div className="flex-1 min-w-[200px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10"/>
 <Input
 ref={searchInputRef}
 type="text"
 placeholder="Search by title..."
 value={searchValue}
 onChange={(e) => onSearchChange(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Escape') {
 e.preventDefault();
 onSearchChange('');
 searchInputRef.current?.blur();
 }
 }}
 className={cn(
 "pl-10 pr-10 !h-10 !rounded-none transition-colors",
 "!bg-parchment",
 "!border !border-rule",
 "focus:!ring-1 focus:!ring-ink focus:!border-rule-strong",
 "placeholder:!text-muted-foreground",
 "hover:!bg-parchment-deep"
 )}
 />
 {searchValue && (
 <button
 type="button"
 onClick={() => {
 onSearchChange('');
 searchInputRef.current?.focus();
 }}
 className={cn(
 "absolute right-3 top-1/2 transform -translate-y-1/2 z-20",
 "h-6 w-6 flex items-center justify-center rounded-none",
 "text-muted-foreground",
 "bg-parchment-deep",
 "hover:text-ink",
 "transition-colors",
 "focus:outline-none focus:ring-1 focus:ring-ink"
 )}
 aria-label="Clear search"
 >
 <X className="h-4 w-4"/>
 </button>
 )}
 </div>
 </div>

 {/* Show Filters button */}
 {onToggleFilters && (
 <div className="relative">
 <VariantButton intent="secondary"
 size="sm"
 icon={Filter}
 onClick={onToggleFilters}
 >
 {showFilters ? 'Hide Filters' : 'Show Filters'}
 </VariantButton>
 </div>
 )}

 {/* Add Schema button */}
 {onAddSchema && (
 <VariantButton intent="secondary"
 size="sm"
 icon={Plus}
 onClick={onAddSchema}
 >
 Add Schema
 </VariantButton>
 )}
 </div>
 </div>
 );
}
