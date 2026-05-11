"use client";

import { FC, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SearchDocument } from "@/types/search";
import {
  COLLECTION_EXPORT_COLUMNS,
  buildCollectionExportRows,
  buildExportFilename,
  flattenDocumentForExport,
} from "@/lib/collection-export";
import { exportToCSV, exportToXLSX, type ExportFormat } from "@/lib/file-export";
import logger from "@/lib/logger";

interface CollectionDocumentsTableProps {
  documents: SearchDocument[];
  collectionName: string;
  searchQuery?: string;
  className?: string;
}

const MAX_CELL_PREVIEW = 240;

function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const str = typeof value === "string" ? value : String(value);
  if (str.length <= MAX_CELL_PREVIEW) return str;
  return `${str.slice(0, MAX_CELL_PREVIEW)}…`;
}

const CollectionDocumentsTable: FC<CollectionDocumentsTableProps> = ({
  documents,
  collectionName,
  searchQuery = "",
  className,
}) => {
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const rows = useMemo(
    () => documents.map((doc) => ({ doc, row: flattenDocumentForExport(doc) })),
    [documents]
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(({ row }) =>
      COLLECTION_EXPORT_COLUMNS.some((col) => {
        const value = row[col.key];
        if (value === null || value === undefined || value === "") return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [rows, searchQuery]);

  const handleExport = async (format: ExportFormat): Promise<void> => {
    setIsExporting(format);
    try {
      // Export always uses the full document set, ignoring the in-table filter.
      const exportRows = buildCollectionExportRows(documents);
      if (exportRows.length === 0) {
        toast.warning("Nothing to export — collection is empty");
        return;
      }
      const filename = buildExportFilename(collectionName);
      if (format === "xlsx") {
        await exportToXLSX(exportRows, filename, collectionName);
      } else {
        exportToCSV(exportRows, filename);
      }
      toast.success(`Exported ${exportRows.length} documents as ${format.toUpperCase()}`);
    } catch (error) {
      logger.error("Failed to export collection", error, {
        format,
        documentCount: documents.length,
      });
      toast.error("Failed to export collection");
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {searchQuery
            ? `Showing ${filteredRows.length} of ${rows.length} documents`
            : `${rows.length} ${rows.length === 1 ? "document" : "documents"}`}
          <span className="ml-2 text-xs">
            — exports the full collection ({rows.length}), not the filtered view
          </span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="sm"
              disabled={rows.length === 0 || isExporting !== null}
              className="shrink-0"
            >
              {isExporting !== null ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Download as</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleExport("xlsx")}
              disabled={isExporting !== null}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport("csv")}
              disabled={isExporting !== null}
            >
              <FileText className="h-4 w-4 mr-2" />
              CSV (.csv)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={cn(
          "rounded-lg border border-[var(--rule)] bg-white shadow-sm",
          "overflow-x-auto overflow-y-auto max-h-[70vh]"
        )}
      >
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--parchment-deep)] sticky top-0 z-10">
            <tr>
              {COLLECTION_EXPORT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-left font-semibold text-[var(--ink)]",
                    "border-b border-[var(--rule)] whitespace-nowrap"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLLECTION_EXPORT_COLUMNS.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {searchQuery
                    ? `No documents match "${searchQuery}".`
                    : "No documents in this collection."}
                </td>
              </tr>
            ) : (
              filteredRows.map(({ doc, row }, idx) => (
                <tr
                  key={`${doc.document_id}-${idx}`}
                  className={cn(
                    "border-b border-[var(--rule)] last:border-b-0",
                    idx % 2 === 1 && "bg-[var(--parchment)]/40"
                  )}
                >
                  {COLLECTION_EXPORT_COLUMNS.map((col) => {
                    const value = row[col.key];
                    const display = previewValue(value);
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2 align-top whitespace-pre-wrap break-words",
                          "max-w-[320px] text-[var(--ink-soft)]"
                        )}
                        title={
                          typeof value === "string" && value.length > MAX_CELL_PREVIEW
                            ? value
                            : undefined
                        }
                      >
                        {display || <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CollectionDocumentsTable;
