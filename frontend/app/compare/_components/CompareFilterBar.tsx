"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
import { DateRangeControl } from "@/components/search/controls/DateRangeControl";
import { NlFilterDialog } from "@/components/search/NlFilterDialog";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/contexts/LanguageContext";
import { CORE_FILTER_FIELD_BY_NAME } from "@/lib/extractions/base-schema-filter-config";
import { coreToDrawerValue, toDrawerFilters } from "@/lib/extractions/drawer-adapter";
import type { BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

export interface CompareFilterBarProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  /** NL dialog accepted: structured filters + split-out text + the question. */
  onApply: (filters: BaseSchemaFilters, textQuery: string, question: string) => void;
  /** Free-text box submitted (Enter / blur). */
  onTextQuery: (textQuery: string) => void;
  onRemove: (field: keyof BaseSchemaFilters) => void;
  onClearText: () => void;
  onClearAll: () => void;
  /** Drawer or scope control changed one field (`undefined` clears it). */
  onDrawerChange: (field: string, value: BaseFilterValue | undefined) => void;
  /** Reset only the drawer-managed fields (keeps text, dates, substrings). */
  onDrawerReset: () => void;
  disabled?: boolean;
}

/**
 * Filter bar for /compare: NL question → filters, a free-text box, a decision
 * date range, the shared base-schema drawer, and the active chips. There is no
 * jurisdiction control on purpose — compare always runs PL and UK; the drawer
 * adapter already drops core fields, and the backend strips `jurisdiction`
 * from whatever a portable permalink carries.
 */
export function CompareFilterBar({
  filters,
  textQuery,
  onApply,
  onTextQuery,
  onRemove,
  onClearText,
  onClearAll,
  onDrawerChange,
  onDrawerReset,
  disabled,
}: CompareFilterBarProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(textQuery);
  const [syncedQuery, setSyncedQuery] = useState(textQuery);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Re-sync the box when the query changes from elsewhere (NL dialog, chips,
  // clear-all) — adjust-during-render, so no effect-driven extra commit.
  if (textQuery !== syncedQuery) {
    setSyncedQuery(textQuery);
    setDraft(textQuery);
  }

  const drawerFilters = toDrawerFilters(filters);
  const drawerActive = Object.keys(drawerFilters).length;
  const dateCfg = CORE_FILTER_FIELD_BY_NAME.decision_date;
  const decisionDate = coreToDrawerValue("decision_date", filters.decision_date);

  const commitText = () => {
    if (draft.trim() !== textQuery.trim()) onTextQuery(draft.trim());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t("compare.textPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            }
          }}
          disabled={disabled}
          className="flex-1"
          aria-label={t("compare.askQuestion")}
        />
        <NlFilterDialog onApply={onApply} disabled={disabled} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DateRangeControl
          label={dateCfg.label}
          description={dateCfg.help}
          value={decisionDate?.kind === "date_range" ? decisionDate : undefined}
          onChange={(next) => onDrawerChange("decision_date", next)}
          disabled={disabled}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          disabled={disabled}
          aria-expanded={drawerOpen}
          aria-controls="compare-filters-drawer"
          className="flex w-full cursor-pointer items-center justify-between border border-rule bg-parchment px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-oxblood disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>
            {t("compare.filtersToggle")}
            {drawerActive > 0 && (
              <span className="ml-2 font-semibold text-oxblood">{drawerActive}</span>
            )}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${drawerOpen ? "rotate-180" : ""}`} />
        </button>
        {drawerOpen && (
          <div id="compare-filters-drawer" className="mt-2">
            <BaseFiltersDrawer
              filters={drawerFilters}
              onChange={onDrawerChange}
              onReset={onDrawerReset}
              disabled={disabled ?? false}
              defaultOpen
              hideToggle
            />
          </div>
        )}
      </div>

      <ActiveFilterChips
        filters={filters}
        textQuery={textQuery}
        onRemove={onRemove}
        onClearText={onClearText}
        onClearAll={onClearAll}
      />
    </div>
  );
}
