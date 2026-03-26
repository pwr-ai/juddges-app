/**
 * Search Filters Component
 * Filter sidebar for search results with keywords, document types, dates, etc.
 * Used in search page to filter search results
 */

"use client";

import React from "react";
import { Badge, Button, Calendar, AdvancedFilterPanel } from "@/lib/styles/components";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, CalendarIcon, Filter, Scale, Calculator } from "lucide-react";
import { format } from "date-fns";
import { cn, formatSnakeCaseToHumanReadable } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { getActiveButtonStyle } from "@/lib/styles/components/buttons";
import { AccentButton } from "@/lib/styles/components";
import { DocumentType } from "@/types/search";


interface FiltersState {
 keywords: Set<string>;
 legalConcepts: Set<string>;
 documentTypes: Set<string>;
 issuingBodies: Set<string>;
 languages: Set<string>;
 dateFrom: Date | undefined;
 dateTo: Date | undefined;
 jurisdictions: Set<string>;
 courtLevels: Set<string>;
 legalDomains: Set<string>;
 customMetadata: Record<string, string[]>;
}

interface AvailableFilters {
 keywords: string[];
 legalConcepts: string[];
 documentTypes: string[];
 issuingBodies: string[];
 languages: string[];
 jurisdictions: string[];
 courtLevels: string[];
 legalDomains: string[];
 customMetadataKeys: string[];
}

export interface SearchFiltersProps {
 filters: FiltersState;
 availableFilters: AvailableFilters;
 onFilterToggle: (filterType: keyof FiltersState, value: string) => void;
 onDateChange: (type: 'dateFrom' | 'dateTo', value?: Date) => void;
 onResetFilters: () => void;
 activeFilterCount: number;
 searchResults?: { documents: Array<{
 keywords?: string[] | null;
 document_type?: string | null;
 language?: string | null;
 jurisdiction?: string | null;
 court_level?: string | null;
 legal_domain?: string | null;
 custom_metadata?: Record<string, string | string[] | number | boolean | null> | null;
 }> } | null;
 /** Callbacks for custom metadata filters */
 onCustomMetadataToggle?: (key: string, value: string) => void;
 onClearCustomMetadata?: (key: string) => void;
 /** Custom metadata values available for each key */
 customMetadataValues?: Record<string, string[]>;
}



// Helper function to get icon for document type
const getDocumentTypeIcon = (type: string): React.ComponentType<{ className?: string }> | null => {
 const normalizedType = type.toLowerCase();
 if (normalizedType === 'judgment' || normalizedType === 'court_judgment') {
 return Scale;
 }
 if (normalizedType === 'tax_interpretation' || normalizedType === 'interpretation') {
 return Calculator;
 }
 // Intentionally no icon for error/undefined document type
 return null;
};

// Date range input component
const DateRangeInput = ({ label, date, onSelect, minDate, maxDate }: {
 label: string;
 date?: Date;
 onSelect: (date: Date | undefined) => void;
 minDate?: Date;
 maxDate?: Date;
}): React.JSX.Element => {
 const handleSelect = (selectedDate: Date | DateRange | undefined): void => {
 // Since mode="single", we only expect Date | undefined
 if (selectedDate instanceof Date || selectedDate === undefined) {
 onSelect(selectedDate);
 }
 };

 return (
 <div>
 <div className="text-xs font-semibold text-slate-900 mb-2">{label}</div>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 size="sm"
 className={cn(
"w-full justify-start text-left font-medium rounded-xl transition-all duration-300",
"bg-white/60 backdrop-blur-sm",
"border-slate-200/50",
"hover:bg-white/80",
"hover:scale-[1.02] hover:shadow-md",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 !date ? "text-muted-foreground": "text-foreground"
 )}
 aria-label={`${label} date picker${date ? `: ${format(date,"MMM yyyy")}` : ""}`}
 >
 <CalendarIcon className="mr-2 h-4 w-4 text-primary"aria-hidden="true"/>
 {date ? format(date,"MMM yyyy") : "Select date"}
 </Button>
 </PopoverTrigger>
 <PopoverContent
 className="w-auto p-0 rounded-xl border-slate-200/50 bg-transparent backdrop-blur-md shadow-xl"
 align="start"
 >
 <Calendar
 mode="single"
 precision="month"
 selected={date}
 onSelect={handleSelect}
 minDate={minDate}
 maxDate={maxDate}
 initialFocus
 />
 </PopoverContent>
 </Popover>
 </div>
 );
};

