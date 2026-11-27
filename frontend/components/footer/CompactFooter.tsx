"use client";

import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export function CompactFooter({ className }: { className?: string }) {
  const { user, loading } = useAuth();
  // /help, /changelog and /dataset-comparison are auth-gated (public-route-policy.ts): a
  // guest clicking them is bounced to /auth/login, so hide them for guests.
  // While auth is still loading they stay visible: the common case is a
  // signed-in user, for whom hiding-then-showing would shift the link row on
  // every page load. A guest only sees them during the loading window.
  const showGatedLinks = loading || Boolean(user);

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
          <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em]">
            <Link href="/about" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              About
            </Link>
            <Link href="/team" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Team
            </Link>
            <Link href="/publications" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Publications
            </Link>
            {showGatedLinks && (
              <Link href="/dataset-comparison" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
                Datasets
              </Link>
            )}
            {showGatedLinks && (
              <Link href="/help" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
                Help
              </Link>
            )}
            {showGatedLinks && (
              <Link href="/changelog" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
                Changelog
              </Link>
            )}
            <Link href="/contact" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Contact
            </Link>
            <Link href="/status" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Status
            </Link>
            <span className="text-rule-strong">|</span>
            <Link href="/privacy" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-6 items-center hover:text-oxblood transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
