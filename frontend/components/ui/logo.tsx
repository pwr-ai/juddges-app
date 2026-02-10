import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getBrandConfig, type BrandType } from '@/lib/brand';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  showGlow?: boolean;
  /** Override brand for preview purposes */
  brandOverride?: BrandType;
}

const iconSizeMap = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
  xl: 'h-12 w-12',
};

const iconPixelSizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
};

const textSizeMap = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

/**
 * Brand-aware Logo component
 *
 * Displays the logo for the current brand (judges, ai-tax, or legal-ai).
 * Falls back to a default SVG icon if the brand logo file is not found.
 */
export function Logo({
  size = 'md',
  showText = true,
  className = '',
  showGlow = true,
  brandOverride,
}: LogoProps) {
  const config = getBrandConfig();
  const brandName = brandOverride ? brandOverride : config.shortName;
  const iconSize = iconSizeMap[size];
  const iconPixels = iconPixelSizeMap[size];
  const textSize = textSizeMap[size];

  // Check if we have a custom logo file
  const hasCustomLogo = config.logo && config.logo !== '';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative">
        {hasCustomLogo ? (
          // Use custom brand logo
          <Image
            src={config.logo}
            alt={`${config.name} logo`}
            width={iconPixels}
            height={iconPixels}
            className={cn(iconSize, 'text-primary')}
            priority
          />
        ) : (
          // Fallback to default scales of justice icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(iconSize, 'text-primary')}
          >
            <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
            <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
            <path d="M7 21h10"></path>
            <path d="M12 3v18"></path>
            <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>
          </svg>
        )}
        {/* Pulsing glow effect on the indicator dot */}
        {showGlow && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full opacity-80 animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full animate-ping opacity-75" />
          </div>
        )}
      </div>
      {showText && (
        <h1
          className={cn(
            'font-semibold text-foreground transition-colors duration-300 relative',
            textSize
          )}
        >
          <span className="bg-gradient-to-r from-foreground via-primary to-primary bg-clip-text text-transparent animate-text-shimmer bg-[length:200%_auto]">
            {brandName}
          </span>
        </h1>
      )}
    </div>
  );
}
