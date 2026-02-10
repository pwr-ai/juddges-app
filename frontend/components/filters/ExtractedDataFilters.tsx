"use client";

import * as React from "react";
import { X, Filter, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Types
export interface FilterFieldConfig {
  field: string;
  type: string;
  filter_type: string;
  label: string;
  order: number;
  description: string;
  enum_values?: string[];
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface ExtractedDataFilters {
  [field: string]: string | string[] | boolean | number | [number, number] | undefined;
}

interface ExtractedDataFiltersProps {
  filters: ExtractedDataFilters;
  onFilterChange: (filters: ExtractedDataFilters) => void;
  filterConfigs: FilterFieldConfig[];
  facetCounts?: Record<string, FacetCount[]>;
  isLoading?: boolean;
  className?: string;
}

// Helper to format enum values for display
function formatEnumValue(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Single facet filter component
function FacetFilter({
  config,
  value,
  counts,
  onChange,
}: {
  config: FilterFieldConfig;
  value: string | string[] | undefined;
  counts?: FacetCount[];
  onChange: (value: string | undefined) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const options = config.enum_values || [];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:bg-muted/50 rounded-md px-2">
        <span>{config.label}</span>
        <div className="flex items-center gap-2">
          {value && (
            <Badge variant="secondary" className="text-xs">
              {Array.isArray(value) ? value.length : 1}
            </Badge>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-4">
        <Select
          value={typeof value === "string" ? value : undefined}
          onValueChange={(v) => onChange(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={`Select ${config.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {options.map((opt) => {
              const count = counts?.find((c) => c.value === opt)?.count;
              return (
                <SelectItem key={opt} value={opt}>
                  <span className="flex items-center justify-between w-full">
                    <span>{formatEnumValue(opt)}</span>
                    {count !== undefined && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({count})
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Boolean filter component
function BooleanFilter({
  config,
  value,
  onChange,
}: {
  config: FilterFieldConfig;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-2">
      <Label htmlFor={config.field} className="text-sm font-medium">
        {config.label}
      </Label>
      <Switch
        id={config.field}
        checked={value ?? false}
        onCheckedChange={(checked) => onChange(checked ? true : undefined)}
      />
    </div>
  );
}

// Text search filter component
function TextSearchFilter({
  config,
  value,
  onChange,
}: {
  config: FilterFieldConfig;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const [localValue, setLocalValue] = React.useState(value || "");

  React.useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleSubmit = () => {
    onChange(localValue.trim() || undefined);
  };

  return (
    <div className="py-2 px-2">
      <Label className="text-sm font-medium mb-2 block">{config.label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={`Search ${config.label.toLowerCase()}...`}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="flex-1"
        />
        <Button size="icon" variant="outline" onClick={handleSubmit}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Array multi-select filter component
function ArrayFilter({
  config,
  value,
  counts,
  onChange,
}: {
  config: FilterFieldConfig;
  value: string[] | undefined;
  counts?: FacetCount[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedValues = value || [];
  const options = counts?.map((c) => c.value) || [];

  const toggleValue = (opt: string) => {
    const newValues = selectedValues.includes(opt)
      ? selectedValues.filter((v) => v !== opt)
      : [...selectedValues, opt];
    onChange(newValues.length > 0 ? newValues : undefined);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:bg-muted/50 rounded-md px-2">
        <span>{config.label}</span>
        <div className="flex items-center gap-2">
          {selectedValues.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedValues.length}
            </Badge>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-4 px-2">
        <ScrollArea className="h-48">
          <div className="space-y-2">
            {options.map((opt) => {
              const count = counts?.find((c) => c.value === opt)?.count;
              return (
                <div key={opt} className="flex items-center gap-2">
                  <Checkbox
                    id={`${config.field}-${opt}`}
                    checked={selectedValues.includes(opt)}
                    onCheckedChange={() => toggleValue(opt)}
                  />
                  <Label
                    htmlFor={`${config.field}-${opt}`}
                    className="text-sm flex-1 cursor-pointer"
                  >
                    {opt}
                    {count !== undefined && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({count})
                      </span>
                    )}
                  </Label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Main filter panel component
export function ExtractedDataFilterPanel({
  filters,
  onFilterChange,
  filterConfigs,
  facetCounts = {},
  isLoading = false,
  className,
}: ExtractedDataFiltersProps) {
  // Group filters by type
  const facetFilters = filterConfigs.filter((c) => c.filter_type === "facet");
  const booleanFilters = facetFilters.filter((c) => c.type === "boolean");
  const enumFilters = facetFilters.filter((c) => c.type === "string" && c.enum_values);
  const textFilters = filterConfigs.filter((c) => c.filter_type === "text_search");
  const arrayFilters = filterConfigs.filter((c) => c.filter_type === "array_contains");

  const activeFilterCount = Object.keys(filters).filter(
    (k) => filters[k] !== undefined
  ).length;

  const clearAllFilters = () => {
    onFilterChange({});
  };

  const updateFilter = (field: string, value: any) => {
    const newFilters = { ...filters };
    if (value === undefined) {
      delete newFilters[field];
    } else {
      newFilters[field] = value;
    }
    onFilterChange(newFilters);
  };

  return (
    <div className={cn("bg-background border rounded-lg", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h3 className="font-semibold">Filters</h3>
            {activeFilterCount > 0 && (
              <Badge variant="secondary">{activeFilterCount}</Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs"
            >
              Clear all
              <X className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="p-4 space-y-4">
          {/* Boolean Filters */}
          {booleanFilters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Toggles
              </h4>
              {booleanFilters.map((config) => (
                <BooleanFilter
                  key={config.field}
                  config={config}
                  value={filters[config.field] as boolean | undefined}
                  onChange={(v) => updateFilter(config.field, v)}
                />
              ))}
            </div>
          )}

          {booleanFilters.length > 0 && enumFilters.length > 0 && <Separator />}

          {/* Enum Facet Filters */}
          {enumFilters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Categories
              </h4>
              {enumFilters.map((config) => (
                <FacetFilter
                  key={config.field}
                  config={config}
                  value={filters[config.field] as string | string[] | undefined}
                  counts={facetCounts[config.field]}
                  onChange={(v) => updateFilter(config.field, v)}
                />
              ))}
            </div>
          )}

          {(booleanFilters.length > 0 || enumFilters.length > 0) &&
            arrayFilters.length > 0 && <Separator />}

          {/* Array Filters */}
          {arrayFilters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Multi-select
              </h4>
              {arrayFilters.map((config) => (
                <ArrayFilter
                  key={config.field}
                  config={config}
                  value={filters[config.field] as string[] | undefined}
                  counts={facetCounts[config.field]}
                  onChange={(v) => updateFilter(config.field, v)}
                />
              ))}
            </div>
          )}

          {(booleanFilters.length > 0 ||
            enumFilters.length > 0 ||
            arrayFilters.length > 0) &&
            textFilters.length > 0 && <Separator />}

          {/* Text Search Filters */}
          {textFilters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Text Search
              </h4>
              {textFilters.slice(0, 5).map((config) => (
                <TextSearchFilter
                  key={config.field}
                  config={config}
                  value={filters[config.field] as string | undefined}
                  onChange={(v) => updateFilter(config.field, v)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Mobile filter sheet
export function ExtractedDataFilterSheet({
  filters,
  onFilterChange,
  filterConfigs,
  facetCounts = {},
  isLoading = false,
}: ExtractedDataFiltersProps) {
  const activeFilterCount = Object.keys(filters).filter(
    (k) => filters[k] !== undefined
  ).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <ExtractedDataFilterPanel
          filters={filters}
          onFilterChange={onFilterChange}
          filterConfigs={filterConfigs}
          facetCounts={facetCounts}
          isLoading={isLoading}
          className="border-0 rounded-none"
        />
      </SheetContent>
    </Sheet>
  );
}

// Active filters display
export function ActiveFilters({
  filters,
  filterConfigs,
  onRemove,
  onClearAll,
}: {
  filters: ExtractedDataFilters;
  filterConfigs: FilterFieldConfig[];
  onRemove: (field: string) => void;
  onClearAll: () => void;
}) {
  const activeFilters = Object.entries(filters).filter(
    ([, value]) => value !== undefined
  );

  if (activeFilters.length === 0) return null;

  const getLabel = (field: string) =>
    filterConfigs.find((c) => c.field === field)?.label || field;

  const formatValue = (value: any): string => {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.join(", ");
    return formatEnumValue(String(value));
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground">Active filters:</span>
      {activeFilters.map(([field, value]) => (
        <Badge key={field} variant="secondary" className="gap-1">
          <span className="font-medium">{getLabel(field)}:</span>
          <span>{formatValue(value)}</span>
          <button
            onClick={() => onRemove(field)}
            className="ml-1 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs">
        Clear all
      </Button>
    </div>
  );
}
