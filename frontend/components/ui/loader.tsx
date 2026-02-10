"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "secondary" | "ghost";
}

export function Loader({
  className,
  size = "md",
  variant = "default",
  ...props
}: LoaderProps) {
  return (
    <div
      aria-label="Loading"
      data-slot="loader"
      className={cn(
        "inline-flex items-center justify-center",
        {
          "h-4 w-4": size === "sm",
          "h-6 w-6": size === "md",
          "h-8 w-8": size === "lg",
          "text-primary": variant === "default",
          "text-secondary": variant === "secondary",
          "text-muted-foreground": variant === "ghost",
        },
        className
      )}
      {...props}
    >
      <div className="relative h-full w-full animate-spin">
        <div className="absolute h-full w-full rounded-full border-2 border-solid border-current opacity-20"></div>
        <div className="absolute h-full w-full rounded-full border-2 border-solid border-current border-r-transparent"></div>
      </div>
    </div>
  );
} 