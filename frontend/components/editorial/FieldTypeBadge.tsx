/**
 * Canonical FieldTypeBadge component for Editorial Jurisprudence (#640).
 * 14 px ink icon + mono label, outline, no fill.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { FIELD_TYPE_MARKERS, FieldType, FieldTypeMarker } from '@/types/schema-editor';
import { Calendar, CheckSquare, Link as LinkIcon, Type } from 'lucide-react';

const EXTENDED_MARKERS: Record<string, FieldTypeMarker> = {
  date: { icon: Calendar, label: 'DATE' },
  datetime: { icon: Calendar, label: 'DATETIME' },
  time: { icon: Calendar, label: 'TIME' },
  enum: { icon: CheckSquare, label: 'ENUM' },
  email: { icon: LinkIcon, label: 'EMAIL' },
  url: { icon: LinkIcon, label: 'URL' },
  text: { icon: Type, label: 'TEXT' },
  'yes/no': { icon: CheckSquare, label: 'BOOLEAN' },
};

export function getFieldMarker(type?: string | null): FieldTypeMarker {
  if (!type) return FIELD_TYPE_MARKERS.string;
  const normalized = type.toLowerCase().trim();
  if (normalized in FIELD_TYPE_MARKERS) {
    return FIELD_TYPE_MARKERS[normalized as FieldType];
  }
  if (normalized in EXTENDED_MARKERS) {
    return EXTENDED_MARKERS[normalized];
  }
  return { icon: Type, label: type.toUpperCase() };
}

export interface FieldTypeBadgeProps {
  type: string;
  isAiCreated?: boolean;
  className?: string;
  showIcon?: boolean;
}

export function FieldTypeBadge({
  type,
  isAiCreated = false,
  className,
  showIcon = true,
}: FieldTypeBadgeProps) {
  const marker = getFieldMarker(type);
  const Icon = marker.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-transparent font-mono text-xs uppercase',
        isAiCreated ? 'border-gold text-gold' : 'border-rule text-ink',
        className
      )}
    >
      {showIcon && <Icon className="size-3.5 shrink-0" />}
      <span>{marker.label}</span>
    </span>
  );
}
