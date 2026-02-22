'use client';

import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose: () => void;
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    iconColor: 'text-green-600 dark:text-green-400',
    titleColor: 'text-green-900 dark:text-green-100',
    descriptionColor: 'text-green-700 dark:text-green-300',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-900 dark:text-red-100',
    descriptionColor: 'text-red-700 dark:text-red-300',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    titleColor: 'text-yellow-900 dark:text-yellow-100',
    descriptionColor: 'text-yellow-700 dark:text-yellow-300',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-900 dark:text-blue-100',
    descriptionColor: 'text-blue-700 dark:text-blue-300',
  },
};

/**
 * Toast Component
 *
 * Individual toast notification with icon, title, description, and actions.
 * Features smooth animations and accessibility support.
 *
 * @example
 * ```tsx
 * <Toast
 *   type="success"
 *   title="Saved successfully"
 *   description="Your changes have been saved"
 *   onClose={() => {}}
 * />
 * ```
 */
export function Toast({ type, title, description, action, onClose }: ToastProps) {
  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border shadow-lg',
        'animate-in slide-in-from-right-full duration-300',
        'backdrop-blur-sm',
        config.bg,
        config.border
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconColor)} aria-hidden="true" />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium leading-tight', config.titleColor)}>{title}</p>
            {description && (
              <p className={cn('mt-1 text-sm leading-tight', config.descriptionColor)}>
                {description}
              </p>
            )}

            {/* Action Button */}
            {action && (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  className={cn(
                    'text-xs h-7',
                    type === 'success' && 'border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-800',
                    type === 'error' && 'border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-800',
                    type === 'warning' && 'border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-800',
                    type === 'info' && 'border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800'
                  )}
                >
                  {action.label}
                </Button>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className={cn(
              'flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
              'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
              type === 'success' && 'focus:ring-green-500',
              type === 'error' && 'focus:ring-red-500',
              type === 'warning' && 'focus:ring-yellow-500',
              type === 'info' && 'focus:ring-blue-500'
            )}
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
