"""Pydantic models for health check and status responses."""

from datetime import datetime
from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceStatus(str, Enum):
    """Status levels for individual services."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class SystemStatus(str, Enum):
    """Overall system status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ServiceHealth(BaseModel):
    """Health information for a single service."""

    name: str = Field(..., description="Service name")
    status: ServiceStatus = Field(..., description="Current service status")
    response_time_ms: Optional[float] = Field(None, description="Response time in milliseconds")
    message: Optional[str] = Field(None, description="Additional status information")
    error: Optional[str] = Field(None, description="Error message if service is unhealthy")
    last_checked: datetime = Field(default_factory=datetime.utcnow, description="Timestamp of last check")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "weaviate",
                "status": "healthy",
                "response_time_ms": 45.2,
                "message": "Connected to Weaviate cluster",
                "error": None,
                "last_checked": "2025-01-15T10:30:00Z"
            }
        }
    )


class BasicHealthResponse(BaseModel):
    """Basic health check response for load balancers."""

    status: str = Field(..., description="Health status (always 'healthy' for 200 OK)")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Current timestamp")
    version: str = Field(..., description="Application version")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "timestamp": "2025-01-15T10:30:00Z",
                "version": "0.2.0"
            }
        }
    )


class DetailedStatusResponse(BaseModel):
    """Detailed status response with all service checks."""

    status: SystemStatus = Field(..., description="Overall system status")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Current timestamp")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Deployment environment")
    services: Dict[str, ServiceHealth] = Field(..., description="Individual service health checks")
    response_time_ms: float = Field(..., description="Total time to perform all checks")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "timestamp": "2025-01-15T10:30:00Z",
                "version": "0.2.0",
                "environment": "production",
                "services": {
                    "weaviate": {
                        "name": "weaviate",
                        "status": "healthy",
                        "response_time_ms": 45.2,
                        "message": "Connected successfully",
                        "error": None,
                        "last_checked": "2025-01-15T10:30:00Z"
                    }
                },
                "response_time_ms": 156.8
            }
        }
    )


class DependencyInfo(BaseModel):
    """Information about a service dependency."""

    name: str = Field(..., description="Service name")
    critical: bool = Field(..., description="Whether service is critical for system operation")
    description: str = Field(..., description="Service description")
    health_check_url: Optional[str] = Field(None, description="URL for service health check")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "weaviate",
                "critical": True,
                "description": "Vector database for semantic search",
                "health_check_url": "http://weaviate:8080/.well-known/ready"
            }
        }
    )


class DependenciesResponse(BaseModel):
    """Response listing all system dependencies."""

    critical: Dict[str, DependencyInfo] = Field(..., description="Critical dependencies")
    optional: Dict[str, DependencyInfo] = Field(..., description="Optional dependencies")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "critical": {
                    "weaviate": {
                        "name": "weaviate",
                        "critical": True,
                        "description": "Vector database",
                        "health_check_url": None
                    }
                },
                "optional": {
                    "supabase": {
                        "name": "supabase",
                        "critical": False,
                        "description": "Analytics and feedback",
                        "health_check_url": None
                    }
                }
            }
        }
    )
