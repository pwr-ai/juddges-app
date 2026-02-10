"use client";

import { GraduationCap, Lock, Shield, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function CompactFooter({ className }: { className?: string }) {
  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      className={cn(
        "w-full flex-shrink-0 border-t",
        "bg-slate-100 dark:bg-slate-900",
        "border-slate-200 dark:border-slate-800",
        className
      )}
    >
      <div className="w-full px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          {/* Left: Copyright & University */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="size-3.5 text-blue-600 dark:text-blue-400" />
              <span>WUST Research Project</span>
            </div>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">© {new Date().getFullYear()} Wrocław University of Science and Technology</span>
          </div>

          {/* Center: Navigation Links */}
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              About
            </Link>
            <Link href="/team" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Team
            </Link>
            <Link href="/publications" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Publications
            </Link>
            <Link href="/help" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Help
            </Link>
            <Link href="/contact" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Contact
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Terms
            </Link>
          </div>

          {/* Right: Trust badges */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Lock className="size-3" />
              <span>GDPR</span>
            </div>
            <div className="flex items-center gap-1">
              <Globe className="size-3" />
              <span>EU</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="size-3" />
              <span>SSL</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
