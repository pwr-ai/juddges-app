"use client";

import { GraduationCap, Lock, Shield, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export function CompactFooter({ className }: { className?: string }) {
 return (
 <footer
 role="contentinfo"
 aria-label="Site footer"
 className={cn(
"w-full flex-shrink-0 border-t",
"bg-slate-100",
"border-slate-200",
 className
 )}
 >
 <div className="w-full px-6 py-3">
 <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
 {/* Left: Copyright & University */}
 <div className="flex items-center gap-3">
 <div className="flex items-center gap-1.5">
 <GraduationCap className="size-3.5 text-blue-600"/>
 <span>WUST Research Project</span>
 </div>
 <span className="hidden sm:inline">•</span>
 <span className="hidden sm:inline">© {new Date().getFullYear()} Wrocław University of Science and Technology</span>
 {APP_VERSION && (
 <>
 <span className="hidden sm:inline">•</span>
 <span aria-label="Application version" className="hidden sm:inline text-slate-600">v{APP_VERSION}</span>
 </>
 )}
 </div>

 {/* Center: Navigation Links */}
 <div className="flex items-center gap-4">
 <Link href="/about"className="hover:text-slate-800 transition-colors">
 About
 </Link>
 <Link href="/team"className="hover:text-slate-800 transition-colors">
 Team
 </Link>
 <Link href="/publications"className="hover:text-slate-800 transition-colors">
 Publications
 </Link>
 <Link href="/help"className="hover:text-slate-800 transition-colors">
 Help
 </Link>
 <Link href="/contact"className="hover:text-slate-800 transition-colors">
 Contact
 </Link>
 <span className="text-slate-300">|</span>
 <Link href="/privacy"className="hover:text-slate-800 transition-colors">
 Privacy
 </Link>
 <Link href="/terms"className="hover:text-slate-800 transition-colors">
 Terms
 </Link>
 </div>

 {/* Right: Trust badges */}
 <div className="hidden lg:flex items-center gap-3">
 <div className="flex items-center gap-1">
 <Lock className="size-3"/>
 <span>GDPR</span>
 </div>
 <div className="flex items-center gap-1">
 <Globe className="size-3"/>
 <span>EU</span>
 </div>
 <div className="flex items-center gap-1">
 <Shield className="size-3"/>
 <span>SSL</span>
 </div>
 </div>
 </div>
 </div>
 </footer>
 );
}
