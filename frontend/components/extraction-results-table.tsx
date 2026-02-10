"use client";

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
  Check,
  XCircle,
  ExternalLink,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = "xlsx" | "csv" | "json";

export interface ExportOptions {
  /** Whether to show the export button */
  enabled?: boolean;
  /** Base filename (without extension) */
  filename?: string;
  /** Available export formats */
  formats?: ExportFormat[];
  /** Whether to export only filtered/sorted data or all data */
  exportFiltered?: boolean;
}

export interface ExtractionResultsTableProps {
  columns: string[];
  rows: Array<{
    document_id: string;
    status: string;
    data: Record<string, unknown>;
  }>;
  pageSize?: number;
  pageSizeOptions?: number[];
  onDocumentClick?: (documentId: string) => void;
  onRowClick?: (row: { document_id: string; status: string; data: Record<string, unknown> }) => void;
  className?: string;
  emptyMessage?: string;
  /** Export configuration */
  exportOptions?: ExportOptions;
}

type SortDirection = "asc" | "desc" | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

// ============================================================================
// Value Formatters
// ============================================================================

/**
 * Formats boolean values with emojis
 */
function formatBoolean(value: boolean): React.ReactNode {
  return value ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
      <Check className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Yes</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
      <XCircle className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">No</span>
    </span>
  );
}

/**
 * Generates a consistent color for a label based on hash
 */
function getLabelColor(value: string): string {
  const colors = [
    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700",
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-700",
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-700",
    "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200 dark:border-pink-700",
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700",
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700",
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
    "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-700",
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-700",
  ];

  const hash = value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * Formats enum/label values as badges
 */
function formatLabel(value: string): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        getLabelColor(value)
      )}
    >
      {value}
    </span>
  );
}

/**
 * Detects if a value looks like an enum/label
 */
function isEnumLike(value: string): boolean {
  if (value.length > 30 || value.length < 2) return false;
  // All uppercase with underscores (e.g., "PENDING", "IN_PROGRESS")
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return true;
  // PascalCase (e.g., "Completed", "InProgress")
  if (/^[A-Z][a-zA-Z0-9]*$/.test(value) && value.length <= 20) return true;
  // snake_case (e.g., "in_progress")
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(value) && value.length <= 20) return true;
  return false;
}

/**
 * Formats a cell value based on its type
 */
function formatCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400 dark:text-slate-500 italic">-</span>;
  }

  if (typeof value === "boolean") {
    return formatBoolean(value);
  }

  if (typeof value === "number") {
    return <span className="font-mono tabular-nums">{value.toLocaleString()}</span>;
  }

  if (typeof value === "string") {
    // Check for boolean strings
    const lowerValue = value.toLowerCase();
    if (lowerValue === "true" || lowerValue === "tak" || lowerValue === "yes") {
      return formatBoolean(true);
    }
    if (lowerValue === "false" || lowerValue === "nie" || lowerValue === "no") {
      return formatBoolean(false);
    }

    // Check for enum-like values
    if (isEnumLike(value)) {
      return formatLabel(value);
    }

    // Regular string - preserve whitespace and wrap
    return <span className="whitespace-pre-wrap break-words">{value}</span>;
  }

  // For arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400 dark:text-slate-500 italic">Empty list</span>;
    }
    // Check if it's an array of simple values that could be labels
    if (value.every(v => typeof v === "string" && isEnumLike(v))) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <React.Fragment key={i}>{formatLabel(v)}</React.Fragment>
          ))}
        </div>
      );
    }
    return (
      <span className="font-mono text-xs whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </span>
    );
  }

  // For objects
  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </span>
    );
  }

  return String(value);
}

// ============================================================================
// Export Utilities
// ============================================================================

type TableRow = {
  document_id: string;
  status: string;
  data: Record<string, unknown>;
};

/**
 * Prepares table data for export - flattens to simple key-value pairs
 */
function prepareExportData(
  rows: TableRow[],
  columns: string[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const exportRow: Record<string, unknown> = {
      document_id: row.document_id,
    };

    columns.forEach((col) => {
      const value = row.data[col];
      // Convert complex values to strings for export
      if (value === null || value === undefined) {
        exportRow[col] = "";
      } else if (typeof value === "object") {
        exportRow[col] = JSON.stringify(value);
      } else {
        exportRow[col] = value;
      }
    });

    return exportRow;
  });
}

/**
 * Downloads a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Exports data to XLSX format
 */