export function SearchFilters({
 filters,
 availableFilters,
 onFilterToggle,
 onDateChange,
 onResetFilters,
 activeFilterCount,
 searchResults,
 onCustomMetadataToggle,
 onClearCustomMetadata,
 customMetadataValues,
}: SearchFiltersProps): React.JSX.Element {
 // Calculate keyword counts and filter/sort
 const keywordCounts = searchResults?.documents
 ? availableFilters.keywords
 .map(keyword => {
 const count = searchResults.documents.filter(doc =>
 doc.keywords?.includes(keyword)
 ).length;
 return { keyword, count };
 })
 .filter(({ count }) => count > 1) // Filter out keywords with only 1 result
 .sort((a, b) => b.count - a.count) // Sort by count descending
 .map(({ keyword }) => keyword)
 : availableFilters.keywords;

 // Calculate document type counts and filter/sort
 const documentTypeCounts = searchResults?.documents
 ? availableFilters.documentTypes
 .map(type => {
 const count = searchResults.documents.filter(doc =>
 doc.document_type === type
 ).length;
 return { type, count };
 })
 .filter(({ count }) => count > 1) // Filter out document types with only 1 result
 .sort((a, b) => b.count - a.count) // Sort by count descending
 .map(({ type }) => type)
 : availableFilters.documentTypes;

 // Calculate language counts and filter/sort
 const languageCounts = searchResults?.documents
 ? availableFilters.languages
 .map(lang => {
 const count = searchResults.documents.filter(doc =>
 doc.language === lang
 ).length;
 return { lang, count };
 })
 .filter(({ count }) => count > 0) // Only show languages with at least 1 result
 .sort((a, b) => b.count - a.count) // Sort by count descending
 .map(({ lang }) => lang)
 : availableFilters.languages;
 return (
 <div className="sticky top-4">
 {/* Modern header with gradient */}
 <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/50">
 <div className="flex items-center gap-2.5">
 <div className="relative">
 <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-blue-500/20 to-cyan-500/20 rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
 <div className="relative bg-gradient-to-br from-primary/10 via-blue-500/10 to-cyan-500/10 rounded-lg p-2 border border-primary/20">
 <Filter className="h-4 w-4 text-primary"/>
 </div>
 </div>
 <h2 className="text-base font-bold text-slate-900">
 Filters
 </h2>
 {activeFilterCount > 0 && (
 <Badge className="bg-primary/10 text-primary border-primary/20 font-bold">
 {activeFilterCount}
 </Badge>
 )}
 </div>

 {activeFilterCount > 0 && (
 <AccentButton
 onClick={onResetFilters}
 icon={X}
 size="sm"
 >
 Clear all
 </AccentButton>
 )}
 </div>

 <div className="space-y-5">
 {/* Date Range Filter */}
 <div className="border rounded-2xl p-4 bg-gradient-to-br from-white/60 via-blue-50/30 to-indigo-50/20 backdrop-blur-sm border-slate-200/50 shadow-sm">
 <h3 className="text-sm font-bold mb-3 text-slate-900">
 Date
 </h3>
 <div className="space-y-3">
 <DateRangeInput
 label="From"
 date={filters.dateFrom}
 onSelect={(date) => onDateChange('dateFrom', date)}
 maxDate={filters.dateTo} // FROM cannot be after TO
 />
 <DateRangeInput
 label="To"
 date={filters.dateTo}
 onSelect={(date) => onDateChange('dateTo', date)}
 minDate={filters.dateFrom} // TO cannot be before FROM
 />
 </div>
 </div>

 {/* Language filter - Only show if there are languages with results */}
 {languageCounts.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-bold text-slate-900">
 Language
 </h3>
 <div className="flex flex-wrap gap-3">
 {languageCounts.map((lang) => (
 <button
 key={lang}
 type="button"
 className={cn(
 // Technical Chip Architecture - Sorting Mechanism
"inline-flex items-center",
"px-4 py-2", // 0.5rem 1rem padding
"rounded-lg", // 0.5rem (8px) - Squarer, not pills
"gap-2", // 0.5rem gap
 // Material
"bg-white/40", // rgba(255, 255, 255, 0.4)
"border border-white/80", // 0.0625rem solid rgba(255, 255, 255, 0.8)
 // Text
"text-slate-500", // Slate 500
"text-sm", // 0.875rem
"font-medium", // 500
"cursor-pointer",
"transition-all duration-200 ease-in-out",
 // Idle State
 filters.languages?.has(lang)
 ? cn(
 // Active (Legal Authority): Navy Text + Blue Tint
"bg-blue-500/8", // Faint Blue
"border-blue-500", // Royal Blue Edge
"text-blue-700", // Navy Text (#1E40AF)
"shadow-sm"
 )
 : cn(
 // Hover: Lift and Solidify
"hover:bg-white",
"hover:text-slate-900", // #0F172A
"hover:-translate-y-0.5", // -0.125rem lift
"hover:shadow-sm"
 )
 )}
 onClick={(e) => {
 e.stopPropagation();
 e.preventDefault();
 onFilterToggle('languages', lang);
 }}
 >
 {lang === 'pl' ? '🇵🇱' : lang === 'uk' || lang === 'en' ? '🇬🇧' : ''} {lang.toUpperCase()}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Document types filter - Only show if there are document types */}
 {documentTypeCounts.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-bold text-slate-900">
 Document Types
 </h3>
 <div className="flex flex-wrap gap-3">
 {documentTypeCounts.map((type) => {
 const Icon = getDocumentTypeIcon(type);
 const label =
 type === DocumentType.ERROR
 ? "? Undefined"
 : formatSnakeCaseToHumanReadable(type);
 return (
 <button
 key={type}
 type="button"
 className={cn(
 // Technical Chip Architecture
"inline-flex items-center",
"px-4 py-2",
"rounded-lg", // 0.5rem - Squarer
"gap-2",
"bg-white/40",
"border border-white/80",
"text-slate-500",
"text-sm",
"font-medium",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
"flex items-center gap-1.5",
 filters.documentTypes.has(type)
 ? cn(
"bg-blue-500/8",
"border-blue-500",
"text-blue-700",
"shadow-sm"
 )
 : cn(
"hover:bg-white",
"hover:text-slate-900",
"hover:-translate-y-0.5",
"hover:shadow-sm"
 )
 )}
 onClick={(e) => {
 e.stopPropagation();
 onFilterToggle('documentTypes', type);
 }}
 >
 {Icon && <Icon className="h-3 w-3"/>}
 {label}
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* Keywords filter - Only show if there are keywords */}
 {keywordCounts.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-bold text-slate-900">
 Keywords
 </h3>
 <div className="flex flex-wrap gap-3">
 {keywordCounts.map((keyword) => (
 <button
 key={keyword}
 type="button"
 className={cn(
 // Technical Chip Architecture
"inline-flex items-center",
"px-4 py-2",
"rounded-lg",
"gap-2",
"bg-white/40",
"border border-white/80",
"text-slate-500",
"text-sm",
"font-medium",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
 filters.keywords.has(keyword)
 ? cn(
"bg-blue-500/8",
"border-blue-500",
"text-blue-700",
"shadow-sm"
 )
 : cn(
"hover:bg-white",
"hover:text-slate-900",
"hover:-translate-y-0.5",
"hover:shadow-sm"
 )
 )}
 onClick={(e) => {
 e.stopPropagation();
 onFilterToggle('keywords', keyword);
 }}
 >
 {formatSnakeCaseToHumanReadable(keyword)}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Issuing bodies filter - Only show if there are issuing bodies */}
 {availableFilters.issuingBodies.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-bold text-slate-900">
 Issuing Bodies
 </h3>
 <div className="flex flex-wrap gap-3">
 {availableFilters.issuingBodies.map((body) => (
 <button
 key={body}
 type="button"
 className={cn(
 // Technical Chip Architecture
"inline-flex items-center",
"px-4 py-2",
"rounded-lg",
"gap-2",
"bg-white/40",
"border border-white/80",
"text-slate-500",
"text-sm",
"font-medium",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
 filters.issuingBodies.has(body)
 ? cn(
"bg-blue-500/8",
"border-blue-500",
"text-blue-700",
"shadow-sm"
 )
 : cn(
"hover:bg-white",
"hover:text-slate-900",
"hover:-translate-y-0.5",
"hover:shadow-sm"
 )
 )}
 onClick={(e) => {
 e.stopPropagation();
 onFilterToggle('issuingBodies', body);
 }}
 >
 {formatSnakeCaseToHumanReadable(body)}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Legal concepts filter - Only show if there are legal concepts */}
 {availableFilters.legalConcepts.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-sm font-bold text-slate-900">
 Legal Concepts
 </h3>
 <div className="flex flex-wrap gap-3">
 {availableFilters.legalConcepts.map((concept) => (
 <button
 key={concept}
 type="button"
 className={cn(
 // Technical Chip Architecture
"inline-flex items-center",
"px-4 py-2",
"rounded-lg",
"gap-2",
"bg-white/40",
"border border-white/80",
"text-slate-500",
"text-sm",
"font-medium",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
 filters.legalConcepts.has(concept)
 ? cn(
"bg-blue-500/8",
"border-blue-500",
"text-blue-700",
"shadow-sm"
 )
 : cn(
"hover:bg-white",
"hover:text-slate-900",
"hover:-translate-y-0.5",
"hover:shadow-sm"
 )
 )}
 onClick={() => onFilterToggle('legalConcepts', concept)}
 >
 {concept}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Advanced Filters (Jurisdiction, Court Level, Legal Domain, Custom Metadata) */}
 <AdvancedFilterPanel
 filters={filters}
 availableFilters={availableFilters}
 onFilterToggle={onFilterToggle}
 onCustomMetadataToggle={onCustomMetadataToggle || (() => {})}
 onClearCustomMetadata={onClearCustomMetadata || (() => {})}
 searchResults={searchResults}
 customMetadataValues={customMetadataValues}
 />
 </div>
 </div>
 );
}
