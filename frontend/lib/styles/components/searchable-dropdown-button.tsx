/**
 * Searchable Dropdown Button Component
 * Reusable searchable dropdown button with search input
 * Used for large lists like schemas, collections, etc.
 */

'use client';

import * as React from 'react';
import { ChevronDown, Search, X, FileText, Check, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from './schema-status-badge';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SearchableDropdownButtonOption {
 value: string;
 label: string;
 description?: string;
 badge?: string;
 status?: string;
 isVerified?: boolean;
}

export interface SearchableDropdownButtonProps {
 icon: React.ReactNode;
 label: string;
 value?: string;
 options: SearchableDropdownButtonOption[];
 onChange?: (value: string) => void;
 disabled?: boolean;
 className?: string;
 align?: 'start' | 'end' | 'center';
 searchPlaceholder?: string;
 maxHeight?: string;
}

/**
 * Searchable Dropdown Button
 * A searchable dropdown button with search input for filtering options
 *
 * @example
 * <SearchableDropdownButton
 * icon={<FileCode size={16} />}
 * label="Select a schema"
 * value={selectedSchema}
 * options={schemas.map(s => ({ value: s.id, label: s.name, description: s.description }))}
 * onChange={(value) => setSelectedSchema(value)}
 * searchPlaceholder="Search schemas..."
 * />
 */
export function SearchableDropdownButton({
 icon,
 label,
 value,
 options,
 onChange,
 disabled = false,
 className,
 align = 'start',
 searchPlaceholder ="Search...",
 maxHeight ="max-h-[300px]",
}: SearchableDropdownButtonProps): React.JSX.Element {
 const [isOpen, setIsOpen] = React.useState(false);
 const [searchQuery, setSearchQuery] = React.useState('');
 const searchInputRef = React.useRef<HTMLInputElement>(null);
 const [focusedIndex, setFocusedIndex] = React.useState<number>(-1);
 const optionRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map());

 // Filter options based on search query
 const filteredOptions = React.useMemo(() => {
 if (!searchQuery.trim()) return options;

 const query = searchQuery.toLowerCase();
 return options.filter(option =>
 option.label.toLowerCase().includes(query) ||
 option.description?.toLowerCase().includes(query) ||
 option.value.toLowerCase().includes(query)
 );
 }, [options, searchQuery]);

 const selectedOption = options.find((opt) => opt.value === value);
 const displayLabel = selectedOption?.label || label;

 // Reset search and focus when dropdown closes
 React.useEffect(() => {
 if (!isOpen) {
 setSearchQuery('');
 setFocusedIndex(-1);
 } else {
 // Focus search input when dropdown opens
 setTimeout(() => {
 searchInputRef.current?.focus();
 }, 100);

 // Scroll selected item into view when dropdown opens
 if (value) {
 const selectedIndex = filteredOptions.findIndex(opt => opt.value === value);
 if (selectedIndex >= 0) {
 setTimeout(() => {
 const selectedElement = optionRefs.current.get(selectedIndex);
 if (selectedElement) {
 selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 }
 }, 150);
 }
 }
 }
 }, [isOpen, value, filteredOptions]);

 // Scroll focused item into view
 React.useEffect(() => {
 if (focusedIndex >= 0) {
 const optionElement = optionRefs.current.get(focusedIndex);
 if (optionElement) {
 optionElement.scrollIntoView({
 behavior: 'smooth',
 block: 'nearest',
 });
 }
 }
 }, [focusedIndex]);

 // Handle keyboard navigation
 const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
 // Only handle navigation keys, let all other keys (including letters) pass through
 if (e.key === 'ArrowDown') {
 e.preventDefault();
 e.stopPropagation();
 if (filteredOptions.length > 0) {
 setFocusedIndex(prev =>
 prev < filteredOptions.length - 1 ? prev + 1 : 0
 );
 // Focus the first item if starting from search
 if (focusedIndex === -1) {
 setFocusedIndex(0);
 }
 }
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 e.stopPropagation();
 if (filteredOptions.length > 0) {
 setFocusedIndex(prev =>
 prev > 0 ? prev - 1 : filteredOptions.length - 1
 );
 }
 } else if (e.key === 'Enter') {
 e.preventDefault();
 e.stopPropagation();
 if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
 const option = filteredOptions[focusedIndex];
 onChange?.(option.value);
 setIsOpen(false);
 }
 } else if (e.key === 'Escape') {
 e.preventDefault();
 e.stopPropagation();
 setSearchQuery('');
 setIsOpen(false);
 }
 // For all other keys (including letters like 'w'), don't prevent default
 // This allows normal text input to work
 };

 // Handle option selection with keyboard
 const handleOptionKeyDown = (
 e: React.KeyboardEvent<HTMLButtonElement>,
 option: SearchableDropdownButtonOption,
 index: number
 ): void => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onChange?.(option.value);
 setIsOpen(false);
 } else if (e.key === 'ArrowDown') {
 e.preventDefault();
 setFocusedIndex(index < filteredOptions.length - 1 ? index + 1 : 0);
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 setFocusedIndex(index > 0 ? index - 1 : filteredOptions.length - 1);
 } else if (e.key === 'Escape') {
 e.preventDefault();
 setSearchQuery('');
 setIsOpen(false);
 searchInputRef.current?.focus();
 }
 };

 return (
 <DropdownMenu
 open={isOpen}
 onOpenChange={setIsOpen}
 modal={false}
 >
 <DropdownMenuTrigger asChild disabled={disabled}>
 <Button
 variant="ghost"
 size="sm"
 className={cn(
 'group relative h-11 text-xs sm:text-sm font-medium gap-1.5 px-3 sm:px-4 rounded-lg w-full justify-start',
 'bg-white',
 'shadow-sm text-muted-foreground',
 'hover:text-foreground',
 'transition-all duration-300',
 'hover:shadow-md',
 'border border-border/50 hover:border-primary/30',
 // Active state for tactile feedback
 'active:opacity-90',
 // Focus state for accessibility
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
 // Responsive text sizing
 'text-left',
 // NO background change on hover
 'hover:bg-white',
 // Highlight when value is selected
 value && [
 'border-2 border-[rgba(37,99,235,0.3)]',
 'bg-[rgba(37,99,235,0.05)]',
 'shadow-sm shadow-blue-500/10'
 ],
 className
 )}
 >
 {/* Content */}
 <span className="relative flex items-center gap-1.5 flex-1 min-w-0">
 <span className={cn(
"group-hover:scale-110 transition-transform duration-300 shrink-0",
 value &&"text-[#1E40AF]"
 )}>
 {icon}
 </span>
 <span className={cn(
"truncate flex-1 text-left text-xs sm:text-sm",
 value &&"text-[#1E40AF] font-semibold"
 )}>{displayLabel}</span>
 <ChevronDown
 size={12}
 className={cn(
 'opacity-80 group-hover:opacity-100 transition-all duration-300 shrink-0',
 isOpen && '-rotate-180',
 value && 'text-[#1E40AF]'
 )}
 />
 </span>
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent
 align={align}
 onKeyDown={(e) => {
 // If the search input is focused, don't let DropdownMenu handle keyboard events
 // This prevents navigation when typing
 if (document.activeElement === searchInputRef.current) {
 // Only allow Escape to be handled by DropdownMenu
 if (e.key !== 'Escape') {
 e.preventDefault();
 e.stopPropagation();
 }
 }
 }}
 onEscapeKeyDown={(e) => {
 // Only close on Escape if search input is not focused or is empty
 if (document.activeElement !== searchInputRef.current || !searchQuery) {
 setIsOpen(false);
 } else {
 // If search has text, just clear it instead of closing
 e.preventDefault();
 setSearchQuery('');
 searchInputRef.current?.focus();
 }
 }}
 onInteractOutside={(e) => {
 // Don't close if clicking on the search input
 if (e.target === searchInputRef.current || searchInputRef.current?.contains(e.target as Node)) {
 e.preventDefault();
 }
 }}
 className={cn(
"w-[calc(100vw-2rem)] sm:w-[var(--radix-dropdown-menu-trigger-width)] sm:min-w-[20rem] rounded-3xl",
 // Glass Pane - High Opacity Porcelain with 24px blur
"bg-[rgba(255,255,255,0.90)] backdrop-blur-[24px]",
 // Border and Shadow
"border border-white",
"shadow-[0_20px_60px_-10px_rgba(0,0,0,0.2)]",
 // Padding - More compact
"p-4",
"max-h-[80vh] overflow-hidden flex flex-col"
 )}
 >
 {/* Search Input - Inset Console */}
 <div className="relative mb-3">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none"/>
 <input
 ref={searchInputRef}
 type="text"
 placeholder={searchPlaceholder}
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value);
 setFocusedIndex(-1); // Reset focus when searching
 }}
 onKeyDown={(e) => {
 // For navigation keys, handle them and stop propagation
 if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
 e.stopPropagation();
 handleKeyDown(e);
 } else {
 // For all other keys (typing), stop propagation but don't prevent default
 // This allows normal text input while preventing DropdownMenu from handling it
 e.stopPropagation();
 // Don't call preventDefault() - let the input handle it naturally
 }
 }}
 onKeyDownCapture={(e) => {
 // Stop all key events from reaching DropdownMenu at capture phase
 // This is critical to prevent Radix UI from intercepting typing
 if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
 e.stopPropagation();
 }
 }}
 onKeyUp={(e) => {
 // Stop keyup events for non-navigation keys
 if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
 e.stopPropagation();
 }
 }}
 onKeyUpCapture={(e) => {
 // Stop keyup capture for non-navigation keys
 if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
 e.stopPropagation();
 }
 }}
 onCompositionStart={(e) => {
 // Prevent composition events from bubbling
 e.stopPropagation();
 }}
 onCompositionUpdate={(e) => {
 e.stopPropagation();
 }}
 onCompositionEnd={(e) => {
 e.stopPropagation();
 }}
 onClick={(e) => {
 // Prevent clicks from closing the dropdown
 e.stopPropagation();
 }}
 className={cn(
"w-full h-10 pl-10 pr-4 rounded-[10px]",
"bg-[rgba(0,0,0,0.04)]",
"border border-[rgba(0,0,0,0.05)]",
"text-sm text-[#475569]",
"transition-all duration-200",
"focus:outline-none focus:border-[#3B82F6] focus:bg-white",
"placeholder:text-[#94A3B8]"
 )}
 autoFocus
 role="combobox"
 aria-expanded={isOpen}
 aria-autocomplete="list"
 aria-controls="searchable-dropdown-options"
 />
 {searchQuery && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 setSearchQuery('');
 }}
 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded hover:bg-[rgba(0,0,0,0.05)] transition-colors"
 aria-label="Clear search"
 >
 <X className="h-3.5 w-3.5 text-[#94A3B8]"/>
 </button>
 )}
 </div>

 {/* Options List - Interactive Rows */}
 <div
 id="searchable-dropdown-options"
 className={cn(
"overflow-y-auto overflow-x-hidden",
 maxHeight,
"space-y-1"
 )}
 role="listbox"
 >
 {filteredOptions.length === 0 ? (
 <div className="px-4 py-6 text-center text-sm text-[#64748B]"role="status">
 No results found
 </div>
 ) : (
 filteredOptions.map((option, index) => {
 const isSelected = value === option.value;
 const isFocused = focusedIndex === index;
 return (
 <button
 key={option.value}
 ref={(el) => {
 if (el) {
 optionRefs.current.set(index, el);
 } else {
 optionRefs.current.delete(index);
 }
 }}
 onClick={() => {
 onChange?.(option.value);
 setIsOpen(false);
 }}
 onKeyDown={(e) => handleOptionKeyDown(e, option, index)}
 onMouseEnter={() => setFocusedIndex(index)}
 role="option"
 aria-selected={isSelected}
 tabIndex={isFocused ? 0 : -1}
 className={cn(
"w-full h-11 px-4 rounded-lg flex items-center justify-between",
"transition-all duration-200",
 // Idle state - no hover background change
 !isSelected &&"text-[#475569] hover:bg-slate-50",
 // Selected state - More prominent highlighting
 isSelected && [
"bg-[rgba(37,99,235,0.15)]",
"border-2 border-[rgba(37,99,235,0.4)]",
"text-[#1E40AF]",
"font-semibold",
"shadow-sm shadow-blue-500/20"
 ]
 )}
 >
 <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
 {icon && (
 <span className="shrink-0 text-[#94A3B8] [&>svg]:h-4 [&>svg]:w-4">
 {icon}
 </span>
 )}
 <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left">
 <span className="text-sm font-medium truncate text-left">{option.label}</span>
 {option.description && (
 <span className="text-xs text-[#64748B] line-clamp-1 text-left">
 {option.description}
 </span>
 )}
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 {option.badge && (
 <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
 <File className="h-3 w-3"/>
 <span>{option.badge}</span>
 </div>
 )}
 {option.isVerified && <VerifiedBadge size="sm"/>}
 {isSelected && (
 <Check className="h-5 w-5 text-[#1E40AF] font-bold"strokeWidth={3} />
 )}
 </div>
 </button>
 );
 })
 )}
 </div>
 </DropdownMenuContent>
 </DropdownMenu>
 );
}
