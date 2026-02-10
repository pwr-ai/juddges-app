"use client";

import React from "react";
import { Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function AuthBanner() {
  return (
    <div className="relative mb-8 overflow-hidden rounded-xl border border-border bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 backdrop-blur-sm">
      {/* Subtle animated gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_var(--primary)_0%,_transparent_50%)] opacity-5 animate-pulse" />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 md:p-5">
        {/* Left section: Icon + Message */}
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-primary/10 backdrop-blur-sm mt-0.5">
            <Shield className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Unlock the full platform
              </h3>
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                <Sparkles className="size-3" />
                <span>Free</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Create a free account to chat with AI, save collections, and access personalized research tools
            </p>
          </div>
        </div>

        {/* Right section: Action buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            asChild
            className="flex-1 sm:flex-none h-9 px-5 shadow-md hover:shadow-lg transition-all hover:scale-105"
          >
            <Link href="/auth/sign-up">Get Started Free</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            asChild
            className="flex-1 sm:flex-none h-9 px-5"
          >
            <Link href="/auth/login">Login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
