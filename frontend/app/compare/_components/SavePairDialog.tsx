"use client";

// =============================================================================
// SavePairDialog — persists the current /compare result set as a PL + UK
// collection pair (issue #684, Task 17).
//
// Delegates to `createCollectionPair` (lib/compare/api.ts), which is
// `createCollectionFromFilter({ ...body, split_by_jurisdiction: true })`
// under the hood — the same save-as-collection endpoint SaveAsCollectionDialog
// (#683) uses, just with the split flag set. Errors are therefore
// `CollectionFromFilterError` (status/code/message/total/cap/jurisdiction),
// not a compare-specific type: a 413 is `FILTER_TOO_LARGE` (either side over
// the per-collection cap) and a 400 `FILTER_EMPTY` names the empty side in
// its own message, so both branches can show `e.message` as-is.
//
// There is no client-side cap pre-check — the backend is the only source of
// truth for the limit, and its message already carries the exact numbers.
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/contexts/LanguageContext";
import { CollectionFromFilterError } from "@/lib/api/collections";
import { createCollectionPair } from "@/lib/compare/api";
import type { CompareRequest } from "@/lib/compare/types";
import logger from "@/lib/logger";
import type { BaseSchemaFilters, CollectionFromFilterResponse } from "@/types/base-schema-filter";

const log = logger.child("SavePairDialog");

/** Backend bound on the pair name in split mode (see collections_from_filter.py). */
const NAME_MAX_LENGTH = 200;

export interface SavePairDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  request: CompareRequest;
  /** The natural-language question the current filter came from, if any. */
  defaultName?: string;
  onSaved(result: CollectionFromFilterResponse): void;
}

interface DialogError {
  /** Set only for the 413 case, so the generic cap copy leads the specific backend body. */
  title?: string;
  message: string;
}

function chipSummary(filters: BaseSchemaFilters): string {
  return Object.keys(filters).join(", ");
}

function initialName(request: CompareRequest, defaultName?: string): string {
  const fromDefault = (defaultName ?? "").trim();
  if (fromDefault) return fromDefault.slice(0, NAME_MAX_LENGTH);
  const fromQuery = (request.text_query ?? "").trim();
  if (fromQuery) return fromQuery.slice(0, NAME_MAX_LENGTH);
  return chipSummary(request.filters).slice(0, NAME_MAX_LENGTH);
}

export function SavePairDialog({ open, onOpenChange, request, defaultName, onSaved }: SavePairDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState(() => initialName(request, defaultName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  // Latched once a save actually produces a pair id: the redirect is
  // fire-and-forget (router.push doesn't unmount synchronously, e.g. in
  // tests that mock the router), so without this a second click before
  // navigation lands would fire a second createCollectionPair call.
  const [succeeded, setSucceeded] = useState(false);
  // Tracks the `open` value the above state was last seeded for. Adjusting
  // state during render (rather than in an effect) on an `open` transition
  // avoids an extra render pass; the same instance is reused across opens
  // from CompareContent, so a stale name/error/succeeded would otherwise
  // leak through.
  const [seededFor, setSeededFor] = useState(open);
  if (open !== seededFor) {
    setSeededFor(open);
    if (open) {
      setName(initialName(request, defaultName));
      setError(null);
      setSucceeded(false);
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    onOpenChange(next);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || succeeded) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createCollectionPair({
        name: trimmed,
        filters: request.filters,
        text_query: request.text_query ?? null,
      });
      setSaving(false);
      // Checked before `onSaved` fires: the parent handler (e.g. closing the
      // dialog) must not run ahead of the "id missing" error below, or the
      // error would never be visible.
      if (result.pair_id) {
        setSucceeded(true);
        onSaved(result);
        router.push(`/compare/${result.pair_id}`);
      } else {
        log.error("createCollectionPair returned no pair_id", result);
        setError({ message: "The pair was saved, but its id was missing — check the collections list." });
      }
    } catch (e) {
      if (e instanceof CollectionFromFilterError) {
        setError(e.status === 413 ? { title: t("compare.savePairTooLarge"), message: e.message } : { message: e.message });
      } else {
        setError({ message: e instanceof Error ? e.message : t("compare.savePairGenericError") });
      }
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("compare.savePairTitle")}</DialogTitle>
          <DialogDescription>{t("compare.savePairHint", { name: trimmedOrPlaceholder(name) })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="pair-name">{t("compare.savePairName")}</Label>
          <Input
            id="pair-name"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
          <p className="text-right font-mono text-[11px] text-ink-soft">
            {name.length}/{NAME_MAX_LENGTH}
          </p>
        </div>

        {error && (
          <div role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error.title && <p className="font-semibold">{error.title}</p>}
            <p>{error.message}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || succeeded || name.trim() === ""}>
            {saving ? t("compare.savePairSaving") : t("compare.savePair")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function trimmedOrPlaceholder(name: string): string {
  return name.trim() || "…";
}

export default SavePairDialog;
