"""
Document versioning API endpoints.

Provides:
- Version history for legal documents
- Diff between versions
- Creating manual version snapshots
- Reverting to previous versions
"""

import difflib
import hashlib
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger
from pydantic import BaseModel, Field

router = APIRouter(prefix="/documents", tags=["versioning"])


# ===== Models =====


class DocumentVersion(BaseModel):
    """A single version entry for a document."""

    id: str
    document_id: str
    version_number: int
    title: str | None = None
    content_hash: str
    change_description: str | None = None
    change_type: str
    created_by: str = "system"
    created_at: str
    has_extracted_data: bool = False


class VersionHistoryResponse(BaseModel):
    """Response for version history of a document."""

    document_id: str
    current_version: int
    versions: list[DocumentVersion]
    total_versions: int


class VersionDetailResponse(BaseModel):
    """Detailed version with full content."""

    id: str
    document_id: str
    version_number: int
    title: str | None = None
    full_text: str
    summary: str | None = None
    content_hash: str
    change_description: str | None = None
    change_type: str
    created_by: str
    created_at: str
    extracted_data: dict[str, Any] = Field(default_factory=dict)


class VersionDiffResponse(BaseModel):
    """Diff between two versions."""

    document_id: str
    from_version: int
    to_version: int
    diff_html: str
    diff_stats: dict[str, int]
    from_title: str | None = None
    to_title: str | None = None
    from_created_at: str | None = None
    to_created_at: str | None = None


class CreateVersionRequest(BaseModel):
    """Request to create a manual version snapshot."""

    change_description: str | None = Field(
        default=None,
        max_length=500,
        description="Description of what changed",
    )
    change_type: str = Field(
        default="amendment",
        description="Type of change: initial, amendment, correction, consolidation, repeal",
    )


class RevertVersionRequest(BaseModel):
    """Request to revert a document to a specific version."""

    version_number: int = Field(
        ge=1,
        description="Version number to revert to",
    )
    change_description: str | None = Field(
        default=None,
        max_length=500,
        description="Description of why reverting",
    )


# ===== Helper Functions =====


def _compute_content_hash(text: str) -> str:
    """Compute SHA-256 hash of document text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _generate_diff_html(old_text: str, new_text: str) -> tuple[str, dict[str, int]]:
    """Generate an HTML diff between two texts.

    Returns tuple of (diff_html, stats_dict).
    """
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)

    differ = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile="Previous Version",
        tofile="Current Version",
        lineterm="",
    )

    additions = 0
    deletions = 0
    diff_lines = []

    for line in differ:
        if line.startswith("+") and not line.startswith("+++"):
            additions += 1
            diff_lines.append(f'<span class="diff-add">{_escape_html(line)}</span>')
        elif line.startswith("-") and not line.startswith("---"):
            deletions += 1
            diff_lines.append(f'<span class="diff-del">{_escape_html(line)}</span>')
        elif line.startswith("@@"):
            diff_lines.append(f'<span class="diff-hunk">{_escape_html(line)}</span>')
        else:
            diff_lines.append(f'<span class="diff-ctx">{_escape_html(line)}</span>')

    diff_html = "\n".join(diff_lines)
    stats = {
        "additions": additions,
        "deletions": deletions,
        "total_changes": additions + deletions,
    }

    return diff_html, stats


def _escape_html(text: str) -> str:
    """Escape HTML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ===== Endpoints =====


