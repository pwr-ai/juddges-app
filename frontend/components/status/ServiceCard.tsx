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
    <div className="editorial-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="editorial-display text-lg text-ink capitalize">
            {service.name}
          </h3>
          <p className="text-sm text-ink-soft mt-1">
            Last checked: {formatTimestamp(service.last_checked)}
          </p>
        </div>
        <StatusBadge status={service.status} size="md" />
      </div>

      <div className="space-y-2">
        {service.response_time_ms !== undefined && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-ink-soft">Response Time:</span>
            <span className="font-mono tabular-nums text-ink">
              {formatResponseTime(service.response_time_ms)}
            </span>
          </div>
        )}

        {service.message && (
          <div className="mt-3 p-3 border-l-2 border-l-gold bg-parchment-deep">
            <p className="text-sm text-ink">{service.message}</p>
          </div>
        )}

        {service.error && (
          <div className="mt-3 p-3 border-l-2 border-l-oxblood bg-parchment-deep">
            <p className="text-sm font-medium text-ink mb-1">Error:</p>
            <p className="text-sm text-ink-soft">{service.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
