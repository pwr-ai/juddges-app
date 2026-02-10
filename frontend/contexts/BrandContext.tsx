'use client';

import React, { createContext, useContext, useMemo } from 'react';
import {
  type BrandConfig,
  type BrandType,
  getBrandConfig,
  getCurrentBrand,
} from '@/lib/brand';

interface BrandContextValue {
  /** Current brand identifier */
  brand: BrandType;
  /** Full brand configuration */
  config: BrandConfig;
  /** Brand display name */
  name: string;
  /** Brand short name */
  shortName: string;
  /** Brand tagline */
  tagline: string;
  /** Logo path */
  logo: string;
  /** Primary color */
  primaryColor: string;
}

const BrandContext = createContext<BrandContextValue | null>(null);

interface BrandProviderProps {
  children: React.ReactNode;
  /** Override brand for testing/preview */
  overrideBrand?: BrandType;
}

/**
 * Brand provider component
 *
 * Provides brand configuration to all child components via context.
 * The brand is determined by:
 * 1. overrideBrand prop (if provided)
 * 2. NEXT_PUBLIC_BRAND environment variable
 * 3. Default: 'ai-tax'
 */
export function BrandProvider({ children, overrideBrand }: BrandProviderProps) {
  const value = useMemo(() => {
    // Use override if provided, otherwise get from environment
    const brand = overrideBrand ?? getCurrentBrand();
    const config = getBrandConfig();

    return {
      brand,
      config,
      name: config.name,
      shortName: config.shortName,
      tagline: config.tagline,
      logo: config.logo,
      primaryColor: config.colors.primary,
    };
  }, [overrideBrand]);

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

/**
 * Hook to access brand configuration
 *
 * @throws Error if used outside of BrandProvider
 */
export function useBrand(): BrandContextValue {
  const context = useContext(BrandContext);

  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider');
  }

  return context;
}

/**
 * Hook to check if current brand matches a specific brand
 *
 * @param brand - Brand to check against
 * @returns true if current brand matches
 */
export function useIsBrand(brand: BrandType): boolean {
  const { brand: currentBrand } = useBrand();
  return currentBrand === brand;
}

/**
 * Hook to get brand-specific value
 *
 * @param values - Object with brand-specific values
 * @returns Value for current brand
 */
export function useBrandValue<T>(values: Record<BrandType, T>): T {
  const { brand } = useBrand();
  return values[brand];
}
