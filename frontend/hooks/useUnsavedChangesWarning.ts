"use client";

import { useEffect } from "react";

/**
 * Hook to prevent page reload when there are unsaved changes
 * 
 * This hook handles browser reload/close via the beforeunload event.
 * It will show a confirmation dialog when the user tries to:
 * - Reload the page (F5, Cmd+R, Ctrl+R, etc.)
 * - Close the browser tab/window
 * - Navigate away from the page
 * 
 * Modern browsers will show their own confirmation dialog.
 * 
 * Note: For programmatic Next.js router navigation (router.push, etc.),
 * you should check hasUnsavedChanges before calling those methods in your components.
 * 
 * @param hasUnsavedChanges - Whether there are currently unsaved changes
 * @param message - Optional custom message (note: modern browsers ignore custom messages)
 */
export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message?: string
): void {
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers require returnValue to be set to a non-empty string
      // to show the confirmation dialog. They ignore custom messages and show their own.
      // This works for: page reload (F5, Cmd+R), closing tab/window, navigating away
      const confirmationMessage = message || "You have unsaved changes. Are you sure you want to leave?";
      
      // DEBUG: Log when beforeunload is triggered
      console.log('[useUnsavedChangesWarning] beforeunload triggered, showing confirmation dialog');
      
      // Call preventDefault to prevent the default action
      e.preventDefault();
      
      // Set returnValue to trigger the browser's confirmation dialog
      // Modern browsers will show their own generic message, but we still need to set this
      e.returnValue = confirmationMessage;
      
      // Return the value (required for some browsers)
      return confirmationMessage;
    };

    // DEBUG: Log when event listener is attached
    console.log('[useUnsavedChangesWarning] Attaching beforeunload listener, hasUnsavedChanges:', hasUnsavedChanges);

    // Add event listener for beforeunload (catches reload, close, navigation)
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // DEBUG: Log when event listener is removed
      console.log('[useUnsavedChangesWarning] Removing beforeunload listener');
      // Clean up event listener when component unmounts or hasUnsavedChanges becomes false
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message]);
}

