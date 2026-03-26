/**
 * Delete Confirmation Dialog Component
 * Reusable dialog component for confirming destructive actions
 * Follows design system standards and uses reusable button components
 */

"use client";

import React, { useEffect, useCallback } from 'react';
import {
 Dialog,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogPortal,
 DialogOverlay,
} from '@/components/ui/dialog';
import { SecondaryButton } from './secondary-button';
import { DeleteButton } from './delete-button';
import { IconButton } from './icon-button';
import { cn } from '@/lib/utils';
import { AlertTriangle, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * Props for DeleteConfirmationDialog component
 */
export interface DeleteConfirmationDialogProps {
 /** Whether the dialog is open */
 open: boolean;
 /** Callback when dialog open state changes */
 onOpenChange: (open: boolean) => void;
 /** Title of the dialog */
 title?: string;
 /** Description text */
 description?: string;
 /** Item name being deleted (for more specific messaging) */
 itemName?: string;
 /** Title/name of the specific item being deleted (e.g., chat title) */
 itemTitle?: string;
 /** Whether deletion is in progress */
 isDeleting?: boolean;
 /** Callback when delete is confirmed */
 onConfirm: () => void | Promise<void>;
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Delete Confirmation Dialog Component
 *
 * A reusable dialog component for confirming destructive actions.
 * Uses design system components and follows accessibility guidelines.
 *
 * @example
 * ```tsx
 * <DeleteConfirmationDialog
 * open={isOpen}
 * onOpenChange={setIsOpen}
 * title="Delete Chat"
 * description="Are you sure you want to delete this chat? "
 * onConfirm={handleDelete}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <DeleteConfirmationDialog
 * open={isOpen}
 * onOpenChange={setIsOpen}
 * itemName="chat"
 * isDeleting={isDeleting}
 * onConfirm={handleDelete}
 * />
 * ```
 */
export function DeleteConfirmationDialog({
 open,
 onOpenChange,
 title ="Delete Item",
 description,
 itemName,
 itemTitle,
 isDeleting = false,
 onConfirm,
 className,
}: DeleteConfirmationDialogProps): React.JSX.Element {
 // Build natural, human-friendly description
 const buildDescription = (): string => {
 if (description) {
 return description;
 }

 const itemType = itemName || 'item';
 if (itemTitle) {
 // When we have a title, we'll add it separately with highlighting
 return `Are you sure you want to delete the ${itemType}?`;
 }

 return `Are you sure you want to delete this ${itemType}? This action cannot be undone.`;
 };

 const finalDescription = buildDescription();

 const handleConfirm = useCallback(async () => {
 if (isDeleting) {
 return;
 }
 await onConfirm();
 }, [isDeleting, onConfirm]);

 // Handle Enter key to confirm delete
 useEffect(() => {
 if (!open) return;

 const handleKeyDown = (e: KeyboardEvent): void => {
 if (e.key === 'Enter' && !isDeleting) {
 e.preventDefault();
 handleConfirm();
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => {
 window.removeEventListener('keydown', handleKeyDown);
 };
 }, [open, isDeleting, handleConfirm]);

 return (
 <Dialog
 open={open}
 onOpenChange={(newOpen) => {
 // Only allow closing if not currently deleting
 if (!isDeleting) {
 onOpenChange(newOpen);
 }
 }}
 >
 <DialogPortal>
 <DialogOverlay />
 <DialogPrimitive.Content
 className={cn(
 // Base styles
"bg-background",
 // Animations
"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
 // Layout
"fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl p-6 duration-200 sm:max-w-[425px]",
 // Border - following design system: slate-200/50 (light), slate-800/50 (dark, standard opacity /50)
"border border-slate-200/50",
 // Shadow - following design system: shadow-2xl with primary accent for dialogs
"shadow-2xl shadow-primary/10",
 className
 )}
 onInteractOutside={(e) => {
 // Prevent closing when clicking outside during deletion
 if (isDeleting) {
 e.preventDefault();
 }
 }}
 onEscapeKeyDown={(e) => {
 // Prevent closing with Escape during deletion
 if (isDeleting) {
 e.preventDefault();
 }
 }}
 >
 {/* Custom close button using reusable IconButton */}
 <DialogPrimitive.Close asChild>
 <IconButton
 icon={X}
 onClick={() => {
 if (!isDeleting) {
 onOpenChange(false);
 }
 }}
 disabled={isDeleting}
 variant="muted"
 size="md"
 aria-label="Close"
 className="absolute top-4 right-4 z-50 !h-10 !w-10 !p-2"
 />
 </DialogPrimitive.Close>
 <DialogHeader className="space-y-4">
 <div className="flex items-center gap-3">
 {/* Warning icon container - following design system: red-50 (special case), red-900/50 (dark, standard opacity) */}
 <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 border border-red-200/50">
 {/* Icon color - following design system: red-600 (light), red-400 (dark - 400 shade) */}
 <AlertTriangle className="h-5 w-5 text-red-600"/>
 </div>
 <DialogTitle className="text-left text-lg font-semibold">{title}</DialogTitle>
 </div>
 <DialogDescription className="text-left space-y-2 text-foreground/80 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
 {itemTitle ? (
 <>
 Are you sure you want to{' '}
 <span className="font-semibold">delete</span>
 {' '}the {itemName || 'item'}{' '}
 <span className="font-semibold text-black">
 &quot;{itemTitle}&quot;
 </span>
 ?
 </>
 ) : (
 finalDescription
 )}
 </DialogDescription>
 </DialogHeader>
 <DialogFooter>
 <SecondaryButton
 type="button"
 disabled={isDeleting}
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 onOpenChange(false);
 }}
 >
 Cancel
 </SecondaryButton>
 <DeleteButton
 type="button"
 disabled={isDeleting}
 isLoading={isDeleting}
 onClick={async (e) => {
 e?.preventDefault();
 e?.stopPropagation();
 await handleConfirm();
 }}
 className="min-w-[80px]"
 >
 {isDeleting ? "Deleting...": "Delete"}
 </DeleteButton>
 </DialogFooter>
 </DialogPrimitive.Content>
 </DialogPortal>
 </Dialog>
 );
}
