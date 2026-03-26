/**
 * Data Table Component
 * Modern table component following 2024/2025 design standards
 * Features glass-morphism, subtle gradients, and enhanced accessibility
 *
 * @version 1.0
 * @date 2025-01-XX
 */

"use client";

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T = any> {
 /**
 * Unique key for the column
 */
 key: string;
 /**
 * Column header label
 */
 header: string;
 /**
 * Function to render cell content
 */
 cell: (row: T, index: number) => React.ReactNode;
 /**
 * Optional column width class (e.g.,"w-32","min-w-48")
 */
 width?: string;
 /**
 * Whether column is sortable
 */
 sortable?: boolean;
}

export interface DataTableProps<T = any> {
 /**
 * Array of data rows
 */
 data: T[];
 /**
 * Column definitions
 */
 columns: DataTableColumn<T>[];
 /**
 * Optional table title
 */
 title?: string;
 /**
 * Optional description
 */
 description?: string;
 /**
 * Optional className for the table container
 */
 className?: string;
 /**
 * Optional row key function (defaults to index)
 */
 getRowKey?: (row: T, index: number) => string;
 /**
 * Optional row click handler
 */
 onRowClick?: (row: T, index: number) => void;
 /**
 * Whether rows are clickable
 */
 clickableRows?: boolean;
 /**
 * Optional empty state message
 */
 emptyMessage?: string;
 /**
 * Optional empty state icon
 */
 emptyIcon?: React.ReactNode;
}

/**
 * Data Table Component
 *
 * Modern table with glass-morphism design, following 2024/2025 standards.
 * Features subtle gradients, smooth hover effects, and full accessibility support.
 *
 * @example
 * <DataTable
 * data={users}
 * columns={[
 * { key: 'name', header: 'Name', cell: (row) => row.name },
 * { key: 'email', header: 'Email', cell: (row) => row.email },
 * ]}
 * title="Users"
 * description="List of all users"
 * />
 */
export const DataTable = memo(function DataTable<T = any>({
 data,
 columns,
 title,
 description,
 className,
 getRowKey,
 onRowClick,
 clickableRows = false,
 emptyMessage ="No data available",
 emptyIcon,
}: DataTableProps<T>) {
 const getKey = getRowKey || ((_, index) => `row-${index}`);

 if (data.length === 0) {
 return (
 <div className={cn("p-6", className)}>
 {title && (
 <div className="mb-4">
 <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
 {description && (
 <p className="text-sm text-slate-600">{description}</p>
 )}
 </div>
 )}
 <div className="flex flex-col items-center justify-center py-12 text-center">
 {emptyIcon && <div className="mb-4 text-slate-400">{emptyIcon}</div>}
 <p className="text-sm text-slate-600">{emptyMessage}</p>
 </div>
 </div>
 );
 }

 const isInteractive = clickableRows || !!onRowClick;

 return (
 <div className={cn("overflow-hidden", className)}>
 {(title || description) && (
 <div className="mb-6 px-6 pt-6">
 {title && (
 <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
 )}
 {description && (
 <p className="text-sm text-slate-600">{description}</p>
 )}
 </div>
 )}

 <div className="overflow-x-auto">
 <div className="inline-block min-w-full align-middle">
 <table className="w-full border-collapse">
 <thead>
 <tr className="border-b border-slate-200 bg-slate-100/50">
 {columns.map((column) => {
 const isIdColumn = column.width?.includes('w-16') || /^id$|_id$|_number$|question_number/i.test(column.key);

 return (
 <th
 key={column.key}
 className={cn(
 isIdColumn ? "px-2 py-3": "px-4 py-3",
"text-left text-xs font-semibold uppercase tracking-wider",
"text-slate-700",
 isIdColumn &&"w-16 text-center",
 column.width
 )}
 scope="col"
 >
 {column.header}
 </th>
 );
 })}
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-200/60">
 {data.map((row, rowIndex) => {
 const rowKey = getKey(row, rowIndex);
 const handleRowClick = onRowClick ? () => onRowClick(row, rowIndex) : undefined;

 return (
 <tr
 key={rowKey}
 onClick={handleRowClick}
 className={cn(
"transition-colors duration-150",
 isInteractive && [
"cursor-pointer",
"hover:bg-slate-50",
"focus-within:bg-slate-50",
"focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-inset",
 ]
 )}
 role={isInteractive ? "button": undefined}
 tabIndex={isInteractive ? 0 : undefined}
 onKeyDown={isInteractive && handleRowClick ? (e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleRowClick();
 }
 } : undefined}
 aria-label={isInteractive ? `Row ${rowIndex + 1}` : undefined}
 >
 {columns.map((column) => {
 const cellContent = column.cell(row, rowIndex);
 const isArrayColumn = /legal_basis|legal_basis|basis/i.test(column.key);
 const isIdColumn = column.width?.includes('w-16') || /^id$|_id$|_number$|question_number/i.test(column.key);

 return (
 <td
 key={`${rowKey}-${column.key}`}
 className={cn(
 isIdColumn ? "px-2 py-3": isArrayColumn ? "px-3 py-2": "px-4 py-3",
"text-sm",
"text-slate-900",
"whitespace-normal break-words",
 isIdColumn ? "w-16 text-center": isArrayColumn ? "max-w-xs": "max-w-md",
 column.width
 )}
 >
 {cellContent}
 </td>
 );
 })}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
}) as <T = any>(props: DataTableProps<T>) => React.JSX.Element;
