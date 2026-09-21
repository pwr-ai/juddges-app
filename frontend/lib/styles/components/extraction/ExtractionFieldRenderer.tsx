/**
 * Extraction Field Renderer Component
 * Renders individual fields from extraction data with proper formatting
 */

"use client";

import React from "react";
import { DocumentFieldCard, Badge, ItemHeader } from "@/lib/styles/components";
import { formatFieldValue, detectValueType, getFieldLabel, getBooleanLabel } from "@/utils/extraction-data-utils";
import { cn } from "@/lib/utils";

interface ExtractionFieldRendererProps {
 fieldKey: string;
 value: any;
 label?: string;
 className?: string;
 language?: 'pl' | 'en';
}

export function ExtractionFieldRenderer({
 fieldKey,
 value,
 label,
 className,
 language = 'pl',
}: ExtractionFieldRendererProps) {
 const fieldLabel = label || getFieldLabel(fieldKey);
 const fieldType = detectValueType(value);

  // Handle null/undefined
  if (value === null || value === undefined) {
    return (
      <DocumentFieldCard className={className}>
        <div className="flex-1">
          <ItemHeader title={fieldLabel} className="mb-1" />
          <p className="text-sm text-ink-soft italic">—</p>
        </div>
      </DocumentFieldCard>
    );
  }

  // Handle boolean
  if (fieldType === 'boolean') {
    return (
      <DocumentFieldCard className={className}>
        <div className="flex-1">
          <ItemHeader title={fieldLabel} className="mb-3" />
          <Badge
            variant="outline"
            className={cn(
              "rounded-none px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
              value
                ? "border-rule bg-parchment-deep text-ink"
                : "border-rule bg-parchment-deep text-oxblood"
            )}
          >
            {getBooleanLabel(value, language)}
          </Badge>
        </div>
      </DocumentFieldCard>
    );
  }

  // Handle string
  if (fieldType === 'string') {
    return (
      <DocumentFieldCard className={className}>
        <div className="flex-1">
          <ItemHeader title={fieldLabel} className="mb-3" />
          <p className="text-sm text-ink whitespace-pre-wrap break-words leading-relaxed">{value}</p>
        </div>
      </DocumentFieldCard>
    );
  }

  // Handle number
  if (fieldType === 'number') {
    const formattedValue = formatFieldValue(value, 'number');

    return (
      <DocumentFieldCard className={className}>
        <div className="flex-1">
          <ItemHeader title={fieldLabel} className="mb-3" />
          <p className="text-sm font-medium text-ink font-mono tabular-nums">{formattedValue}</p>
        </div>
      </DocumentFieldCard>
    );
  }

  // Handle date
  if (fieldType === 'date') {
    return (
      <DocumentFieldCard className={className}>
        <div className="flex-1">
          <ItemHeader title={fieldLabel} className="mb-3" />
          <p className="text-sm text-ink font-mono">{formatFieldValue(value, 'date')}</p>
        </div>
      </DocumentFieldCard>
    );
  }

  // Default fallback
  return (
    <DocumentFieldCard className={className}>
      <div className="flex-1">
        <ItemHeader title={fieldLabel} className="mb-3" />
        <p className="text-sm text-ink">{String(value)}</p>
      </div>
    </DocumentFieldCard>
  );
}
