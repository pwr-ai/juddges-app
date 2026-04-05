/**
 * Schema Card Component
 * Reusable card component for displaying schema items in list/grid views
 */

"use client";

import React, { useState } from 'react';
import { Clock, Database, CheckCircle2, Calendar, Play, Eye, Trash2, Pencil, Copy, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BaseCard } from '../base-card';
import { SchemaStatusBadge, VerifiedBadge } from '../schema-status-badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../tooltip';
import { SecondaryButton } from '../secondary-button';
import { IconButton } from '../icon-button';
import { DeleteConfirmationDialog } from '../delete-confirmation-dialog';
import { ExtractionSchema, SchemaStatus } from '@/types/extraction_schemas';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logger } from "@/lib/logger";

/**
 * Props for SchemaCard component
 */
export interface SchemaCardProps {
 /** Schema data */
 schema: ExtractionSchema;
 /** View mode: 'list' or 'grid' */
 viewMode?: 'list' | 'grid';
 /** Click handler for the card */
 onClick?: () => void;
 /** Optional extraction count */
 extractionCount?: number;
 /** Optional className for additional styling */
 className?: string;
 /** Current user ID to determine ownership */
 currentUserId?: string;
 /** Callback when schema is deleted (to refresh the list) */
 onDelete?: () => void;
}

/**
 * Schema Card Component
 *
 * A reusable card component for displaying schemas with name, description,
 * field count, extraction usage, and status badges.
 */
