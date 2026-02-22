import { cn } from '@/lib/utils';

interface TableSkeletonProps {
  /**
   * Number of rows to display
   * @default 5
   */
  rows?: number;

  /**
   * Number of columns to display
   * @default 4
   */
  columns?: number;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Show table header
   * @default true
   */
  showHeader?: boolean;
}

/**
 * TableSkeleton - Table loading skeleton
 *
 * Displays a placeholder table structure with animated rows and columns.
 * Used for data tables, judgment lists, and tabular data displays.
 *
 * @example
 * ```tsx
 * <TableSkeleton />
 * <TableSkeleton rows={10} columns={6} />
 * ```
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
  showHeader = true
}: TableSkeletonProps) {
  return (
    <div
      className={cn("w-full", className)}
      role="status"
      aria-label="Loading table"
    >
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          {showHeader && (
            <thead className="bg-muted/50">
              <tr>
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="p-4">
                    <div
                      className="h-4 bg-muted rounded animate-pulse"
                      style={{ width: `${60 + Math.random() * 40}%` }}
                      aria-hidden="true"
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="p-4">
                    <div
                      className="h-4 bg-muted rounded animate-pulse"
                      style={{ width: `${50 + Math.random() * 50}%` }}
                      aria-hidden="true"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading table data...</span>
    </div>
  );
}
