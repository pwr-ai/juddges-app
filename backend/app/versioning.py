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
from supabase import PostgrestAPIError

router = APIRouter(prefix="/documents", tags=["versioning"])

# Custom SQLSTATE raised by public.create_document_version() when a version with
# the same (document_id, content_hash) already exists
# (supabase/migrations/20260812000001_create_document_version_rpc.sql). Mapped
# back to the HTTP 409 this endpoint has always returned.
_DUPLICATE_CONTENT_SQLSTATE = "P0409"

# Name of the RPC that allocates version_number and inserts in one transaction,
# under a per-document advisory lock. PostgREST matches its arguments by NAME.
_CREATE_VERSION_RPC = "create_document_version"


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


def _compute_content_hash(text: str | None) -> str | None:
    """Compute SHA-256 hash of document text.

    Returns None if text is None, allowing callers to handle missing content.
    """
    if text is None:
        return None
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


def _append_version(
    db: Any,
    *,
    document_id: str,
    title: str | None,
    full_text: str,
    summary: str | None,
    content_hash: str | None,
    change_description: str | None,
    change_type: str,
    created_by: str,
    extracted_data: dict[str, Any],
    reject_duplicate_content: bool,
) -> dict[str, Any] | None:
    """Append one `document_versions` row and return it (None if nothing came back).

    Delegates to `public.create_document_version`, which takes a per-document
    `pg_advisory_xact_lock`, runs the duplicate-content check and allocates
    `version_number` as `MAX + 1` all inside one transaction. Doing the
    allocation here with a separate `MAX(version_number)` read raced: two
    concurrent callers for the same document computed the same number and the
    second insert died on `UNIQUE (document_id, version_number)`. Folding the
    read into the INSERT would not have helped either — under READ COMMITTED the
    aggregate cannot see a sibling transaction's uncommitted row (see
    supabase/migrations/20260812000001_create_document_version_rpc.sql).

    `reject_duplicate_content=False` is what the revert path uses: it never had a
    duplicate-content guard, and adding one would turn re-reverting to the
    already-current version from a 200 into a 409.

    Raises:
        HTTPException: 409 when the RPC reports SQLSTATE P0409 (identical content
            already versioned), with the message the endpoint has always
            returned. Any other PostgrestAPIError propagates untouched.
    """
    try:
        response = db.client.rpc(
            _CREATE_VERSION_RPC,
            {
                "p_document_id": document_id,
                "p_title": title,
                "p_full_text": full_text,
                "p_summary": summary,
                "p_content_hash": content_hash,
                "p_change_description": change_description,
                "p_change_type": change_type,
                "p_created_by": created_by,
                "p_extracted_data": extracted_data,
                "p_reject_duplicate_content": reject_duplicate_content,
            },
        ).execute()
    except PostgrestAPIError as e:
        if e.code == _DUPLICATE_CONTENT_SQLSTATE:
            raise HTTPException(
                status_code=409,
                detail=e.message or "A version with identical content already exists",
            ) from e
        raise

    rows = response.data or []
    return rows[0] if rows else None


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

        # Get current document version. `judgments` has no `current_version`
        # column, so the fallback below treats an unversioned document as v1.
        doc_response = (
            db.client.table("judgments")
            .select("document_id:id")
            .eq("id", document_id)
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
        logger.opt(exception=True).error(
            f"Error getting version history for {document_id}: {e}"
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
            .select(
                "id, document_id, version_number, title, full_text, summary, "
                "content_hash, change_description, change_type, created_by, "
                "created_at, extracted_data"
            )
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
        logger.opt(exception=True).error(
            f"Error getting version {version_number} for {document_id}: {e}"
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
                db.client.table("judgments")
                # `judgments` has no `current_version` column.
                .select("full_text, title, updated_at")
                .eq("id", document_id)
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
        logger.opt(exception=True).error(
            f"Error generating diff for {document_id}: {e}"
        )
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
            db.client.table("judgments")
            # `judgments` has no `content_hash`, `extracted_data` or
            # `current_version` columns; the hash is recomputed below and the
            # version counter lives on `document_versions`.
            .select("document_id:id, title, full_text, summary")
            .eq("id", document_id)
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

        # Duplicate-content check, version-number allocation and insert all
        # happen inside public.create_document_version, under a per-document
        # advisory lock. Doing any of it here would race (see _append_version).
        v = _append_version(
            db,
            document_id=document_id,
            title=doc.get("title"),
            full_text=doc["full_text"],
            summary=doc.get("summary"),
            content_hash=content_hash,
            change_description=request.change_description,
            change_type=request.change_type,
            created_by="user",
            extracted_data=doc.get("extracted_data") or {},
            reject_duplicate_content=True,
        )

        if not v:
            raise HTTPException(status_code=500, detail="Failed to create version")

        # The document row itself carries no version counter: `judgments` has
        # no `current_version` column, so the highest
        # `document_versions.version_number` is the current version.

        logger.info(f"Created version {v['version_number']} for document {document_id}")

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
        logger.opt(exception=True).error(
            f"Error creating version for {document_id}: {e}"
        )
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
            .select(
                "id, document_id, version_number, title, full_text, summary, "
                "content_hash, change_description, change_type, created_by, "
                "created_at, extracted_data"
            )
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
            db.client.table("judgments")
            # `judgments` has no `content_hash`, `extracted_data` or
            # `current_version` columns; the hash is recomputed below and the
            # version counter lives on `document_versions`.
            .select("document_id:id, title, full_text, summary")
            .eq("id", document_id)
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

        # Save current state as a version before reverting. Same RPC as
        # create_version_snapshot, so the version number is allocated under the
        # per-document advisory lock instead of by a racy MAX+1 read.
        # `reject_duplicate_content=False` preserves this path's behaviour: it
        # never deduplicated, and reverting to the version whose content is
        # already current must stay a 200.
        snapshot = _append_version(
            db,
            document_id=document_id,
            title=current_doc.get("title"),
            full_text=current_doc["full_text"],
            summary=current_doc.get("summary"),
            content_hash=current_hash,
            change_description=(
                "Pre-revert snapshot (before reverting to version "
                f"{request.version_number})"
            ),
            change_type="amendment",
            created_by="system",
            extracted_data=current_doc.get("extracted_data") or {},
            reject_duplicate_content=False,
        )

        if not snapshot:
            raise HTTPException(
                status_code=500, detail="Error reverting document version"
            )

        next_version = snapshot["version_number"]

        # Now revert the document content; if this fails, roll back the snapshot
        # to avoid leaving a phantom version record with an un-reverted document.
        try:
            # `judgments` has neither `content_hash` nor `current_version`, so
            # only the content columns are written back.
            update_data = {
                "title": target_version.get("title") or current_doc.get("title"),
                "full_text": target_version["full_text"],
                "summary": target_version.get("summary"),
            }

            db.client.table("judgments").update(update_data).eq(
                "id", document_id
            ).execute()
        except Exception as update_err:
            # Compensating transaction: remove the pre-revert snapshot
            logger.opt(exception=True).error(
                f"Document update failed during revert of {document_id}, "
                f"rolling back pre-revert snapshot (version {next_version}): {update_err}"
            )
            try:
                snapshot_id = snapshot["id"]
                db.client.table("document_versions").delete().eq(
                    "id", snapshot_id
                ).execute()
                logger.info(
                    f"Successfully rolled back pre-revert snapshot {snapshot_id} "
                    f"for document {document_id}"
                )
            except Exception as rollback_err:
                logger.opt(exception=True).error(
                    f"Failed to roll back pre-revert snapshot for {document_id}: "
                    f"{rollback_err}"
                )
            raise

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
        logger.opt(exception=True).error(
            f"Error reverting {document_id} to version {request.version_number}: {e}"
        )
        raise HTTPException(status_code=500, detail="Error reverting document version")
