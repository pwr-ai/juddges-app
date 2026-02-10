/**
 * Service card component for displaying individual service health
 */

import React from 'react';
import { ServiceHealth } from '@/types/health';
import { StatusBadge } from './StatusBadge';

interface ServiceCardProps {
  service: ServiceHealth;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const formatResponseTime = (ms?: number): string => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 capitalize">
            {service.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Last checked: {formatTimestamp(service.last_checked)}
          </p>
        </div>
        <StatusBadge status={service.status} size="md" />
      </div>

      <div className="space-y-2">
        {service.response_time_ms !== undefined && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Response Time:</span>
            <span className="font-medium text-gray-900">
              {formatResponseTime(service.response_time_ms)}
            </span>
          </div>
        )}

        {service.message && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">{service.message}</p>
          </div>
        )}

        {service.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800 mb-1">Error:</p>
            <p className="text-sm text-red-700">{service.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
