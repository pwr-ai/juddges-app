/**
 * Advanced Filter Panel Component
 * Rich filtering UI for jurisdiction, court level, legal domain, and custom metadata.
 * Includes multi-select dropdowns with search, collapsible sections, and filter persistence.
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Badge } from "@/lib/styles/components";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
 X,
 ChevronDown,
 ChevronUp,
 Search,
 MapPin,
 Building2,
 BookOpen,
 SlidersHorizontal,
 Tag,
 Check,
} from "lucide-react";
import { cn, formatSnakeCaseToHumanReadable } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ──────────────────────────────────────────────

interface FiltersState {
 keywords: Set<string>;
 legalConcepts: Set<string>;
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
 issuingBodies: string[];
 languages: string[];
 jurisdictions: string[];
 courtLevels: string[];
 legalDomains: string[];
 customMetadataKeys: string[];
}

export interface AdvancedFilterPanelProps {
 filters: FiltersState;
 availableFilters: AvailableFilters;
 onFilterToggle: (filterType: keyof FiltersState, value: string) => void;
 onCustomMetadataToggle: (key: string, value: string) => void;
 onClearCustomMetadata: (key: string) => void;
 searchResults?: {
 documents: Array<{
 jurisdiction?: string | null;
 court_level?: string | null;
 legal_domain?: string | null;
 custom_metadata?: Record<string, string | string[] | number | boolean | null> | null;
 }>;
 } | null;
 /** Custom metadata values available for each key */
 customMetadataValues?: Record<string, string[]>;
}

// ─── Multi-Select Dropdown ──────────────────────────────

interface MultiSelectDropdownProps {
 label: string;
 icon: React.ComponentType<{ className?: string }>;
 options: string[];
 selected: Set<string>;
 onToggle: (value: string) => void;
 formatLabel?: (value: string) => string;
 /** Show counts next to options */
 counts?: Record<string, number>;
}

