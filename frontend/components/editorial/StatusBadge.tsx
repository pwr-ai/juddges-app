import React from 'react';
import { cn } from '@/lib/utils';
import { getStatusTone, STATUS_TONE_STYLES, StatusTone } from '@/lib/styles/status-tone';

export interface StatusBadgeProps {
  status: string;
  tone?: StatusTone;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  showText?: boolean;
  label?: string;
  className?: string;
}

export function StatusBadge({
  status,
  tone: toneOverride,
  size = 'md',
  showDot = true,
  showText = true,
  label,
  className,
}: StatusBadgeProps) {
  const tone = toneOverride ?? getStatusTone(status);
  const styles = STATUS_TONE_STYLES[tone];
  const displayText = label ?? (status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '));

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  }[size];

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono border border-rule rounded-full bg-transparent',
        styles.text,
        sizeClasses,
        className
      )}
    >
      {showDot && <span className={cn('rounded-full shrink-0', dotSizes, styles.dot)} />}
      {showText && <span>{displayText}</span>}
    </span>
  );
}