function exportToXLSX(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = "Data"
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-fit column widths
  const colWidths = Object.keys(data[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] || "").length)
    );
    return { wch: Math.min(maxLength + 2, 60) };
  });
  worksheet["!cols"] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(blob, `${filename}.xlsx`);
}

/**
 * Exports data to CSV format
 */
function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));

  // Data rows
  data.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '""';
      const strValue = String(value).replace(/"/g, '""');
      return `"${strValue}"`;
    });
    csvRows.push(values.join(","));
  });

  const csvContent = csvRows.join("\n");
  // Add UTF-8 BOM for Excel compatibility
  const blob = new Blob(["\ufeff" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Exports data to JSON format
 */
function exportToJSON(data: Record<string, unknown>[], filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], {
    type: "application/json;charset=utf-8;",
  });

  downloadBlob(blob, `${filename}.json`);
}

// ============================================================================
// Sub-components
// ============================================================================

interface ColumnFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function ColumnFilter({ value, onChange, placeholder = "Filter..." }: ColumnFilterProps) {
  return (
    <div className="relative mt-1.5">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
      />
      {value && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>per page</span>
      </div>

      <div className="text-sm text-slate-600 dark:text-slate-400">
        {totalItems > 0 ? (
          <>
            Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{startItem}</span> to{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{endItem}</span> of{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalItems}</span> results
          </>
        ) : (
          "No results"
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 mx-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  "min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors",
                  currentPage === pageNum
                    ? "bg-blue-600 text-white shadow-sm"
                    : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                )}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ExportDropdownProps {
  formats: ExportFormat[];
  onExport: (format: ExportFormat) => void;
  isExporting: boolean;
  itemCount: number;
}

function ExportDropdown({ formats, onExport, isExporting, itemCount }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formatIcons: Record<ExportFormat, React.ReactNode> = {
    xlsx: <FileSpreadsheet className="h-4 w-4" />,
    csv: <FileText className="h-4 w-4" />,
    json: <FileJson className="h-4 w-4" />,
  };

  const formatLabels: Record<ExportFormat, string> = {
    xlsx: "Excel (.xlsx)",
    csv: "CSV (.csv)",
    json: "JSON (.json)",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting || itemCount === 0}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border transition-colors",
          "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600",
          "hover:bg-slate-50 dark:hover:bg-slate-700",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        )}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>{isExporting ? "Exporting..." : `Export (${itemCount})`}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown menu */}
          <div className="absolute right-0 mt-1 w-48 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg z-50">
            {formats.map((format) => (
              <button
                key={format}
                onClick={() => {
                  onExport(format);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {formatIcons[format]}
                <span>{formatLabels[format]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ExtractionResultsTable({
  columns,
  rows,
  pageSize: initialPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  onDocumentClick,
  onRowClick,
  className,
  emptyMessage = "No extraction results available",
  exportOptions = {},
}: ExtractionResultsTableProps) {
  // Merge export options with defaults
  const {
    enabled: exportEnabled = true,
    filename: exportFilename = `export-${new Date().toISOString().split("T")[0]}`,
    formats: exportFormats = ["xlsx", "csv", "json"],
    exportFiltered = true,
  } = exportOptions;

  // State
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [isExporting, setIsExporting] = useState(false);

  // All columns including document_id
  const allColumns = useMemo(() => ["document_id", ...columns], [columns]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return Object.entries(filters).every(([key, filterValue]) => {
        if (!filterValue) return true;

        let cellValue: unknown;
        if (key === "document_id") {
          cellValue = row.document_id;
        } else {
          cellValue = row.data[key];
        }

        if (cellValue === null || cellValue === undefined) return false;
        return String(cellValue).toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  }, [rows, filters]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortState.column || !sortState.direction) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      let aVal: unknown;
      let bVal: unknown;

      if (sortState.column === "document_id") {
        aVal = a.document_id;
        bVal = b.document_id;
      } else {
        aVal = a.data[sortState.column!];
        bVal = b.data[sortState.column!];
      }

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
        comparison = aVal === bVal ? 0 : aVal ? -1 : 1;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortState.direction === "desc" ? -comparison : comparison;
    });
  }, [filteredRows, sortState]);

  // Paginate rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  // Handlers
  const handleSort = useCallback((columnKey: string) => {
    setSortState((prev) => {
      if (prev.column !== columnKey) {
        return { column: columnKey, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column: columnKey, direction: "desc" };
      }
      return { column: null, direction: null };
    });
  }, []);

  const handleFilterChange = useCallback((columnKey: string, value: string) => {
    setFilters((prev) => ({ ...prev, [columnKey]: value }));
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Export handler
  const handleExport = useCallback(
    (format: ExportFormat) => {
      setIsExporting(true);

      try {
        // Choose which data to export: filtered/sorted or all
        const dataToExport = exportFiltered ? sortedRows : rows;
        const exportData = prepareExportData(dataToExport, columns);

        if (exportData.length === 0) {
          return;
        }

        switch (format) {
          case "xlsx":
            exportToXLSX(exportData, exportFilename, "Extraction Results");
            break;
          case "csv":
            exportToCSV(exportData, exportFilename);
            break;
          case "json":
            exportToJSON(exportData, exportFilename);
            break;
        }
      } finally {
        // Small delay to show the loading state
        setTimeout(() => setIsExporting(false), 500);
      }
    },
    [sortedRows, rows, columns, exportFilename, exportFiltered]
  );

  // Render sort icon
  const renderSortIcon = (columnKey: string) => {
    if (sortState.column !== columnKey) {
      return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }
    return sortState.direction === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
    );
  };

  return (
    <div className={cn("border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900", className)}>
      {/* Toolbar with export */}
      {exportEnabled && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {sortedRows.length} {sortedRows.length === 1 ? "result" : "results"}
            {Object.values(filters).some(Boolean) && (
              <span className="ml-1 text-blue-600 dark:text-blue-400">(filtered)</span>
            )}
          </div>
          <ExportDropdown
            formats={exportFormats}
            onExport={handleExport}
            isExporting={isExporting}
            itemCount={exportFiltered ? sortedRows.length : rows.length}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-100 dark:bg-slate-800">
              {allColumns.map((column, colIndex) => {
                const isDocId = column === "document_id";
                return (
                  <th
                    key={column}
                    className={cn(
                      "text-left p-3 font-semibold text-xs uppercase tracking-wide",
                      "border-b-2 border-slate-200 dark:border-slate-600",
                      "border-r border-slate-200 dark:border-slate-700 last:border-r-0",
                      isDocId && "sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 min-w-[200px]",
                      !isDocId && colIndex % 2 === 0 && "bg-slate-50 dark:bg-slate-800/70"
                    )}
                    style={{ minWidth: isDocId ? "200px" : "150px" }}
                  >
                    <div className="space-y-1">
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
                        onClick={() => handleSort(column)}
                      >
                        <span>{isDocId ? "Document ID" : column}</span>
                        {renderSortIcon(column)}
                      </div>
                      <ColumnFilter
                        value={filters[column] || ""}
                        onChange={(value) => handleFilterChange(column, value)}
                        placeholder={`Filter...`}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="text-center py-16 text-slate-500 dark:text-slate-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <tr
                  key={row.document_id || rowIndex}
                  className={cn(
                    "border-b border-slate-100 dark:border-slate-800 last:border-b-0",
                    "transition-colors",
                    rowIndex % 2 === 1 && "bg-slate-50/70 dark:bg-slate-800/40",
                    "hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  )}
                >
                  {allColumns.map((column, colIndex) => {
                    const isDocId = column === "document_id";
                    const value = isDocId ? row.document_id : row.data[column];

                    return (
                      <td
                        key={column}
                        className={cn(
                          "p-3 align-top text-sm",
                          "border-r border-slate-100 dark:border-slate-800 last:border-r-0",
                          isDocId && "sticky left-0 z-10 bg-white dark:bg-slate-900 font-mono text-xs",
                          isDocId && rowIndex % 2 === 1 && "bg-slate-50/70 dark:bg-slate-800/40",
                          !isDocId && colIndex % 2 === 0 && "bg-slate-50/30 dark:bg-slate-800/20",
                          !isDocId && colIndex % 2 === 0 && rowIndex % 2 === 1 && "bg-slate-100/50 dark:bg-slate-800/50"
                        )}
                        onClick={isDocId ? undefined : () => onRowClick?.(row)}
                      >
                        {isDocId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDocumentClick?.(row.document_id);
                            }}
                            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors group"
                          >
                            <span className="break-all text-left">{row.document_id}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          formatCellValue(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={sortedRows.length}
        pageSizeOptions={pageSizeOptions}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}

export default ExtractionResultsTable;
