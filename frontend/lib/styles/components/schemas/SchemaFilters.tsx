"use client";

import React, { useMemo } from 'react';
import { Filter, X, User } from 'lucide-react';
import { Badge, VariantButton, SearchableDropdownButton } from '@/lib/styles/components';
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
    "border border-rule bg-parchment p-6",
    "max-h-[calc(100vh-2rem)]",
    "overflow-y-auto"
  );

  const renderFilterContent = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-rule">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8",
              "bg-parchment-deep border border-rule",
              "text-oxblood"
            )}
          >
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-serif text-ink leading-none">
              Filters
            </h2>
            <p className="text-[10px] text-ink-soft mt-1 font-mono uppercase tracking-[0.14em]">
              Refine your view
            </p>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <VariantButton
            intent="accent"
            onClick={handleResetFilters}
            icon={X}
            size="sm"
            className="h-7 px-2.5 text-xs font-mono"
          >
            Clear ({activeFilterCount})
          </VariantButton>
        )}
      </div>

      <div className="space-y-6">
        {/* Author Filter */}
        <div className="space-y-2">
          <Label htmlFor="filter-creator" className="text-xs font-mono uppercase tracking-[0.14em] text-ink-soft">
            Author
          </Label>
          <SearchableDropdownButton
            icon={<User size={14} />}
            label="All authors"
            value={filters.creator}
            options={authorOptions}
            onChange={(value) => onFiltersChange({ ...filters, creator: value })}
            searchPlaceholder="Search authors..."
            className="!h-10 !rounded-none border border-rule bg-parchment text-ink hover:border-rule-strong"
            maxHeight="max-h-[300px]"
          />
        </div>

        {/* Verified Filter - Editorial Segmented Control */}
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-[0.14em] text-ink-soft">
            Verified Status
          </Label>
          <div className="inline-flex h-9 w-full items-center justify-center border border-rule bg-parchment-deep/40 p-1 gap-1">
            {verifiedOptions.map((option) => {
              const isActive = currentVerifiedValue === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleVerifiedChange(option.value)}
                  className={cn(
                    "relative inline-flex h-full flex-1 items-center justify-center",
                    "px-3 py-1 font-mono text-xs uppercase tracking-[0.12em]",
                    "whitespace-nowrap transition-colors duration-150 ease-out",
                    "z-10",
                    isActive
                      ? "text-ink font-semibold"
                      : "text-ink-soft hover:text-ink",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-oxblood",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="verified-segment-indicator"
                      className="absolute inset-0 bg-parchment border border-rule/80 shadow-sm -z-10"
                      transition={{
                        type: "spring",
                        bounce: 0.15,
                        duration: 0.3,
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
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-[0.14em] text-ink-soft">
            Number of Fields
          </Label>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Min"
                value={filters.minFields}
                onChange={(e) => onFiltersChange({ ...filters, minFields: e.target.value })}
                className="!h-9 !rounded-none border border-rule bg-parchment text-center text-xs font-mono"
                min="0"
              />
            </div>
            <span className="text-rule-strong font-mono">-</span>
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Max"
                value={filters.maxFields}
                onChange={(e) => onFiltersChange({ ...filters, maxFields: e.target.value })}
                className="!h-9 !rounded-none border border-rule bg-parchment text-center text-xs font-mono"
                min="0"
              />
            </div>
          </div>
        </div>

        {/* Extraction Count Filter */}
        <div className="space-y-2">
          <Label className="text-xs font-mono uppercase tracking-[0.14em] text-ink-soft">
            Number of Extractions
          </Label>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Min"
                value={filters.minExtractions}
                onChange={(e) => onFiltersChange({ ...filters, minExtractions: e.target.value })}
                className="!h-9 !rounded-none border border-rule bg-parchment text-center text-xs font-mono"
                min="0"
              />
            </div>
            <span className="text-rule-strong font-mono">-</span>
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Max"
                value={filters.maxExtractions}
                onChange={(e) => onFiltersChange({ ...filters, maxExtractions: e.target.value })}
                className="!h-9 !rounded-none border border-rule bg-parchment text-center text-xs font-mono"
                min="0"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (disableAnimation) {
    return (
      <div className={containerClasses}>
        {renderFilterContent()}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.15,
        ease: "easeOut",
      }}
      className={containerClasses}
    >
      {renderFilterContent()}
    </motion.div>
  );
}
