/**
 * Schema Status Selector Component
 * Interactive dropdown to change schema lifecycle status
 * Only visible to schema owners
 */

"use client";

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { SchemaStatus } from '@/types/extraction_schemas';
import { FileText, Globe, Eye, Archive, ChevronDown, Check, Lock } from 'lucide-react';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from './badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/**
 * Props for SchemaStatusSelector component
 */
export interface SchemaStatusSelectorProps {
 /** Current schema status value */
 status: SchemaStatus;
 /** Whether the current user is the owner of the schema */
 isOwner: boolean;
 /** Callback when status changes */
 onStatusChange?: (newStatus: SchemaStatus) => Promise<void>;
 /** Whether the status change is in progress */
 isLoading?: boolean;
 /** Whether the selector is disabled */
 disabled?: boolean;
 /** Optional className for additional styling */
 className?: string;
 /** Size variant */
 size?: 'sm' | 'md';
}

interface StatusConfig {
 label: string;
 description: string;
 icon: React.ComponentType<{ className?: string }>;
 className: string;
 badgeClassName: string;
}

const statusConfig: Record<SchemaStatus, StatusConfig> = {
 draft: {
 label: 'Draft',
 description: 'Work in progress, only visible to you',
 icon: FileText,
 className: 'text-yellow-700',
 badgeClassName: 'bg-yellow-50 border-yellow-200 text-yellow-700',
 },
 published: {
 label: 'Published',
 description: 'Active and visible to all users',
 icon: Globe,
 className: 'text-emerald-700',
 badgeClassName: 'bg-emerald-50 border-emerald-200 text-emerald-700',
 },
 review: {
 label: 'In Review',
 description: 'Pending approval from experts',
 icon: Eye,
 className: 'text-blue-700',
 badgeClassName: 'bg-blue-50 border-blue-200 text-blue-700',
 },
 archived: {
 label: 'Archived',
 description: 'Deprecated, no longer in active use',
 icon: Archive,
 className: 'text-gray-600',
 badgeClassName: 'bg-gray-50 border-gray-200 text-gray-600',
 },
};

const statusOrder: SchemaStatus[] = ['draft', 'review', 'published', 'archived'];

/**
 * Schema Status Selector Component
 *
 * Interactive dropdown for changing schema lifecycle status.
 * Only owners can change status; non-owners see a read-only badge.
 *
 * Status lifecycle:
 * - draft: Work in progress
 * - review: Pending approval
 * - published: Active and public
 * - archived: Deprecated
 *
 * @example
 * ```tsx
 * <SchemaStatusSelector
 * status="draft"
 * isOwner={true}
 * onStatusChange={async (status) => { await updateStatus(status); }}
 * />
 * ```
 */
export function SchemaStatusSelector({
 status,
 isOwner,
 onStatusChange,
 isLoading = false,
 disabled = false,
 className,
 size = 'sm',
}: SchemaStatusSelectorProps): React.JSX.Element {
 const [isOpen, setIsOpen] = useState(false);
 const config = statusConfig[status];
 const Icon = config.icon;

 const handleStatusChange = async (newStatus: SchemaStatus) => {
 if (newStatus === status || !onStatusChange) return;
 setIsOpen(false);
 await onStatusChange(newStatus);
 };

 // Non-owners see a read-only badge with lock indicator
 if (!isOwner) {
 return (
 <Tooltip>
 <TooltipTrigger asChild>
 <Badge
 variant="outline"
 className={cn(
 'inline-flex items-center gap-1.5',
 'backdrop-blur-sm cursor-default',
 config.badgeClassName,
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
 <Lock className={cn(
 'opacity-50',
 size === 'sm' && 'h-2.5 w-2.5',
 size === 'md' && 'h-3 w-3'
 )} />
 </Badge>
 </TooltipTrigger>
 <TooltipContent>
 Only the schema owner can change status
 </TooltipContent>
 </Tooltip>
 );
 }

 // Owners see an interactive dropdown
 return (
 <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
 <DropdownMenuTrigger asChild disabled={disabled || isLoading}>
 <button
 className={cn(
 'inline-flex items-center gap-1.5',
 'backdrop-blur-sm',
 'border rounded-md',
 'transition-all duration-200',
 'focus:outline-none focus:ring-2 focus:ring-offset-1',
 'focus:ring-blue-500/50',
 config.badgeClassName,
 size === 'sm' && 'text-xs px-2 py-0.5',
 size === 'md' && 'text-sm px-2.5 py-1',
 !disabled && !isLoading && 'hover:opacity-80 cursor-pointer',
 (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
 className
 )}
 >
 <Icon className={cn(
 size === 'sm' && 'h-3 w-3',
 size === 'md' && 'h-3.5 w-3.5',
 isLoading && 'animate-pulse'
 )} />
 <span>{isLoading ? 'Updating...' : config.label}</span>
 <ChevronDown className={cn(
 'transition-transform duration-200',
 isOpen && 'rotate-180',
 size === 'sm' && 'h-3 w-3',
 size === 'md' && 'h-3.5 w-3.5'
 )} />
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="start"className="w-56">
 {statusOrder.map((statusOption) => {
 const optionConfig = statusConfig[statusOption];
 const OptionIcon = optionConfig.icon;
 const isSelected = statusOption === status;

 return (
 <DropdownMenuItem
 key={statusOption}
 onClick={() => handleStatusChange(statusOption)}
 className={cn(
 'flex items-center gap-3 py-2 cursor-pointer',
 isSelected && 'bg-accent'
 )}
 >
 <OptionIcon className={cn('h-4 w-4', optionConfig.className)} />
 <div className="flex flex-col flex-1">
 <span className={cn(
 'font-medium',
 optionConfig.className
 )}>
 {optionConfig.label}
 </span>
 <span className="text-xs text-muted-foreground">
 {optionConfig.description}
 </span>
 </div>
 {isSelected && (
 <Check className="h-4 w-4 text-primary"/>
 )}
 </DropdownMenuItem>
 );
 })}
 </DropdownMenuContent>
 </DropdownMenu>
 );
}