export function SchemaCard({
 schema,
 viewMode = 'list',
 onClick,
 extractionCount = 0,
 className,
 currentUserId,
 onDelete,
}: SchemaCardProps): React.JSX.Element {
 const router = useRouter();
 const isListMode = viewMode === 'list';
 const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);

 // Check if schema is owned by current user
 const isUserSchema = currentUserId && schema.user_id === currentUserId;

 const handleStartExtraction = () => {
 router.push(`/extract?schema=${schema.id}`);
 };

 const handleViewDetails = () => {
 router.push(`/schemas/${schema.id}`);
 };

 const handleEdit = (e?: React.MouseEvent) => {
 e?.stopPropagation();
 router.push(`/schema-chat?schemaId=${schema.id}`);
 };

 const handleDuplicate = (e?: React.MouseEvent) => {
 e?.stopPropagation();
 router.push(`/schema-chat?schemaId=${schema.id}&duplicate=true`);
 };

 const handleDeleteClick = (e?: React.MouseEvent) => {
 e?.stopPropagation();
 setDeleteDialogOpen(true);
 };

 const handleDeleteConfirm = async () => {
 setIsDeleting(true);
 try {
 const response = await fetch(`/api/schemas?id=${schema.id}`, {
 method: 'DELETE',
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || 'Failed to delete schema');
 }

 toast.success('Schema deleted successfully');
 setDeleteDialogOpen(false);
 onDelete?.();
 } catch (error) {
 toast.error('Failed to delete schema', {
 description: error instanceof Error ? error.message : 'An error occurred',
 });
 } finally {
 setIsDeleting(false);
 }
 };

 // Calculate field count from schema text
 const getFieldCount = (): number => {
 if (schema.field_count !== undefined && schema.field_count > 0) {
 return schema.field_count;
 }
 try {
 if (schema.text && typeof schema.text === 'object') {
 if ('properties' in schema.text && typeof schema.text.properties === 'object' && schema.text.properties !== null) {
 const props = schema.text.properties as Record<string, unknown>;
 return Object.keys(props).length;
 }
 if (!('type' in schema.text) && !('$schema' in schema.text)) {
 return Object.keys(schema.text).length;
 }
 }
 } catch (error) {
 logger.warn('Failed to calculate field count:', error);
 }
 return 0;
 };

 const fieldCount = getFieldCount();

 const formatDate = (dateString: string) => {
 const date = new Date(dateString);
 return date.toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 });
 };

 const getInitials = (email: string) => {
 return email.substring(0, 2).toUpperCase();
 };

 const formatDateShort = (dateString: string) => {
 const date = new Date(dateString);
 const now = new Date();
 const diffTime = Math.abs(now.getTime() - date.getTime());
 const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

 // If less than 7 days ago, show relative time
 if (diffDays < 7) {
 if (diffDays === 0) return 'Today';
 if (diffDays === 1) return 'Yesterday';
 return `${diffDays}d ago`;
 }

 // If same year, show only month and day
 if (date.getFullYear() === now.getFullYear()) {
 return date.toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 });
 }

 // Otherwise show compact format: MMM DD, YY
 return date.toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: '2-digit',
 });
 };

 const ActionButtons = () => (
 <div
 className={cn(
"shrink-0 flex items-center justify-center -space-x-1",
"rounded-lg",
 // Enhanced glass effect - more visible blur
"bg-white/70",
"backdrop-blur-[24px] backdrop-saturate-[200%]",
"border border-white/40",
"transition-all duration-200"
 )}
 onClick={(e) => e.stopPropagation()}
 >
 <Tooltip>
 <TooltipTrigger asChild>
 <IconButton
 icon={Eye}
 onClick={handleViewDetails}
 size="lg"
 variant="muted"
 aria-label="View details"
 />
 </TooltipTrigger>
 <TooltipContent>Details</TooltipContent>
 </Tooltip>

 <Tooltip>
 <TooltipTrigger asChild>
 <IconButton
 icon={Play}
 onClick={handleStartExtraction}
 size="lg"
 variant="primary"
 aria-label="Start extraction"
 />
 </TooltipTrigger>
 <TooltipContent>Extraction</TooltipContent>
 </Tooltip>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <IconButton
 icon={MoreHorizontal}
 size="lg"
 variant="muted"
 aria-label="More actions"
 />
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end"className="w-48">
 {isUserSchema ? (
 <>
 <DropdownMenuItem onClick={handleEdit}>
 <Pencil className="mr-2 h-4 w-4"/>
 <span>Edit</span>
 </DropdownMenuItem>
 <DropdownMenuItem onClick={handleDuplicate}>
 <Copy className="mr-2 h-4 w-4"/>
 <span>Duplicate</span>
 </DropdownMenuItem>
 <DropdownMenuItem onClick={handleDeleteClick} className="text-red-600 focus:text-red-600">
 <Trash2 className="mr-2 h-4 w-4"/>
 <span>Delete</span>
 </DropdownMenuItem>
 </>
 ) : (
 <DropdownMenuItem onClick={handleDuplicate}>
 <Copy className="mr-2 h-4 w-4"/>
 <span>Duplicate</span>
 </DropdownMenuItem>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 );

 return (
 <BaseCard
 onClick={onClick}
 variant="light"
 className={cn(
"group relative rounded-[24px] transition-all duration-200 h-full",
 // Legal Glassmorphism 2.0 is applied by BaseCard with variant="light"
 // Remove any overrides that conflict with glass styling
 isListMode ? "w-full": "",
 className
 )}
 clickable={!!onClick}
 >
 <div className={cn(
"flex h-full",
 isListMode ? "flex-row gap-4 p-4": "flex-col px-3 pb-0 pt-1.5"
 )}>
 <div className={cn(
"flex flex-col",
 isListMode ? "flex-1 min-w-0": "w-full h-full"
 )}>

 {!isListMode ? (
 // GRID MODE LAYOUT
 <>
 {/* Author */}
 {schema.user?.email && (
 <div className="flex items-center gap-2 mb-2.5">
 <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-200">
 {getInitials(schema.user.email)}
 </div>
 <span className="text-xs text-slate-600 font-medium truncate">
 {schema.user.email}
 </span>
 </div>
 )}

 {/* Title with Status and Verified Badge */}
 <div className="mb-3">
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-slate-900 leading-tight group-hover:text-primary transition-colors tracking-tight text-base line-clamp-2 flex-1">
 {schema.name}
 </h3>
 <div className="flex items-center gap-1.5 shrink-0">
 {schema.status && (
 <SchemaStatusBadge status={schema.status} size="sm"/>
 )}
 {schema.is_verified && (
 <VerifiedBadge size="md"className="shrink-0"/>
 )}
 </div>
 </div>
 </div>

 {/* Metrics: Fields & Extractions */}
 <div className="flex items-center gap-6 text-xs text-slate-500 font-medium mb-4">
 <div className="flex items-center gap-1.5"title="Field Count">
 <Database className="h-3.5 w-3.5 opacity-60"/>
 <span>{fieldCount} {fieldCount === 1 ? 'Field' : 'Fields'}</span>
 </div>
 <div className="flex items-center gap-1.5"title="Extractions">
 <Play className="h-3.5 w-3.5 opacity-60"/>
 <span>{extractionCount} {extractionCount === 1 ? 'Extraction' : 'Extractions'}</span>
 </div>
 </div>

 {/* Description */}
 <div className="flex-1 mb-3">
 {schema.description ? (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <p className="text-sm text-slate-700 font-normal leading-relaxed cursor-default line-clamp-4">
 {schema.description}
 </p>
 </TooltipTrigger>
 <TooltipContent
 side="top"
 className="!w-[400px] !max-w-md p-4 text-sm"
 >
 <span className="block whitespace-normal break-words text-left">
 {schema.description}
 </span>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 ) : (
 <p className="text-sm text-slate-400 font-normal italic line-clamp-4 min-h-[5.6rem]">
 No description
 </p>
 )}
 </div>

 {/* Footer: Action Buttons */}
 <div className="mt-auto pt-0.5 border-t border-slate-100">
 <div className="flex justify-center">
 <ActionButtons />
 </div>
 </div>
 </>
 ) : (
 // LIST MODE LAYOUT (unchanged)
 <>
 {/* 2. Author */}
 {schema.user?.email && (
 <div className="flex items-center gap-2 mb-2">
 <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-200">
 {getInitials(schema.user.email)}
 </div>
 <span className="text-xs text-slate-600 font-medium truncate">
 {schema.user.email}
 </span>
 </div>
 )}

 {/* 3. Title with Status and Verified Badge */}
 <div className="flex items-center justify-between gap-2 mb-1">
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <h3 className="font-semibold text-slate-900 leading-tight group-hover:text-primary transition-colors tracking-tight text-sm line-clamp-2">
 {schema.name}
 </h3>
 <div className="flex items-center gap-1.5 shrink-0">
 {schema.status && (
 <SchemaStatusBadge status={schema.status} size="sm"/>
 )}
 {schema.is_verified && (
 <VerifiedBadge size="md"className="shrink-0"/>
 )}
 </div>
 </div>
 <ActionButtons />
 </div>

 {/* 4. Metadata Block: Created • Updated • Fields • Extractions */}
 <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mb-3">
 <div className="flex items-center gap-1.5"title={`Created: ${formatDateShort(schema.created_at)}`}>
 <Calendar className="h-3.5 w-3.5 opacity-60"/>
 <span>{formatDateShort(schema.created_at)}</span>
 </div>

 <span className="text-slate-300">•</span>

 <div className="flex items-center gap-1.5"title={`Updated: ${formatDateShort(schema.updated_at)}`}>
 <Clock className="h-3.5 w-3.5 opacity-60"/>
 <span>{formatDateShort(schema.updated_at)}</span>
 </div>

 <span className="text-slate-300">•</span>

 <div className="flex items-center gap-1.5"title="Field Count">
 <Database className="h-3.5 w-3.5 opacity-60"/>
 <span>{fieldCount} {fieldCount === 1 ? 'Field' : 'Fields'}</span>
 </div>

 <span className="text-slate-300">•</span>

 <div className="flex items-center gap-1.5"title="Extractions">
 <Play className="h-3.5 w-3.5 opacity-60"/>
 <span>{extractionCount} {extractionCount === 1 ? 'Extraction' : 'Extractions'}</span>
 </div>
 </div>

 {/* 5. Description */}
 <div className="mb-4">
 {schema.description ? (
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <p className="text-sm text-slate-700 font-normal leading-relaxed cursor-default line-clamp-2">
 {schema.description}
 </p>
 </TooltipTrigger>
 <TooltipContent
 side="top"
 className="!w-[400px] !max-w-md p-4 text-sm"
 >
 <span className="block whitespace-normal break-words text-left">
 {schema.description}
 </span>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 ) : (
 <p className="text-sm text-slate-400 font-normal italic line-clamp-2">
 No description
 </p>
 )}
 </div>
 </>
 )}

 {/* 6b. Stats for List mode only */}
 {isListMode && (
 <div className="flex items-center gap-4 text-xs text-slate-500 font-medium pt-2 border-t border-slate-100">
 <div className="flex items-center gap-1.5"title="Field Count">
 <Database className="h-3.5 w-3.5 opacity-60"/>
 <span>{fieldCount} {fieldCount === 1 ? 'Field' : 'Fields'}</span>
 </div>

 <div className="flex items-center gap-1.5"title="Extractions">
 <CheckCircle2 className="h-3.5 w-3.5 opacity-60"/>
 <span>{extractionCount} {extractionCount === 1 ? 'Extraction' : 'Extractions'}</span>
 </div>
 </div>
 )}

 </div>
 </div>

 {/* Delete Confirmation Dialog */}
 <DeleteConfirmationDialog
 open={deleteDialogOpen}
 onOpenChange={setDeleteDialogOpen}
 onConfirm={handleDeleteConfirm}
 isDeleting={isDeleting}
 title="Delete Schema"
 description={`Are you sure you want to delete"${schema.name}"? This action cannot be undone.`}
 />
 </BaseCard>
 );
}
