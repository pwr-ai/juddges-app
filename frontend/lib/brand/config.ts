/**
 * Brand configuration for Juddges
 *
 * Brand is determined by NEXT_PUBLIC_BRAND environment variable
 */

export type BrandType = 'juddges';

export interface BrandColors {
  /** Primary brand color in OKLCH format */
  primary: string;
  /** Primary foreground color (text on primary) */
  primaryForeground: string;
  /** Accent color for highlights */
  accent: string;
  /** Accent foreground color */
  accentForeground: string;
}

export interface BrandMetadata {
  /** Page title */
  title: string;
  /** Meta description */
  description: string;
  /** Open Graph title */
  ogTitle: string;
}

export interface BrandConfig {
  /** Brand identifier */
  id: BrandType;
  /** Display name */
  name: string;
  /** Short name for compact displays */
  shortName: string;
  /** Tagline/slogan */
  tagline: string;
  /** Logo path relative to /public */
  logo: string;
  /** Favicon path relative to /public */
  favicon: string;
  /** Brand colors */
  colors: BrandColors;
  /** Page metadata */
  metadata: BrandMetadata;
  /** Support email */
  supportEmail: string;
  /** Copyright holder */
  copyrightHolder: string;
}

/**
 * Brand configurations
 */
export const brandConfigs: Record<BrandType, BrandConfig> = {
  juddges: {
    id: 'juddges',
    name: 'JuDDGES',
    shortName: 'JuDDGES',
    tagline: 'Judicial Decision Data Gathering, Encoding, and Sharing',
    logo: '/brands/juddges/logo.svg',
    favicon: '/brands/juddges/favicon.ico',
    colors: {
      primary: 'oklch(0.55 0.22 200.00)', // Teal
      primaryForeground: 'oklch(1.00 0 0)',
      accent: 'oklch(0.72 0.18 30.00)', // Orange
      accentForeground: 'oklch(0.20 0.02 30.00)',
    },
    metadata: {
      title: 'JuDDGES - Judicial Decision Data Gathering, Encoding, and Sharing',
      description:
        'JuDDGES revolutionizes accessibility and analysis of judicial decisions across legal systems using NLP and Human-In-The-Loop technologies. Search Polish and UK court judgments with AI-powered semantic search.',
      ogTitle: 'JuDDGES | Judicial Decision Data Gathering, Encoding, and Sharing',
    },
    supportEmail: 'lukasz.augustyniak@pwr.edu.pl',
    copyrightHolder: 'JuDDGES',
  },
};

/**
 * Get the current brand from environment variable
 * Falls back to 'juddges' if not set
 */
export function getCurrentBrand(): BrandType {
  return 'juddges';
}

/**
 * Get the configuration for the current brand
 */
export function getBrandConfig(): BrandConfig {
  return brandConfigs.juddges;
}

/**
 * Get CSS variables for the current brand's colors
 * Returns an object that can be spread into a style attribute
 */
export function getBrandCSSVariables(): Record<string, string> {
  const config = getBrandConfig();

  return {
    '--brand-primary': config.colors.primary,
    '--brand-primary-foreground': config.colors.primaryForeground,
    '--brand-accent': config.colors.accent,
    '--brand-accent-foreground': config.colors.accentForeground,
  };
}

/**
 * Get the data-brand attribute value for the current brand
 * Use this on the root element to enable CSS brand overrides
 */
export function getBrandDataAttribute(): string {
  return 'juddges';
}
