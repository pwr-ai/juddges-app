import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  /** Trailing arrow icon. */
  arrow?: boolean;
  /** Loading state — disables the button. */
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface ButtonProps
  extends BaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  href?: undefined;
}

interface LinkButtonProps extends BaseProps {
  href: string;
  /** External — open in a new tab. */
  external?: boolean;
}

type EditorialButtonProps = ButtonProps | LinkButtonProps;

const sizeClass: Record<Size, string> = {
  sm: "px-4 py-2 text-[13px]",
  md: "px-6 py-3.5 text-sm",
  lg: "px-8 py-4 text-base",
};

const variantClass: Record<Variant, string> = {
  primary: "editorial-button-primary",
  secondary: "editorial-button-secondary",
  ghost:
    "inline-flex items-center justify-center gap-2 border-0 bg-transparent text-[color:var(--ink)] hover:text-[color:var(--oxblood)] transition-colors",
};

/**
 * Editorial button — sharp-edged, ink/oxblood. Render as `<button>` (no href)
 * or as a Next.js `<Link>` (with href). Use `arrow` to append the kinetic →.
 *
 * @example
 *   <EditorialButton href="/search" arrow>Open search</EditorialButton>
 *   <EditorialButton variant="secondary" onClick={…}>Cancel</EditorialButton>
 */
export function EditorialButton(props: EditorialButtonProps) {
  const {
    variant = "primary",
    size = "md",
    arrow = false,
    className,
    children,
  } = props;

  const cls = cn(
    variantClass[variant],
    sizeClass[size],
    "group disabled:opacity-50 disabled:pointer-events-none",
    className,
  );

  const inner = (
    <>
      <span>{children}</span>
      {arrow && (
        <span aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
          →
        </span>
      )}
    </>
  );

  if ("href" in props && props.href) {
    const { href, external } = props;
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={cls}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }

  const { loading, ...buttonProps } =
    props as ButtonProps;
  return (
    <button
      type="button"
      disabled={loading || (buttonProps as ButtonProps).disabled}
      {...buttonProps}
      className={cls}
    >
      {inner}
    </button>
  );
}

export default EditorialButton;
