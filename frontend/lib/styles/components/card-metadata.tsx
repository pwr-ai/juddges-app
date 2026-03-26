import React from 'react';
import { Calendar, Scale, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CardMetadataProps {
  /** Date issued */
  dateIssued?: string | null;
  /** Court name */
  courtName?: string | null;
  /** Presiding judge */
  presidingJudge?: string | null;
  /** Optional className for the container */
  className?: string;
  /** Optional background color function */
  getMetadataBackground?: () => string;
  /** Format date function */
  formatDate?: (dateString: string | null) => string | null;
  /** Format court name function */
  formatCourtName?: (courtName: string) => string;
}

/**
 * CardMetadata Component
 *
 * A reusable component for displaying document metadata in cards.
 * Shows date issued, court name, and presiding judge with icons.
 *
 * @example
 * ```tsx
 * <CardMetadata
 *   dateIssued="2021-04-13"
 *   courtName="Crown Court"
 *   presidingJudge="Judge Smith"
 * />
 * ```
 */
export function CardMetadata({
  dateIssued,
  courtName,
  presidingJudge,
  className,
  getMetadataBackground,
  formatDate,
  formatCourtName,
}: CardMetadataProps): React.JSX.Element | null {
  const defaultFormatDate = (dateString: string | null): string | null => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const defaultFormatCourtName = (name: string): string => {
    return name;
  };

  const formatDateFn = formatDate || defaultFormatDate;
  const formatCourtNameFn = formatCourtName || defaultFormatCourtName;
  const backgroundClass = getMetadataBackground ? getMetadataBackground() : 'bg-background/50 border-border';

  if (!dateIssued && !courtName && !presidingJudge) {
    return null;
  }

  return (
    <div className={cn("space-y-2 text-xs rounded-lg p-3 border shadow-sm", backgroundClass, className)}>
      {dateIssued && (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Date Issued: </span>
            <span className="font-medium text-xs">{formatDateFn(dateIssued)}</span>
          </div>
        </div>
      )}
      {courtName && (
        <div className="flex items-start gap-2">
          <Scale className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">Court: </span>
            <span className="font-medium text-xs break-words">{formatCourtNameFn(courtName)}</span>
          </div>
        </div>
      )}
      {presidingJudge && (
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">Presiding Judge: </span>
            <span className="font-medium text-xs break-words">{presidingJudge}</span>
          </div>
        </div>
      )}
    </div>
  );
}
