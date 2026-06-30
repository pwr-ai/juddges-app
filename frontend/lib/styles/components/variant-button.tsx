/**
 * Unified variant button (#144).
 *
 * The six bespoke button components (Accent/Text/Glass/Primary/Secondary/Icon)
 * are being collapsed into this single `intent`-driven component. Styling comes
 * from the shared builders in `button-variants.ts`; this file owns the render
 * shape (icon placement, Link-vs-button, loading) per intent. Variants are
 * migrated one at a time — each migration adds its `intent` branch here, codemods
 * that variant's call sites, and deletes the old wrapper file.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { accentButtonSizes, accentButtonBase } from './button-variants';

type AccentProps = {
  intent: "accent";
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  icon?: React.ComponentType<{ className?: string }>;
  size?: "sm" | "md" | "lg";
};

export type VariantButtonProps = AccentProps;

export function VariantButton(props: VariantButtonProps): React.JSX.Element {
  // ── accent ────────────────────────────────────────────────────────────
  const {
    children,
    onClick,
    className,
    disabled = false,
    type = "button",
    icon: Icon,
    size = "sm",
  } = props;

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant="outline"
      className={cn(accentButtonSizes[size], accentButtonBase, className)}
    >
      {Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />}
      {children}
    </Button>
  );
}
