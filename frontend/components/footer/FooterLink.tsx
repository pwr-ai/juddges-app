import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface FooterLinkProps {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}

export function FooterLink({ href, children, external, className }: FooterLinkProps) {
  const linkClasses = cn(
    "text-sm font-medium text-slate-700 dark:text-slate-300 transition-all duration-300",
    "relative inline-flex items-center gap-1.5",
    "hover:text-blue-600 dark:hover:text-blue-400",
    "before:absolute before:bottom-0 before:left-0 before:w-0 before:h-0.5 before:bg-gradient-to-r before:from-blue-600 before:to-indigo-600",
    "before:transition-all before:duration-300 hover:before:w-full",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
    className
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClasses}
      >
        {children}
        <ExternalLink className="size-2.5" />
      </a>
    );
  }

  return (
    <Link href={href} className={linkClasses}>
      {children}
    </Link>
  );
}
