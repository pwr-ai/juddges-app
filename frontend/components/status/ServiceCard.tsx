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
    <div className="bg-parchment rounded-none border border-rule p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-serif text-lg text-ink capitalize font-normal">
            {service.name}
          </h3>
          <p className="text-xs font-mono text-ink-soft mt-1">
            Last checked: {formatTimestamp(service.last_checked)}
          </p>
        </div>
        <StatusBadge status={service.status} size="md" />
      </div>

      <div className="space-y-2">
        {service.response_time_ms !== undefined && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-xs text-ink-soft">Response Time:</span>
            <span className="font-medium font-mono text-ink tabular-nums">
              {formatResponseTime(service.response_time_ms)}
            </span>
          </div>
        )}

        {service.message && (
          <div className="mt-3 p-3 bg-parchment-deep border border-rule rounded-none font-mono text-xs text-ink">
            <p>{service.message}</p>
          </div>
        )}

        {service.error && (
          <div className="mt-3 p-3 bg-parchment-deep border border-rule border-l-2 border-l-oxblood rounded-none font-mono text-xs">
            <p className="font-medium text-oxblood mb-1">Error:</p>
            <p className="text-oxblood">{service.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
