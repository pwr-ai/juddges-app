/**
 * Pagination Component
 * Reusable pagination component with page navigation, page size selector, and jump-to functionality
 * Styled according to the unified styling guide with semantic tokens and consistent gradients
 */

"use client";

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PageSizeToggle } from './page-size-toggle';
import { IconButton } from './icon-button';
import { SecondaryButton } from './secondary-button';
import { SearchableDropdownButton } from './searchable-dropdown-button';

/**
 * Props for Pagination component
 */
export interface PaginationProps {
 /** Current active page (1-indexed) */
 currentPage: number;
 /** Total number of pages */
 totalPages: number;
 /** Total number of results */
 totalResults: number;
 /** Current page size */
 pageSize: number;
 /** Callback when page changes */
 onPageChange: (page: number) => void;
 /** Callback when page size changes */
 onPageSizeChange: (size: number) => void;
 /** Optional className for additional styling */
 className?: string;
 /** Show/hide page size selector */
 showPageSizeSelector?: boolean;
 /** Show/hide jump to page input */
 showJumpToPage?: boolean;
 /** Available page size options */
 pageSizeOptions?: number[];
 /** Use custom dropdown instead of input field for jump-to */
 useCustomDropdown?: boolean;
 /** Custom dropdown options (for schema selector, etc.) */
 customDropdownOptions?: Array<{ value: string; label: string; description?: string; badge?: string }>;
 /** Custom dropdown label (defaults to"Page X") */
 customDropdownLabel?: string;
 /** Custom dropdown placeholder */
 customDropdownPlaceholder?: string;
 /** Width of the dropdown container when using custom dropdown (default: auto) */
 customDropdownWidth?: string;
 /** Position of navigation controls: 'left' | 'center' | 'right' (default: 'center') */
 navigationPosition?: 'left' | 'center' | 'right';
}

/**
 * Pagination Component
 *
 * A reusable pagination component with comprehensive navigation controls.
 * Features include:
 * - First/Last page navigation
 * - Previous/Next page navigation
 * - Page number buttons with smart ellipsis
 * - Jump to page input
 * - Page size selector
 * - Results count display
 *
 * Styled with:
 * - Semantic color tokens
 * - Consistent gradient overlays
 * - Hover effects matching BaseCard
 * - Backdrop blur for modern glass effect
 *
 * @example
 * ```tsx
 * <Pagination
 * currentPage={1}
 * totalPages={10}
 * totalResults={100}
 * pageSize={10}
 * onPageChange={(page) => setPage(page)}
 * onPageSizeChange={(size) => setPageSize(size)}
 * />
 * ```
 */
