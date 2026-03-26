"use client";

import React, { useMemo } from 'react';
import { Filter, X, User } from 'lucide-react';
import { Badge, AccentButton, SearchableDropdownButton } from '@/lib/styles/components';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExtractionSchema } from '@/types/extraction_schemas';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface FilterState {
 title: string;
 creator: string;
 isVerified: boolean | null; // null = all, true = verified only, false = unverified only
 minFields: string;
 maxFields: string;
 minExtractions: string;
 maxExtractions: string;
}

export interface SchemaFiltersProps {
 filters: FilterState;
 onFiltersChange: (filters: FilterState) => void;
 schemas: ExtractionSchema[];
 disableAnimation?: boolean;
}

export function SchemaFilters({
 filters,
 onFiltersChange,
 schemas,
 disableAnimation = false,
}: SchemaFiltersProps): React.JSX.Element {
 // Get unique creators for filter dropdown
 const uniqueCreators = useMemo(() => {
 const creators = new Set<string>();
 schemas.forEach((schema) => {
 if (schema.user?.email) {
 creators.add(schema.user.email);
 }
 });
 return Array.from(creators).sort();
 }, [schemas]);

 // Convert creators to options format for SearchableDropdownButton
 const authorOptions = useMemo(() => {
 return [
 { value: '__all__', label: 'All authors' },
 ...uniqueCreators.map((creator) => ({
 value: creator,
 label: creator,
 })),
 ];
 }, [uniqueCreators]);

 // Check if any filters are active and count them (excluding title filter which is now in the main page)
 const activeFilterCount = useMemo(() => {
 let count = 0;
 if (filters.creator !== '__all__' && filters.creator !== '') count++;
 if (filters.isVerified !== null) count++;
 if (filters.minFields !== '' || filters.maxFields !== '') count++;
 if (filters.minExtractions !== '' || filters.maxExtractions !== '') count++;
 return count;
 }, [filters]);

 const handleResetFilters = () => {
 onFiltersChange({
 title: '',
 creator: '__all__',
 isVerified: null,
 minFields: '',
 maxFields: '',
 minExtractions: '',
 maxExtractions: '',
 });
 };

 // Helper for Segmented Control options
 const verifiedOptions = [
 { label: 'All', value: 'all' },
 { label: 'Verified', value: 'verified' },
 { label: 'Unverified', value: 'unverified' },
 ];

 const currentVerifiedValue = filters.isVerified === null ? 'all' : filters.isVerified ? 'verified' : 'unverified';

 const handleVerifiedChange = (value: string) => {
 if (value === 'all') onFiltersChange({ ...filters, isVerified: null });
 else if (value === 'verified') onFiltersChange({ ...filters, isVerified: true });
 else if (value === 'unverified') onFiltersChange({ ...filters, isVerified: false });
 };

 const containerClasses = cn(
"relative overflow-hidden w-full",
"rounded-3xl", // Soft, modern shape
 // Legal Glassmorphism 2.0 - Transparent Glass Effect with Light Blur
"bg-[rgba(255,255,255,0.1)]",
"backdrop-blur-[20px] backdrop-saturate-[180%]",
"border-[1px] border-solid border-white/40",
"shadow-[0_8px_32px_rgba(148,163,184,0.2)]",
"p-6",
"max-h-[calc(100vh-2rem)]", // Max height to prevent overflow
"overflow-y-auto"// Allow scrolling if content is too tall
 );

 if (disableAnimation) {
 return (
 <div
 className={containerClasses}
 style={{
 backdropFilter: 'blur(20px) saturate(180%)',
 WebkitBackdropFilter: 'blur(20px) saturate(180%)',
 }}
 >
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div className="flex items-center gap-3">
 <div
 className={cn(
"flex items-center justify-center w-10 h-10 rounded-xl",
"bg-gradient-to-br from-blue-500/10 to-indigo-500/10",
"text-blue-600",
"border border-blue-500/10"
 )}
 >
 <Filter className="h-5 w-5"/>
 </div>
 <div>
 <h2 className="text-lg font-bold text-slate-900 leading-none">
 Filters
 </h2>
 <p className="text-xs text-slate-500 mt-1 font-medium">
 Refine your view
 </p>
 </div>
 </div>

 {activeFilterCount > 0 && (
 <AccentButton
 onClick={handleResetFilters}
 icon={X}
 size="sm"
 className="h-8 px-3 text-xs font-semibold rounded-lg"
 >
 Clear ({activeFilterCount})
 </AccentButton>
 )}
 </div>

 <div className="space-y-8">
 {/* Author Filter */}
 <div className="space-y-3">
 <Label htmlFor="filter-creator"className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Author
 </Label>
 <SearchableDropdownButton
 icon={<User size={16} />}
 label="All authors"
 value={filters.creator}
 options={authorOptions}
 onChange={(value) => onFiltersChange({ ...filters, creator: value })}
 searchPlaceholder="Search authors..."
 className={cn(
"!h-11 !rounded-xl transition-all duration-150 ease-out",
 // Carved Glass Style - match existing filter inputs
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50",
 // Override blue text color to black
"[&_span]:!text-slate-900",
"[&_svg]:!text-slate-700"
 )}
 maxHeight="max-h-[300px]"
 />
 </div>

 {/* Verified Filter - Liquid Glass Segmented Control */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Verified Status
 </Label>
 <div
 className={cn(
"inline-flex h-12 w-full items-center justify-center rounded-full",
 // Liquid glass container - subtle depth (matches GlassTabsList and ViewModeToggle)
"bg-slate-200/20",
"backdrop-blur-[20px] backdrop-saturate-[180%]",
"border border-white/20",
"p-1.5 gap-1.5",
"shadow-[inset_0_0_12px_rgba(255,255,255,0.1)]"
 )}
 >
 {verifiedOptions.map((option) => {
 const isActive = currentVerifiedValue === option.value;
 return (
 <button
 key={option.value}
 type="button"
 onClick={() => handleVerifiedChange(option.value)}
 className={cn(
"relative inline-flex h-full flex-1 items-center justify-center",
"rounded-full px-4 py-2 text-sm",
"whitespace-nowrap",
"transition-all duration-150 ease-out",
"z-10", // Ensure text is above the background blob
 // Text colors
 isActive
 ? "text-slate-900 font-semibold"
 : "text-slate-600 font-medium hover:text-slate-800",
 // Focus styles
"focus-visible:outline-none",
"focus-visible:ring-2 focus-visible:ring-primary/30",
"focus-visible:ring-offset-2",
 )}
 >
 {isActive && (
 <motion.div
 layoutId="verified-segment-indicator"
 className={cn(
"absolute inset-0 rounded-full",
 // Subtle glass effect - minimal gradient (matches GlassTabsTrigger)
"bg-white/50",
 // Blur for glass integration
"backdrop-blur-[12px]",
 // Subtle border - reduced glow on dark theme
"border border-white/40",
 // Minimal shadow for depth
"shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
"-z-10"// Behind the text
 )}
 transition={{
 type: "spring",
 bounce: 0.2,
 duration: 0.5
 }}
 />
 )}
 <span className="relative z-10">{option.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Field Count Filter */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Number of Fields
 </Label>
 <div className="flex gap-3">
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Min"
 value={filters.minFields}
 onChange={(e) => onFiltersChange({ ...filters, minFields: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 <div className="flex items-center text-slate-300 font-bold">-</div>
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Max"
 value={filters.maxFields}
 onChange={(e) => onFiltersChange({ ...filters, maxFields: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 </div>
 </div>

 {/* Extraction Count Filter */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Number of Extractions
 </Label>
 <div className="flex gap-3">
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Min"
 value={filters.minExtractions}
 onChange={(e) => onFiltersChange({ ...filters, minExtractions: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 <div className="flex items-center text-slate-300 font-bold">-</div>
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Max"
 value={filters.maxExtractions}
 onChange={(e) => onFiltersChange({ ...filters, maxExtractions: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 </div>
 </div>
 </div>
 </div>
 );
 }

 return (
 <motion.div
 initial={{ opacity: 0, y: 10, filter: "blur(2px)"}}
 animate={{ opacity: 1, y: 0, filter: "blur(0px)"}}
 transition={{
 duration: 0.15,
 ease: "easeOut"
 }}
 className={containerClasses}
 style={{
 backdropFilter: 'blur(20px) saturate(180%)',
 WebkitBackdropFilter: 'blur(20px) saturate(180%)',
 }}
 >
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div className="flex items-center gap-3">
 <div
 className={cn(
"flex items-center justify-center w-10 h-10 rounded-xl",
"bg-gradient-to-br from-blue-500/10 to-indigo-500/10",
"text-blue-600",
"border border-blue-500/10"
 )}
 >
 <Filter className="h-5 w-5"/>
 </div>
 <div>
 <h2 className="text-lg font-bold text-slate-900 leading-none">
 Filters
 </h2>
 <p className="text-xs text-slate-500 mt-1 font-medium">
 Refine your view
 </p>
 </div>
 </div>

 {activeFilterCount > 0 && (
 <AccentButton
 onClick={handleResetFilters}
 icon={X}
 size="sm"
 className="h-8 px-3 text-xs font-semibold rounded-lg"
 >
 Clear ({activeFilterCount})
 </AccentButton>
 )}
 </div>

 <div className="space-y-8">
 {/* Author Filter */}
 <div className="space-y-3">
 <Label htmlFor="filter-creator"className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Author
 </Label>
 <SearchableDropdownButton
 icon={<User size={16} />}
 label="All authors"
 value={filters.creator}
 options={authorOptions}
 onChange={(value) => onFiltersChange({ ...filters, creator: value })}
 searchPlaceholder="Search authors..."
 className={cn(
"!h-11 !rounded-xl transition-all duration-150 ease-out",
 // Carved Glass Style - match existing filter inputs
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50",
 // Override blue text color to black
"[&_span]:!text-slate-900",
"[&_svg]:!text-slate-700"
 )}
 maxHeight="max-h-[300px]"
 />
 </div>

 {/* Verified Filter - Liquid Glass Segmented Control */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Verified Status
 </Label>
 <div
 className={cn(
"inline-flex h-12 w-full items-center justify-center rounded-full",
 // Liquid glass container - subtle depth (matches GlassTabsList and ViewModeToggle)
"bg-slate-200/20",
"backdrop-blur-[20px] backdrop-saturate-[180%]",
"border border-white/20",
"p-1.5 gap-1.5",
"shadow-[inset_0_0_12px_rgba(255,255,255,0.1)]"
 )}
 >
 {verifiedOptions.map((option) => {
 const isActive = currentVerifiedValue === option.value;
 return (
 <button
 key={option.value}
 type="button"
 onClick={() => handleVerifiedChange(option.value)}
 className={cn(
"relative inline-flex h-full flex-1 items-center justify-center",
"rounded-full px-4 py-2 text-sm",
"whitespace-nowrap",
"transition-all duration-150 ease-out",
"z-10", // Ensure text is above the background blob
 // Text colors
 isActive
 ? "text-slate-900 font-semibold"
 : "text-slate-600 font-medium hover:text-slate-800",
 // Focus styles
"focus-visible:outline-none",
"focus-visible:ring-2 focus-visible:ring-primary/30",
"focus-visible:ring-offset-2",
 )}
 >
 {isActive && (
 <motion.div
 layoutId="verified-segment-indicator"
 className={cn(
"absolute inset-0 rounded-full",
 // Subtle glass effect - minimal gradient (matches GlassTabsTrigger)
"bg-white/50",
 // Blur for glass integration
"backdrop-blur-[12px]",
 // Subtle border - reduced glow on dark theme
"border border-white/40",
 // Minimal shadow for depth
"shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
"-z-10"// Behind the text
 )}
 transition={{
 type: "spring",
 bounce: 0.2,
 duration: 0.5
 }}
 />
 )}
 <span className="relative z-10">{option.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Field Count Filter */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Number of Fields
 </Label>
 <div className="flex gap-3">
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Min"
 value={filters.minFields}
 onChange={(e) => onFiltersChange({ ...filters, minFields: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 <div className="flex items-center text-slate-300 font-bold">-</div>
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Max"
 value={filters.maxFields}
 onChange={(e) => onFiltersChange({ ...filters, maxFields: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 </div>
 </div>

 {/* Extraction Count Filter */}
 <div className="space-y-3">
 <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1">
 Number of Extractions
 </Label>
 <div className="flex gap-3">
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Min"
 value={filters.minExtractions}
 onChange={(e) => onFiltersChange({ ...filters, minExtractions: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 <div className="flex items-center text-slate-300 font-bold">-</div>
 <div className="flex-1">
 <Input
 type="number"
 placeholder="Max"
 value={filters.maxExtractions}
 onChange={(e) => onFiltersChange({ ...filters, maxExtractions: e.target.value })}
 className={cn(
"!h-11 !rounded-xl text-center transition-all duration-150 ease-out",
"!bg-slate-50/50",
"!border-none",
"!shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]",
"focus:!ring-2 focus:!ring-primary/20 focus:!bg-white",
"hover:!bg-slate-100/50"
 )}
 min="0"
 />
 </div>
 </div>
 </div>
 </div>
 </motion.div>
 );
}
