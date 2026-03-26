/**
 * Success Toast Component
 * Reusable toast component for success notifications
 * Follows design system styling matching delete toast
 */

"use client";

import React from 'react';
// toast from 'sonner' automatically uses the SonnerToaster component when rendered
// This ensures all toasts use the glassmorphism styling and stacking configuration
import { toast } from 'sonner';
import { CheckCircle2, LucideIcon } from 'lucide-react';

export interface SuccessToastProps {
 /** Toast title */
 title: string;
 /** Toast description/message (can be string or ReactNode for complex formatting) */
 description: string | React.ReactNode;
 /** Primary action button configuration */
 primaryAction?: {
 label: string;
 onClick: () => void;
 };
 /** Secondary action button configuration */
 secondaryAction?: {
 label: string;
 onClick: () => void;
 };
 /** Optional icon component (defaults to CheckCircle2 for success, pass null to hide) */
 icon?: LucideIcon | null;
 /** Optional icon color classes (defaults to green for success) */
 iconClassName?: string;
 /** Optional duration in milliseconds */
 duration?: number;
 /** Optional callback when toast is dismissed */
 onDismiss?: () => void;
}

/**
 * Success Toast Component
 *
 * A reusable toast component for success notifications.
 * Uses design system styling matching the delete toast.
 *
 * @example
 * ```tsx
 * showSuccessToast({
 * title: "Success",
 * description: "Document saved to collection",
 * primaryAction: {
 * label: "View Collection",
 * onClick: () => router.push('/collections')
 * },
 * secondaryAction: {
 * label: "Start Extraction",
 * onClick: () => router.push('/extract')
 * }
 * });
 * ```
 */
export function showSuccessToast({
 title,
 description,
 primaryAction,
 secondaryAction,
 icon: Icon,
 iconClassName ="text-green-500",
 duration = 5000,
 onDismiss,
}: SuccessToastProps): string | number {
 // Default to CheckCircle2 if no icon is provided, but allow null to hide icon
 const DisplayIcon = Icon === null ? null : (Icon || CheckCircle2);

 // Track if the toast was dismissed by an action button (to prevent onDismiss from firing)
 // Using an object that can be shared across closures
 const dismissState = { dismissedByAction: false, timeoutFired: false };

 // Set up a timeout to call onDismiss after duration
 // This ensures onDismiss is called even if sonner's onDismiss doesn't fire for custom toasts
 let dismissTimeout: NodeJS.Timeout | null = null;
 if (onDismiss) {
 dismissTimeout = setTimeout(() => {
 if (!dismissState.dismissedByAction) {
 dismissState.timeoutFired = true;
 onDismiss();
 }
 }, duration);
 }

 // Wrap onDismiss to check if it was dismissed by action (fallback if sonner calls it)
 const wrappedOnDismiss = onDismiss ? () => {
 // Clear the timeout if sonner's onDismiss fires first
 if (dismissTimeout) {
 clearTimeout(dismissTimeout);
 }
 // Only call onDismiss if not dismissed by action and timeout hasn't fired yet
 if (!dismissState.dismissedByAction && !dismissState.timeoutFired) {
 onDismiss();
 }
 } : undefined;

 // Helper to handle action button clicks - clears timeout and marks as dismissed
 const handleActionClick = (actionFn: () => void, toastId: string | number) => {
 dismissState.dismissedByAction = true;
 if (dismissTimeout) {
 clearTimeout(dismissTimeout);
 }
 actionFn();
 toast.dismiss(toastId);
 };

 // Use Sonner's built-in toast.success function with default action buttons
 // Sonner supports ReactNode directly for description, so no conversion needed
 return toast.success(title, {
 description: description,
 icon: DisplayIcon ? <DisplayIcon className={iconClassName} /> : undefined,
 duration,
 onDismiss: wrappedOnDismiss,
 // Use primary action if available, otherwise secondary
 action: primaryAction ? {
 label: primaryAction.label,
 onClick: () => {
 dismissState.dismissedByAction = true;
 if (dismissTimeout) {
 clearTimeout(dismissTimeout);
 }
 primaryAction.onClick();
 },
 } : secondaryAction ? {
 label: secondaryAction.label,
 onClick: () => {
 dismissState.dismissedByAction = true;
 if (dismissTimeout) {
 clearTimeout(dismissTimeout);
 }
 secondaryAction.onClick();
 },
 } : undefined,
 });
}
