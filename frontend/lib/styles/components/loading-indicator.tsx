"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, LucideIcon } from "lucide-react";

export type LoadingIndicatorVariant = "inline" | "centered" | "fullscreen";
export type LoadingIndicatorSize = "sm" | "md" | "lg";

export interface LoadingIndicatorProps {
  /**
   * Main loading message text
   */
  message: string;
  /**
   * Optional subtitle text (shown below main message)
   */
  subtitle?: string;
  /**
   * Optional icon to display next to subtitle
   */
  subtitleIcon?: LucideIcon;
  /**
   * Optional logo element to display above the loader (for centered/fullscreen variants)
   */
  logo?: React.ReactNode;
  /**
   * Whether to show the loading spinner/circle
   * @default true
   */
  showLoader?: boolean;
  /**
   * Variant of the loading indicator
   * - "inline": Horizontal layout, fits inline with content
   * - "centered": Vertical layout, centered in container
   * - "fullscreen": Full screen overlay
   * @default "inline"
   */
  variant?: LoadingIndicatorVariant;
  /**
   * Size of the loader
   * @default "sm"
   */
  size?: LoadingIndicatorSize;
  /**
   * Additional className for the container
   */
  className?: string;
  /**
   * Additional className for the container card
   */
  containerClassName?: string;
  /**
   * If true, makes the background transparent (removes card's default background)
   * Useful for inline usage where the background should blend with the parent
   * @default false
   */
  transparentBackground?: boolean;
}

/**
 * Loading Indicator
 * Universal loading indicator component following Editorial Jurisprudence styling.
 */
export function LoadingIndicator({
  message,
  subtitle,
  subtitleIcon: SubtitleIcon,
  logo,
  showLoader = true,
  variant = "inline",
  size = "sm",
  className,
  containerClassName,
  transparentBackground = false,
}: LoadingIndicatorProps): React.JSX.Element {
  const isInline = variant === "inline";
  const isCentered = variant === "centered";
  const isFullscreen = variant === "fullscreen";

  const iconSizeClass = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4";

  // Container wrapper classes based on variant
  const wrapperClasses = cn(
    "relative",
    isInline && "w-fit mx-auto",
    isCentered && "w-full flex items-center justify-center",
    isFullscreen && "fixed inset-0 flex items-center justify-center z-50",
    className
  );

  // Padding based on variant
  const containerPadding = cn(
    isInline && "px-4 py-2.5",
    isCentered && "p-6",
    isFullscreen && "p-8"
  );

  // Layout direction based on variant
  const layoutDirection = cn(
    "flex items-center gap-3",
    isInline && "flex-row",
    (isCentered || isFullscreen) && "flex-col gap-4"
  );

  return (
    <div className={wrapperClasses}>
      {isFullscreen && (
        <div className="absolute inset-0 bg-background/80 -z-10" />
      )}

      <div className={cn("relative", isFullscreen && "z-10")}>
        <div className={cn(
          "relative overflow-hidden",
          transparentBackground ? "" : "bg-card border border-rule shadow-sm",
          containerPadding,
          transparentBackground && [
            "!bg-transparent",
            "!border-0",
            "!shadow-none",
            "!overflow-visible",
          ],
          containerClassName
        )}>
          <div className="relative z-10">
            <div className={layoutDirection}>
              {logo && (isCentered || isFullscreen) && (
                <div className="flex items-center justify-center">
                  {logo}
                </div>
              )}

              {showLoader && (
                <div className="flex items-center justify-center">
                  <Loader2 className={cn("animate-spin text-ink", iconSizeClass)} />
                </div>
              )}

              <div className={cn(
                isInline ? "" : "space-y-1 text-center"
              )}>
                {isInline ? (
                  <span className="font-medium text-sm text-ink">
                    {message}
                  </span>
                ) : (
                  <p className="font-medium text-base text-ink">
                    {message}
                  </p>
                )}

                {subtitle && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-ink-soft">
                    {SubtitleIcon && (
                      <SubtitleIcon className="h-3.5 w-3.5 text-ink-soft" />
                    )}
                    <span>{subtitle}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