function MultiSelectDropdown({
 label,
 icon: Icon,
 options,
 selected,
 onToggle,
 formatLabel = formatSnakeCaseToHumanReadable,
 counts,
}: MultiSelectDropdownProps): React.JSX.Element | null {
 const [isOpen, setIsOpen] = useState(false);
 const [searchQuery, setSearchQuery] = useState("");

 const filteredOptions = useMemo(() => {
 if (!searchQuery.trim()) return options;
 const query = searchQuery.toLowerCase();
 return options.filter((opt) =>
 formatLabel(opt).toLowerCase().includes(query)
 );
 }, [options, searchQuery, formatLabel]);

 const handleToggle = useCallback(
 (value: string) => {
 onToggle(value);
 },
 [onToggle]
 );

 if (options.length === 0) return null;

 return (
 <Popover open={isOpen} onOpenChange={setIsOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"
 className={cn(
"w-full flex items-center justify-between",
"px-4 py-3",
"rounded-xl",
"bg-white/60 backdrop-blur-sm",
"border border-slate-200/50",
"text-sm font-medium",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
"hover:bg-white/80",
"hover:shadow-md",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 selected.size > 0
 ? "text-blue-700 border-blue-500/30"
 : "text-slate-600"
 )}
 aria-expanded={isOpen}
 aria-haspopup="listbox"
 aria-label={`${label} filter${selected.size > 0 ? `, ${selected.size} selected` : ""}`}
 >
 <div className="flex items-center gap-2.5">
 <Icon className="h-4 w-4 text-primary flex-shrink-0"/>
 <span>{label}</span>
 {selected.size > 0 && (
 <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
 {selected.size}
 </Badge>
 )}
 </div>
 {isOpen ? (
 <ChevronUp className="h-4 w-4 text-muted-foreground"/>
 ) : (
 <ChevronDown className="h-4 w-4 text-muted-foreground"/>
 )}
 </button>
 </PopoverTrigger>
 <PopoverContent
 className="w-72 p-0 rounded-xl border-slate-200/50 bg-white/95 backdrop-blur-md shadow-xl"
 align="start"
 sideOffset={4}
 >
 {/* Search input for long lists */}
 {options.length > 5 && (
 <div className="p-3 border-b border-slate-200/50">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
 <Input
 placeholder={`Search ${label.toLowerCase()}...`}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-9 h-9 text-sm rounded-lg bg-slate-50/50 border-slate-200/50"
 />
 </div>
 </div>
 )}

 {/* Options list */}
 <ScrollArea className="max-h-64">
 <div className="p-2"role="listbox"aria-label={`${label} options`}>
 {filteredOptions.length === 0 ? (
 <div className="px-3 py-4 text-sm text-muted-foreground text-center">
 No options found
 </div>
 ) : (
 filteredOptions.map((opt) => {
 const isSelected = selected.has(opt);
 const count = counts?.[opt];
 return (
 <button
 key={opt}
 type="button"
 role="option"
 aria-selected={isSelected}
 className={cn(
"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm",
"transition-all duration-150 cursor-pointer",
 isSelected
 ? "bg-primary/8 text-primary font-medium"
 : "text-slate-700 hover:bg-slate-100/80"
 )}
 onClick={() => handleToggle(opt)}
 >
 <div
 className={cn(
"flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
 isSelected
 ? "bg-primary border-primary text-white"
 : "border-slate-300"
 )}
 >
 {isSelected && <Check className="h-3 w-3"/>}
 </div>
 <span className="flex-1 text-left truncate">
 {formatLabel(opt)}
 </span>
 {count !== undefined && (
 <span className="text-xs text-muted-foreground tabular-nums">
 ({count})
 </span>
 )}
 </button>
 );
 })
 )}
 </div>
 </ScrollArea>

 {/* Clear selection footer */}
 {selected.size > 0 && (
 <div className="p-2 border-t border-slate-200/50">
 <button
 type="button"
 className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1.5 rounded-md hover:bg-slate-50"
 onClick={() => {
 selected.forEach((val) => onToggle(val));
 }}
 >
 Clear selection
 </button>
 </div>
 )}
 </PopoverContent>
 </Popover>
 );
}

// ─── Custom Metadata Filter ─────────────────────────────

interface CustomMetadataFilterProps {
 metadataKey: string;
 values: string[];
 selectedValues: string[];
 onToggle: (key: string, value: string) => void;
 onClear: (key: string) => void;
}

function CustomMetadataFilter({
 metadataKey,
 values,
 selectedValues,
 onToggle,
 onClear,
}: CustomMetadataFilterProps): React.JSX.Element {
 const [isExpanded, setIsExpanded] = useState(selectedValues.length > 0);

 return (
 <div className="space-y-2">
 <button
 type="button"
 className="flex items-center justify-between w-full text-left"
 onClick={() => setIsExpanded(!isExpanded)}
 >
 <div className="flex items-center gap-2">
 <Tag className="h-3.5 w-3.5 text-muted-foreground"/>
 <span className="text-xs font-semibold text-slate-900">
 {formatSnakeCaseToHumanReadable(metadataKey)}
 </span>
 {selectedValues.length > 0 && (
 <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
 {selectedValues.length}
 </Badge>
 )}
 </div>
 {isExpanded ? (
 <ChevronUp className="h-3.5 w-3.5 text-muted-foreground"/>
 ) : (
 <ChevronDown className="h-3.5 w-3.5 text-muted-foreground"/>
 )}
 </button>

 {isExpanded && (
 <div className="flex flex-wrap gap-2 pl-5">
 {values.map((value) => {
 const isSelected = selectedValues.includes(value);
 return (
 <button
 key={value}
 type="button"
 className={cn(
"inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium",
"cursor-pointer transition-all duration-200 ease-in-out",
"bg-white/40",
"border border-white/80",
 isSelected
 ? cn(
"bg-blue-500/8",
"border-blue-500",
"text-blue-700",
"shadow-sm"
 )
 : cn(
"text-slate-500",
"hover:bg-white",
"hover:text-slate-900",
"hover:-translate-y-0.5 hover:shadow-sm"
 )
 )}
 onClick={() => onToggle(metadataKey, value)}
 >
 {formatSnakeCaseToHumanReadable(value)}
 {isSelected && <X className="h-3 w-3 ml-1.5"/>}
 </button>
 );
 })}
 {selectedValues.length > 0 && (
 <button
 type="button"
 className="text-xs text-muted-foreground hover:text-destructive transition-colors"
 onClick={() => onClear(metadataKey)}
 >
 Clear
 </button>
 )}
 </div>
 )}
 </div>
 );
}

// ─── Main Component ─────────────────────────────────────

export function AdvancedFilterPanel({
 filters,
 availableFilters,
 onFilterToggle,
 onCustomMetadataToggle,
 onClearCustomMetadata,
 searchResults,
 customMetadataValues = {},
}: AdvancedFilterPanelProps): React.JSX.Element | null {
 const [isExpanded, setIsExpanded] = useState(false);

 // Count active advanced filters
 const advancedFilterCount =
 filters.jurisdictions.size +
 filters.courtLevels.size +
 filters.legalDomains.size +
 Object.keys(filters.customMetadata).length;

 // Auto-expand when filters are active
 const shouldShow = isExpanded || advancedFilterCount > 0;

 // Calculate counts for each jurisdiction
 const jurisdictionCounts = useMemo(() => {
 if (!searchResults?.documents) return {};
 const counts: Record<string, number> = {};
 availableFilters.jurisdictions.forEach((j) => {
 counts[j] = searchResults.documents.filter(
 (d) => d.jurisdiction === j
 ).length;
 });
 return counts;
 }, [searchResults, availableFilters.jurisdictions]);

 // Calculate counts for each court level
 const courtLevelCounts = useMemo(() => {
 if (!searchResults?.documents) return {};
 const counts: Record<string, number> = {};
 availableFilters.courtLevels.forEach((cl) => {
 counts[cl] = searchResults.documents.filter(
 (d) => d.court_level === cl
 ).length;
 });
 return counts;
 }, [searchResults, availableFilters.courtLevels]);

 // Calculate counts for each legal domain
 const legalDomainCounts = useMemo(() => {
 if (!searchResults?.documents) return {};
 const counts: Record<string, number> = {};
 availableFilters.legalDomains.forEach((ld) => {
 counts[ld] = searchResults.documents.filter(
 (d) => d.legal_domain === ld
 ).length;
 });
 return counts;
 }, [searchResults, availableFilters.legalDomains]);

 // Determine if there are any advanced filters available
 const hasAnyAdvancedFilters =
 availableFilters.jurisdictions.length > 0 ||
 availableFilters.courtLevels.length > 0 ||
 availableFilters.legalDomains.length > 0 ||
 availableFilters.customMetadataKeys.length > 0;

 if (!hasAnyAdvancedFilters) return null;

 return (
 <div className="space-y-3">
 {/* Expand/collapse toggle */}
 <button
 type="button"
 className={cn(
"w-full flex items-center justify-between",
"px-4 py-3",
"rounded-xl",
"bg-gradient-to-br from-slate-50/60 via-blue-50/20 to-indigo-50/10",
"",
"border border-slate-200/50",
"text-sm font-bold",
"cursor-pointer",
"transition-all duration-200 ease-in-out",
"hover:shadow-md hover:bg-white/80",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
 )}
 onClick={() => setIsExpanded(!shouldShow)}
 aria-expanded={shouldShow}
 aria-controls="advanced-filters-content"
 >
 <div className="flex items-center gap-2.5">
 <div className="relative bg-gradient-to-br from-primary/10 via-blue-500/10 to-cyan-500/10 rounded-lg p-1.5 border border-primary/20">
 <SlidersHorizontal className="h-3.5 w-3.5 text-primary"/>
 </div>
 <span className="text-slate-900">Advanced Filters</span>
 {advancedFilterCount > 0 && (
 <Badge className="bg-primary/10 text-primary border-primary/20 font-bold text-xs">
 {advancedFilterCount}
 </Badge>
 )}
 </div>
 {shouldShow ? (
 <ChevronUp className="h-4 w-4 text-muted-foreground"/>
 ) : (
 <ChevronDown className="h-4 w-4 text-muted-foreground"/>
 )}
 </button>

 {/* Advanced filter content */}
 {shouldShow && (
 <div
 id="advanced-filters-content"
 className={cn(
"space-y-3 pl-1",
"animate-in fade-in-0 slide-in-from-top-2 duration-200"
 )}
 >
 {/* Jurisdiction filter */}
 {availableFilters.jurisdictions.length > 0 && (
 <MultiSelectDropdown
 label="Jurisdiction"
 icon={MapPin}
 options={availableFilters.jurisdictions}
 selected={filters.jurisdictions}
 onToggle={(value) => onFilterToggle("jurisdictions", value)}
 counts={jurisdictionCounts}
 />
 )}

 {/* Court Level filter */}
 {availableFilters.courtLevels.length > 0 && (
 <MultiSelectDropdown
 label="Court Level"
 icon={Building2}
 options={availableFilters.courtLevels}
 selected={filters.courtLevels}
 onToggle={(value) => onFilterToggle("courtLevels", value)}
 counts={courtLevelCounts}
 />
 )}

 {/* Legal Domain filter */}
 {availableFilters.legalDomains.length > 0 && (
 <MultiSelectDropdown
 label="Legal Domain"
 icon={BookOpen}
 options={availableFilters.legalDomains}
 selected={filters.legalDomains}
 onToggle={(value) => onFilterToggle("legalDomains", value)}
 counts={legalDomainCounts}
 />
 )}

 {/* Custom Metadata Filters */}
 {availableFilters.customMetadataKeys.length > 0 && (
 <div className="border rounded-xl p-3 bg-white/40 border-slate-200/50 space-y-3">
 <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
 <Tag className="h-3 w-3"/>
 Custom Fields
 </h4>
 {availableFilters.customMetadataKeys.map((key) => (
 <CustomMetadataFilter
 key={key}
 metadataKey={key}
 values={customMetadataValues[key] || []}
 selectedValues={filters.customMetadata[key] || []}
 onToggle={onCustomMetadataToggle}
 onClear={onClearCustomMetadata}
 />
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
}
