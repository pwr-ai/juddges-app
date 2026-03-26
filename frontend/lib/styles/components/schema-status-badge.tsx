/**
 * Schema Status Badge Component
 * Displays schema lifecycle status with color-coded badges
 */

"use client";

import React from 'react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';
import { SchemaStatus } from '@/types/extraction_schemas';
import { FileText, CheckCircle2, Eye, Archive, Globe } from 'lucide-react';

/**
 * Props for SchemaStatusBadge component
 */
export interface SchemaStatusBadgeProps {
 /** Schema status value */
 status: SchemaStatus;
 /** Optional className for additional styling */
 className?: string;
 /** Size variant */
 size?: 'sm' | 'md';
}

/**
 * Schema Status Badge Component
 *
 * Displays schema lifecycle status with appropriate color coding:
 * - draft: gray/yellow
 * - published: neutral gray
 * - review: blue
 * - archived: muted gray
 *
 * @example
 * ```tsx
 * <SchemaStatusBadge status="draft"/>
 * ```
 */
export function SchemaStatusBadge({
 status,
 className,
 size = 'sm',
}: SchemaStatusBadgeProps): React.JSX.Element {
 const statusConfig: Record<SchemaStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
 draft: {
 label: 'Draft',
 icon: FileText,
 className: 'bg-yellow-50 border-yellow-200 text-yellow-700',
 },
 published: {
 label: 'Published',
 icon: Globe,
 className: 'bg-gray-50 border-gray-200 text-gray-700',
 },
 review: {
 label: 'Review',
 icon: Eye,
 className: 'bg-blue-50 border-blue-200 text-blue-700',
 },
 archived: {
 label: 'Archived',
 icon: Archive,
 className: 'bg-gray-50 border-gray-200 text-gray-700',
 },
 };

 const config = statusConfig[status];
 const Icon = config.icon;

 return (
 <Badge
 variant="outline"
 className={cn(
 'inline-flex items-center gap-1.5',
 'backdrop-blur-sm',
 config.className,
 size === 'sm' && 'text-xs px-2 py-0.5',
 size === 'md' && 'text-sm px-2.5 py-1',
 className
 )}
 >
 <Icon className={cn(
 size === 'sm' && 'h-3 w-3',
 size === 'md' && 'h-3.5 w-3.5'
 )} />
 <span>{config.label}</span>
 </Badge>
 );
}

/**
 * Verified Badge Component
 * Displays a checkmark badge indicating field-expert approval
 */

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface VerifiedBadgeProps {
 /** Optional className for additional styling */
 className?: string;
 /** Size variant */
 size?: 'sm' | 'md' | 'lg';
}

/**
 * Verified Badge Component
 *
 * Displays a checkmark icon to indicate that a schema has been
 * approved by field experts. Shows"Expert verified"tooltip on hover.
 *
 * @example
 * ```tsx
 * <VerifiedBadge />
 * ```
 */
export function VerifiedBadge({
 className,
 size = 'lg',
}: VerifiedBadgeProps): React.JSX.Element {
 return (
 <Tooltip>
 <TooltipTrigger asChild>
 <div
 className={cn(
 'inline-flex items-center justify-center',
 'rounded-full',
 'transition-all duration-200',
 // Glass effect with emerald tint
 'bg-emerald-50/80',
 'backdrop-blur-[20px] backdrop-saturate-[180%]',
 'border border-emerald-200/60',
 'shadow-[0_2px_8px_rgba(16,185,129,0.15)]',
 // Hover effects
 'hover:scale-110',
 'hover:bg-emerald-100/90',
 'hover:border-emerald-300/80',
 'hover:shadow-[0_4px_12px_rgba(16,185,129,0.2)]',
 size === 'sm' && 'h-5 w-5',
 size === 'md' && 'h-6 w-6',
 size === 'lg' && 'h-7 w-7',
 className
 )}
 >
 <CheckCircle2 className={cn(
 'text-emerald-600',
 size === 'sm' && 'h-3 w-3',
 size === 'md' && 'h-4 w-4',
 size === 'lg' && 'h-5 w-5'
 )} />
 </div>
 </TooltipTrigger>
 <TooltipContent side="right">
 Expert verified
 </TooltipContent>
 </Tooltip>
 );
}
