/**
 * Analytics utility for tracking user events
 * Supports Google Analytics, Facebook Pixel, and custom analytics
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
  }
}

export type EventCategory =
  | "conversion"
  | "engagement"
  | "lead"
  | "interest"
  | "navigation";

export interface AnalyticsEvent {
  action: string;
  category: EventCategory;
  label?: string;
  value?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Track an analytics event
 */
export function trackEvent(event: AnalyticsEvent): void {
  const { action, category, label, value, metadata } = event;

  // Google Analytics 4
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
      value: value,
      ...metadata,
    });
  }

  // Facebook Pixel
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", action, {
      category,
      label,
      value,
      ...metadata,
    });
  }

  // Console log in development
  if (process.env.NODE_ENV === "development") {
    console.warn("[Analytics]", {
      action,
      category,
      label,
      value,
      metadata,
    });
  }
}

/**
 * Track page view
 */
export function trackPageView(url: string, title?: string): void {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "page_view", {
      page_path: url,
      page_title: title,
    });
  }
}

/**
 * Predefined tracking functions for common enterprise page events
 */
export const enterpriseTracking = {
  // Hero CTA clicks
  heroPrimaryCTA: () =>
    trackEvent({
      action: "hero_cta_primary_click",
      category: "conversion",
      label: "schedule_demo",
    }),

  heroSecondaryCTA: () =>
    trackEvent({
      action: "hero_cta_secondary_click",
      category: "engagement",
      label: "view_case_studies",
    }),

  // Navigation
  scrollToSection: (sectionName: string) =>
    trackEvent({
      action: "scroll_to_section",
      category: "engagement",
      label: sectionName,
    }),

  // Case studies
  viewCaseStudy: (caseStudyTitle: string) =>
    trackEvent({
      action: "case_study_view",
      category: "engagement",
      label: caseStudyTitle,
    }),

  clickCaseStudyLink: (caseStudyTitle: string) =>
    trackEvent({
      action: "case_study_link_click",
      category: "engagement",
      label: caseStudyTitle,
    }),

  // Pricing
  pricingTierClick: (tierName: string) =>
    trackEvent({
      action: "pricing_tier_click",
      category: "interest",
      label: tierName,
    }),

  // Contact form
  contactFormStart: () =>
    trackEvent({
      action: "contact_form_start",
      category: "lead",
      label: "form_interaction",
    }),

  contactFormSubmit: (companyName?: string) =>
    trackEvent({
      action: "contact_form_submit",
      category: "conversion",
      label: "lead_generated",
      metadata: { company: companyName },
    }),

  contactFormError: (errorType: string) =>
    trackEvent({
      action: "contact_form_error",
      category: "engagement",
      label: errorType,
    }),

  // Alternative contact methods
  emailClick: () =>
    trackEvent({
      action: "contact_email_click",
      category: "lead",
      label: "email_direct",
    }),

  phoneClick: () =>
    trackEvent({
      action: "contact_phone_click",
      category: "lead",
      label: "phone_direct",
    }),

  scheduleClick: () =>
    trackEvent({
      action: "schedule_demo_click",
      category: "lead",
      label: "calendar_booking",
    }),

  // Deployment options
  deploymentOptionSelect: (optionId: string) =>
    trackEvent({
      action: "deployment_option_select",
      category: "interest",
      label: optionId,
    }),

  // Features
  featureExpand: (featureId: string) =>
    trackEvent({
      action: "feature_expand",
      category: "engagement",
      label: featureId,
    }),

  // FAQ
  faqExpand: (question: string) =>
    trackEvent({
      action: "faq_expand",
      category: "engagement",
      label: question,
    }),

  faqSearch: (searchTerm: string) =>
    trackEvent({
      action: "faq_search",
      category: "engagement",
      label: searchTerm,
    }),

  // Scroll depth tracking
  scrollDepth: (percentage: number) =>
    trackEvent({
      action: "scroll_depth",
      category: "engagement",
      label: `${percentage}%`,
      value: percentage,
    }),

  // Time on page
  timeOnPage: (seconds: number) =>
    trackEvent({
      action: "time_on_page",
      category: "engagement",
      label: "enterprise_page",
      value: seconds,
    }),
};
