/**
 * System Status Page
 * Displays real-time health status of all backend services
 */

'use client';

import React from 'react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { StatusBadge } from '@/components/status/StatusBadge';
import { ServiceCard } from '@/components/status/ServiceCard';

export default function StatusPage() {
  const { status, loading, error, refetch } = useSystemStatus({
    pollInterval: 30000, // Poll every 30 seconds
    enabled: true,
  });

  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
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

  const getCriticalServices = () => {
    if (!status) return [];
    const critical = ['weaviate', 'redis', 'postgresql'];
    return critical
      .filter((name) => status.services[name])
      .map((name) => status.services[name]);
  };

  const getOptionalServices = () => {
    if (!status) return [];
    const critical = ['weaviate', 'redis', 'postgresql'];
    return Object.values(status.services).filter(
      (service) => !critical.includes(service.name)
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">
              Failed to Load Status
            </h2>
            <p className="text-red-700">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-4 text-gray-600">Loading status...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
            <button
              onClick={() => refetch()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {status && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Overall System Status
                  </h2>
                  <p className="text-sm text-gray-500">
                    Last updated: {formatTimestamp(status.timestamp)}
                  </p>
                </div>
                <StatusBadge status={status.status} size="lg" />
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Version</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {status.version}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Environment</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {status.environment}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Check Duration</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatResponseTime(status.response_time_ms)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Critical Services */}
        {status && getCriticalServices().length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Critical Services
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getCriticalServices().map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          </div>
        )}

        {/* Optional Services */}
        {status && getOptionalServices().length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Optional Services
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getOptionalServices().map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            This page automatically refreshes every 30 seconds. Critical services
            must be healthy for the system to operate. Optional services enhance
            functionality but are not required.
          </p>
        </div>
      </div>
    </div>
  );
}
