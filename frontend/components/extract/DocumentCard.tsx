"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentCardProps {
  id: string;
  document_id: string;
  document_date: string;
  volume_number: number;
  title?: string;
  summary?: string;
  reference?: string;
  selected: boolean;
  onToggle: () => void;
}

export function DocumentCard({
  id,
  document_id,
  document_date,
  volume_number,
  title,
  summary,
  reference,
  selected,
  onToggle,
}: DocumentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Generate default title if not provided
  const displayTitle = title || `Case ${volume_number}`;

  // Generate default summary if not provided
  const displaySummary = summary || "No summary available for this document.";

  // Format reference number
  const displayReference = reference || document_id;

  // For the collapsed state, we'll use CSS line-clamp
  const summaryClasses = isExpanded
    ? "text-sm text-muted-foreground whitespace-pre-wrap"
    : "text-sm text-muted-foreground line-clamp-3";

  return (
    <Card
      className="hover:bg-muted/50 transition-colors cursor-pointer group"
      onClick={(e) => {
        // Don't toggle if clicking on the checkbox or expand button
        if (!(e.target as HTMLElement).closest('[data-no-toggle]')) {
          onToggle();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div data-no-toggle onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              className="mt-1"
            />
          </div>

          {/* Document Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header with title and badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold truncate">
                  {displayTitle}
                </h3>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                Legal Document
              </Badge>
            </div>

            {/* Reference and Date */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <span className="font-mono">{displayReference}</span>
              </div>
              {document_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(document_date).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Summary with expandable text */}
            {displaySummary && (
              <div className="space-y-1">
                <p className={summaryClasses}>
                  {displaySummary}
                </p>

                {/* Show expand/collapse button only if summary is long enough */}
                {displaySummary.length > 150 && (
                  <div data-no-toggle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 -ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Show more
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
