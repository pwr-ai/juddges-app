/**
 * AI Disclaimer Badge Component
 * Reusable badge for displaying AI-generated content disclaimer
 * Used in message components and other places where AI content is shown
 *
 * Uses centralized color definitions from lib/styles/colors/badge.ts
 */

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
// Color definitions are in lib/styles/colors/badge.ts for reference
// Using static Tailwind classes for JIT compiler compatibility

export interface AIDisclaimerBadgeProps {
 /**
 * Optional className for the wrapper container
 */
 className?: string;
 /**
 * Optional className for the badge itself
 */
 badgeClassName?: string;
 /**
 * Whether to show the top border separator
 * @default true
 */
 showBorder?: boolean;
 /**
 * Custom disclaimer link URL
 * @default"/legal/disclaimer"
 */
 disclaimerUrl?: string;
 /**
 * Custom message text
 * @default"AI-generated content. Verify before use."
 */
 message?: string;
 /**
 * Custom link text
 * @default"Learn more"
 */
 linkText?: string;
}

/**
 * AI Disclaimer Badge
 * Displays a badge warning about AI-generated content with a link to the disclaimer
 *
 * @example
 * <AIDisclaimerBadge />
 *
 * @example
 * <AIDisclaimerBadge
 * showBorder={false}
 * message="Custom message"
 * />
 */
export function AIDisclaimerBadge({
 className,
 badgeClassName,
 showBorder = true,
 disclaimerUrl = '/legal/disclaimer',
 message = 'AI-generated content. Verify before use.',
 linkText = 'Learn more',
}: AIDisclaimerBadgeProps): React.JSX.Element {
 return (
 <div className={cn(
 showBorder && 'mt-4 pt-4 border-t border-border/50',
 className
 )}>
 <div className={cn(
 'flex items-center gap-2.5 px-3 py-2.5 rounded-lg',
 // Background gradient (using semantic tokens)
 'bg-gradient-to-br from-background/80 via-background/50 to-background/80',
 'backdrop-blur-sm',
 // Border (using semantic tokens)
 'border border-border/50',
 // Shadow (from badgeColors - using static classes for Tailwind JIT)
 'shadow-sm hover:shadow-md hover:shadow-primary/10',
 'transition-all duration-300',
 badgeClassName
 )}>
 <AlertTriangle className={cn(
 'h-4 w-4 flex-shrink-0',
 // Icon color (from badgeColors - using static classes for Tailwind JIT)
 'text-amber-600'
 )} />
 <span className={cn(
 'text-xs font-medium',
 // Text color (using semantic tokens)
 'text-muted-foreground'
 )}>
 {message}
 </span>
 <Link
 href={disclaimerUrl}
 className={cn(
 'text-xs font-semibold ml-auto transition-all duration-200',
 // Link color (from badgeColors - using static classes for Tailwind JIT)
 'text-primary hover:text-primary/80',
 'hover:scale-105 inline-block',
 // Focus state for accessibility
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded'
 )}
 >
 {linkText}
 </Link>
 </div>
 </div>
 );
}
