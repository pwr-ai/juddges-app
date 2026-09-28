"use client";

import { useState } from "react";
import { toast } from "sonner";

import { EditorialButton } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { downloadCompareCsv } from "@/lib/compare/api";
import type { CompareRequest } from "@/lib/compare/types";
import logger from "@/lib/logger";

const log = logger.child("CompareExport");

/** CSV export of the current comparison + copy-permalink. */
export function ExportMenu({ request, permalink }: { request: CompareRequest; permalink: string }) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCompareCsv(request);
    } catch (error) {
      log.error("CSV export failed", error);
      toast.error(t("compare.loadError"));
    } finally {
      setExporting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(permalink);
      toast.success(t("compare.linkCopied"));
    } catch (error) {
      log.error("Copy link failed", error);
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      <EditorialButton variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting}>
        {t("compare.exportCsv")}
      </EditorialButton>
      <EditorialButton variant="secondary" size="sm" onClick={() => void copyLink()}>
        {t("compare.copyLink")}
      </EditorialButton>
    </div>
  );
}
