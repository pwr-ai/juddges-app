"use client";

// =============================================================================
// NlFilterDialog — opt-in "paste your question" shortcut for /search/extractions.
//
// Issue #141. An unobtrusive secondary entry point next to the Advanced filters
// drawer. The user pastes a plain-language question; we POST it to
// /api/extractions/base-schema/nl-filter, preview the translated filter object,
// then — on apply — pre-fill the form state. We deliberately DO NOT auto-run the
// search: the "review before run" step is the UX guard against LLM hallucination.
// =============================================================================

import { Sparkles } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

interface NlFilterResponse {
  filters: BaseSchemaFilters;
  text_query: string | null;
}

interface NlFilterDialogProps {
  /**
   * Called when the user accepts the translated filters. Receives the structured
   * filters plus the free-text query (already split out by the backend). The
   * parent should populate form state — it must NOT trigger a search.
   */
  onApply: (filters: BaseSchemaFilters, textQuery: string) => void;
  disabled?: boolean;
}

const GENERIC_ERROR =
  "Couldn't translate that question; try simpler phrasing.";

function countFilters(filters: BaseSchemaFilters): number {
  return Object.keys(filters).length;
}

export function NlFilterDialog({ onApply, disabled }: NlFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NlFilterResponse | null>(null);

  const reset = () => {
    setQuery("");
    setError(null);
    setPreview(null);
    setIsLoading(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleTranslate = async () => {
    const trimmed = query.trim();
    if (trimmed === "") return;

    setIsLoading(true);
    setError(null);
    setPreview(null);

    try {
      const response = await fetch(
        "/api/extractions/base-schema/nl-filter",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
        return;
      }

      const data = (await response.json()) as NlFilterResponse;
      setPreview({
        filters: data.filters ?? {},
        text_query: data.text_query ?? null,
      });
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!preview) return;
    onApply(preview.filters, preview.text_query ?? "");
    handleOpenChange(false);
  };

  const hasResult =
    preview !== null &&
    (countFilters(preview.filters) > 0 || Boolean(preview.text_query));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1.5"
        >
          <Sparkles className="size-4 text-[color:var(--gold)]" aria-hidden />
          Paste your question
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Paste your question</DialogTitle>
          <DialogDescription>
            Describe what you&apos;re looking for in plain language. We&apos;ll
            translate it into structured filters for you to review and edit
            before searching.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. successful appeals where the conviction was quashed in 2025, with at least two co-defendants"
          rows={4}
          disabled={isLoading}
          aria-label="Natural-language question"
        />

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {preview && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Translated filters
            </p>
            {hasResult ? (
              <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                {JSON.stringify(
                  preview.text_query
                    ? { ...preview.filters, text_query: preview.text_query }
                    : preview.filters,
                  null,
                  2,
                )}
              </pre>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                No filters matched that question. Try rephrasing, or use the
                form below.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {preview === null ? (
            <Button
              type="button"
              onClick={handleTranslate}
              disabled={isLoading || query.trim() === ""}
            >
              {isLoading ? "Translating…" : "Translate to filters"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
              >
                Edit question
              </Button>
              <Button
                type="button"
                onClick={handleApply}
                disabled={!hasResult}
              >
                Apply to form
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NlFilterDialog;
