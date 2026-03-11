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
 bg: 'bg-green-50',
 border: 'border-green-200',
 iconColor: 'text-green-600',
 titleColor: 'text-green-900',
 descriptionColor: 'text-green-700',
 },
 error: {
 icon: XCircle,
 bg: 'bg-red-50',
 border: 'border-red-200',
 iconColor: 'text-red-600',
 titleColor: 'text-red-900',
 descriptionColor: 'text-red-700',
 },
 warning: {
 icon: AlertTriangle,
 bg: 'bg-yellow-50',
 border: 'border-yellow-200',
 iconColor: 'text-yellow-600',
 titleColor: 'text-yellow-900',
 descriptionColor: 'text-yellow-700',
 },
 info: {
 icon: Info,
 bg: 'bg-blue-50',
 border: 'border-blue-200',
 iconColor: 'text-blue-600',
 titleColor: 'text-blue-900',
 descriptionColor: 'text-blue-700',
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
 * type="success"
 * title="Saved successfully"
 * description="Your changes have been saved"
 * onClose={() => {}}
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
 <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconColor)} aria-hidden="true"/>

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
 type === 'success' && 'border-green-300 hover:bg-green-100',
 type === 'error' && 'border-red-300 hover:bg-red-100',
 type === 'warning' && 'border-yellow-300 hover:bg-yellow-100',
 type === 'info' && 'border-blue-300 hover:bg-blue-100'
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
 'flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors',
 'text-gray-400 hover:text-gray-600',
 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
 type === 'success' && 'focus:ring-green-500',
 type === 'error' && 'focus:ring-red-500',
 type === 'warning' && 'focus:ring-yellow-500',
 type === 'info' && 'focus:ring-blue-500'
 )}
 aria-label="Close notification"
 >
 <X className="w-4 h-4"/>
 </button>
 </div>
 </div>
 </div>
 );
}
