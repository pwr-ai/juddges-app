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
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  accentButtonSizes,
  accentButtonBase,
  textButtonClassName,
  glassButtonClassName,
  primaryButtonClassName,
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

type GlassProps = {
  intent: "glass";
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  variant?: "blue" | "white";
};

type PrimaryProps = {
  intent: "primary";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  icon?: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  loadingText?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Accepted for compatibility; currently a no-op (matches VariantButton). */
  enhancedActive?: boolean;
  href?: string;
};

export type VariantButtonProps = AccentProps | TextProps | GlassProps | PrimaryProps;

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

function renderGlass(props: GlassProps): React.JSX.Element {
  const {
    children,
    onClick,
    disabled = false,
    isLoading = false,
    className,
    type = "button",
    variant = "blue",
  } = props;
  const isWhite = variant === "white";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={glassButtonClassName(isWhite, className)}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function renderPrimary(props: PrimaryProps): React.JSX.Element {
  const {
    children,
    onClick,
    className,
    disabled = false,
    type = "button",
    icon: Icon,
    isLoading = false,
    loadingText,
    size = "md",
    href,
  } = props;

  const isDisabled = disabled || isLoading;
  const isExtractionButton =
    typeof children === "string" && children.includes("Start Extraction");
  const commonClasses = primaryButtonClassName(
    size,
    isDisabled,
    isExtractionButton,
    className,
  );

  const content = (
    <>
      {isLoading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
          {loadingText && <span>{loadingText}</span>}
        </>
      ) : (
        <>
          {Icon && <Icon className="h-4 w-4 mr-2" />}
          <span>{children}</span>
        </>
      )}
    </>
  );

  if (href && !isDisabled) {
    return (
      <Link href={href} className={commonClasses}>
        {content}
      </Link>
    );
  }

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={commonClasses}
    >
      {content}
    </Button>
  );
}

export function VariantButton(props: VariantButtonProps): React.JSX.Element {
  switch (props.intent) {
    case "text":
      return renderText(props);
    case "glass":
      return renderGlass(props);
    case "primary":
      return renderPrimary(props);
    case "accent":
    default:
      return renderAccent(props);
  }
}
