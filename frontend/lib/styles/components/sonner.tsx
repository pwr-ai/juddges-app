"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

/**
 * Sonner Toaster Component
 *
 * Global toast notification system with iOS-style stacking.
 * Configured for top-right positioning with expand mode enabled.
 */
export function SonnerToaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // Enable iOS-style stacking
      expand={false}
      // Maximum visible toasts for stacking
      visibleToasts={5}
      // Position: top-right
      position="top-right"
      // Offset from viewport edges
      offset={16}
      // Toast options
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: "font-sans",
          title: "text-sm font-semibold",
          description: "text-sm opacity-90",
          actionButton: "font-medium",
          cancelButton: "font-medium",
        },
      }}
      richColors={false}
      closeButton={false}
      {...props}
    />
  );
}
