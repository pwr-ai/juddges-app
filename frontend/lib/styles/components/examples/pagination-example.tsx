/**
 * Pagination Component Example
 *
 * This file demonstrates how to use the Pagination component
 * in various scenarios with different configurations.
 */

"use client";

import React, { useState } from 'react';
import { Pagination } from '../pagination';

/**
 * Basic Pagination Example
 * Shows standard pagination with all features enabled
 */
export function BasicPaginationExample(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalResults = 247;
  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Basic Pagination</h3>
      <p className="text-sm text-muted-foreground">
        Standard pagination with all features enabled
      </p>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalResults={totalResults}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1); // Reset to first page when changing page size
        }}
      />
    </div>
  );
}

/**
 * Without Page Size Selector
 * Shows pagination without the page size dropdown
 */
export function SimplePaginationExample(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Simple Pagination</h3>
      <p className="text-sm text-muted-foreground">
        Pagination without page size selector
      </p>

      <Pagination
        currentPage={currentPage}
        totalPages={10}
        totalResults={100}
        pageSize={10}
        onPageChange={setCurrentPage}
        onPageSizeChange={() => {}}
        showPageSizeSelector={false}
      />
    </div>
  );
}

/**
 * Custom Page Size Options
 * Shows pagination with custom page size options
 */
export function CustomPageSizeExample(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const totalResults = 487;
  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Custom Page Size Options</h3>
      <p className="text-sm text-muted-foreground">
        Pagination with custom page size options (5, 10, 25, 50)
      </p>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalResults={totalResults}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        pageSizeOptions={[5, 10, 25, 50]}
      />
    </div>
  );
}

/**
 * Large Result Set
 * Shows pagination with many pages (demonstrates ellipsis)
 */
export function LargePaginationExample(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(15);
  const [pageSize, setPageSize] = useState(20);

  const totalResults = 5420;
  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Large Result Set</h3>
      <p className="text-sm text-muted-foreground">
        Pagination with many pages (271 total) - demonstrates smart ellipsis
      </p>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalResults={totalResults}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
      />
    </div>
  );
}

/**
 * With Custom Styling
 * Shows pagination with custom additional styling
 */
export function StyledPaginationExample(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalResults = 150;
  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Custom Styled Pagination</h3>
      <p className="text-sm text-muted-foreground">
        Pagination with custom additional styling (shadow-xl, my-8)
      </p>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalResults={totalResults}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        className="shadow-xl my-8"
      />
    </div>
  );
}

/**
 * All Examples Combined
 * Renders all pagination examples in a single component
 */
export function PaginationExamples(): React.JSX.Element {
  return (
    <div className="space-y-12 p-8">
      <div>
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-primary via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Pagination Component Examples
        </h2>
        <p className="text-muted-foreground mb-8">
          Interactive examples demonstrating various pagination configurations
        </p>
      </div>

      <BasicPaginationExample />
      <SimplePaginationExample />
      <CustomPageSizeExample />
      <LargePaginationExample />
      <StyledPaginationExample />
    </div>
  );
}

export default PaginationExamples;
