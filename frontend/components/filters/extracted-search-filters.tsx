"use client";

import { CalendarIcon, ChevronDown, Filter, X } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FILTER_FIELD_BY_NAME,
  FIELDS_BY_GROUP,
  GROUP_LABELS,
  GROUP_ORDER,
  formatEnumLabel,
  type FilterFieldConfig,
} from "@/lib/extractions/base-schema-filter-config";
import { useExtractionFacet } from "@/lib/extractions/base-schema-filter-api";
import { cn } from "@/lib/utils";
import type {
  BaseSchemaFilters,
  DateRange as DateRangeFilter,
  FacetCount,
  NumericRange,
} from "@/types/base-schema-filter";

// =============================================================================
// Helpers
// =============================================================================

function isNumericRange(value: unknown): value is NumericRange {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    ("min" in value || "max" in value)
  );
}

function isDateRange(value: unknown): value is DateRangeFilter {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    ("from" in value || "to" in value)
  );
}

function parseISODate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toISODate(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// Individual controls
// =============================================================================

interface ControlProps<T> {
  config: FilterFieldConfig;
  value: T | undefined;
  onChange: (next: T | undefined) => void;
}

// ---- Enum multi-select ------------------------------------------------------

function EnumMultiSelect({
  config,
  value,
  onChange,
  facets,
}: ControlProps<string[]> & { facets?: FacetCount[] }) {
  const selected = value ?? [];
  const options = config.enumValues ?? [];

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((v) => v !== opt)
      : [...selected, opt];
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2 px-2">
      {options.map((opt) => {
        const count = facets?.find((f) => f.value === opt)?.count;
        const id = `${config.field}-${opt}`;
        return (
          <div key={opt} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={selected.includes(opt)}
              onCheckedChange={() => toggle(opt)}
            />
            <Label htmlFor={id} className="flex-1 cursor-pointer text-sm">
              {formatEnumLabel(opt)}
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
  );
}

// ---- Free-text tag array (Enter to add, click X to remove) ------------------

function TagArrayFilter({
  config,
  value,
  onChange,
}: ControlProps<string[]>) {
  const [draft, setDraft] = React.useState("");
  const tags = value ?? [];

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed]);
    setDraft("");
  };

  const remove = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2 px-2">
      <div className="flex gap-2">
        <Input
          placeholder={`Add ${config.label.toLowerCase()}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="flex-1"
        />
        <Button size="sm" variant="outline" onClick={commit}>
          Add
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                onClick={() => remove(tag)}
                className="hover:text-destructive"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Boolean tri-state ------------------------------------------------------

function BooleanTriState({
  config,
  value,
  onChange,
}: ControlProps<boolean>) {
  const setVal = (next: boolean | undefined) => onChange(next);

  const buttons: { label: string; val: boolean | undefined }[] = [
    { label: "Any", val: undefined },
    { label: "Yes", val: true },
    { label: "No", val: false },
  ];

  return (
    <div className="px-2 flex gap-1" role="radiogroup" aria-label={config.label}>
      {buttons.map(({ label, val }) => {
        const selected = value === val;
        return (
          <Button
            key={label}
            size="sm"
            variant={selected ? "default" : "outline"}
            onClick={() => setVal(val)}
            role="radio"
            aria-checked={selected}
            className="flex-1"
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

// ---- Numeric range ----------------------------------------------------------

function NumericRangeFilter({
  config,
  value,
  onChange,
}: ControlProps<number | NumericRange>) {
  const min =
    typeof value === "number"
      ? value
      : isNumericRange(value)
        ? value.min
        : undefined;
  const max = isNumericRange(value) ? value.max : undefined;

  const update = (nextMin: number | undefined, nextMax: number | undefined) => {
    if (nextMin === undefined && nextMax === undefined) {
      onChange(undefined);
    } else if (nextMin !== undefined && nextMax === undefined && Number.isFinite(nextMin)) {
      // fold to scalar equality only when explicitly requested via UI? keep range form for clarity
      onChange({ min: nextMin });
    } else {
      onChange({ min: nextMin, max: nextMax });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 px-2">
      <div>
        <Label className="text-xs text-muted-foreground">Min</Label>
        <Input
          type="number"
          value={min ?? ""}
          onChange={(e) =>
            update(
              e.target.value === "" ? undefined : Number(e.target.value),
              max,
            )
          }
          aria-label={`${config.label} minimum`}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Max</Label>
        <Input
          type="number"
          value={max ?? ""}
          onChange={(e) =>
            update(
              min,
              e.target.value === "" ? undefined : Number(e.target.value),
            )
          }
          aria-label={`${config.label} maximum`}
        />
      </div>
    </div>
  );
}

// ---- Date range -------------------------------------------------------------

function DateRangeField({
  config,
  value,
  onChange,
}: ControlProps<string | DateRangeFilter>) {
  const from =
    typeof value === "string"
      ? parseISODate(value)
      : isDateRange(value)
        ? parseISODate(value.from)
        : undefined;
  const to = isDateRange(value) ? parseISODate(value.to) : undefined;

  const update = (nextFrom: Date | undefined, nextTo: Date | undefined) => {
    const fromIso = toISODate(nextFrom);
    const toIso = toISODate(nextTo);
    if (!fromIso && !toIso) {
      onChange(undefined);
    } else {
      onChange({ from: fromIso, to: toIso });
    }
  };

  const label = (() => {
    const parts: string[] = [];
    if (from) parts.push(`from ${toISODate(from)}`);
    if (to) parts.push(`to ${toISODate(to)}`);
    return parts.length > 0 ? parts.join(" ") : `Pick ${config.label.toLowerCase()}`;
  })();

  return (
    <div className="px-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !from && !to && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from, to }}
            onSelect={(range) => {
              if (!range || range instanceof Date) {
                update(undefined, undefined);
                return;
              }
              update(range.from, range.to);
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---- Substring (debounced ILIKE) -------------------------------------------

function SubstringFilter({
  config,
  value,
  onChange,
}: ControlProps<string>) {
  const [local, setLocal] = React.useState(value ?? "");

  React.useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = local.trim();
      if (trimmed === (value ?? "")) return;
      onChange(trimmed === "" ? undefined : trimmed);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="px-2">
      <Input
        placeholder={`Search ${config.label.toLowerCase()}…`}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        aria-label={config.label}
      />
    </div>
  );
}

// =============================================================================
// Field row with collapsible header + active count
// =============================================================================

interface FieldRowProps {
  config: FilterFieldConfig;
  filters: BaseSchemaFilters;
  onChange: (field: string, next: unknown) => void;
}

function describeActive(config: FilterFieldConfig, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length}` : null;
  }
  if (typeof value === "string") return value.trim() === "" ? null : "•";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (isNumericRange(value)) {
    const parts: string[] = [];
    if (value.min !== undefined) parts.push(`≥${value.min}`);
    if (value.max !== undefined) parts.push(`≤${value.max}`);
    return parts.join(" ") || null;
  }
  if (isDateRange(value)) {
    const parts: string[] = [];
    if (value.from) parts.push(value.from);
    if (value.to) parts.push(value.to);
    return parts.length > 0 ? parts.join("→") : null;
  }
  return null;
}

function FieldRow({ config, filters, onChange }: FieldRowProps) {
  const value = filters[config.field as keyof BaseSchemaFilters];
  const [open, setOpen] = React.useState(false);
  const facetQuery = useExtractionFacet(
    config.control === "enum_multi" ? config.field : null,
    open,
  );
  const activeBadge = describeActive(config, value);

  const set = (next: unknown) => onChange(config.field, next);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-muted/50">
        <span>{config.label}</span>
        <span className="flex items-center gap-2">
          {activeBadge && (
            <Badge variant="secondary" className="text-xs">
              {activeBadge}
            </Badge>
          )}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-3">
        {config.help && (
          <p className="px-2 pb-2 text-xs text-muted-foreground">{config.help}</p>
        )}
        {config.control === "enum_multi" && (
          <EnumMultiSelect
            config={config}
            value={value as string[] | undefined}
            onChange={set}
            facets={facetQuery.data}
          />
        )}
        {config.control === "tag_array" && (
          <TagArrayFilter
            config={config}
            value={value as string[] | undefined}
            onChange={set}
          />
        )}
        {config.control === "boolean_tri" && (
          <BooleanTriState
            config={config}
            value={value as boolean | undefined}
            onChange={set}
          />
        )}
        {config.control === "numeric_range" && (
          <NumericRangeFilter
            config={config}
            value={value as number | NumericRange | undefined}
            onChange={set}
          />
        )}
        {config.control === "date_range" && (
          <DateRangeField
            config={config}
            value={value as string | DateRangeFilter | undefined}
            onChange={set}
          />
        )}
        {config.control === "substring" && (
          <SubstringFilter
            config={config}
            value={value as string | undefined}
            onChange={set}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Drawer composition: groups all 42 fields into themed sections
// =============================================================================

interface FilterDrawerProps {
  filters: BaseSchemaFilters;
  onChange: (filters: BaseSchemaFilters) => void;
  activeCount: number;
}

export function ExtractedFilterDrawer({
  filters,
  onChange,
  activeCount,
}: FilterDrawerProps) {
  const setField = (field: string, value: unknown) => {
    const next = { ...filters };
    if (value === undefined) {
      delete (next as Record<string, unknown>)[field];
    } else {
      (next as Record<string, unknown>)[field] = value;
    }
    onChange(next);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Advanced filters</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-7rem)]">
          <div className="p-4 space-y-4">
            {GROUP_ORDER.map((group, idx) => {
              const fields = FIELDS_BY_GROUP[group];
              if (!fields || fields.length === 0) return null;
              return (
                <div key={group}>
                  {idx > 0 && <Separator className="my-2" />}
                  <h4 className="px-2 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </h4>
                  {fields.map((c) => (
                    <FieldRow
                      key={c.field}
                      config={c}
                      filters={filters}
                      onChange={setField}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// Active-filter chips — sit above results, click X to remove
// =============================================================================

interface ActiveChipsProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  onRemove: (field: keyof BaseSchemaFilters) => void;
  onClearText: () => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  filters,
  textQuery,
  onRemove,
  onClearText,
  onClearAll,
}: ActiveChipsProps) {
  const entries = Object.entries(filters) as [keyof BaseSchemaFilters, unknown][];
  const hasText = textQuery.trim() !== "";
  if (entries.length === 0 && !hasText) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasText && (
        <Badge variant="secondary" className="gap-1">
          <span className="text-xs text-muted-foreground">text:</span>
          <span className="font-medium">{textQuery}</span>
          <button onClick={onClearText} aria-label="Clear text query" className="hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {entries.map(([field, value]) => {
        const config = FILTER_FIELD_BY_NAME[field];
        const desc = config ? describeActive(config, value) : null;
        if (!desc) return null;
        return (
          <Badge key={field} variant="secondary" className="gap-1">
            <span className="font-medium">{config?.label ?? field}:</span>
            <span>{desc}</span>
            <button
              onClick={() => onRemove(field)}
              aria-label={`Remove ${config?.label ?? field}`}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs">
        Clear all
      </Button>
    </div>
  );
}
