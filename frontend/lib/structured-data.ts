/**
 * Site-wide schema.org structured data (JSON-LD).
 *
 * Returned as a single `@graph` so the Organization is declared once and
 * referenced by `@id` from the WebSite and SoftwareApplication nodes.
 */

import { SITE_URL } from "@/lib/site";
import { getBrandConfig } from "@/lib/brand";

export function getSiteStructuredData(): Record<string, unknown> {
  const brand = getBrandConfig();
  const organizationId = `${SITE_URL}/#organization`;

  const organization = {
    "@type": "Organization",
    "@id": organizationId,
    name: brand.name,
    url: SITE_URL,
    logo: `${SITE_URL}${brand.logo}`,
    description: brand.tagline,
    sameAs: [
      "https://github.com/pwr-ai/juddges-app",
      "https://huggingface.co/JuDDGES",
    ],
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: brand.name,
    url: SITE_URL,
    description: brand.metadata.description,
    inLanguage: "en",
    publisher: { "@id": organizationId },
  };

  const software = {
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: brand.metadata.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": organizationId },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, software],
  };
}
