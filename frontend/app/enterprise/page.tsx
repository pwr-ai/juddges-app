"use client";

import React, { useEffect } from "react";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { HeroSection } from "@/components/landing/HeroSection";
import { StatsGrid } from "@/components/landing/StatsGrid";
import { ValuePropsGrid } from "@/components/landing/ValuePropCard";
import { DeploymentOptions } from "@/components/landing/DeploymentOptions";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ServicesGrid } from "@/components/landing/ServicesGrid";
import { CaseStudies } from "@/components/landing/CaseStudyCard";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { ContactSection } from "@/components/landing/ContactSection";
import { enterpriseContent } from "./content";
import { enterpriseTracking, trackPageView } from "@/lib/analytics";

export default function EnterprisePage() {
  // Track page view on mount
  useEffect(() => {
    trackPageView("/enterprise", "Juddges Enterprise Solutions");

    // Track scroll depth
    let maxScrollDepth = 0;
    const depths = [25, 50, 75, 90];
    const trackedDepths = new Set<number>();

    const handleScroll = () => {
      const scrollPercent =
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;

      if (scrollPercent > maxScrollDepth) {
        maxScrollDepth = scrollPercent;

        // Track scroll depth milestones
        depths.forEach((depth) => {
          if (scrollPercent >= depth && !trackedDepths.has(depth)) {
            trackedDepths.add(depth);
            enterpriseTracking.scrollDepth(depth);
          }
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Track time on page
    const startTime = Date.now();
    const trackTimeOnPage = () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      if (timeSpent > 10) {
        // Only track if spent more than 10 seconds
        enterpriseTracking.timeOnPage(timeSpent);
      }
    };

    window.addEventListener("beforeunload", trackTimeOnPage);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", trackTimeOnPage);
    };
  }, []);

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <LandingNav />

      {/* Add padding to account for fixed nav */}
      <div className="pt-16 md:pt-20">
        {/* Hero Section */}
        <HeroSection
          headline={enterpriseContent.hero.headline}
          subheadline={enterpriseContent.hero.subheadline}
          primaryCTA={enterpriseContent.hero.primaryCTA}
          secondaryCTA={enterpriseContent.hero.secondaryCTA}
        />

        {/* Stats Section */}
        <StatsGrid stats={enterpriseContent.stats} title="Proven at Scale" />

        {/* Value Propositions */}
        <ValuePropsGrid
          valueProps={enterpriseContent.valueProps}
          title="Why Choose Juddges Enterprise?"
          subtitle="Built for legal professionals who need reliability, security, and performance"
        />

        {/* Deployment Options */}
        <section id="deployment">
          <DeploymentOptions
            options={enterpriseContent.deploymentOptions}
            title="Flexible Deployment Options"
            subtitle="Choose the deployment model that fits your security and infrastructure requirements"
          />
        </section>

        {/* Features Showcase */}
        <section id="features">
          <FeatureShowcase
            features={enterpriseContent.features}
            title="Comprehensive Legal AI Platform"
            subtitle="Everything you need to transform your legal research workflow"
          />
        </section>

        {/* Services */}
        <ServicesGrid
          services={enterpriseContent.services}
          title="End-to-End Support"
          subtitle="From consultation to ongoing optimization, we&apos;re with you every step"
        />

        {/* Case Studies */}
        <section id="case-studies">
          <CaseStudies
            caseStudies={enterpriseContent.caseStudies}
            title="Real Results from Real Deployments"
            subtitle="See how organizations use Juddges to transform their legal operations"
          />
        </section>

        {/* Security & Compliance */}
        <SecuritySection
          certifications={enterpriseContent.certifications}
          securityFeatures={enterpriseContent.securityFeatures}
          title="Enterprise-Grade Security"
          subtitle="Built with security and compliance at the core"
        />

        {/* Pricing / Engagement Models */}
        <section id="pricing">
          <PricingSection
            tiers={enterpriseContent.pricingTiers}
            title="Flexible Engagement Models"
            subtitle="Start small or go all-in. We scale with your needs."
            disclaimer="Pricing varies based on deployment type, user count, and customization requirements. Contact us for a detailed quote."
          />
        </section>

        {/* FAQ */}
        <section id="faq">
          <FAQSection
            faqs={enterpriseContent.faqs}
            title="Frequently Asked Questions"
            subtitle="Find answers to common questions about Juddges Enterprise"
          />
        </section>

        {/* Contact / CTA */}
        <ContactSection
          title="Ready to Transform Your Legal Practice?"
          subtitle="Schedule a demo or speak with our team to learn how Juddges can work for you"
        />

        {/* Final Trust Reinforcement */}
        <section className="py-12 bg-muted/30 border-t border-border">
          <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-4xl">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Trusted by researchers and legal professionals
              </p>
              <div className="flex flex-wrap justify-center gap-8 text-2xl font-bold text-muted-foreground/40">
                <div>3M+ Documents</div>
                <div>50+ Researchers</div>
                <div>99.9% Uptime</div>
                <div>5+ Publications</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
