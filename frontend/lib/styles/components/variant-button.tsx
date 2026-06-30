/**
 * Unified variant button (#144).
 *
 * The six bespoke button components (Accent/Text/Glass/Primary/Secondary/Icon)
 * are being collapsed into this single `intent`-driven component. Styling comes
 * from the shared builders in `button-variants.ts`; this file owns the render
 * shape (icon placement, Link-vs-button, loading) per intent. Variants are
 * migrated one at a time — each migration adds its `intent` branch here,
 * codemods that variant's call sites, and deletes the old wrapper file.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  accentButtonSizes,
  accentButtonBase,
  textButtonClassName,
} from './button-variants';

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

type TextProps = {
  intent: "text";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  icon?: React.ComponentType<{ className?: string }>;
  iconPosition?: "left" | "right";
};

export type VariantButtonProps = AccentProps | TextProps;

function renderAccent(props: AccentProps): React.JSX.Element {
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

function renderText(props: TextProps): React.JSX.Element {
  const {
    children,
    onClick,
    className,
    disabled = false,
    type = "button",
    icon: Icon,
    iconPosition = "left",
  } = props;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={textButtonClassName(disabled, className)}
    >
      {Icon && iconPosition === "left" && (
        <Icon className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-200" />
      )}
      <span>{children}</span>
      {Icon && iconPosition === "right" && (
        <Icon className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
      )}
    </button>
  );
}

export function VariantButton(props: VariantButtonProps): React.JSX.Element {
  switch (props.intent) {
    case "text":
      return renderText(props);
    case "accent":
    default:
      return renderAccent(props);
  }
}
