import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary';
}

interface EmptyStateProps {
  /**
   * Icon component from lucide-react
   */
  icon: LucideIcon;

  /**
   * Main heading text
   */
  title: string;

  /**
   * Descriptive text explaining the empty state
   */
  description: string;

  /**
   * Primary action button
   */
  action?: EmptyStateAction;

  /**
   * Secondary action button (optional)
   */
  secondaryAction?: EmptyStateAction;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Size variant
   * @default 'default'
   */
  size?: 'sm' | 'default' | 'lg';
}

/**
 * EmptyState - Generic empty state component
 *
 * Displays a helpful message when there's no content to show.
 * Follows best practices by guiding users to action.
 *
 * Design Principles:
 * - Clear visual hierarchy (icon → title → description → actions)
 * - Friendly tone that explains why content is empty
 * - Actionable buttons that help users proceed
 * - Consistent with Legal Glass 2.0 design system
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Search}
 *   title="No judgments found"
 *   description="Try adjusting your search criteria"
 *   action={{ label: "Clear filters", onClick: handleReset }}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'default'
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      container: 'py-8 px-4',
      iconBox: 'w-12 h-12 mb-3',
      icon: 'w-6 h-6',
      title: 'text-base',
      description: 'text-xs max-w-xs',
      buttonSize: 'sm' as const
    },
    default: {
      container: 'py-12 px-4',
      iconBox: 'w-16 h-16 mb-4',
      icon: 'w-8 h-8',
      title: 'text-lg',
      description: 'text-sm max-w-sm',
      buttonSize: 'default' as const
    },
    lg: {
      container: 'py-16 px-6',
      iconBox: 'w-20 h-20 mb-6',
      icon: 'w-10 h-10',
      title: 'text-xl',
      description: 'text-base max-w-md',
      buttonSize: 'lg' as const
    }
  };

  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        config.container,
        className
      )}
      role="status"
      aria-label="Empty state"
    >
      {/* Icon container with subtle background */}
      <div
        className={cn(
          "rounded-full bg-muted/50 flex items-center justify-center",
          config.iconBox
        )}
      >
        <Icon className={cn("text-muted-foreground", config.icon)} aria-hidden="true" />
      </div>

      {/* Title */}
      <h3 className={cn("font-semibold text-foreground mb-2", config.title)}>
        {title}
      </h3>

      {/* Description */}
      <p className={cn("text-muted-foreground mb-6", config.description)}>
        {description}
      </p>

      {/* Action buttons */}
      {(action || secondaryAction) && (
        <div className="flex gap-3 flex-wrap justify-center">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || 'default'}
              size={config.buttonSize}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant || 'outline'}
              size={config.buttonSize}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