@router.get(
    "/{document_id}/versions",
    response_model=VersionHistoryResponse,
    summary="Get version history for a document",
)
async def get_version_history(
    document_id: str = Path(..., description="Document ID"),
    limit: int = Query(50, ge=1, le=200, description="Max versions to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> VersionHistoryResponse:
    """Get the version history of a document, ordered by version number descending."""
    try:
        db = get_vector_db()

        # Get current document version
        doc_response = (
            db.client.table("legal_documents")
            .select("document_id, current_version")
            .eq("document_id", document_id)
            .limit(1)
            .execute()
        )

        if not doc_response.data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        current_version = doc_response.data[0].get("current_version", 1) or 1

        # Get version history
        versions_response = (
            db.client.table("document_versions")
            .select(
                "id, document_id, version_number, title, content_hash, change_description, change_type, created_by, created_at, extracted_data"
            )
            .eq("document_id", document_id)
            .order("version_number", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        versions = [
            DocumentVersion(
                id=str(v["id"]),
                document_id=v["document_id"],
                version_number=v["version_number"],
                title=v.get("title"),
                content_hash=v["content_hash"],
                change_description=v.get("change_description"),
                change_type=v.get("change_type", "amendment"),
                created_by=v.get("created_by", "system"),
                created_at=v["created_at"],
                has_extracted_data=bool(v.get("extracted_data")),
            )
            for v in (versions_response.data or [])
        ]

        # Count total versions
        count_response = (
            db.client.table("document_versions")
            .select("id", count="exact")
            .eq("document_id", document_id)
            .execute()
        )
        total = count_response.count or len(versions)

        return VersionHistoryResponse(
            document_id=document_id,
            current_version=current_version,
            versions=versions,
            total_versions=total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error getting version history for {document_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Error retrieving version history")


@router.get(
    "/{document_id}/versions/{version_number}",
    response_model=VersionDetailResponse,
    summary="Get a specific version of a document",
)
async def get_version_detail(
    document_id: str = Path(..., description="Document ID"),
    version_number: int = Path(..., ge=1, description="Version number"),
) -> VersionDetailResponse:
    """Get full content of a specific version."""
    try:
        db = get_vector_db()

        response = (
            db.client.table("document_versions")
            .select("*")
            .eq("document_id", document_id)
            .eq("version_number", version_number)
            .limit(1)
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail=f"Version {version_number} not found for document {document_id}",
            )

        v = response.data[0]
        return VersionDetailResponse(
            id=str(v["id"]),
            document_id=v["document_id"],
            version_number=v["version_number"],
            title=v.get("title"),
            full_text=v["full_text"],
            summary=v.get("summary"),
            content_hash=v["content_hash"],
            change_description=v.get("change_description"),
            change_type=v.get("change_type", "amendment"),
            created_by=v.get("created_by", "system"),
            created_at=v["created_at"],
            extracted_data=v.get("extracted_data") or {},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error getting version {version_number} for {document_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Error retrieving version detail")


@router.get(
    "/{document_id}/versions/{from_version}/diff/{to_version}",
    response_model=VersionDiffResponse,
    summary="Get diff between two versions",
)
async def get_version_diff(
    document_id: str = Path(..., description="Document ID"),
    from_version: int = Path(..., ge=1, description="Source version number"),
    to_version: int = Path(..., ge=1, description="Target version number"),
) -> VersionDiffResponse:
    """Generate a diff between two versions of a document.

    If to_version equals the current version, the current document content is used.
    """
    try:
        db = get_vector_db()

        # Get the source version
        from_response = (
            db.client.table("document_versions")
            .select("full_text, title, created_at")
            .eq("document_id", document_id)
            .eq("version_number", from_version)
            .limit(1)
            .execute()
        )

        if not from_response.data:
            raise HTTPException(
                status_code=404,
                detail=f"Version {from_version} not found for document {document_id}",
            )

        from_data = from_response.data[0]
        from_text = from_data["full_text"]

        # Get the target version
        to_response = (
            db.client.table("document_versions")
            .select("full_text, title, created_at")
            .eq("document_id", document_id)
            .eq("version_number", to_version)
            .limit(1)
            .execute()
        )

        if not to_response.data:
            # If target version is not found, it might be the current version
            doc_response = (
                db.client.table("legal_documents")
                .select("full_text, title, updated_at, current_version")
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )

            if not doc_response.data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Version {to_version} not found for document {document_id}",
                )

            doc = doc_response.data[0]
            to_text = doc["full_text"]
            to_title = doc.get("title")
            to_created_at = doc.get("updated_at")
        else:
            to_data = to_response.data[0]
            to_text = to_data["full_text"]
            to_title = to_data.get("title")
            to_created_at = to_data.get("created_at")

        # Generate diff
        diff_html, diff_stats = _generate_diff_html(from_text, to_text)

        return VersionDiffResponse(
            document_id=document_id,
            from_version=from_version,
            to_version=to_version,
            diff_html=diff_html,
            diff_stats=diff_stats,
            from_title=from_data.get("title"),
            to_title=to_title,
            from_created_at=from_data.get("created_at"),
            to_created_at=to_created_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating diff for {document_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error generating version diff")


@router.post(
    "/{document_id}/versions",
    response_model=DocumentVersion,
    summary="Create a manual version snapshot",
)
async def create_version_snapshot(
    request: CreateVersionRequest,
    document_id: str = Path(..., description="Document ID"),
) -> DocumentVersion:
    """Create a manual version snapshot of the current document state."""
    try:
        db = get_vector_db()

        # Get current document
        doc_response = (
            db.client.table("legal_documents")
            .select(
                "document_id, title, full_text, summary, content_hash, extracted_data, current_version"
            )
            .eq("document_id", document_id)
            .limit(1)
            .execute()
        )

        if not doc_response.data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        doc = doc_response.data[0]

        # Compute hash if missing
        content_hash = doc.get("content_hash") or _compute_content_hash(
            doc["full_text"]
        )

        # Check if this exact content already has a version
        existing = (
            db.client.table("document_versions")
            .select("id, version_number")
            .eq("document_id", document_id)
            .eq("content_hash", content_hash)
            .limit(1)
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail=f"A version with identical content already exists (version {existing.data[0]['version_number']})",
            )

        # Get next version number
        max_version_response = (
            db.client.table("document_versions")
            .select("version_number")
            .eq("document_id", document_id)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )

        next_version = 1
        if max_version_response.data:
            next_version = max_version_response.data[0]["version_number"] + 1

        # Create version
        version_data = {
            "document_id": document_id,
            "version_number": next_version,
            "title": doc.get("title"),
            "full_text": doc["full_text"],
            "summary": doc.get("summary"),
            "content_hash": content_hash,
            "change_description": request.change_description,
            "change_type": request.change_type,
            "created_by": "user",
            "extracted_data": doc.get("extracted_data") or {},
        }

        insert_response = (
            db.client.table("document_versions").insert(version_data).execute()
        )

        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create version")

        v = insert_response.data[0]

        # Update current_version on the document
        db.client.table("legal_documents").update({"current_version": next_version}).eq(
            "document_id", document_id
        ).execute()

        logger.info(f"Created version {next_version} for document {document_id}")

        return DocumentVersion(
            id=str(v["id"]),
            document_id=v["document_id"],
            version_number=v["version_number"],
            title=v.get("title"),
            content_hash=v["content_hash"],
            change_description=v.get("change_description"),
            change_type=v.get("change_type", "amendment"),
            created_by=v.get("created_by", "user"),
            created_at=v["created_at"],
            has_extracted_data=bool(v.get("extracted_data")),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating version for {document_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating version snapshot")


@router.post(
    "/{document_id}/versions/revert",
    response_model=dict[str, Any],
    summary="Revert document to a previous version",
)
async def revert_to_version(
    request: RevertVersionRequest,
    document_id: str = Path(..., description="Document ID"),
) -> dict[str, Any]:
    """Revert a document to a specific previous version.

    This creates a new version snapshot of the current state before reverting,
    then updates the document with the content from the target version.
    """
    try:
        db = get_vector_db()

        # Get the target version
        target_response = (
            db.client.table("document_versions")
            .select("*")
            .eq("document_id", document_id)
            .eq("version_number", request.version_number)
            .limit(1)
            .execute()
        )

        if not target_response.data:
            raise HTTPException(
                status_code=404,
                detail=f"Version {request.version_number} not found for document {document_id}",
            )

        target_version = target_response.data[0]

        # Get current document to snapshot before revert
        doc_response = (
            db.client.table("legal_documents")
            .select(
                "document_id, title, full_text, summary, content_hash, extracted_data, current_version"
            )
            .eq("document_id", document_id)
            .limit(1)
            .execute()
        )

        if not doc_response.data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        current_doc = doc_response.data[0]
        current_hash = current_doc.get("content_hash") or _compute_content_hash(
            current_doc["full_text"]
        )

        # Get next version number for the pre-revert snapshot
        max_version_response = (
            db.client.table("document_versions")
            .select("version_number")
            .eq("document_id", document_id)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )

        next_version = 1
        if max_version_response.data:
            next_version = max_version_response.data[0]["version_number"] + 1

        # Save current state as a version before reverting
        pre_revert_data = {
            "document_id": document_id,
            "version_number": next_version,
            "title": current_doc.get("title"),
            "full_text": current_doc["full_text"],
            "summary": current_doc.get("summary"),
            "content_hash": current_hash,
            "change_description": f"Pre-revert snapshot (before reverting to version {request.version_number})",
            "change_type": "amendment",
            "created_by": "system",
            "extracted_data": current_doc.get("extracted_data") or {},
        }

        db.client.table("document_versions").insert(pre_revert_data).execute()

        # Now revert the document content
        revert_hash = _compute_content_hash(target_version["full_text"])
        update_data = {
            "title": target_version.get("title") or current_doc.get("title"),
            "full_text": target_version["full_text"],
            "summary": target_version.get("summary"),
            "content_hash": revert_hash,
            "current_version": next_version + 1,
        }

        db.client.table("legal_documents").update(update_data).eq(
            "document_id", document_id
        ).execute()

        logger.info(
            f"Reverted document {document_id} to version {request.version_number} "
            f"(new current_version: {next_version + 1})"
        )

        return {
            "document_id": document_id,
            "reverted_to_version": request.version_number,
            "new_current_version": next_version + 1,
            "pre_revert_snapshot_version": next_version,
            "message": f"Document reverted to version {request.version_number}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error reverting {document_id} to version {request.version_number}: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Error reverting document version")