export function Pagination({
 currentPage,
 totalPages,
 totalResults,
 pageSize,
 onPageChange,
 onPageSizeChange,
 className ="",
 showPageSizeSelector = true,
 showJumpToPage = true,
 pageSizeOptions = [10, 20, 50, 100],
 useCustomDropdown = false,
 customDropdownOptions,
 customDropdownLabel,
 customDropdownPlaceholder ="Search pages...",
 customDropdownWidth,
 navigationPosition = 'center',
}: PaginationProps): React.JSX.Element | null {
 const [jumpToPage, setJumpToPage] = React.useState("");

 // Calculate range indices for potential"Showing X-Y of Z"display
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const startIndex = totalResults > 0 ? (currentPage - 1) * pageSize + 1 : 0;
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const endIndex = Math.min(currentPage * pageSize, totalResults);

 // Generate page options for the dropdown (use custom options if provided)
 const pageOptions = React.useMemo(() => {
 if (customDropdownOptions) {
 return customDropdownOptions;
 }
 return Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => ({
 value: String(pageNum),
 label: `Page ${pageNum}`,
 description: `Go to page ${pageNum} of ${totalPages}`,
 }));
 }, [totalPages, customDropdownOptions]);

 // Determine the dropdown label
 const dropdownLabel = customDropdownLabel || `Page ${currentPage}`;

 const handleJumpToPage = (e: React.FormEvent): void => {
 e.preventDefault();
 const page = parseInt(jumpToPage);
 if (!isNaN(page) && page >= 1 && page <= totalPages) {
 onPageChange(page);
 setJumpToPage("");
 }
 };

 // Generate page numbers to display with smart ellipsis
 const getPageNumbers = (): (number | string)[] => {
 const pages: (number | string)[] = [];
 const maxPagesToShow = 7;
 const halfRange = Math.floor(maxPagesToShow / 2);

 if (totalPages <= maxPagesToShow) {
 // Show all pages if total is less than max
 for (let i = 1; i <= totalPages; i++) {
 pages.push(i);
 }
 } else {
 // Show first page
 pages.push(1);

 if (currentPage <= halfRange + 1) {
 // Near the beginning
 for (let i = 2; i <= Math.min(maxPagesToShow - 1, totalPages - 1); i++) {
 pages.push(i);
 }
 if (totalPages > maxPagesToShow) {
 pages.push("...");
 }
 } else if (currentPage >= totalPages - halfRange) {
 // Near the end
 pages.push("...");
 for (let i = totalPages - maxPagesToShow + 2; i < totalPages; i++) {
 pages.push(i);
 }
 } else {
 // In the middle
 pages.push("...");
 for (let i = currentPage - halfRange + 1; i <= currentPage + halfRange - 1; i++) {
 pages.push(i);
 }
 pages.push("...");
 }

 // Show last page
 if (totalPages > 1) {
 pages.push(totalPages);
 }
 }

 return pages;
 };

 if (totalPages === 0 || totalResults === 0) return null;

 return (
 <div
 className={cn(
"flex items-center justify-between w-full px-6 py-4",
 // Legal Glassmorphism 2.0 - Heavy Glass Card
"bg-[rgba(255,255,255,0.9)]",
"backdrop-blur-[32px] backdrop-saturate-[200%]",
"border-[1px] border-solid border-[#FFFFFF]",
"shadow-[0_8px_30px_rgba(148,163,184,0.15)]",
"rounded-[24px]",
 className
 )}
 >
 {/* Left: Jump to Page / Schema Selector */}
 {showJumpToPage && (
 <div className={cn(
"flex items-center justify-start min-w-0",
 useCustomDropdown && customDropdownWidth ? customDropdownWidth : ""
 )}>
 {useCustomDropdown ? (
 <SearchableDropdownButton
 icon={<FileText size={16} />}
 label={dropdownLabel}
 value={customDropdownOptions
 ? pageOptions.find(opt => {
 // Find the option that corresponds to the current page
 const optPage = parseInt(opt.value);
 return optPage === currentPage;
 })?.value || pageOptions[0]?.value || ""
 : String(currentPage)}
 options={pageOptions}
 onChange={(value) => {
 // For both custom and default options, the value should be the page number
 const page = parseInt(value);
 if (!isNaN(page) && page >= 1 && page <= totalPages) {
 onPageChange(page);
 }
 }}
 searchPlaceholder={customDropdownPlaceholder}
 align="start"
 className="w-full"
 />
 ) : (
 <form onSubmit={handleJumpToPage} className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground whitespace-nowrap">
 Go to:
 </span>
 <Input
 type="number"
 value={jumpToPage}
 onChange={(e) => setJumpToPage(e.target.value)}
 placeholder={`1-${totalPages}`}
 min={1}
 max={totalPages}
 className={cn(
"h-9 w-16 rounded-lg text-sm text-center",
 // Glass morphism effects
"bg-white/50",
"backdrop-blur-sm backdrop-saturate-150",
"border border-slate-200/50",
 // Enhanced hover - more visible per styling guide
"hover:border-primary/50",
"hover:bg-white/60",
"hover:shadow-md hover:shadow-primary/20",
 // Enhanced focus - more visible
"focus-visible:outline-none",
"focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
"focus-visible:border-primary",
"focus-visible:shadow-lg focus-visible:shadow-primary/40",
 // Enhanced active - more visible
"active:border-primary/70",
"transition-all duration-200"
 )}
 />
 </form>
 )}
 </div>
 )}
 {!showJumpToPage && <div className="flex items-center justify-start min-w-0"/>}

 {/* Navigation Controls */}
 <div className={cn(
"flex items-center gap-1 flex-1 px-8",
 navigationPosition === 'left' &&"justify-start",
 navigationPosition === 'center' &&"justify-center",
 navigationPosition === 'right' &&"justify-end"
 )}>
 {/* First Page Button */}
 <IconButton
 icon={ChevronsLeft}
 onClick={() => onPageChange(1)}
 disabled={currentPage === 1}
 aria-label="First page"
 size="sm"
 variant="default"
 hoverStyle="background"
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 w-9"
 />

 {/* Previous Page Button */}
 <IconButton
 icon={ChevronLeft}
 onClick={() => onPageChange(currentPage - 1)}
 disabled={currentPage === 1}
 aria-label="Previous page"
 size="sm"
 variant="default"
 hoverStyle="background"
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 w-9"
 />

 {/* Page Number Buttons */}
 <div className="flex items-center gap-1 mx-2">
 {getPageNumbers().map((page, idx) => {
 if (page === "...") {
 return (
 <span
 key={`ellipsis-${idx}`}
 className="px-2 text-muted-foreground"
 >
 ...
 </span>
 );
 }

 const isActive = currentPage === page;

 if (isActive) {
 return (
 <SecondaryButton
 key={page}
 size="sm"
 onClick={() => onPageChange(page as number)}
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 min-w-[36px] px-3 bg-white border-primary/50 text-foreground font-semibold"
 >
 {page}
 </SecondaryButton>
 );
 }

 return (
 <SecondaryButton
 key={page}
 size="sm"
 onClick={() => onPageChange(page as number)}
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 min-w-[36px] px-3"
 >
 {page}
 </SecondaryButton>
 );
 })}
 </div>

 {/* Next Page Button */}
 <IconButton
 icon={ChevronRight}
 onClick={() => onPageChange(currentPage + 1)}
 disabled={currentPage === totalPages}
 aria-label="Next page"
 size="sm"
 variant="default"
 hoverStyle="background"
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 w-9"
 />

 {/* Last Page Button */}
 <IconButton
 icon={ChevronsRight}
 onClick={() => onPageChange(totalPages)}
 disabled={currentPage === totalPages}
 aria-label="Last page"
 size="sm"
 variant="default"
 hoverStyle="background"
 enhancedHover={true}
 enhancedFocus={true}
 enhancedActive={true}
 className="h-9 w-9"
 />
 </div>

 {/* Right: Page Size Selector */}
 <div className="flex items-center justify-end min-w-0 gap-3">
 {showPageSizeSelector && (
 <>
 <span className="text-sm text-muted-foreground whitespace-nowrap">
 Results per page:
 </span>
 <PageSizeToggle
 options={pageSizeOptions}
 value={pageSize}
 onChange={onPageSizeChange}
 />
 </>
 )}
 </div>
 </div>
 );
}
