/**
 * Type definitions for health check and status API responses
 */

export type ServiceStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type SystemStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  response_time_ms?: number;
  message?: string;
  error?: string;
  last_checked: string;
}

export interface BasicHealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface DetailedStatusResponse {
  status: SystemStatus;
  timestamp: string;
  version: string;
  environment: string;
  services: Record<string, ServiceHealth>;
  response_time_ms: number;
}

export interface DependencyInfo {
  name: string;
  critical: boolean;
  description: string;
  health_check_url?: string;
}

export interface DependenciesResponse {
  critical: Record<string, DependencyInfo>;
  optional: Record<string, DependencyInfo>;
}
