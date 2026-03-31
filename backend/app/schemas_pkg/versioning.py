"""
Schema version history, comparison, and rollback endpoints.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from loguru import logger

from app.core.supabase import supabase_client

from .models import (
    RollbackRequest,
    RollbackResponse,
    SchemaVersionDetail,
    SchemaVersionSummary,
    VersionComparisonResponse,
)


def register_versioning_routes(router: APIRouter) -> None:
    """Register all versioning route handlers on the given router."""

    @router.get("/db/{schema_id}/versions")
    async def list_schema_versions(
        schema_id: str,
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
    ) -> dict[str, Any]:
        """
        List all versions for a schema with pagination.

        Returns version history with summary information, ordered by version number
        (newest first).

        Args:
            schema_id: UUID of the schema
            page: Page number (1-based)
            page_size: Items per page

        Returns:
            Dictionary with versions list and pagination info
        """
        if not supabase_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable",
            )

        try:
            # Get current version number from main schema
            schema_response = (
                supabase_client.table("extraction_schemas")
                .select("schema_version")
                .eq("id", schema_id)
                .single()
                .execute()
            )

            if not schema_response.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Schema '{schema_id}' not found",
                )

            current_version = schema_response.data.get("schema_version", 1)

            # Get total count
            count_response = (
                supabase_client.table("schema_versions")
                .select("id", count="exact")
                .eq("schema_id", schema_id)
                .execute()
            )

            total = count_response.count or 0

            # Get paginated versions
            offset = (page - 1) * page_size
            versions_response = (
                supabase_client.table("schema_versions")
                .select(
                    "id, version_number, change_type, change_summary, changed_fields, user_id, created_at"
                )
                .eq("schema_id", schema_id)
                .order("version_number", desc=True)
                .range(offset, offset + page_size - 1)
                .execute()
            )

            versions = [
                SchemaVersionSummary(
                    id=v["id"],
                    version_number=v["version_number"],
                    change_type=v["change_type"],
                    change_summary=v.get("change_summary"),
                    changed_fields=v.get("changed_fields"),
                    user_id=v.get("user_id"),
                    created_at=v["created_at"],
                ).model_dump()
                for v in (versions_response.data or [])
            ]

            return {
                "schema_id": schema_id,
                "current_version": current_version,
                "versions": versions,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size
                    if total > 0
                    else 0,
                },
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to list schema versions: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list versions: {e!s}",
            )

    @router.get("/db/{schema_id}/versions/{version_number}")
    async def get_schema_version(
        schema_id: str,
        version_number: int,
    ) -> SchemaVersionDetail:
        """
        Get full details of a specific schema version.

        Args:
            schema_id: UUID of the schema
            version_number: The version number to retrieve

        Returns:
            Full version details including schema and field snapshots
        """
        if not supabase_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable",
            )

        try:
            response = (
                supabase_client.table("schema_versions")
                .select("*")
                .eq("schema_id", schema_id)
                .eq("version_number", version_number)
                .single()
                .execute()
            )

            if not response.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Version {version_number} not found for schema '{schema_id}'",
                )

            v = response.data
            return SchemaVersionDetail(
                id=v["id"],
                schema_id=v["schema_id"],
                version_number=v["version_number"],
                schema_snapshot=v.get("schema_snapshot", {}),
                field_snapshot=v.get("field_snapshot", []),
                change_type=v["change_type"],
                change_summary=v.get("change_summary"),
                changed_fields=v.get("changed_fields"),
                diff_from_previous=v.get("diff_from_previous"),
                user_id=v.get("user_id"),
                created_at=v["created_at"],
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to get schema version: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get version: {e!s}",
            )

    @router.get("/db/{schema_id}/versions/compare")
    async def compare_schema_versions(
        schema_id: str,
        version_a: int = Query(..., description="First version to compare"),
        version_b: int = Query(..., description="Second version to compare"),
    ) -> VersionComparisonResponse:
        """
        Compare two schema versions to see differences.

        Args:
            schema_id: UUID of the schema
            version_a: First version number
            version_b: Second version number

        Returns:
            Comparison showing added, removed, and modified fields
        """
        if not supabase_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable",
            )

        try:
            # Fetch both versions
            response_a = (
                supabase_client.table("schema_versions")
                .select("field_snapshot")
                .eq("schema_id", schema_id)
                .eq("version_number", version_a)
                .single()
                .execute()
            )

            response_b = (
                supabase_client.table("schema_versions")
                .select("field_snapshot")
                .eq("schema_id", schema_id)
                .eq("version_number", version_b)
                .single()
                .execute()
            )

            if not response_a.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Version {version_a} not found",
                )

            if not response_b.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Version {version_b} not found",
                )

            fields_a = {
                f["field_path"]: f
                for f in (response_a.data.get("field_snapshot") or [])
            }
            fields_b = {
                f["field_path"]: f
                for f in (response_b.data.get("field_snapshot") or [])
            }

            paths_a = set(fields_a.keys())
            paths_b = set(fields_b.keys())

            # Calculate differences
            added_paths = paths_b - paths_a
            removed_paths = paths_a - paths_b
            common_paths = paths_a & paths_b

            added_fields = [fields_b[p] for p in added_paths]
            removed_fields = [fields_a[p] for p in removed_paths]

            # Find modified fields (same path, different content)
            modified_fields = []
            for path in common_paths:
                field_a = fields_a[path]
                field_b = fields_b[path]

                # Check for meaningful changes
                changes = []
                if field_a.get("field_type") != field_b.get("field_type"):
                    changes.append(
                        {
                            "property": "field_type",
                            "old": field_a.get("field_type"),
                            "new": field_b.get("field_type"),
                        }
                    )
                if field_a.get("description") != field_b.get("description"):
                    changes.append(
                        {
                            "property": "description",
                            "old": field_a.get("description"),
                            "new": field_b.get("description"),
                        }
                    )
                if field_a.get("is_required") != field_b.get("is_required"):
                    changes.append(
                        {
                            "property": "is_required",
                            "old": field_a.get("is_required"),
                            "new": field_b.get("is_required"),
                        }
                    )

                if changes:
                    modified_fields.append(
                        {
                            "field_path": path,
                            "field_name": field_b.get("field_name"),
                            "changes": changes,
                        }
                    )

            return VersionComparisonResponse(
                schema_id=schema_id,
                version_a=version_a,
                version_b=version_b,
                added_fields=added_fields,
                removed_fields=removed_fields,
                modified_fields=modified_fields,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to compare versions: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to compare versions: {e!s}",
            )

    @router.post("/db/{schema_id}/versions/{version_number}/rollback")
    async def rollback_schema_version(
        schema_id: str,
        version_number: int,
        request: RollbackRequest = None,
    ) -> RollbackResponse:
        """
        Rollback schema to a specific version.

        This creates a new version with the content from the specified version,
        maintaining the audit trail. The rollback is performed using a database
        function for atomicity.

        Args:
            schema_id: UUID of the schema
            version_number: The version number to rollback to
            request: Optional rollback request with change summary

        Returns:
            Rollback result with new version details
        """
        if not supabase_client:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable",
            )

        try:
            # Get current version before rollback
            schema_response = (
                supabase_client.table("extraction_schemas")
                .select("schema_version")
                .eq("id", schema_id)
                .single()
                .execute()
            )

            if not schema_response.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Schema '{schema_id}' not found",
                )

            previous_version = schema_response.data.get("schema_version", 1)

            # Call the database rollback function
            result = supabase_client.rpc(
                "rollback_to_version",
                {
                    "p_schema_id": schema_id,
                    "p_version_number": version_number,
                },
            ).execute()

            if not result.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Rollback failed - no result returned",
                )

            new_version_id = result.data

            # Get the new version number
            new_schema = (
                supabase_client.table("extraction_schemas")
                .select("schema_version")
                .eq("id", schema_id)
                .single()
                .execute()
            )

            new_version = (
                new_schema.data.get("schema_version", previous_version + 1)
                if new_schema.data
                else previous_version + 1
            )

            change_summary = request.change_summary if request else None
            summary = change_summary or f"Rolled back to version {version_number}"

            logger.info(
                f"Schema {schema_id} rolled back from version {previous_version} "
                f"to version {version_number} (new version: {new_version})"
            )

            return RollbackResponse(
                schema_id=schema_id,
                previous_version=previous_version,
                new_version=new_version,
                restored_from_version=version_number,
                new_version_id=new_version_id,
                change_summary=summary,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to rollback schema version: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to rollback: {e!s}",
            )
