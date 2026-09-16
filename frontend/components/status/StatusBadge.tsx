/**
 * Status badge component for displaying service health status.
 * Delegates to the canonical editorial StatusBadge.
 */

import React from 'react';
import { ServiceStatus, SystemStatus } from '@/types/health';
import { StatusBadge as EditorialStatusBadge } from '@/components/editorial';

interface StatusBadgeProps {
  status: ServiceStatus | SystemStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function StatusBadge({ status, size = 'md', showText = true }: StatusBadgeProps) {
  return <EditorialStatusBadge status={status} size={size} showText={showText} />;
}
