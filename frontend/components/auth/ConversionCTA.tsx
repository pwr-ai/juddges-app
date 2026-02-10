"use client";

import React from "react";
import { Zap, FolderOpen, Shield, MessageSquare, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface FeatureItemProps {
  icon: React.ReactNode;
  text: string;
}

function FeatureItem({ icon, text }: FeatureItemProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-background/50 border border-border/50 backdrop-blur-sm hover:bg-background/80 transition-colors">
      <div className="p-2 rounded-lg bg-primary/10">
        <div className="size-5 text-primary">
          {icon}
        </div>
      </div>
      <span className="text-sm font-medium">{text}</span>
      <CheckCircle2 className="size-4 text-primary ml-auto" />
    </div>
  );
}

export function ConversionCTA() {
  return (
    <section className="relative py-20 md:py-24 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent/8 rounded-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_var(--primary)_0%,_transparent_50%)] opacity-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,_var(--accent)_0%,_transparent_50%)] opacity-10" />

      {/* Border */}
      <div className="absolute inset-0 rounded-2xl border border-border/50" />

      {/* Content */}
      <div className="relative text-center px-6 md:px-12">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/15 text-primary text-xs font-semibold uppercase tracking-wide mb-6 backdrop-blur-sm">
          <Zap className="size-4" />
          <span>Free Academic Access</span>
        </div>

        {/* Headline */}
        <h3 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Ready to unlock full access?
        </h3>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Create a free account to chat with AI, save documents, and access personalized legal research tools
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 max-w-4xl mx-auto">
          <FeatureItem
            icon={<MessageSquare className="size-5" />}
            text="AI Chat Assistant"
          />
          <FeatureItem
            icon={<FolderOpen className="size-5" />}
            text="Saved Collections"
          />
          <FeatureItem
            icon={<Shield className="size-5" />}
            text="Secure Storage"
          />
          <FeatureItem
            icon={<Zap className="size-5" />}
            text="Advanced Search"
          />
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <Button
            size="lg"
            asChild
            className="h-14 px-10 text-base shadow-xl hover:shadow-2xl transition-all hover:scale-105 group"
          >
            <Link href="/auth/sign-up">
              Create Free Account
              <ArrowRight className="ml-2 size-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>

          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-14 px-10 text-base"
          >
            <Link href="/auth/login">
              Already have an account? Login
            </Link>
          </Button>
        </div>

        {/* Trust Signal */}
        <p className="text-sm text-muted-foreground">
          No credit card required • Research project by Wrocław University of Science and Technology
        </p>
      </div>
    </section>
  );
}
