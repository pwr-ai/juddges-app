import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorialPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  totalItems?: number;
  itemsPerPage?: number;
  itemLabel?: string;
}

/**
 * Editorial pagination control — sharp borders, mono page numbers, and subtle rule dividers.
 * Replaces redundant rounded slate pagination blocks across collections and documents.
 */
export function EditorialPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  totalItems,
  itemsPerPage,
  itemLabel = "items",
}: EditorialPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex flex-col items-center gap-3 mt-8", className)}>
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-xs font-mono border transition-colors",
            currentPage === 1
              ? "border-rule/50 text-ink-soft/40 cursor-not-allowed"
              : "border-rule text-ink hover:border-rule-strong hover:bg-parchment-deep"
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Prev</span>
        </button>

        <div className="flex items-center gap-1 mx-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              if (page === 1 || page === totalPages) return true;
              if (Math.abs(page - currentPage) <= 1) return true;
              return false;
            })
            .map((page, index, arr) => {
              const prevPage = arr[index - 1];
              const showEllipsis = prevPage && page - prevPage > 1;

              return (
                <React.Fragment key={page}>
                  {showEllipsis && (
                    <span className="px-1.5 font-mono text-xs text-ink-soft">…</span>
                  )}
                  <button
                    onClick={() => onPageChange(page)}
                    className={cn(
                      "w-8 h-8 text-xs font-mono border transition-colors",
                      currentPage === page
                        ? "bg-ink text-parchment border-ink font-semibold"
                        : "border-rule text-ink hover:border-rule-strong hover:bg-parchment-deep"
                    )}
                    aria-label={`Page ${page}`}
                    aria-current={currentPage === page ? "page" : undefined}
                  >
                    {page}
                  </button>
                </React.Fragment>
              );
            })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-xs font-mono border transition-colors",
            currentPage === totalPages
              ? "border-rule/50 text-ink-soft/40 cursor-not-allowed"
              : "border-rule text-ink hover:border-rule-strong hover:bg-parchment-deep"
          )}
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {totalItems !== undefined && itemsPerPage !== undefined && (
        <div className="font-mono text-xs text-ink-soft">
          Showing {((currentPage - 1) * itemsPerPage) + 1}–
          {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} {itemLabel}
        </div>
      )}
    </div>
  );
}

export default EditorialPagination;
