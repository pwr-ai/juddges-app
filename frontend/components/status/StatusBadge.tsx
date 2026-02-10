/**
 * Status badge component for displaying service health status
 */

import React from 'react';
import { ServiceStatus, SystemStatus } from '@/types/health';

interface StatusBadgeProps {
  status: ServiceStatus | SystemStatus;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function StatusBadge({ status, size = 'md', showText = true }: StatusBadgeProps) {
  const getStatusColor = (status: ServiceStatus | SystemStatus): string => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'unknown':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusDot = (status: ServiceStatus | SystemStatus): string => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'unhealthy':
        return 'bg-red-500';
      case 'unknown':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSizeClasses = (size: 'sm' | 'md' | 'lg'): string => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'md':
        return 'px-3 py-1.5 text-sm';
      case 'lg':
        return 'px-4 py-2 text-base';
    }
  };

  const getDotSize = (size: 'sm' | 'md' | 'lg'): string => {
    switch (size) {
      case 'sm':
        return 'w-2 h-2';
      case 'md':
        return 'w-2.5 h-2.5';
      case 'lg':
        return 'w-3 h-3';
    }
  };

  const statusText = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center gap-2 font-medium rounded-full border ${getStatusColor(
        status
      )} ${getSizeClasses(size)}`}
    >
      <span className={`rounded-full ${getDotSize(size)} ${getStatusDot(status)}`} />
      {showText && statusText}
    </span>
  );
}
