"use client";

import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export function CompactFooter({ className }: { className?: string }) {
  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      className={cn(
        "w-full flex-shrink-0 border-t border-rule bg-parchment-deep/40",
        className
      )}
    >
      <div className="w-full px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
          {/* Left: Copyright & University */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="size-3.5 text-oxblood" aria-hidden />
              <span className="font-medium text-ink">WUST Research Project</span>
            </div>
            <span className="hidden sm:inline text-rule-strong">•</span>
            <span className="hidden sm:inline">© {new Date().getFullYear()} Wrocław University of Science and Technology</span>
            {APP_VERSION && (
              <>
                <span className="hidden sm:inline text-rule-strong">•</span>
                <span aria-label="Application version" className="hidden sm:inline font-mono text-[11px] text-ink-soft">v{APP_VERSION}</span>
              </>
            )}
          </div>

          {/* Right: Navigation Links */}
          <div className="flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[0.14em]">
            <Link href="/about" className="hover:text-oxblood transition-colors">
              About
            </Link>
            <Link href="/team" className="hover:text-oxblood transition-colors">
              Team
            </Link>
            <Link href="/publications" className="hover:text-oxblood transition-colors">
              Publications
            </Link>
            <Link href="/dataset-comparison" className="hover:text-oxblood transition-colors">
              Datasets
            </Link>
            <Link href="/help" className="hover:text-oxblood transition-colors">
              Help
            </Link>
            <Link href="/contact" className="hover:text-oxblood transition-colors">
              Contact
            </Link>
            <Link href="/status" className="hover:text-oxblood transition-colors">
              Status
            </Link>
            <span className="text-rule-strong">|</span>
            <Link href="/privacy" className="hover:text-oxblood transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-oxblood transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
