import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
import { GraduationCap, ArrowRight } from "lucide-react";

interface HeroSectionProps {
  headline: string;
  subheadline: string;
  primaryCTA: { text: string; href: string };
  secondaryCTA: { text: string; href: string };
}

export function HeroSection({
  headline,
  subheadline,
  primaryCTA,
  secondaryCTA,
}: HeroSectionProps) {
  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />

      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary rounded-full blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent rounded-full blur-3xl"
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-6 md:px-8 lg:px-12 max-w-7xl">
        <div className="max-w-4xl mx-auto text-center">
          {/* University badge */}
          <div className="flex items-center justify-center gap-2.5 text-sm text-muted-foreground mb-8 animate-fade-in">
            <GraduationCap className="size-5" />
            <span>Research project by Wrocław University of Science and Technology</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent animate-fade-in-up">
            {headline}
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed max-w-3xl mx-auto animate-fade-in-up [animation-delay:100ms]">
            {subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12 animate-fade-in-up [animation-delay:200ms]">
            <Button size="lg" asChild className="h-14 px-8 text-base group">
              <Link href={primaryCTA.href}>
                {primaryCTA.text}
                <ArrowRight className="ml-2 size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-14 px-8 text-base"
            >
              <Link href={secondaryCTA.href}>{secondaryCTA.text}</Link>
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground/80 animate-fade-in-up [animation-delay:300ms]">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-chart-2" />
              <span>GDPR Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-chart-2" />
              <span>EU Hosted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-chart-2" />
              <span>Open Source</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-chart-2" />
              <span>Production Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
