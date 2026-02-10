/**
 * SearchPagination Component
 * Wrapper around the reusable Pagination component for backward compatibility
 * with search-specific default page size options
 */

"use client";

import { Pagination, PaginationProps } from "@/lib/styles/components";

interface SearchPaginationProps extends Omit<PaginationProps, 'pageSizeOptions'> {
  pageSizeOptions?: number[];
}

export function SearchPagination({
  pageSizeOptions = [10, 20, 50],
  ...props
}: SearchPaginationProps) {
  return (
    <Pagination
      {...props}
      pageSizeOptions={pageSizeOptions}
    />
  );
}