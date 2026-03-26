'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface LegalReferenceBadgeProps {
  /** The legal reference text to display */
  text: string;
  /** Optional className for additional styling */
  className?: string;
  /** Optional variant - defaults to "secondary" */
  variant?: 'default' | 'secondary' | 'outline';
}

/**
 * Legal Reference Badge Component
 *
 * A standalone badge component for displaying legal references that properly wraps
 * long text instead of truncating. Designed for legal citations and references.
 * Built from scratch to ensure text wrapping works correctly.
 *
 * @example
 * ```tsx
 * <LegalReferenceBadge text="Ustawa z dnia 17 listopada 1964 r. - Kodeks postępowania cywilnego" />
 * ```
 *
 * @example
 * ```tsx
 * <div className="flex flex-wrap gap-2">
 *   {references.map((ref, idx) => (
 *     <LegalReferenceBadge key={idx} text={ref.text || ref} />
 *   ))}
 * </div>
 * ```
 */
export function LegalReferenceBadge({
  text,
  className,
  variant = 'secondary',
}: LegalReferenceBadgeProps): React.JSX.Element {
  // Inject global styles on mount
  useEffect(() => {
    const styleId = 'legal-reference-badge-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [data-slot="legal-reference-badge"] {
          display: inline-flex !important;
          align-items: center !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          max-width: 100% !important;
          height: auto !important;
          min-height: 1.5rem !important;
          min-width: 0 !important;
          width: fit-content !important;
          flex-shrink: 1 !important;
          flex-grow: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    maxWidth: '100%',
    height: 'auto',
    minHeight: '1.5rem',
    minWidth: 0,
    width: 'fit-content',
    flexShrink: 1,
    flexGrow: 0,
  };

  const variantStyles = {
    default: {
      borderColor: 'transparent',
      backgroundColor: 'hsl(var(--primary))',
      color: 'hsl(var(--primary-foreground))',
    },
    secondary: {
      backgroundColor: 'rgba(226, 232, 240, 0.6)',
      borderColor: 'rgba(226, 232, 240, 0.3)',
    },
    outline: {
      borderColor: 'rgba(226, 232, 240, 0.5)',
      color: 'inherit',
    },
  };

  const darkVariantStyles = {
    default: {},
    secondary: {
      backgroundColor: 'rgba(30, 41, 59, 0.6)',
      borderColor: 'rgba(30, 41, 59, 0.3)',
    },
    outline: {
      borderColor: 'rgba(30, 41, 59, 0.5)',
    },
  };

  return (
    <div
      data-slot="legal-reference-badge"
      className={cn(
        'rounded-md',
        'border',
        'px-2',
        'py-0.5',
        'text-xs',
        'font-medium',
        'transition-all duration-300',
        'backdrop-blur-sm',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-primary',
        'focus-visible:ring-offset-2',
        className
      )}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
      } as React.CSSProperties}
    >
      {text}
    </div>
  );
}

export interface LegalReferenceChipProps {
  /** The legal reference text to display */
  text: string;
  /** Optional className for additional styling */
  className?: string;
  /** Optional variant - defaults to "secondary" */
  variant?: 'default' | 'secondary' | 'outline';
}

/**
 * Legal Reference Chip Component
 *
 * A component for displaying legal references that wraps text properly.
 * Uses inline-block display instead of inline-flex for better wrapping behavior
 * in flex containers. Maintains similar visual styling to LegalReferenceBadge.
 *
 * @example
 * ```tsx
 * <LegalReferenceChip text="Ustawa z dnia 17 listopada 1964 r. - Kodeks postępowania cywilnego" />
 * ```
 *
 * @example
 * ```tsx
 * <div className="flex flex-wrap gap-2">
 *   {references.map((ref, idx) => (
 *     <LegalReferenceChip key={idx} text={ref.text || ref} />
 *   ))}
 * </div>
 * ```
 */
export function LegalReferenceChip({
  text,
  className,
  variant = 'secondary',
}: LegalReferenceChipProps): React.JSX.Element {
  // Inject global styles on mount to ensure proper wrapping
  useEffect(() => {
    const styleId = 'legal-reference-chip-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [data-slot="legal-reference-chip"] {
          display: inline-block !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          max-width: 100% !important;
          min-width: 0 !important;
          width: auto !important;
          height: auto !important;
          flex-shrink: 1 !important;
          flex-grow: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const baseStyles: React.CSSProperties = {
    display: 'inline-block',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    maxWidth: '100%',
    minWidth: 0,
    height: 'auto',
    minHeight: '1.5rem',
    flexShrink: 1,
  };

  const variantStyles = {
    default: {
      borderColor: 'transparent',
      backgroundColor: 'hsl(var(--primary))',
      color: 'hsl(var(--primary-foreground))',
    },
    secondary: {
      backgroundColor: 'rgba(226, 232, 240, 0.6)',
      borderColor: 'rgba(226, 232, 240, 0.3)',
    },
    outline: {
      borderColor: 'rgba(226, 232, 240, 0.5)',
      color: 'inherit',
    },
  };

  const darkVariantStyles = {
    default: {},
    secondary: {
      backgroundColor: 'rgba(30, 41, 59, 0.6)',
      borderColor: 'rgba(30, 41, 59, 0.3)',
    },
    outline: {
      borderColor: 'rgba(30, 41, 59, 0.5)',
    },
  };

  return (
    <span
      data-slot="legal-reference-chip"
      className={cn(
        'rounded-md',
        'border',
        'px-2',
        'py-0.5',
        'text-xs',
        'font-medium',
        'transition-all duration-300',
        'backdrop-blur-sm',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-primary',
        'focus-visible:ring-offset-2',
        className
      )}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
      } as React.CSSProperties}
    >
      {text}
    </span>
  );
}
