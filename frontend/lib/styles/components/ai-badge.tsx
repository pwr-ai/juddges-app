/**
 * AI Badge Component
 * The single AI-provenance marker in Editorial Jurisprudence:
 * gold ✦ + mono "AI" eyebrow.
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for AIBadge component
 */
export interface AIBadgeProps {
  /** Badge text (default: "AI") */
  text?: string;
  /** @deprecated Kept for backward compatibility */
  iconType?: "sparkles" | "lightning";
  /** @deprecated Kept for backward compatibility */
  icon?: React.ComponentType<{ className?: string }>;
  /** @deprecated Kept for backward compatibility */
  size?: "sm" | "md";
  /** Optional className for additional styling */
  className?: string;
}

/**
 * AI Badge Component
 * Single AI-provenance marker: gold ✦ + mono eyebrow.
 */
export function AIBadge({
  text = "AI",
  className,
}: AIBadgeProps): React.JSX.Element {
  return (
    <span
      data-ai-badge
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] font-medium tracking-wider uppercase text-ink-soft select-none",
        className
      )}
    >
      <span className="text-gold" aria-hidden="true">✦</span>
      <span>{text}</span>
    </span>
  );
}
