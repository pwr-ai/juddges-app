"use client";

// =============================================================================
// SaveAsCollectionDialog — persists the current /search/extractions result set
// (structured filters + free-text query) as a collection.
//
// Issue #683. There is no client-side document cap: the backend enforces
// `settings.SAVE_FROM_FILTER_MAX_DOCUMENTS` and returns 413 FILTER_TOO_LARGE
// when the filtered set is too large. We surface that error's message (plus
// cap/total when the backend supplies them) rather than guessing a limit here.
// =============================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollectionFromFilterError, createCollectionFromFilter } from "@/lib/api/collections";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

interface SaveAsCollectionDialogProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  /** total_count of the current result set — drives enable/disable + copy. */
  total: number;
  /** Default collection name — the NL question when there is one. */
  defaultName: string;
  disabled?: boolean;
}

function fallbackName(): string {
  return `Filtered judgments — ${new Date().toISOString().slice(0, 10)}`;
}

export function SaveAsCollectionDialog({
  filters,
  textQuery,
  total,
  defaultName,
  disabled,
}: SaveAsCollectionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedReason = total === 0 ? "No results to save." : undefined;

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (next) {
      setName((defaultName.trim() || fallbackName()).slice(0, 255));
      setError(null);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName === "") return;
    setSaving(true);
    setError(null);
    try {
      const trimmedQuery = textQuery.trim();
      const result = await createCollectionFromFilter({
        name: trimmedName,
        description: `Saved from /search/extractions (${total.toLocaleString()} judgments).`,
        filters,
        text_query: trimmedQuery === "" ? undefined : trimmedQuery,
      });
      const created = result.collections[0];
      if (!created) {
        throw new Error("Collection was not created");
      }
      router.push(`/collections/${created.collection.id}`);
      // router.push doesn't always unmount this component (e.g. same-route
      // navigation, or a test that mocks the router) — without this the
      // dialog would stay stuck un-closable, showing "Saving…" forever.
      setSaving(false);
    } catch (e) {
      const message =
        e instanceof CollectionFromFilterError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save the collection.";
      setError(message);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || Boolean(blockedReason)}
          title={blockedReason}
        >
          Save as collection
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Save {total.toLocaleString()} judgment{total === 1 ? "" : "s"} as a collection
          </DialogTitle>
          <DialogDescription>
            Every judgment matching the current filters is added. You can extract, sample and
            export from the collection page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="save-collection-name">Collection name</Label>
          <Input
            id="save-collection-name"
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || name.trim() === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveAsCollectionDialog;
